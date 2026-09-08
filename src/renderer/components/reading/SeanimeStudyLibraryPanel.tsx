/**
 * Phase 6 slice 2 — the Study Mode surface over the unified library.
 *
 * Renders `joinSeanimeStudyLibrary`'s output: the health summary, the readiness filters
 * the plan asks for, and the preparation queue.
 *
 * ## Two things the real data dictated
 *
 * Measured offline against the user's actual library before this was written
 * (`docs/migration/proof/phase6-join-20260730/real-data-join.json`):
 *
 *   1. **29 of 30 real items have no Japanese subtitle.** A surface built around "here are
 *      your ready titles" would be empty on this user's real data. So the queue — the
 *      actionable gap — is the primary content, and `ready` is a filter, not the headline.
 *   2. **The real Seanime profile has an empty library** (`local_files` is `[]`, no scan has
 *      ever run). "Sidecar ready but zero files" is therefore not a theoretical edge case,
 *      it is the current state, and it gets a first-class explanatory empty state instead of
 *      a blank panel.
 *
 * ## Why the orchestrator document is injected rather than imported
 *
 * Readiness scores live in `shared/mediaStudyOrchestrator.ts`, which is **untracked** and
 * owned by another track — `docs/migration/NEXT_SESSION.md` forbids this migration line
 * from importing that track's in-flight orchestrator contracts. This component therefore
 * takes the document and fingerprints as optional props and never reaches for them itself.
 * Without them the join still resolves `unlinked` / `missing-subtitles` / `unanalyzed`,
 * which is 30 of 30 of the real library; with them it additionally distinguishes
 * `ready` from `stale`. See the state doc's "cross-track dependency" section.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  filterSeanimeStudyDifficulty,
  hasDifficulty,
  joinSeanimeStudyLibrary,
  seanimeStudyDifficultyLevels,
  seanimeStudyAnkiHealth,
  seanimeStudyLibraryHealth,
  seanimeStudyPreparationQueue,
  studyLibraryPathKey,
  type SeanimeStudyAnkiHealth,
  type SeanimeLibraryFile,
  type SeanimeStudyLibraryEntry,
  type SeanimeStudyReadinessState,
  type StudyOrchestratorDocument,
  type StudyReadinessFingerprints,
} from '../../../shared/seanimeStudyLibrary';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  STUDY_REVIEW_FOCUS_EVENT,
} from '../../../shared/mediaWorkspace';
import {
  seanimeWatchLoopByEntry,
  seanimeWatchLoopCards,
  type WatchLoopEntryRollup,
} from '../../../shared/seanimeWatchLoop';
import {
  normalizeVideoCoreMiningHistory,
  VIDEO_CORE_MINING_HISTORY_KEY,
} from '../../../shared/videoCoreMining';
import { translateAnkiReason } from '../../../shared/anki';
import type { MediaItem } from '../../../shared/types';
import { useT } from '../../i18n';
import Icon from '../Icons';

/** Filter values: every readiness state, plus "everything". */
type StateFilter = 'all' | SeanimeStudyReadinessState;

const FILTERS: readonly StateFilter[] = [
  'all', 'unanalyzed', 'stale', 'missing-subtitles', 'unlinked', 'ready',
];

const FILTER_KEY: Record<StateFilter, string> = {
  all: 'studyLibrary.filter.all',
  unanalyzed: 'studyLibrary.state.unanalyzed',
  stale: 'studyLibrary.state.stale',
  'missing-subtitles': 'studyLibrary.state.missingSubtitles',
  unlinked: 'studyLibrary.state.unlinked',
  ready: 'studyLibrary.state.ready',
};

/** What each state's next step is. The point of the surface is to say this. */
const ACTION_KEY: Record<SeanimeStudyReadinessState, string> = {
  ready: 'studyLibrary.action.ready',
  stale: 'studyLibrary.action.stale',
  unanalyzed: 'studyLibrary.action.unanalyzed',
  'missing-subtitles': 'studyLibrary.action.missingSubtitles',
  unlinked: 'studyLibrary.action.unlinked',
};

type LoadState =
  | { kind: 'loading' }
  /** An explicit reason, never an empty list — the Phase-1 lifecycle rule. */
  | { kind: 'error'; message: string }
  | { kind: 'ready'; files: SeanimeLibraryFile[] };

/**
 * What running an analysis produced. Declared structurally, on purpose: it mirrors
 * `renderer/mediaStudyOrchestrator.ts`'s `prepareStudyMediaById` return type without
 * importing it, so supplying the action is an assignment the caller makes and this file
 * stays free of the untracked orchestrator — the same bargain `orchestrator` already makes.
 *
 * `queued-transcription` is not a failure. It is what happens when no Japanese subtitle is
 * attached: the work is real, it just moved to the transcription queue, and saying
 * "analysed" there would be a lie the user finds out about later.
 */
export type SeanimeStudyAnalyseResult =
  | { status: 'prepared'; candidateCount?: number; readinessCategory?: string }
  | { status: 'queued-transcription'; stage?: string };

export type SeanimeStudyAnalyseAction = (
  entry: SeanimeStudyLibraryEntry,
) => Promise<SeanimeStudyAnalyseResult>;

interface Props {
  /**
   * Optional so this surface never imports the untracked orchestrator module. Without it,
   * scores are unavailable and entries resolve to the three subtitle-health states.
   */
  orchestrator?: StudyOrchestratorDocument;
  fingerprints?: StudyReadinessFingerprints;
  /**
   * Injected for the same reason and on the same terms as `orchestrator`.
   *
   * The analyse path exists — `preload.ts` exposes `studyPrepare` and
   * `renderer/mediaStudyOrchestrator.ts` exposes `prepareStudyMediaById(mediaId,
   * subtitleRecordId)`, whose signature this prop is shaped to accept directly. What it
   * does **not** have is a committed home: the `study:prepare` handler is registered by
   * `main/mediaStudyOrchestrator.ts`, which is untracked. So the capability is offered
   * rather than reached for, and the button appears only where somebody supplies it.
   */
  onAnalyse?: SeanimeStudyAnalyseAction;
}

const NO_DOCUMENT: StudyOrchestratorDocument = {
  version: 2,
  readiness: {},
  opportunities: {},
  workspaces: {},
  jobs: {},
  actions: [],
} as unknown as StudyOrchestratorDocument;

/**
 * The mining history's own store, read directly.
 *
 * `VideoCoreMiningPanel` writes it and `SeanimeWatchLoopPanel` reads it the same way; this
 * copy exists so a *preparation* row can also say what watching it already produced,
 * which is what makes Phase 6's two halves one surface instead of two lists of the same
 * files. A corrupt store is an empty history, never a crashed panel.
 */
function readMiningHistory() {
  try {
    return normalizeVideoCoreMiningHistory(
      JSON.parse(localStorage.getItem(VIDEO_CORE_MINING_HISTORY_KEY) ?? '[]'),
    );
  } catch {
    return [];
  }
}

const NO_FINGERPRINTS: StudyReadinessFingerprints = {
  knowledgeFingerprint: '',
  levelListsFingerprint: '',
  frequencyListsFingerprint: '',
};

export default function SeanimeStudyLibraryPanel({
  orchestrator,
  fingerprints,
  onAnalyse,
}: Props) {
  const { t } = useT();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [items, setItems] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<StateFilter>('all');
  const [level, setLevel] = useState('');
  const [query, setQuery] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [busyKey, setBusyKey] = useState('');
  const [message, setMessage] = useState('');
  const [anki, setAnki] = useState<SeanimeStudyAnkiHealth | null>(null);
  const [mined, setMined] = useState<Map<string, WatchLoopEntryRollup>>(() => new Map());

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  /**
   * D311 — the error state told the user to start the media server and gave them
   * no way to do it. `MediaWorkspaceHost` and `BlancStudyPlayer` have carried
   * exactly this control the whole time; the capability was present and only this
   * surface was missing it, so this is one button, not a new route.
   *
   * `seanimeStart()` polls health before it resolves, so its answer is terminal:
   * `ready` means reloading will now succeed, and anything else carries the
   * sidecar's own reason, which is worth more than a generic failure.
   */
  const startServer = useCallback(async () => {
    setStarting(true);
    setStartError('');
    try {
      const status = await window.api.seanimeStart();
      if (status.kind === 'ready') reload();
      else setStartError(status.error || status.kind);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }, [reload]);

  useEffect(() => {
    let dead = false;
    setLoad({ kind: 'loading' });
    void (async () => {
      try {
        const [reply, library] = await Promise.all([
          window.api.seanimeStudyLibrary(),
          // `listMedia`, NOT `listLibrary`: the latter is the *reading* library, whose
          // items carry `sourcePath` and no `path` at all — joining against it would put
          // every single entry in `unlinked`, a total but silent join failure.
          window.api.listMedia().catch((): MediaItem[] => []),
        ]);
        if (dead) return;
        setItems(library);
        setLoad(reply.ok
          ? { kind: 'ready', files: reply.files }
          : { kind: 'error', message: reply.error });
      } catch (error) {
        if (!dead) {
          setLoad({
            kind: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => { dead = true; };
  }, [reloadToken]);

  /**
   * Anki health, resolved once per load. Separate from the library effect because a dead
   * Anki must not stop the library from rendering — subtitle work is still actionable
   * without it, and vice versa.
   */
  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const [status, rules] = await Promise.all([
          window.api.ankiStatus(),
          window.api.profileRulesGet().catch(() => ({ rules: [] })),
        ]);
        if (dead) return;
        setAnki(seanimeStudyAnkiHealth({
          connected: status.connected,
          decks: status.decks,
          ...(status.error ? { error: status.error } : {}),
          rules: rules.rules,
          // The seed profile every shipped install routes subtitle cards to.
          defaultProfileId: 'seed-ja-immersion',
        }));
      } catch {
        // An unreachable bridge is not a health verdict — say nothing rather than
        // claiming Anki is broken.
        if (!dead) setAnki(null);
      }
    })();
    return () => { dead = true; };
  }, [reloadToken]);

  /**
   * The return leg of Phase 6's loop, folded onto the same rows.
   *
   * Its **own** effect, and that is load-bearing rather than tidy: the first version put
   * this inside the Anki-health effect, where one throwing call erased the health verdict
   * entirely and the panel silently lost a line it was supposed to always show. These are
   * independent facts and they fail independently.
   *
   * The card *count* comes from mining provenance alone, so it survives a dead Anki
   * completely; only the "needs a look" half needs the interval snapshot, which is why a
   * null snapshot still produces a rollup instead of suppressing it.
   */
  useEffect(() => {
    let dead = false;
    const history = readMiningHistory();
    if (!history.length) return () => { dead = true; };
    setMined(seanimeWatchLoopByEntry(seanimeWatchLoopCards(history, null)));
    void (async () => {
      try {
        // The notes this rollup is about, not the collection — see the same change in
        // `SeanimeWatchLoopPanel`. The collection-wide poll does not return inside a minute
        // on a real library, and its word-only expression filter drops mined sentence cards
        // outright, so asking it was slow AND could not answer.
        const noteIds = history
          .filter((e) => e.status === 'exported')
          .map((e) => e.noteId)
          .filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0);
        const intervals = await window.api.ankiGetIntervalsForNotes(noteIds);
        if (dead || !intervals) return;
        setMined(seanimeWatchLoopByEntry(seanimeWatchLoopCards(history, intervals)));
      } catch {
        // Keep the provenance-only rollup: "12 cards mined" is still true and still
        // useful when Anki cannot say how they are doing.
      }
    })();
    return () => { dead = true; };
  }, [reloadToken]);

  const entries = useMemo(
    () => (load.kind === 'ready'
      ? joinSeanimeStudyLibrary(
          load.files,
          items,
          orchestrator ?? NO_DOCUMENT,
          fingerprints ?? NO_FINGERPRINTS,
        )
      : []),
    [fingerprints, items, load, orchestrator],
  );

  const health = useMemo(() => seanimeStudyLibraryHealth(entries), [entries]);

  /** Only offer levels the library actually contains — not a fixed N5–N1 list. */
  const levels = useMemo(() => seanimeStudyDifficultyLevels(entries), [entries]);

  const visible = useMemo(() => {
    // The queue is the default view because it is the actionable set; `ready` is reachable
    // only by asking for it, since on real data it is the rarest state.
    let base = filter === 'all'
      ? seanimeStudyPreparationQueue(entries)
      : entries.filter((entry) => entry.state === filter);
    if (level) base = filterSeanimeStudyDifficulty(base, { levels: [level] });
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return base;
    return base.filter((entry) => entry.title.toLocaleLowerCase().includes(needle));
  }, [entries, filter, level, query]);

  /**
   * The one row action this track owns. Raising the app's own workspace-open event with a
   * `localFilePath` is exactly the request the header's "Open local video" button ends up
   * making — and unlike that button it does not go through `pickMedia()`, which opens a
   * native dialog. Analyse and import belong to other tracks' services, so they stay as
   * stated next steps rather than half-wired buttons here.
   */
  const openInPlayer = useCallback((entry: SeanimeStudyLibraryEntry) => {
    window.dispatchEvent(new CustomEvent(MEDIA_WORKSPACE_OPEN_EVENT, {
      detail: { localFilePath: entry.path },
    }));
  }, []);

  /**
   * `unlinked` → import. `addMediaPaths` is a **committed** contract
   * (`main/media.ts` `media:addPaths`, both files tracked), which is the bar the migration
   * line holds itself to — unlike the analyse path, which no preload API exposes at all
   * and which would have to reach into the untracked orchestrator.
   *
   * It returns the whole library, so the join simply recomputes and the row transitions
   * out of `unlinked` on its own. It also **silently skips** a file whose extension is not
   * in `MEDIA_EXT`, returning the library unchanged — so success is verified by checking
   * the item actually arrived, not by the call not throwing.
   */
  const importEntry = useCallback(async (entry: SeanimeStudyLibraryEntry) => {
    setBusyKey(entry.pathKey);
    setMessage('');
    try {
      const next = await window.api.addMediaPaths([entry.path]);
      setItems(next);
      const arrived = next.some(
        (item) => studyLibraryPathKey(item.path) === entry.pathKey,
      );
      setMessage(arrived
        ? t('studyLibrary.imported', { title: entry.title })
        : t('studyLibrary.importSkipped', { title: entry.title }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey('');
    }
  }, [t]);

  /**
   * `unanalyzed` / `stale` → analyse, through the injected action.
   *
   * **The row does not transition on success, and that is not an oversight.** Import can
   * recompute locally because it owns `items`; readiness lives in the `orchestrator`
   * document, which this surface takes as a prop and does not own. So the outcome is
   * *stated* and the library is reloaded, but the badge changes only once whoever supplies
   * the document supplies a fresher one. Claiming otherwise would have the row lie about
   * work it cannot see.
   *
   * `queued-transcription` is reported as its own outcome for the same reason `unlinked` is
   * its own state: sending the user to look for a readiness score that is still minutes away
   * is worse than telling them where the work went.
   */
  const analyseEntry = useCallback(async (entry: SeanimeStudyLibraryEntry) => {
    if (!onAnalyse) return;
    setBusyKey(entry.pathKey);
    setMessage('');
    try {
      const result = await onAnalyse(entry);
      setMessage(result.status === 'queued-transcription'
        ? t('studyLibrary.analyseQueued', { title: entry.title })
        : t('studyLibrary.analysed', {
          title: entry.title,
          count: result.candidateCount ?? 0,
        }));
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey('');
    }
  }, [onAnalyse, reload, t]);

  const countFor = (value: StateFilter): number => {
    switch (value) {
      case 'all': return health.total - health.ready;
      case 'ready': return health.ready;
      case 'stale': return health.stale;
      case 'unanalyzed': return health.unanalyzed;
      case 'missing-subtitles': return health.missingSubtitles;
      case 'unlinked': return health.unlinked;
      default: return 0;
    }
  };

  return (
    <section className="study-lib" aria-label={t('studyLibrary.title')}>
      <header className="study-lib-head">
        <div>
          <span className="study-lib-eyebrow">{t('studyLibrary.eyebrow')}</span>
          <h2>{t('studyLibrary.title')}</h2>
          <p>{t('studyLibrary.intro')}</p>
        </div>
        <button
          type="button"
          className="study-lib-refresh"
          onClick={reload}
          disabled={load.kind === 'loading'}
        >
          <Icon name="refresh" size={13} />
          {t('studyLibrary.refresh')}
        </button>
      </header>

      {/* Present before content so the state change is actually announced. */}
      <p className="study-lib-status" role="status" aria-live="polite">
        {load.kind === 'loading' ? t('studyLibrary.loading') : message}
      </p>

      {load.kind === 'error' ? (
        <div className="study-lib-empty" role="alert">
          <p><strong>{t('studyLibrary.unavailable')}</strong></p>
          <p className="study-lib-empty-detail">{load.message}</p>
          <p>{t('studyLibrary.unavailableHint')}</p>
          <button
            type="button"
            // Reuses the panel's own button chrome rather than adding a rule to a
            // stylesheet another track is holding dirty; `justify-self` keeps it
            // from stretching across the grid the empty box lays out.
            className="study-lib-refresh study-lib-start-server"
            style={{ justifySelf: 'start' }}
            onClick={() => void startServer()}
            disabled={starting}
          >
            <Icon name="player" size={13} />
            {starting ? t('mediaWorkspace.connectingServer') : t('mediaWorkspace.startServer')}
          </button>
          {/* Same treatment `load.message` gets above: the sidecar's own reason,
              which is the only thing that distinguishes "no binary" from "port
              taken" from "timed out". */}
          {startError ? (
            <p className="study-lib-empty-detail" role="status">{startError}</p>
          ) : null}
        </div>
      ) : null}

      {/* Measured, not hypothetical: this is the user's current real state. */}
      {load.kind === 'ready' && load.files.length === 0 ? (
        <div className="study-lib-empty" role="status">
          <p><strong>{t('studyLibrary.emptyLibrary')}</strong></p>
          <p>{t('studyLibrary.emptyLibraryHint')}</p>
        </div>
      ) : null}

      {load.kind === 'ready' && load.files.length > 0 ? (
        <>
          <div className="study-lib-health">
            {/* Three independently-pluralized fragments rather than one sentence: the
                plural machinery selects on a single `count`, and this line carries three
                counts that inflect separately. A one-file library rendered "1 files ·
                1 need work" until this was split (found live 2026-07-31). */}
            <p>
              {[
                t('studyLibrary.health.total', { count: health.total }),
                t('studyLibrary.health.queued', { count: health.total - health.ready }),
                t('studyLibrary.health.ready', { count: health.ready }),
              ].join(' · ')}
            </p>
            {/* The other half of "subtitle and Anki health": would a card mined from this
                library actually land right now? Each failure names its own fix. */}
            {anki ? (
              <p className="study-lib-anki" data-ok={anki.ok}>
                {anki.ok
                  ? t('studyLibrary.anki.ok', {
                      decks: anki.deckCount,
                      profile: anki.matchedRuleLabel
                        ? t('studyLibrary.anki.viaRule', { rule: anki.matchedRuleLabel })
                        : anki.profileId ?? '',
                    })
                  : anki.problem === 'disconnected'
                    ? // Same reason as SeanimeWatchLoopPanel: main authors this in English.
                      `${t('studyLibrary.anki.disconnected')}${anki.reason ? ` — ${translateAnkiReason(anki.reason, t)}` : ''}`
                    : anki.problem === 'no-decks'
                      ? t('studyLibrary.anki.noDecks')
                      : t('studyLibrary.anki.noProfile')}
              </p>
            ) : null}
            {/* Counts are words, not just colour — nothing here relies on hue. */}
            <div className="study-lib-filters" role="group" aria-label={t('studyLibrary.filterLabel')}>
              {FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {t(FILTER_KEY[value])}
                  <span className="study-lib-count">{countFor(value)}</span>
                </button>
              ))}
            </div>
            <div className="study-lib-tools">
              <label className="study-lib-search">
                <Icon name="search" size={13} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('studyLibrary.searchPlaceholder')}
                  aria-label={t('studyLibrary.searchLabel')}
                />
              </label>
              {/* Rendered only when something is actually scored: with no readiness
                  document every level list is empty, and an always-present control
                  offering one option would imply a filter that cannot do anything. */}
              {levels.length > 0 ? (
                <label className="study-lib-level">
                  {t('studyLibrary.levelLabel')}
                  <select value={level} onChange={(event) => setLevel(event.target.value)}>
                    <option value="">{t('studyLibrary.levelAny')}</option>
                    {levels.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {level ? (
              <p className="study-lib-note">
                {t('studyLibrary.unscoredKept', {
                  count: visible.filter((entry) => !hasDifficulty(entry)).length,
                })}
              </p>
            ) : null}
          </div>

          {visible.length === 0 ? (
            <p className="study-lib-none" role="status">
              {query.trim()
                ? t('studyLibrary.noSearchResults')
                : filter === 'all'
                  ? t('studyLibrary.queueClear')
                  : t('studyLibrary.noneInState')}
            </p>
          ) : (
            <ul className="study-lib-list">
              {visible.map((entry) => (
                <Row
                  key={entry.pathKey}
                  entry={entry}
                  busy={busyKey === entry.pathKey}
                  mined={mined.get(entry.pathKey)}
                  onOpen={openInPlayer}
                  onImport={importEntry}
                  onAnalyse={onAnalyse ? analyseEntry : undefined}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}

function Row({
  entry,
  busy,
  mined,
  onOpen,
  onImport,
  onAnalyse,
}: {
  entry: SeanimeStudyLibraryEntry;
  busy: boolean;
  /** Absent when nothing has ever been mined from this file — not zero, absent. */
  mined?: WatchLoopEntryRollup;
  onOpen: (entry: SeanimeStudyLibraryEntry) => void;
  onImport: (entry: SeanimeStudyLibraryEntry) => void;
  /** Absent when nobody supplied an analyse action, which is the shipped default. */
  onAnalyse?: (entry: SeanimeStudyLibraryEntry) => void;
}) {
  const { t } = useT();
  const coverage = entry.readiness?.knownCoverage;
  return (
    <li className="study-lib-row" data-state={entry.state}>
      <div className="study-lib-row-main">
        <strong title={entry.title}>{entry.title}</strong>
        <span className="study-lib-row-meta">
          {entry.episode != null
            ? t('studyLibrary.episode', { number: entry.episode })
            : t('studyLibrary.noEpisode')}
          {entry.readiness?.contentLevel ? ` · ${entry.readiness.contentLevel}` : ''}
          {typeof coverage === 'number'
            ? ` · ${t('studyLibrary.coverage', { percent: Math.round(coverage * 100) })}`
            : ''}
        </span>
        {/* What watching this already produced. Rendered only when there is something to
            say — a permanent "0 cards mined" on every row is noise, and its absence is
            already the honest answer. */}
        {mined ? (
          // A button, not a label: the count is only worth stating if it can be acted on,
          // and a number the user can read but not follow is worse than no number.
          <button
            type="button"
            className="study-lib-row-loop"
            data-alert={mined.attention > 0}
            aria-label={t('studyLibrary.reviewNamed', { title: entry.title })}
            onClick={() => window.dispatchEvent(new CustomEvent(STUDY_REVIEW_FOCUS_EVENT, {
              detail: { pathKey: entry.pathKey, title: entry.title },
            }))}
          >
            {t('studyLibrary.minedRollup', { count: mined.cards })}
            {mined.attention > 0
              ? ` · ${t('studyLibrary.minedAttention', { count: mined.attention })}`
              : ''}
          </button>
        ) : null}
        {/* The path is the join key; showing it makes an unexpected `unlinked` debuggable. */}
        <small className="study-lib-row-path" title={entry.path}>{entry.path}</small>
      </div>
      <div className="study-lib-row-state">
        <span className="study-lib-badge">{t(FILTER_KEY[entry.state])}</span>
        <small>{t(ACTION_KEY[entry.state])}</small>
        <div className="study-lib-row-actions">
          {/* Only where it is the stated next action — an Import button on a file Study OS
              already has would do nothing and say nothing. */}
          {entry.state === 'unlinked' ? (
            <button
              type="button"
              className="study-lib-open"
              disabled={busy}
              aria-label={t('studyLibrary.importNamed', { title: entry.title })}
              onClick={() => onImport(entry)}
            >
              {t(busy ? 'studyLibrary.importing' : 'studyLibrary.import')}
            </button>
          ) : null}
          {/* Both states whose stated next action IS analysis, and only those: `ready`
              needs nothing, `missing-subtitles` has nothing to analyse, and `unlinked`
              is not in Study OS yet. `stale` is included because re-analysis is exactly
              what its action line already tells the user to do. */}
          {onAnalyse && (entry.state === 'unanalyzed' || entry.state === 'stale') ? (
            <button
              type="button"
              className="study-lib-analyse"
              disabled={busy}
              aria-label={t('studyLibrary.analyseNamed', { title: entry.title })}
              onClick={() => onAnalyse(entry)}
            >
              {t(busy
                ? 'studyLibrary.analysing'
                : entry.state === 'stale'
                  ? 'studyLibrary.reanalyse'
                  : 'studyLibrary.analyse')}
            </button>
          ) : null}
          <button
            type="button"
            className="study-lib-open"
            // Named by title, because "Open" repeated down a list gives a screen reader
            // nothing to choose between.
            aria-label={t('studyLibrary.openNamed', { title: entry.title })}
            onClick={() => onOpen(entry)}
          >
            {t('studyLibrary.open')}
          </button>
        </div>
      </div>
    </li>
  );
}
