import React from 'react';
import type { VideoCoreActiveCue } from '@/app/(main)/_features/video-core/video-core-subtitles';
import { isTypesettingCueText, stripAssCueText } from '../shared/videoCoreStudy';
import { profileForLanguage, resolveProfileMatch } from '../shared/profileRules';
import { posCategoryClass } from '../shared/posCategory';
import { minedCueKey } from '../shared/videoCoreMining';
import { tokenKnownClass } from '../renderer/components/SubtitleCueLine';
import { getTokenizer, tokenizeSync, type JpToken } from '../renderer/tokenizer';
import { translate } from '../renderer/translator';
import { useT } from '../renderer/i18n';
import type { WordLookupHit } from '../renderer/wordLookup';
import type { StudyLang } from '../renderer/studyEnvironment';
import { fetchReadingAid } from '../renderer/readingAid';
import { useStudyLanguage } from '../renderer/useStudyLanguage';
import { segmentStudyText, type StudySegment } from '../shared/studySegmentation';
import { MAX_READING_AID_WORDS, stressedRussian, type ReadingAidResult } from '../shared/readingAid';

/**
 * The whole subtitle track as a readable, seekable column — the transcript rail
 * next to a video, which is how people actually navigate a line they half-heard.
 *
 * It renders whatever track the study overlay has selected, so a Jimaku download
 * and a Whisper transcription are the same thing here: both arrive as cues on a
 * track, and neither is treated as more real than the other.
 *
 * Rows are memoized because the list is long (a 24-minute episode runs to several
 * hundred cues) and the panel's parent re-renders on every cue change. Without
 * that, following playback would re-render the entire column once a second.
 */

/**
 * Where a card mined from this transcript would actually land.
 *
 * Resolved with `resolveProfileMatch` — the same function the mining path calls,
 * against the same stored rules — rather than by restating the routing in the UI.
 * A second implementation would drift, and a routing display that drifts is worse
 * than none: it tells you confidently which deck your card went to, and is wrong.
 */
interface MiningDestination {
  profileName: string;
  deckName: string;
  /** True when no rule matched and the active profile took it by default. */
  usedDefault: boolean;
}

function useMiningDestination(lang: StudyLang): MiningDestination | null {
  const [destination, setDestination] = React.useState<MiningDestination | null>(null);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (typeof window.api?.profileList !== 'function') return;
        const [profiles, snapshot, ruleStore] = await Promise.all([
          window.api.profileList(),
          window.api.profileGet(),
          typeof window.api.profileRulesGet === 'function'
            ? window.api.profileRulesGet()
            : Promise.resolve({ rules: [] }),
        ]);
        if (!alive) return;
        const activeId = snapshot?.activeProfileId ?? '';
        const resolved = resolveProfileMatch(
          (ruleStore?.rules ?? []) as Parameters<typeof resolveProfileMatch>[0],
          { source: 'subtitle', cardKind: 'word', language: lang },
          activeId,
        );
        // Same fallback as the Anki gateway: no rule matched → a profile that studies this language.
        const profileId = resolved.usedDefault
          ? profileForLanguage(profiles, lang, resolved.profileId)
          : resolved.profileId;
        const profile = profiles.find((entry) => entry.id === profileId)
          ?? profiles.find((entry) => entry.id === activeId);
        if (!profile) return;
        setDestination({
          profileName: profile.label,
          deckName: profile.anki?.deckName ?? '',
          usedDefault: resolved.usedDefault,
        });
      } catch {
        /* the rail is still a transcript without it */
      }
    })();
    return () => {
      alive = false;
    };
  }, [lang]);

  return destination;
}

interface Props {
  cues: readonly VideoCoreActiveCue[];
  /** Cue index currently on screen, or null between cues. */
  activeIndex: number | null;
  lang: StudyLang;
  onSeek: (cue: VideoCoreActiveCue) => void;
  onClose: () => void;
  /** Name of the track being shown, so it is obvious whose transcript this is. */
  trackLabel: string;
  /**
   * Why this transcript is shorter than the file it came from, when it is.
   *
   * Empty for every ordinary track. Set only when the script split removed cues from a
   * dual-language release, because a transcript that silently loses half a file is
   * indistinguishable from a bad download — the number and the style names are the
   * evidence that turns it back into a decision the user can check.
   */
  trackNotice?: string;
  /** Colour words by known / learning / new, as the subtitle line does. */
  knownHighlight?: boolean;
  /** `minedCueKey` of every line already mined from this video (a stable Set). */
  minedCueKeys?: ReadonlySet<string>;
  /** Mine one row's line (the one-key mine, for a line that is not playing). */
  onMineCue?: (cue: VideoCoreActiveCue) => void;
  /**
   * Open the dictionary on a word of a row, as the subtitle line's click does. Opt-in:
   * without it a row is one seek button, as before.
   */
  onWordLookup?: (hit: WordLookupHit, cue: VideoCoreActiveCue) => void;
}

/** Rows tokenized per frame. Small enough that no single frame is felt. */
const TOKENIZE_CHUNK = 40;

/**
 * The line's reading, in hiragana.
 *
 * Kana rather than romaji, deliberately: IPADIC gives readings in katakana, so
 * hiragana is one cheap transliteration away and exact, whereas romaji is a
 * lossy re-encoding that has to guess at long vowels, sokuon and ん before
 * labials — and it teaches a script the learner is trying to stop leaning on.
 *
 * Tokens with no reading (punctuation, latin, unknown words) fall through as
 * their own surface, so the line never develops holes.
 */
function readingLine(tokens: readonly JpToken[]): string {
  return tokens
    .map((token) => (token.reading
      ? token.reading.replace(/[ァ-ヶ]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0x60))
      : token.surface))
    .join('');
}

/**
 * A Chinese or Russian line's reading: pinyin word by word, or the line with
 * its stress marks. Words with no known reading fall through as written.
 */
export function studyReadingLine(
  parts: readonly StudySegment[],
  lang: StudyLang,
  readings: ReadingAidResult,
): string {
  if (lang === 'zh') {
    return parts
      .filter((part) => part.wordLike)
      .map((part) => {
        const syllables = readings[part.text]?.filter(Boolean);
        return syllables?.length ? syllables.join('') : part.text;
      })
      .join(' ');
  }
  return parts.map((part) => (part.wordLike ? stressedRussian(part.text, readings[part.text]) : part.text)).join('');
}

function timestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * How far a row is from the line being spoken, as a band rather than a number.
 *
 * This is the hierarchy the redesign asks for — active line large, neighbours readable,
 * distant lines faded, past lines receding — and it is computed here rather than in CSS
 * because CSS cannot express "two rows either side of the active one" over a list whose
 * active index moves. `near` is ±1 and `mid` is ±4, chosen so a 24-minute episode's
 * typical 3–5 s cues put roughly ten seconds of context at full readability.
 */
export type RowDistance = 'active' | 'near' | 'mid' | 'far' | 'past';

export function rowDistance(index: number, activeIndex: number | null): RowDistance {
  if (activeIndex == null) return 'mid';
  const delta = index - activeIndex;
  if (delta === 0) return 'active';
  if (delta < 0) return delta >= -1 ? 'near' : 'past';
  if (delta <= 1) return 'near';
  return delta <= 4 ? 'mid' : 'far';
}

interface RowProps {
  cue: VideoCoreActiveCue;
  text: string;
  /** Colour-coded tokens, once this row has been through the tokenizer. */
  tokens?: readonly JpToken[];
  /** A Chinese or Russian row's words (ICU), in place of kuromoji tokens. */
  parts?: readonly StudySegment[];
  /** `ja`, `ru`, `zh-Hans` or `zh-Hant`. */
  langTag: string;
  /** Pinyin / stress for a Chinese or Russian row's reading line. */
  reading?: string;
  translation?: string;
  active: boolean;
  /** Emphasis band. See `rowDistance`. */
  distance: RowDistance;
  busy: boolean;
  onSeek: (cue: VideoCoreActiveCue) => void;
  onTranslate: (cue: VideoCoreActiveCue, text: string) => void;
  translateLabel: string;
  /** This line is already a card (mining history). */
  mined: boolean;
  /** Colour words by how well the learner knows them, as the subtitle line does. */
  knownHighlight: boolean;
  onMine?: (cue: VideoCoreActiveCue) => void;
  mineLabel: string;
  minedLabel: string;
  /** Open the dictionary on one word of this row (click, Enter or Space on the word). */
  onWordLookup?: (hit: WordLookupHit, cue: VideoCoreActiveCue) => void;
  /** Accessible name of the timestamp's seek button when words are their own stops. */
  seekLabel: string;
}

/** A word worth a keyboard stop and a lookup: it carries a letter or a digit. */
export function isTranscriptWord(surface: string): boolean {
  return /[\p{L}\p{N}]/u.test(surface);
}

const WORD_STEP: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  Home: Number.NEGATIVE_INFINITY,
  End: Number.POSITIVE_INFINITY,
};

/**
 * Click or keyboard on a transcript word: the lookup hit the subtitle line would build
 * for the same word (`SubtitleCueLine`'s `onWordActivate`), with the row as context.
 */
export function transcriptWordHit(element: HTMLElement, context: string): WordLookupHit | null {
  const query = element.getAttribute('data-transcript-word') ?? '';
  if (!query) return null;
  const rect = element.getBoundingClientRect();
  return { query, x: rect.left, y: rect.bottom, top: rect.top, context };
}

const TranscriptRow = React.memo(function TranscriptRow({
  cue,
  text,
  tokens,
  parts,
  langTag,
  reading,
  translation,
  active,
  distance,
  busy,
  onSeek,
  onTranslate,
  translateLabel,
  mined,
  knownHighlight,
  onMine,
  mineLabel,
  minedLabel,
  onWordLookup,
  seekLabel,
}: RowProps) {
  /*
    With a lookup, each word is its own stop and the timestamp alone seeks: words inside a
    seek button would be interactive elements nested in a button, which neither a pointer
    nor a keyboard can reach reliably. One tab stop per row (its first word); the arrows
    move along the row, as they do on the subtitle line.
  */
  const lookup = typeof onWordLookup === 'function';
  let wordCount = 0;
  const wordProps = (surface: string): Record<string, unknown> => {
    if (!lookup || !isTranscriptWord(surface)) return {};
    const index = wordCount++;
    return {
      role: 'button',
      tabIndex: index === 0 ? 0 : -1,
      'data-transcript-word': surface,
      'data-word-index': index,
    };
  };
  const lineContent = parts
    ? parts.map((part, i) => (part.wordLike
      ? <span key={`${i}-${part.text}`} className="study-transcript-token" {...wordProps(part.text)}>{part.text}</span>
      : <React.Fragment key={`${i}-${part.text}`}>{part.text}</React.Fragment>))
    : tokens
    ? tokens.map((token, i) => (
      <span
        key={`${i}-${token.surface}`}
        className={`study-transcript-token ${posCategoryClass(token.pos, token.posDetail)} ${tokenKnownClass(token, knownHighlight)}`}
        {...wordProps(token.surface)}
      >
        {token.surface}
      </span>
    ))
    : text;

  const activateWord = (target: EventTarget | null): boolean => {
    const word = (target as HTMLElement | null)?.closest?.('[data-transcript-word]') as HTMLElement | null;
    if (!word || !onWordLookup) return false;
    const hit = transcriptWordHit(word, text);
    if (!hit) return false;
    onWordLookup(hit, cue);
    return true;
  };

  const handleWordKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>): void => {
    const from = (event.target as HTMLElement).closest?.('[data-transcript-word]') as HTMLElement | null;
    if (!from) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      activateWord(from);
      return;
    }
    const step = WORD_STEP[event.key];
    if (step === undefined) return;
    const words = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-transcript-word]')];
    const current = Number(from.getAttribute('data-word-index'));
    const next = step === Number.NEGATIVE_INFINITY
      ? 0
      : step === Number.POSITIVE_INFINITY
        ? words.length - 1
        : Math.max(0, Math.min(words.length - 1, current + step));
    // Handled here, so the player's own Arrow / Home / End bindings do not also seek.
    event.preventDefault();
    event.stopPropagation();
    words[next]?.focus();
  };

  return (
    <li
      className={`study-transcript-row${active ? ' is-active' : ''}`}
      data-cue-index={cue.index}
      data-active={active ? 'true' : 'false'}
      data-distance={distance}
      data-mined={mined ? 'true' : undefined}
      // Announced as the current line rather than merely styled as it: a screen reader
      // following along has no access to the size and opacity that carry this visually.
      aria-current={active ? 'true' : undefined}
    >
      {lookup ? (
        <div className="study-transcript-seek" data-transcript-lookup="">
          <button
            type="button"
            className="study-transcript-time"
            aria-label={`${seekLabel} ${timestamp(cue.startMs)}`}
            onClick={() => onSeek(cue)}
          >
            {timestamp(cue.startMs)}
          </button>
          {/* A click on a word looks it up; a click between words still seeks, as the
              whole line did before words were their own stops. */}
          <span
            className="study-transcript-text"
            lang={langTag}
            // Owns its click lookup: the global dictionary must not open a second popup.
            data-dict-owner=""
            onClick={(event) => {
              if (!activateWord(event.target)) onSeek(cue);
            }}
            onKeyDown={handleWordKeyDown}
          >
            {lineContent}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="study-transcript-seek"
          onClick={() => onSeek(cue)}
        >
          <span className="study-transcript-time">{timestamp(cue.startMs)}</span>
          <span className="study-transcript-text" lang={langTag}>
            {/* Plain text until this row has been tokenized — the colour arrives a
                frame later rather than the line arriving a frame later. */}
            {lineContent}
          </span>
        </button>
      )}
      {/* Only when it says something the line does not already: an all-kana cue
          would otherwise render twice, identically. Distant rows drop it — a reading
          gloss on a line nobody is looking at is the noise this redesign is removing. */}
      {tokens && distance !== 'far' && distance !== 'past' && readingLine(tokens) !== text && (
        <p className="study-transcript-reading" lang="ja">{readingLine(tokens)}</p>
      )}
      {reading && distance !== 'far' && distance !== 'past' && reading !== text && (
        // Pinyin is Chinese written in Latin letters: `zh-Latn-pinyin`, not `zh-Hans`.
        <p className="study-transcript-reading" lang={langTag.startsWith('zh') ? 'zh-Latn-pinyin' : langTag}>{reading}</p>
      )}
      {translation ? (
        <p className="study-transcript-translation">{translation}</p>
      ) : (
        /*
          Revealed on the active row, on hover and on keyboard focus — never printed
          down every row. "Avoid placing every action on every row" is the rule, and a
          focus-visible reveal is what keeps that from becoming hover-only.
        */
        <button
          type="button"
          className="study-transcript-translate"
          disabled={busy}
          onClick={() => onTranslate(cue, text)}
        >
          {translateLabel}
        </button>
      )}
      {onMine && (
        // Same reveal rule as Translate (active row, hover, focus); a mined line keeps a
        // visible marker instead, so the rail shows at a glance what is already a card.
        <button
          type="button"
          className={`study-transcript-mine${mined ? ' is-mined' : ''}`}
          data-study-action="transcript-mine"
          aria-label={`${mined ? minedLabel : mineLabel}: ${text}`}
          onClick={() => onMine(cue)}
        >
          {mined ? minedLabel : mineLabel}
        </button>
      )}
    </li>
  );
});

export default function VideoCoreTranscriptPanel({
  cues,
  activeIndex,
  lang,
  onSeek,
  onClose,
  trackLabel,
  trackNotice = '',
  knownHighlight = false,
  minedCueKeys,
  onMineCue,
  onWordLookup,
}: Props) {
  const { t } = useT();
  const [query, setQuery] = React.useState('');
  const [follow, setFollow] = React.useState(true);
  const [translations, setTranslations] = React.useState<Record<number, string>>({});
  const [busyIndex, setBusyIndex] = React.useState<number | null>(null);
  const listRef = React.useRef<HTMLOListElement>(null);

  /**
   * Every non-empty cue, each carrying whether it is typesetting rather than speech.
   *
   * Classified from the RAW text, before `stripAssCueText` deletes the brace groups the
   * classifier reads. See `isTypesettingCueText` for the census this is built on.
   */
  const allRows = React.useMemo(
    () => cues
      .map((cue) => ({
        cue,
        text: stripAssCueText(cue.text),
        typeset: isTypesettingCueText(cue.text),
      }))
      .filter((row) => row.text),
    [cues],
  );

  const typesetCount = React.useMemo(
    () => allRows.reduce((total, row) => total + (row.typeset ? 1 : 0), 0),
    [allRows],
  );

  /*
    Signs are off by default and the switch only exists on a track that has any.

    A hidden control on an SRT rail would be a lie in the other direction: nothing is being
    withheld there, because a subtitle format with no override tags flags nothing. On the
    measured OVA this is 2,626 rows of positioned typesetting against 430 spoken lines — the
    column a learner scrolls, the text that gets tokenized and mined from, and six times the
    DOM every band update is paid on.
  */
  const [showSigns, setShowSigns] = React.useState(false);

  /** `position` is the row's place in the rail, which is what the bands are measured in. */
  const rows = React.useMemo(
    () => (showSigns ? allRows : allRows.filter((row) => !row.typeset))
      .map((row, position) => ({ ...row, position })),
    [allRows, showSigns],
  );

  /*
    The playhead does not stop existing between two lines, and the bands must not either.

    `activeIndex` is `activeCue?.index ?? null`, so it drops to null in every gap between
    cues — and `rowDistance(i, null)` is `'mid'` for EVERY row. That made each cue end and
    each cue start rewrite `data-distance` on the whole column: measured live 2026-09-03 on a
    2,650-row track as a single MutationObserver batch of 2,650 mutations, 2,647 of them
    `data-distance`, against exactly one `class` / `data-active` / `aria-current`. Twice per
    spoken line the panel re-rendered all 2,650 memoized rows with their ~47 token spans, and
    the renderer stopped servicing its own timers for up to 24.9 s with the clip playing.
    Defect S5 in the transformation plan; the same track paused, or filtered so the banding is
    suspended, holds ~1 s. It is the attribute rewrite, not the row count — 68 % of these rows
    with banding off measured 2,115 ms against 24,952 ms.

    So the anchor is the last line that WAS spoken. `active` below still comes from the real
    `activeIndex`, so the highlight clears in the gap; only the emphasis hierarchy persists,
    which is what a reader following along wants anyway.
  */
  const bandAnchorRef = React.useRef<number | null>(null);
  if (activeIndex != null) bandAnchorRef.current = activeIndex;
  const bandAnchor = activeIndex ?? bandAnchorRef.current;

  /*
    The bands are measured in rail positions, not cue indices, and once signs are filtered
    those are no longer the same number.

    `rowDistance` calls ±1 `near` and ±4 `mid`. On the measured track 86 % of cues are signs,
    so consecutive spoken lines sit ~7 cue indices apart — every neighbour would score `far`
    and the hierarchy S5 landed would collapse to "the active row, and everything else". The
    scan also answers the case that has no exact hit: the cue on screen may itself be a hidden
    sign, and then the anchor is the last dialogue line before it, so the rail keeps its place
    while typesetting plays over the picture. Cues arrive in start order, hence the break.
  */
  const anchorPosition = React.useMemo(() => {
    if (bandAnchor == null) return null;
    let position: number | null = null;
    for (const row of rows) {
      if (row.cue.index > bandAnchor) break;
      position = row.position;
    }
    return position;
  }, [rows, bandAnchor]);

  /*
    Colour-coding the whole track, without a jank spike on open.

    An episode runs to several hundred cues. Tokenizing them in one pass is tens
    of milliseconds of blocked main thread at exactly the moment the rail slides
    in, and doing it inside the row (on first render) is the same cost with the
    frames spread out but every row still landing in one commit. So it is
    chunked: the list paints immediately in plain text, and colour fills in over
    the next few frames. A row with no entry yet renders its text, never a gap.
  */
  const [tokenRows, setTokenRows] = React.useState<Record<number, JpToken[]>>({});
  const study = useStudyLanguage();
  const langTag = lang === 'zh' ? (study.lang === 'zh' ? study.tag : 'zh-Hans') : lang;
  const japanese = lang === 'ja';

  /*
    Chinese and Russian rows: ICU words, and main's readings for them (pinyin,
    stress) fetched once per track in batches. kuromoji is Japanese-only — a
    Chinese transcript run through it came back as Japanese words with kana.
  */
  const partRows = React.useMemo<Record<number, StudySegment[]>>(() => {
    if (japanese) return {};
    const out: Record<number, StudySegment[]> = {};
    for (const row of rows) out[row.cue.index] = segmentStudyText(row.text, langTag);
    return out;
  }, [rows, japanese, langTag]);
  const [readings, setReadings] = React.useState<ReadingAidResult>({});

  React.useEffect(() => {
    if (japanese || (lang !== 'zh' && lang !== 'ru')) {
      setReadings({});
      return;
    }
    let cancelled = false;
    const words = [...new Set(Object.values(partRows).flatMap((parts) =>
      parts.filter((part) => part.wordLike).map((part) => part.text)))];
    void (async () => {
      for (let i = 0; i < words.length && !cancelled; i += MAX_READING_AID_WORDS) {
        const next = await fetchReadingAid(lang, words.slice(i, i + MAX_READING_AID_WORDS));
        if (!cancelled) setReadings((current) => ({ ...current, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partRows, japanese, lang]);

  React.useEffect(() => {
    let cancelled = false;
    let timer = 0;
    setTokenRows({});
    if (!japanese) return undefined;
    void getTokenizer()
      .then(() => {
        if (cancelled) return;
        let index = 0;
        const step = (): void => {
          if (cancelled) return;
          const slice = rows.slice(index, index + TOKENIZE_CHUNK);
          if (!slice.length) return;
          const next: Record<number, JpToken[]> = {};
          for (const row of slice) next[row.cue.index] = tokenizeSync(row.text);
          setTokenRows((current) => ({ ...current, ...next }));
          index += TOKENIZE_CHUNK;
          timer = window.setTimeout(step, 0);
        };
        step();
      })
      .catch(() => {
        /* no tokenizer, no colour — the transcript still reads */
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rows, japanese]);

  const needle = query.trim().toLowerCase();
  const visible = React.useMemo(
    () => (needle ? rows.filter((row) => row.text.toLowerCase().includes(needle)) : rows),
    [rows, needle],
  );

  /**
   * Whether the scroll about to happen is ours.
   *
   * Manual scrolling has to suspend auto-follow, and the only signal a `scroll` event
   * carries is that the list moved — it cannot say who moved it. So the follow effect
   * marks its own scrolls, and the handler ignores exactly those. Without the mark,
   * following playback would immediately switch following off.
   */
  const programmaticScrollRef = React.useRef(0);

  /**
   * The scroller's own geometry, as of the last scroll we judged.
   *
   * The 250 ms mark above answers "did WE scroll". It cannot answer the other way a
   * `scroll` event arrives without anyone scrolling: the list REFLOWED underneath a
   * fixed `scrollTop`. Measured live 2026-09-02 against the presentation switch —
   * `listScrollTop` 3693 → 4552 and `followChecked` true → false, with the panel box
   * identical at 384x517 in both — so Make Liquid silently switched auto-follow off
   * while a clip was playing, and the reader's only clue was that the transcript
   * stopped moving. Lazy furigana tokenisation, a detach/re-dock and an OS window
   * resize all produce the same event from the same cause.
   *
   * A user gesture never changes `scrollHeight` or `clientHeight`; a reflow almost
   * always changes one. That is the whole discriminator, and it needs no
   * `ResizeObserver` — which would also have been wrong here, since it does not fire
   * at all in an unfocused window and this panel is watched while a video plays.
   *
   * The baseline is refreshed on every programmatic scroll too, i.e. once per cue
   * during playback, so a geometry change that arrives with no scroll event of its own
   * cannot make the NEXT real gesture look like a reflow.
   */
  const listMetricsRef = React.useRef<{ scrollHeight: number; clientHeight: number } | null>(null);

  const recordListMetrics = React.useCallback((): void => {
    const list = listRef.current;
    if (!list) return;
    listMetricsRef.current = { scrollHeight: list.scrollHeight, clientHeight: list.clientHeight };
  }, []);

  const scrollToActive = React.useCallback((): void => {
    if (activeIndex == null) return;
    const node = listRef.current?.querySelector(`[data-cue-index="${activeIndex}"]`);
    // Feature-detected rather than assumed: this runs in an effect, so a host
    // without it (jsdom, and any non-DOM renderer) would not merely fail to
    // scroll — the throw would tear the whole panel out of the tree.
    if (typeof node?.scrollIntoView !== 'function') return;
    programmaticScrollRef.current = Date.now();
    recordListMetrics();
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, recordListMetrics]);

  // Following playback while filtering would fight the reader — they are
  // looking at a subset on purpose, and yanking it to the playhead undoes that.
  React.useEffect(() => {
    if (!follow || needle || activeIndex == null) return;
    scrollToActive();
  }, [activeIndex, follow, needle, scrollToActive]);

  const handleScroll = React.useCallback((): void => {
    const list = listRef.current;
    const previous = listMetricsRef.current;
    if (list && previous) {
      const reflowed = list.scrollHeight !== previous.scrollHeight
        || list.clientHeight !== previous.clientHeight;
      recordListMetrics();
      if (reflowed) {
        // A layout change is not a user scrolling away. Following stays on, and the
        // active line is pulled back into view, because a reflow is exactly when it
        // has been pushed out of it.
        if (follow) scrollToActive();
        return;
      }
    } else {
      recordListMetrics();
    }
    // 250 ms covers a smooth scroll's own event burst. A longer window would swallow a
    // real wheel gesture that lands right after one.
    if (Date.now() - programmaticScrollRef.current < 250) return;
    setFollow(false);
  }, [follow, recordListMetrics, scrollToActive]);

  const handleTranslate = React.useCallback(
    (cue: VideoCoreActiveCue, text: string): void => {
      setBusyIndex(cue.index);
      void translate(text, lang)
        .then((value) => {
          setTranslations((current) => ({ ...current, [cue.index]: value }));
        })
        .catch(() => undefined)
        .finally(() => setBusyIndex((current) => (current === cue.index ? null : current)));
    },
    [lang],
  );

  const translateLabel = t('mediaWorkspace.study.transcriptTranslate');
  const mineLabel = t('studyLoop.lookup.mine');
  const minedLabel = t('studyLoop.lookup.mined');
  const seekLabel = t('studyLoop2.transcript.seekTo');
  const destination = useMiningDestination(lang);

  return (
    <aside className="study-transcript-panel" aria-label={t('mediaWorkspace.study.transcript')}>
      <header className="study-transcript-head">
        <div className="study-transcript-title">
          <strong>{t('mediaWorkspace.study.transcript')}</strong>
          <small>{trackLabel}</small>
        </div>
        <button
          type="button"
          className="study-transcript-close"
          aria-label={t('common.close')}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {trackNotice && (
        <p className="study-transcript-notice" role="status">{trackNotice}</p>
      )}

      {/* A rail shorter than its file says so, with the number. Same treatment as the
          split notice above because it is the same kind of fact: a withheld result. */}
      {typesetCount > 0 && !showSigns && (
        <p className="study-transcript-notice" data-study-notice="signs-hidden" role="status">
          {t('mediaWorkspace.study.transcriptSignsHidden', {
            shown: rows.length,
            hidden: typesetCount,
          })}
        </p>
      )}

      {destination && (
        <p className="study-transcript-destination">
          <span className="study-transcript-destination-label">
            {t('mediaWorkspace.study.transcriptMinesTo')}
          </span>
          <strong>{destination.deckName || destination.profileName}</strong>
          <small>
            {destination.usedDefault
              ? t('mediaWorkspace.study.transcriptRouteDefault', { profile: destination.profileName })
              : t('mediaWorkspace.study.transcriptRouteRule', { profile: destination.profileName })}
          </small>
        </p>
      )}

      <div className="study-transcript-controls">
        <input
          type="search"
          value={query}
          placeholder={t('mediaWorkspace.study.transcriptSearch')}
          aria-label={t('mediaWorkspace.study.transcriptSearch')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.currentTarget.checked)}
          />
          {t('mediaWorkspace.study.transcriptFollow')}
        </label>
        {typesetCount > 0 && (
          <label>
            <input
              type="checkbox"
              checked={showSigns}
              data-study-action="transcript-show-signs"
              onChange={(event) => setShowSigns(event.currentTarget.checked)}
            />
            {t('mediaWorkspace.study.transcriptShowSigns')}
          </label>
        )}
        {/* The way back. Scrolling away suspends following, so without this the only
            route to the playhead is to hunt for it. Shown only when it does something. */}
        {!follow && activeIndex != null && (
          <button
            type="button"
            className="study-transcript-jump"
            data-study-action="transcript-jump-to-current"
            onClick={() => {
              setFollow(true);
              scrollToActive();
            }}
          >
            {t('studyWorkspace.transcript.jumpToCurrent')}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="study-transcript-empty">
          {/* A track that is nothing but typesetting must not report itself as absent:
              the cues are there, this panel is hiding them, and the switch is above. */}
          {t(needle
            ? 'mediaWorkspace.study.transcriptNoMatch'
            : typesetCount > 0
              ? 'mediaWorkspace.study.transcriptOnlySigns'
              : 'mediaWorkspace.study.transcriptEmpty')}
        </p>
      ) : (
        // `sa-palette` carries the six category hues, so a noun is the same green
        // here as in the analysis panel's legend.
        <ol className="study-transcript-list sa-palette" ref={listRef} onScroll={handleScroll}>
          {visible.map((row) => (
            <TranscriptRow
              key={row.cue.index}
              cue={row.cue}
              text={row.text}
              tokens={tokenRows[row.cue.index]}
              parts={partRows[row.cue.index]}
              langTag={langTag}
              reading={japanese || !partRows[row.cue.index]
                ? undefined
                : studyReadingLine(partRows[row.cue.index], lang, readings)}
              translation={translations[row.cue.index]}
              active={row.cue.index === activeIndex}
              // While filtering, every row is a search result rather than a position in
              // the timeline, so the distance hierarchy is suspended — fading four of
              // six matches would hide the answer the reader is looking at.
              distance={needle ? 'mid' : rowDistance(row.position, anchorPosition)}
              busy={busyIndex === row.cue.index}
              onSeek={onSeek}
              onTranslate={handleTranslate}
              translateLabel={translateLabel}
              mined={minedCueKeys?.has(minedCueKey(row.cue)) ?? false}
              knownHighlight={knownHighlight}
              onMine={onMineCue}
              mineLabel={mineLabel}
              minedLabel={minedLabel}
              onWordLookup={onWordLookup}
              seekLabel={seekLabel}
            />
          ))}
        </ol>
      )}
    </aside>
  );
}
