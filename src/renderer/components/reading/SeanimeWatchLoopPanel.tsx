/**
 * Phase 6 slice 6 — the watch-to-review loop's surface.
 *
 * The migration has had the outbound half of this loop since `03d27a3`: watch a line,
 * mine it, and a card lands in Anki carrying a full cue provenance record. Nothing ever
 * read that record back. This is the return path.
 *
 * The design question that shaped it was *what is this surface for*, and the answer is not
 * "a list of everything you mined". It is: **which cards are not working, and what did they
 * come from?** Anki already knows the first half — its leech tag and its suspended queue
 * are authoritative, deterministic, and free. The mining provenance knows the second. So
 * the primary content is the small set of cards that need another look, each with a button
 * that takes you back to the exact second it was mined from, and the full list is below it
 * rather than in front of it.
 *
 * Three things this deliberately does **not** do:
 *
 *   - **No due dates.** An interval length is not a due date (`reviewForecast.ts` says so
 *     for the same reason), and `anki:dueForecast` answers collection-wide, which cannot be
 *     attributed to one title. Maturity is reported; due-ness is not invented.
 *   - **No zeroes when Anki is down.** Every card would read `untracked`, which looks like a
 *     verdict. The panel says review state is unknown and shows the cards anyway — the
 *     provenance half still works, so the replay button still works.
 *   - **No per-card Anki actions.** Suspending, unsuspending and re-scheduling belong to
 *     Anki. This surface owns the one thing Anki cannot do: get you back to the video.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IntervalSnapshot } from '../../../shared/anki';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  type StudyReviewFocusRequest,
} from '../../../shared/mediaWorkspace';
import {
  formatWatchLoopTimestamp,
  seanimeWatchLoopAttention,
  seanimeWatchLoopCards,
  seanimeWatchLoopSummary,
  watchLoopReplaySec,
  type WatchLoopCard,
  type WatchLoopStage,
} from '../../../shared/seanimeWatchLoop';
import { studyLibraryPathKey } from '../../../shared/seanimeStudyLibrary';
import {
  normalizeVideoCoreMiningHistory,
  VIDEO_CORE_MINING_HISTORY_KEY,
  type VideoCoreMiningHistoryEntry,
} from '../../../shared/videoCoreMining';
import { useT } from '../../i18n';
import Icon from '../Icons';

/**
 * `Record<Union, …>` so adding a stage is a compile error rather than a raw enum leaking
 * into the JA/ZH/RU chrome — the same rule `mediaWorkspaceLabels.ts` exists to enforce.
 */
const STAGE_KEY: Record<WatchLoopStage, string> = {
  new: 'studyLoop.stage.new',
  learning: 'studyLoop.stage.learning',
  known: 'studyLoop.stage.known',
  leech: 'studyLoop.stage.leech',
  suspended: 'studyLoop.stage.suspended',
  untracked: 'studyLoop.stage.untracked',
};

/** How many of the full list to render. The attention list above it is never truncated. */
const RECENT_LIMIT = 24;

function readHistory(): VideoCoreMiningHistoryEntry[] {
  try {
    return normalizeVideoCoreMiningHistory(
      JSON.parse(localStorage.getItem(VIDEO_CORE_MINING_HISTORY_KEY) ?? '[]'),
    );
  } catch {
    // A corrupt store is an empty history, not a crashed panel.
    return [];
  }
}

interface AnkiState {
  connected: boolean;
  reason?: string;
}

interface Props {
  /**
   * Set when a readiness row handed off to this view. Optional so the panel is still
   * self-contained — the dev harness and the tests mount it with no focus at all.
   */
  focus?: StudyReviewFocusRequest | null;
  onClearFocus?: () => void;
}

// Both props optional, and NO `= {}` default: a default parameter makes TypeScript infer
// the component's props as bare `Attributes`, so every `createElement(Panel, { focus })`
// fails with an unhelpful "no overload matches this call".
export default function SeanimeWatchLoopPanel({ focus, onClearFocus }: Props) {
  const { t, lang } = useT();
  const [history, setHistory] = useState<VideoCoreMiningHistoryEntry[]>([]);
  const [snapshot, setSnapshot] = useState<IntervalSnapshot | null>(null);
  const [anki, setAnki] = useState<AnkiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    // Read the history synchronously and first: it is local, it cannot fail, and the
    // replay path works without Anki. Waiting on the collection to show it would make a
    // dead Anki look like an empty mining history.
    const entries = readHistory();
    setHistory(entries);
    void (async () => {
      try {
        const status = await window.api.ankiStatus();
        if (dead) return;
        setAnki({
          connected: status.connected,
          ...(status.error ? { reason: status.error } : {}),
        });
        if (!status.connected) {
          setSnapshot(null);
          return;
        }
        // Only the notes this panel is about. `ankiGetIntervals()` walks every profile's
        // sync query — `deck:*` by default, 155,377 notes on a real collection — and does
        // not return inside a minute, which left this panel on its loading line with every
        // card staged `untracked` by construction. It also drops any term with whitespace or
        // over 24 characters, so a mined SENTENCE card could never have been staged by it
        // even once it finished. Measured: proof/mining-rollup-live-20260802slice47mine4/.
        const noteIds = entries
          .filter((e) => e.status === 'exported')
          .map((e) => e.noteId)
          .filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0);
        const intervals = await window.api.ankiGetIntervalsForNotes(noteIds);
        if (!dead) setSnapshot(intervals ?? null);
      } catch (error) {
        // An unreachable bridge is not a verdict about Anki — say review state is
        // unknown, which is exactly what the disconnected branch already says.
        if (!dead) {
          setAnki({
            connected: false,
            reason: error instanceof Error ? error.message : String(error),
          });
          setSnapshot(null);
        }
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, [reloadToken]);

  /**
   * Focus is applied to the **input**, not to the output, so every number downstream —
   * tiles, attention list, duplicate count — describes the same set. Filtering only the
   * rendered list would leave the tiles reporting the whole library beside a single
   * title's cards, which is the kind of quietly-wrong pairing this surface exists to
   * avoid.
   */
  const focusKey = focus?.pathKey ?? '';
  const scopedHistory = useMemo(
    () => (focusKey
      ? history.filter((entry) =>
          studyLibraryPathKey(entry.provenance.source.localFilePath ?? '') === focusKey)
      : history),
    [focusKey, history],
  );
  const cards = useMemo(
    () => seanimeWatchLoopCards(scopedHistory, snapshot),
    [scopedHistory, snapshot],
  );
  const summary = useMemo(
    () => seanimeWatchLoopSummary(cards, scopedHistory),
    [cards, scopedHistory],
  );
  const attention = useMemo(() => seanimeWatchLoopAttention(cards), [cards]);

  /**
   * The loop's closing arrow. Same event the library row's `Open` raises — deliberately
   * not `pickMedia()`, whose native dialog blocks nothing visible — but with the card's
   * own cue position, so the player lands on the line rather than wherever the file was
   * last left.
   */
  const replay = useCallback((card: WatchLoopCard) => {
    if (!card.canReplay) return;
    const startAtSec = watchLoopReplaySec(card.cue);
    window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_OPEN_EVENT, {
      detail: { localFilePath: card.localFilePath, startAtSec },
    }));
    setMessage(t('studyLoop.opening', {
      title: card.title,
      time: formatWatchLoopTimestamp(card.cue.startMs),
    }));
  }, [t]);

  /** False while Anki has not answered — see the tile note below. */
  const reviewStateKnown = anki?.connected === true;

  const stats: ReadonlyArray<{ key: string; label: string; value: number; alert?: boolean }> =
    useMemo(() => {
      // The card count is provenance, so it is true whatever Anki is doing. Every other
      // tile is an Anki answer, and with Anki unreachable a rendered `0` is not a small
      // inaccuracy — it is a confident claim built from a question nobody asked. Dropping
      // those tiles says "unknown" more clearly than any placeholder glyph could, and the
      // alert note directly beneath them explains why they are gone.
      const cards = { key: 'cards', label: t('studyLoop.stat.cards'), value: summary.cards };
      if (!reviewStateKnown) return [cards];
      return [
        cards,
        {
          key: 'attention',
          label: t('studyLoop.stat.attention'),
          value: summary.attention,
          // Emphasis only when there is something to emphasise; a permanent red zero is
          // noise that trains the eye to ignore the tile.
          alert: summary.attention > 0,
        },
        { key: 'known', label: t('studyLoop.stat.known'), value: summary.known },
        { key: 'new', label: t('studyLoop.stat.new'), value: summary.new },
        { key: 'untracked', label: t('studyLoop.stat.untracked'), value: summary.untracked },
      ];
    // `lang`, never `t` — `t`'s identity is stable by design, so depending on it goes
    // stale after a language switch instead of erroring. This is `CLAUDE.md`'s i18n
    // rule 6 and the repo's stated #1 review item for new i18n code.
    }, [lang, reviewStateKnown, summary]);

  return (
    <section className="study-lib study-loop" aria-label={t('studyLoop.title')}>
      <header className="study-lib-head">
        <div>
          <span className="study-lib-eyebrow">{t('studyLoop.eyebrow')}</span>
          <h2>{t('studyLoop.title')}</h2>
          <p>{t('studyLoop.intro')}</p>
        </div>
        <button
          type="button"
          className="study-lib-refresh"
          onClick={reload}
          disabled={loading}
        >
          <Icon name="refresh" size={13} />
          {t('studyLoop.refresh')}
        </button>
      </header>

      {/* Exists before its content, so a change to it is actually announced. */}
      <p className="study-lib-status" role="status" aria-live="polite">
        {loading ? t('studyLoop.loading') : message}
      </p>

      {/* Outside the content branch on purpose: a focus that happens to match nothing
          must still be clearable, or the view is a dead end. */}
      {focus ? (
        <p className="study-loop-focus">
          <span>{t('studyLoop.focused', { title: focus.title })}</span>
          <button type="button" className="study-lib-open" onClick={onClearFocus}>
            {t('studyLoop.clearFocus')}
          </button>
        </p>
      ) : null}

      {cards.length === 0 && summary.duplicates === 0 ? (
        <div className="study-lib-empty" role="status">
          <p>
            <strong>
              {focus ? t('studyLoop.emptyFocusTitle') : t('studyLoop.emptyTitle')}
            </strong>
          </p>
          <p>{focus ? t('studyLoop.emptyFocusHint') : t('studyLoop.emptyHint')}</p>
        </div>
      ) : (
        <>
          <dl className="study-loop-stats">
            {stats.map((stat) => (
              <div key={stat.key} className="study-loop-stat" data-alert={stat.alert === true}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>

          {/* Without this, every card reads `untracked` and the panel looks like a
              verdict on the collection rather than a missing connection. */}
          {anki && !anki.connected ? (
            <p className="study-loop-note" data-alert="true" role="status">
              {anki.reason
                ? t('studyLoop.ankiOfflineReason', { reason: anki.reason })
                : t('studyLoop.ankiOffline')}
            </p>
          ) : null}

          {anki?.connected && summary.untracked > 0 ? (
            <p className="study-loop-note">
              {t('studyLoop.untrackedNote', { count: summary.untracked })}
            </p>
          ) : null}

          {summary.duplicates > 0 ? (
            <p className="study-loop-note">
              {t('studyLoop.duplicates', { count: summary.duplicates })}
            </p>
          ) : null}

          <section className="study-loop-section" aria-label={t('studyLoop.attentionTitle')}>
            <h3>
              {t('studyLoop.attentionTitle')}
              <span className="study-lib-count">{attention.length}</span>
            </h3>
            {attention.length === 0 ? (
              // "Nothing is stuck" is a claim, and it needs Anki to have answered. With
              // Anki unreachable the honest statement is that it could not be asked —
              // reporting a clean bill of health from an unanswered question is exactly
              // the false green this whole module is written against.
              <p className="study-loop-clear">
                {reviewStateKnown
                  ? t('studyLoop.attentionClear')
                  : t('studyLoop.attentionUnknown')}
              </p>
            ) : (
              <>
                <p className="study-loop-note">{t('studyLoop.attentionHint')}</p>
                <ul className="study-lib-list">
                  {attention.map((card) => (
                    <Card key={card.historyId} card={card} onReplay={replay} prominent />
                  ))}
                </ul>
              </>
            )}
          </section>

          {cards.length > 0 ? (
            <section className="study-loop-section" aria-label={t('studyLoop.recentTitle')}>
              <h3>
                {t('studyLoop.recentTitle')}
                <span className="study-lib-count">{cards.length}</span>
              </h3>
              <ul className="study-lib-list">
                {cards.slice(0, RECENT_LIMIT).map((card) => (
                  <Card key={card.historyId} card={card} onReplay={replay} />
                ))}
              </ul>
              {/* A silent truncation reads as "that is all of them". */}
              {cards.length > RECENT_LIMIT ? (
                <p className="study-loop-note">
                  {t('studyLoop.truncated', { count: cards.length - RECENT_LIMIT })}
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

function Card({
  card,
  onReplay,
  prominent = false,
}: {
  card: WatchLoopCard;
  onReplay: (card: WatchLoopCard) => void;
  prominent?: boolean;
}) {
  const { t } = useT();
  const time = formatWatchLoopTimestamp(card.cue.startMs);
  const source = card.episodeNumber != null
    ? t('studyLoop.sourceEpisode', {
        title: card.title,
        episode: card.episodeNumber,
        time,
      })
    : t('studyLoop.source', { title: card.title, time });
  return (
    <li
      className="study-loop-card"
      data-stage={card.stage}
      data-prominent={prominent}
    >
      <div className="study-loop-card-head">
        {/* Study content, so it carries its own language for the screen reader's voice
            and for line-breaking — the surrounding chrome may be any of four. */}
        <strong lang="ja">{card.term}</strong>
        <span className="study-lib-badge">{t(STAGE_KEY[card.stage])}</span>
      </div>
      {/* Only where it adds something: on a word card the sentence is the context, but on
          a sentence card the term already *is* the sentence. */}
      {card.sentence && card.sentence !== card.term ? (
        <p className="study-loop-sentence" lang="ja">{card.sentence}</p>
      ) : null}
      <div className="study-loop-card-foot">
        <span className="study-loop-source" title={card.localFilePath || undefined}>
          {source}
          {card.ivlDays != null
            ? ` · ${t('studyLoop.interval', { count: card.ivlDays })}`
            : ''}
        </span>
        <button
          type="button"
          className="study-lib-open"
          disabled={!card.canReplay}
          // A disabled control with no stated reason reads as broken.
          title={card.canReplay ? undefined : t('studyLoop.replayUnavailable')}
          // Named by term: "Replay the line" repeated down a list gives a screen reader
          // nothing to choose between.
          aria-label={t('studyLoop.replayNamed', { term: card.term })}
          onClick={() => onReplay(card)}
        >
          {t('studyLoop.replay')}
        </button>
      </div>
    </li>
  );
}
