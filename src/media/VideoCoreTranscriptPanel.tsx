import React from 'react';
import type { VideoCoreActiveCue } from '@/app/(main)/_features/video-core/video-core-subtitles';
import { stripAssCueText } from '../shared/videoCoreStudy';
import { resolveProfileMatch } from '../shared/profileRules';
import { posCategoryClass } from '../shared/posCategory';
import { getTokenizer, tokenizeSync, type JpToken } from '../renderer/tokenizer';
import { translate } from '../renderer/translator';
import { useT } from '../renderer/i18n';
import type { StudyLang } from '../renderer/studyEnvironment';

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

function useMiningDestination(): MiningDestination | null {
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
          { source: 'subtitle', cardKind: 'word', language: 'ja' },
          activeId,
        );
        const profile = profiles.find((entry) => entry.id === resolved.profileId)
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
  }, []);

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

function timestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

interface RowProps {
  cue: VideoCoreActiveCue;
  text: string;
  /** Colour-coded tokens, once this row has been through the tokenizer. */
  tokens?: readonly JpToken[];
  translation?: string;
  active: boolean;
  busy: boolean;
  onSeek: (cue: VideoCoreActiveCue) => void;
  onTranslate: (cue: VideoCoreActiveCue, text: string) => void;
  translateLabel: string;
}

const TranscriptRow = React.memo(function TranscriptRow({
  cue,
  text,
  tokens,
  translation,
  active,
  busy,
  onSeek,
  onTranslate,
  translateLabel,
}: RowProps) {
  return (
    <li
      className={`study-transcript-row${active ? ' is-active' : ''}`}
      data-cue-index={cue.index}
      data-active={active ? 'true' : 'false'}
    >
      <button
        type="button"
        className="study-transcript-seek"
        onClick={() => onSeek(cue)}
      >
        <span className="study-transcript-time">{timestamp(cue.startMs)}</span>
        <span className="study-transcript-text" lang="ja">
          {/* Plain text until this row has been tokenized — the colour arrives a
              frame later rather than the line arriving a frame later. */}
          {tokens
            ? tokens.map((token, i) => (
              <span
                key={`${i}-${token.surface}`}
                className={`study-transcript-token ${posCategoryClass(token.pos, token.posDetail)}`}
              >
                {token.surface}
              </span>
            ))
            : text}
        </span>
      </button>
      {/* Only when it says something the line does not already: an all-kana cue
          would otherwise render twice, identically. */}
      {tokens && readingLine(tokens) !== text && (
        <p className="study-transcript-reading" lang="ja">{readingLine(tokens)}</p>
      )}
      {translation ? (
        <p className="study-transcript-translation">{translation}</p>
      ) : (
        <button
          type="button"
          className="study-transcript-translate"
          disabled={busy}
          onClick={() => onTranslate(cue, text)}
        >
          {translateLabel}
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
}: Props) {
  const { t } = useT();
  const [query, setQuery] = React.useState('');
  const [follow, setFollow] = React.useState(true);
  const [translations, setTranslations] = React.useState<Record<number, string>>({});
  const [busyIndex, setBusyIndex] = React.useState<number | null>(null);
  const listRef = React.useRef<HTMLOListElement>(null);

  const rows = React.useMemo(
    () => cues.map((cue) => ({ cue, text: stripAssCueText(cue.text) })).filter((row) => row.text),
    [cues],
  );

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

  React.useEffect(() => {
    let cancelled = false;
    let timer = 0;
    setTokenRows({});
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
  }, [rows]);

  const needle = query.trim().toLowerCase();
  const visible = React.useMemo(
    () => (needle ? rows.filter((row) => row.text.toLowerCase().includes(needle)) : rows),
    [rows, needle],
  );

  // Following playback while filtering would fight the reader — they are
  // looking at a subset on purpose, and yanking it to the playhead undoes that.
  React.useEffect(() => {
    if (!follow || needle || activeIndex == null) return;
    const node = listRef.current?.querySelector(`[data-cue-index="${activeIndex}"]`);
    // Feature-detected rather than assumed: this runs in an effect, so a host
    // without it (jsdom, and any non-DOM renderer) would not merely fail to
    // scroll — the throw would tear the whole rail out of the tree.
    if (typeof node?.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, follow, needle]);

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
  const destination = useMiningDestination();

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
      </div>

      {visible.length === 0 ? (
        <p className="study-transcript-empty">
          {t(needle
            ? 'mediaWorkspace.study.transcriptNoMatch'
            : 'mediaWorkspace.study.transcriptEmpty')}
        </p>
      ) : (
        // `sa-palette` carries the six category hues, so a noun is the same green
        // here as in the analysis panel's legend.
        <ol className="study-transcript-list sa-palette" ref={listRef}>
          {visible.map((row) => (
            <TranscriptRow
              key={row.cue.index}
              cue={row.cue}
              text={row.text}
              tokens={tokenRows[row.cue.index]}
              translation={translations[row.cue.index]}
              active={row.cue.index === activeIndex}
              busy={busyIndex === row.cue.index}
              onSeek={onSeek}
              onTranslate={handleTranslate}
              translateLabel={translateLabel}
            />
          ))}
        </ol>
      )}
    </aside>
  );
}
