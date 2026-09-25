import { Fragment, useEffect, useMemo, useState } from 'react';
import { getTokenizer, tokenizeSync, type JpToken } from '../tokenizer';
import { hasKanji } from '../../shared/furigana';
import { sentencePieces, type SentenceAnnotation } from '../../shared/sentenceAnalysisCore';
import { pinyinRubyPairs, stressedRussian, type ReadingAidResult } from '../../shared/readingAid';
import type { StudySegment } from '../../shared/studySegmentation';
import type { StudyLang } from '../../shared/studyLang';
import { useReadingAid } from '../readingAid';
import { useStudyLanguage } from '../useStudyLanguage';

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
}

/** One rendered run: a plain stretch, or an annotated span carrying its index. */
interface CueRun {
  text: string;
  annotation?: SentenceAnnotation;
  index?: number;
}

function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

function TokenSpan({ token, furigana }: { token: JpToken; furigana: boolean }) {
  const reading = token.reading ? katakanaToHiragana(token.reading) : '';
  if (furigana && reading && hasKanji(token.surface) && reading !== token.surface) {
    return (
      <ruby className="media-sub-ruby">
        <span className="media-sub-morpheme">{token.surface}</span>
        <rt>{reading}</rt>
      </ruby>
    );
  }
  return <span className="media-sub-morpheme">{token.surface}</span>;
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
}: {
  word: string;
  lang: StudyLang;
  aid: boolean;
  readings: ReadingAidResult;
}) {
  const reading = aid ? readings[word] : undefined;
  if (lang === 'zh' && reading?.some(Boolean)) {
    return (
      <span className="media-sub-morpheme wk" data-surface={word}>
        <ruby className="media-sub-ruby">
          {pinyinRubyPairs(word, reading).map((pair, i) => (
            <Fragment key={i}>{pair.base}<rt>{pair.rt}</rt></Fragment>
          ))}
        </ruby>
      </span>
    );
  }
  const shown = lang === 'ru' && reading ? stressedRussian(word, reading) : word;
  return <span className="media-sub-morpheme wk" data-surface={word}>{shown}</span>;
}

function StudySegments({
  parts,
  lang,
  aid,
  readings,
}: {
  parts: readonly StudySegment[];
  lang: StudyLang;
  aid: boolean;
  readings: ReadingAidResult;
}) {
  return (
    <>
      {parts.map((part, i) => (part.wordLike
        ? <StudyWord key={`${i}-${part.text}`} word={part.text} lang={lang} aid={aid} readings={readings} />
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
}: Props) {
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
    >
      {runs.map((run, runIndex) => {
        const tokens = tokenRuns?.[runIndex];
        const parts = aid.segments[runIndex];
        const content = !japanese && parts?.length
          ? <StudySegments parts={parts} lang={lineLang} aid={furigana} readings={aid.readings} />
          : tokens && tokens.length > 0
            ? tokens.map((tok, i) => (
              <TokenSpan key={`${i}-${tok.surface}`} token={tok} furigana={furigana} />
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
