import { Fragment, useEffect, useMemo, useState } from 'react';
import { getTokenizer, tokenizeSync, type JpToken } from '../tokenizer';
import { hasKanji } from '../../shared/furigana';
import { sentencePieces, type SentenceAnnotation } from '../../shared/sentenceAnalysisCore';
import { pinyinRubyPairs, stressedRussian, type ReadingAidResult } from '../../shared/readingAid';
import type { StudySegment } from '../../shared/studySegmentation';
import type { StudyLang } from '../../shared/studyLang';
import { useReadingAid } from '../readingAid';
import { useStudyLanguage } from '../useStudyLanguage';
import { getLevel, onKnowledgeChanged } from '../knownWords';
import { studyWordKey } from '../../shared/studySegmentation';
import type { WordLookupHit } from '../wordLookup';
import './subtitleCueLine.css';

/**
 * The learner's knowledge of a word as a class: New words are marked, words
 * being learned are marked lightly, familiar and known words are left plain.
 * `null` when highlighting is off.
 */
function knownClass(key: string, on: boolean, surface?: string): string {
  if (!on || !key) return '';
  // Known words are stored under the form the learner marked; check the plain
  // spelling as well as the language's lemma/stem key.
  const level = Math.max(getLevel(key), surface ? getLevel(surface) : 0);
  return level === 0 ? ' wk-new' : level === 1 ? ' wk-learning' : '';
}

/**
 * The knowledge class (` wk-new`, ` wk-learning` or empty) for one Japanese token, exactly
 * as the subtitle line colours it: only content words carry a knowledge state, proper nouns
 * never do. Exported so the transcript rail colours its rows by the same rule rather than a
 * second copy of it.
 */
export function tokenKnownClass(token: JpToken, on = true): string {
  return token.content && !token.proper ? knownClass(token.lemma || token.surface, on, token.surface) : '';
}

/** The knowledge class for one Chinese or Russian word, as the subtitle line colours it. */
export function studyWordKnownClass(word: string, lang: StudyLang, on = true): string {
  return knownClass(studyWordKey(word, lang), on, word.toLowerCase());
}

/**
 * Roving-focus keys by `KeyboardEvent.key`: how far each moves (±Infinity = the ends).
 * Object keys rather than a `switch` on quoted names — these are key ids, not copy.
 */
const ROVE_STEP: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  Home: Number.NEGATIVE_INFINITY,
  End: Number.POSITIVE_INFINITY,
};
/** Keys that activate the focused word; Enter is told apart because a grammar button needs it. */
const ACTIVATE_KEYS: Readonly<Record<string, 'enter' | 'space'>> = {
  Enter: 'enter',
  ' ': 'space',
  Spacebar: 'space',
};

interface Props {
  text: string;
  /**
   * The reading aid: furigana for Japanese, pinyin for Chinese, stress marks for
   * Russian. (The prop keeps its historical name.)
   */
  furigana: boolean;
  /** The line's language; the study language when omitted. */
  lang?: StudyLang;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Colour-coded analysis spans over `text`. When present the line is drawn as
   * clickable segments instead of one run.
   *
   * Offsets are indexes into the *analyzed* sentence, so the caller must pass
   * `result.sentence` as `text` — not the raw cue. `normalizeAnalysisText`
   * collapses whitespace and applies NFKC, and painting those offsets onto the
   * un-normalized line would shift every highlight by however much it changed.
   */
  annotations?: readonly SentenceAnnotation[];
  /** Index of the span drawn as selected. */
  selectedAnnotation?: number;
  onSelectAnnotation?: (index: number) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  /** Hover lookup (the player's modifier-held lookup); the caller throttles. */
  onMouseMove?: (e: React.MouseEvent) => void;
  /** Mark words the learner does not know yet (New) and is still learning. */
  knownHighlight?: boolean;
  /** The line's exam level (JLPT / HSK / CEFR), shown as a small tag. */
  levelBadge?: string | null;
  /**
   * Keyboard lookup, and the opt-in for it.
   *
   * When given, the line becomes ONE tab stop (a `group` named by its text) with a roving
   * tabindex across its words and grammar spans: ArrowLeft / ArrowRight / Home / End move,
   * Enter or Space on a word calls this with the word's box (`x` = left, `y` = bottom,
   * `top` = top) and the whole line as context; Enter on a grammar span calls
   * `onSelectAnnotation`. Omitted, the line renders exactly as before — the other surfaces
   * that reuse it (Blanc's transcription panel) would otherwise grow an accessibility node
   * per word for a feature they do not wire.
   */
  onWordActivate?: (hit: WordLookupHit) => void;
}

/** One rendered run: a plain stretch, or an annotated span carrying its index. */
interface CueRun {
  text: string;
  annotation?: SentenceAnnotation;
  index?: number;
}

/** One keyboard stop in a roving line. */
interface CueItem {
  /** `${runIndex}` for a grammar span, `${runIndex}:${partIndex}` for a word. */
  key: string;
  kind: 'word' | 'grammar';
  surface: string;
  /** The annotation index, for a grammar span. */
  annotation?: number;
}

/** Punctuation, symbols and spaces are not words to land on. */
function isNavigableWord(surface: string): boolean {
  return /[\p{L}\p{N}]/u.test(surface);
}

/** Roving props for one stop: one of them is the line's tab stop, the rest are -1. */
interface ItemProps {
  'data-cue-item': number;
  tabIndex: number;
}

function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

function TokenSpan({
  token,
  furigana,
  known,
  item,
}: {
  token: JpToken;
  furigana: boolean;
  known: boolean;
  item?: ItemProps;
}) {
  const reading = token.reading ? katakanaToHiragana(token.reading) : '';
  // Only content words carry a knowledge state; particles are never "unknown".
  const cls = `media-sub-morpheme${tokenKnownClass(token, known)}`;
  // A roving word is named by its surface alone: its text would also carry the ruby.
  const a11y = item ? { ...item, role: 'button', 'aria-label': token.surface, 'data-surface': token.surface } : {};
  if (furigana && reading && hasKanji(token.surface) && reading !== token.surface) {
    return (
      <ruby className="media-sub-ruby">
        <span className={cls} {...a11y}>{token.surface}</span>
        <rt>{reading}</rt>
      </ruby>
    );
  }
  return <span className={cls} {...a11y}>{token.surface}</span>;
}

/**
 * One Chinese or Russian word: pinyin ruby per character, or the stressed
 * spelling, when the aid is on. `data-surface` is what a click looks up — the
 * element's text would include the ruby and the accents.
 */
function StudyWord({
  word,
  lang,
  aid,
  readings,
  known = false,
  item,
}: {
  word: string;
  lang: StudyLang;
  aid: boolean;
  readings: ReadingAidResult;
  known?: boolean;
  item?: ItemProps;
}) {
  const reading = aid ? readings[word] : undefined;
  const cls = `media-sub-morpheme wk${studyWordKnownClass(word, lang, known)}`;
  const a11y = item ? { ...item, role: 'button', 'aria-label': word } : {};
  if (lang === 'zh' && reading?.some(Boolean)) {
    return (
      <span className={cls} data-surface={word} {...a11y}>
        <ruby className="media-sub-ruby">
          {pinyinRubyPairs(word, reading).map((pair, i) => (
            <Fragment key={i}>{pair.base}<rt>{pair.rt}</rt></Fragment>
          ))}
        </ruby>
      </span>
    );
  }
  const shown = lang === 'ru' && reading ? stressedRussian(word, reading) : word;
  return <span className={cls} data-surface={word} {...a11y}>{shown}</span>;
}

function StudySegments({
  parts,
  lang,
  aid,
  readings,
  known = false,
  itemFor,
}: {
  parts: readonly StudySegment[];
  lang: StudyLang;
  aid: boolean;
  readings: ReadingAidResult;
  known?: boolean;
  itemFor?: (partIndex: number) => ItemProps | undefined;
}) {
  return (
    <>
      {parts.map((part, i) => (part.wordLike
        ? <StudyWord key={`${i}-${part.text}`} word={part.text} lang={lang} aid={aid} readings={readings} known={known} item={itemFor?.(i)} />
        : <Fragment key={`${i}-${part.text}`}>{part.text}</Fragment>))}
    </>
  );
}

/**
 * Tokenized subtitle line: each word is selectable for dictionary lookup; the
 * study language's reading aid on request (furigana via kuromoji for Japanese,
 * pinyin via CC-CEDICT for Chinese, stress marks via the Russian dictionary);
 * optional grammar highlighting, where each analyzed span becomes its own
 * clickable, category-coloured segment. The line carries its real `lang`
 * (`ja`, `zh-Hans`, `zh-Hant`, `ru`) so its glyphs and fonts are right.
 */
export default function SubtitleCueLine({
  text,
  furigana,
  lang,
  className,
  style,
  annotations,
  selectedAnnotation,
  onSelectAnnotation,
  onMouseDown,
  onMouseUp,
  onMouseMove,
  knownHighlight = false,
  levelBadge,
  onWordActivate,
}: Props) {
  // Re-colour when a word's level changes (a lookup, a review, a manual mark).
  const [, setKnowledgeNonce] = useState(0);
  useEffect(
    () => (knownHighlight ? onKnowledgeChanged(() => setKnowledgeNonce((n) => n + 1)) : undefined),
    [knownHighlight],
  );
  const runs = useMemo<CueRun[]>(() => {
    if (!annotations || annotations.length === 0) return [{ text }];
    return sentencePieces(text, annotations).map((piece) =>
      (piece.kind === 'annotation'
        ? { text: piece.text, annotation: piece.annotation, index: piece.index }
        : { text: piece.text }));
  }, [text, annotations]);

  // Each run is tokenized on its own rather than tokenizing the line and then
  // splitting: annotation boundaries are word boundaries in practice, and
  // per-run tokenization keeps readings aligned to the text actually rendered
  // without any offset arithmetic to get wrong.
  const [tokenRuns, setTokenRuns] = useState<JpToken[][] | null>(null);
  const study = useStudyLanguage();
  const lineLang: StudyLang = lang ?? study.lang;
  const lineTag = lineLang === 'zh' ? (study.lang === 'zh' ? study.tag : 'zh-Hans') : lineLang;
  const japanese = lineLang === 'ja';
  const runTexts = useMemo(() => runs.map((run) => run.text), [runs]);
  const aid = useReadingAid(japanese ? [] : runTexts, lineLang, furigana, lineTag);

  useEffect(() => {
    // kuromoji is a Japanese analyser: a Chinese line run through it comes back
    // as Japanese words with kana readings over hanzi.
    if (!japanese) {
      setTokenRuns(null);
      return;
    }
    let cancelled = false;
    void getTokenizer()
      .then(() => {
        if (!cancelled) setTokenRuns(runs.map((run) => tokenizeSync(run.text)));
      })
      .catch(() => {
        if (!cancelled) setTokenRuns(null);
      });
    return () => {
      cancelled = true;
    };
  }, [runs, japanese]);

  const roving = typeof onWordActivate === 'function';

  /*
    The keyboard stops, in reading order, decided in one place so the render below only
    looks them up. A grammar span is one stop (its words are inside a button, and nesting
    interactive elements in a button is invalid); elsewhere every token or ICU word that
    carries a letter or digit is a stop. Before the tokenizer answers there are none, and
    the line itself is the tab stop until there are.
  */
  const items = useMemo<CueItem[]>(() => {
    if (!roving) return [];
    const out: CueItem[] = [];
    runs.forEach((run, runIndex) => {
      if (run.annotation && run.index !== undefined) {
        out.push({ key: `${runIndex}`, kind: 'grammar', surface: run.text, annotation: run.index });
        return;
      }
      const parts = aid.segments[runIndex];
      if (!japanese && parts?.length) {
        parts.forEach((part, i) => {
          if (part.wordLike && isNavigableWord(part.text)) out.push({ key: `${runIndex}:${i}`, kind: 'word', surface: part.text });
        });
        return;
      }
      tokenRuns?.[runIndex]?.forEach((token, i) => {
        if (isNavigableWord(token.surface)) out.push({ key: `${runIndex}:${i}`, kind: 'word', surface: token.surface });
      });
    });
    return out;
  }, [roving, runs, aid.segments, japanese, tokenRuns]);

  const itemIndexByKey = useMemo(() => new Map(items.map((item, i) => [item.key, i])), [items]);

  // The roving position, reset with the line: a new cue starts at its first word.
  const [roveState, setRoveState] = useState<{ text: string; index: number }>({ text, index: 0 });
  const roveIndex = roveState.text === text && roveState.index < items.length ? roveState.index : 0;

  const itemProps = (key: string): ItemProps | undefined => {
    if (!roving) return undefined;
    const index = itemIndexByKey.get(key);
    return index === undefined ? undefined : { 'data-cue-item': index, tabIndex: index === roveIndex ? 0 : -1 };
  };

  // Moving focus is enough: `handleFocus` below makes the focused stop the tab stop.
  const focusItem = (container: HTMLElement, index: number): void => {
    container.querySelector<HTMLElement>(`[data-cue-item="${index}"]`)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!roving || items.length === 0) return;
    const container = event.currentTarget;
    const from = (event.target as HTMLElement).closest?.('[data-cue-item]');
    const current = from ? Number(from.getAttribute('data-cue-item')) : roveIndex;
    let next: number | null = null;
    const step = ROVE_STEP[event.key];
    switch (step === undefined ? (ACTIVATE_KEYS[event.key] ? 'activate' : 'other') : 'move') {
      case 'move':
        next = step === Number.NEGATIVE_INFINITY
          ? 0
          : step === Number.POSITIVE_INFINITY
            ? items.length - 1
            : Math.max(0, Math.min(items.length - 1, current + (step ?? 0)));
        break;
      case 'activate': {
        if (!from) return;
        const item = items[current];
        if (!item) return;
        if (item.kind === 'grammar') {
          // A native button: Space activates it on its own. Enter is taken here so the
          // call happens exactly once (prevented, the button's own Enter click is not sent).
          if (ACTIVATE_KEYS[event.key] !== 'enter') return;
          event.preventDefault();
          event.stopPropagation();
          if (item.annotation !== undefined) onSelectAnnotation?.(item.annotation);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const rect = (from as HTMLElement).getBoundingClientRect();
        onWordActivate?.({ query: item.surface, x: rect.left, y: rect.bottom, top: rect.top, context: text });
        return;
      }
      default:
        return;
    }
    // Handled here, so the player's own Arrow / Home / End bindings do not also seek.
    event.preventDefault();
    event.stopPropagation();
    focusItem(container, next);
  };

  // A word focused any other way (a click) becomes the line's tab stop, so Tab back in
  // returns to it rather than to a word the reader has left.
  const handleFocus = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (!roving) return;
    const at = (event.target as HTMLElement).getAttribute?.('data-cue-item');
    if (at == null) return;
    const index = Number(at);
    if (index !== roveIndex || roveState.text !== text) setRoveState({ text, index });
  };

  return (
    <div
      className={className}
      style={style}
      lang={lineTag}
      data-lookup-block=""
      // The words as written, for a click's sentence context — the element's own
      // text also holds the ruby readings and stress accents.
      data-lookup-text={text}
      // Owns its own click lookup — keeps GlobalDictionaryOverlay's plain-click
      // mode from opening a second popup over this line.
      data-dict-owner=""
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseMove={onMouseMove}
      {...(roving
        ? {
          role: 'group',
          'aria-label': text,
          'data-cue-roving': '',
          // The line is the tab stop only while it has no words to stop on.
          tabIndex: items.length === 0 ? 0 : undefined,
          onKeyDown: handleKeyDown,
          onFocus: handleFocus,
        }
        : {})}
    >
      {levelBadge && (
        <span className="study-cue-level" aria-label={levelBadge}>
          {levelBadge}
        </span>
      )}
      {runs.map((run, runIndex) => {
        const tokens = tokenRuns?.[runIndex];
        const parts = aid.segments[runIndex];
        const grammar = Boolean(run.annotation && run.index !== undefined);
        // Words inside a grammar span are not stops of their own: the span is.
        const wordItem = (partIndex: number): ItemProps | undefined =>
          (grammar ? undefined : itemProps(`${runIndex}:${partIndex}`));
        const content = !japanese && parts?.length
          ? <StudySegments parts={parts} lang={lineLang} aid={furigana} readings={aid.readings} known={knownHighlight} itemFor={roving ? wordItem : undefined} />
          : tokens && tokens.length > 0
            ? tokens.map((tok, i) => (
              <TokenSpan key={`${i}-${tok.surface}`} token={tok} furigana={furigana} known={knownHighlight} item={roving ? wordItem(i) : undefined} />
            ))
            : run.text;

        if (!run.annotation || run.index === undefined) {
          return <span key={runIndex}>{content}</span>;
        }
        const index = run.index;
        return (
          <button
            key={runIndex}
            type="button"
            className={`sa-seg sa-cat-${run.annotation.category}${
              index === selectedAnnotation ? ' active' : ''
            }`}
            data-annotation-index={index}
            aria-pressed={index === selectedAnnotation}
            title={run.annotation.meaning}
            {...itemProps(`${runIndex}`)}
            // The line's own mouse handlers drive dictionary lookup by
            // selection. A segment click means "explain this span", so it must
            // not also open a popup — hence both phases are stopped, not just
            // the click.
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            onClick={() => onSelectAnnotation?.(index)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
