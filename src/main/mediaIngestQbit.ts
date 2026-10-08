/**
 * qBittorrent completion for the media ingest.
 *
 * A light poller: while a qBittorrent profile is configured and answering, it
 * lists the torrents, notices the ones that have finished, reads which files
 * they hold and hands the finished videos to the ingest with whatever identity
 * the handoff ledger (or the torrent's `gum:*` tags) has for them.
 *
 * Deliberately conservative about the user's client:
 *
 * - **Only reads.** Nothing here starts, stops, moves or deletes a torrent.
 * - **A refused credential stops polling** until the settings change. Retrying
 *   a wrong password every few seconds is how a WebUI bans the machine.
 * - **An unreachable client backs off** (30 s doubling to 10 min) instead of
 *   polling a closed port on a timer, and costs nothing while it is off.
 * - **The first poll is a baseline**; see `planQbitCompletions`.
 *
 * Every side effect is injected so the suite runs it on a fake clock.
 */

import { isScraperQbitConfigured, type ScraperQbittorrentSettings } from '../shared/scraperSourceSettings';
import {
  hintFromTags,
  isTorrentComplete,
  planQbitCompletions,
  torrentOwningPath,
  type MediaIngestHint,
  type MediaIngestQbitStatus,
  type QbitTorrentSnapshot,
} from '../shared/mediaIngest';
import type { QbitFileEntry, QbitOutcome, QbitPollOutcome } from './scraper/qbittorrent';

/** Poll interval while something is downloading. */
export const QBIT_POLL_ACTIVE_MS = 10_000;
/** Poll interval while every torrent is finished or stopped. */
export const QBIT_POLL_IDLE_MS = 45_000;
export const QBIT_BACKOFF_MIN_MS = 30_000;
export const QBIT_BACKOFF_MAX_MS = 10 * 60_000;
/** How often the default save path is re-read, so a changed setting is picked up. */
export const QBIT_SAVE_PATH_REFRESH_MS = 30 * 60_000;
/** How many handled hashes are remembered. */
export const QBIT_HANDLED_LIMIT = 5_000;
/** Polls a finished torrent whose files cannot be found is retried on before it is given up. */
export const QBIT_UNRESOLVED_RETRIES = 20;

export interface QbitPollerState {
  /** Finished torrents already imported or baselined, lowercase hex. */
  handled: Set<string>;
  /** False until the first successful poll has recorded the baseline. */
  baselined: boolean;
}

export interface QbitPollerDeps {
  now: () => number;
  schedule: (fn: () => void, ms: number) => { cancel: () => void };
  getConfig: () => ScraperQbittorrentSettings | null;
  /** "Import finished downloads automatically". */
  isEnabled: () => boolean;
  /** A credential for the mode in force exists, so a poll will not be a failed login. */
  hasCredential: (config: ScraperQbittorrentSettings) => Promise<boolean>;
  poll: (config: ScraperQbittorrentSettings) => Promise<QbitPollOutcome<QbitTorrentSnapshot[]>>;
  files: (config: ScraperQbittorrentSettings, hash: string) => Promise<QbitOutcome<QbitFileEntry[]>>;
  defaultSavePath: (config: ScraperQbittorrentSettings) => Promise<QbitPollOutcome<string>>;
  state: QbitPollerState;
  saveState: () => void;
  /** Hashes the handoff ledger knows — imported even on the baseline poll. */
  ledgerHashes: () => ReadonlySet<string>;
  ledgerHint: (hash: string) => MediaIngestHint | undefined;
  /** Absolute local paths of a finished torrent's media files. `files` is null when the list was unreadable. */
  resolveFiles: (torrent: QbitTorrentSnapshot, files: QbitFileEntry[] | null) => string[];
  ingest: (paths: string[], hint: MediaIngestHint | undefined, torrent: QbitTorrentSnapshot) => Promise<void>;
  onSavePath: (savePath: string) => void;
  onStatus: (status: MediaIngestQbitStatus) => void;
  /** Categories that are never imported (the subtitle fetches' own). */
  ignoreCategories: ReadonlySet<string>;
  keyOf: (value: string) => string;
  /** A finished torrent's files were not found (first miss, and when the retries give up). */
  log?: (message: string) => void;
}

export interface QbitCompletionPoller {
  /** (Re)start from nothing — after the config or the auto-import switch changed. */
  start: () => void;
  stop: () => void;
  /** Poll now unless the last snapshot is younger than `maxAgeMs`. */
  refresh: (maxAgeMs?: number) => Promise<void>;
  /** The poller will import this path itself (its torrent is unfinished, or finished and not yet imported). */
  claims: (filePath: string) => boolean;
  status: () => MediaIngestQbitStatus;
  /** Finished torrents whose files have not been found on this machine yet (still being retried). */
  unresolvedCount: () => number;
  lastCheckedAt: () => number | null;
  /** Resolves once the current run's first poll has settled, whatever its outcome. */
  firstPoll: () => Promise<void>;
}

function isActive(torrent: QbitTorrentSnapshot): boolean {
  if (isTorrentComplete(torrent)) return false;
  return !/^(paused|stopped)/.test(torrent.rawState) && torrent.rawState !== 'error' && torrent.rawState !== 'missingFiles';
}

export function createQbitCompletionPoller(deps: QbitPollerDeps): QbitCompletionPoller {
  let generation = 0;
  let timer: { cancel: () => void } | null = null;
  let inflight: Promise<void> | null = null;
  /** The generation `inflight` belongs to. */
  let inflightGen = -1;
  let failures = 0;
  let snapshot: QbitTorrentSnapshot[] = [];
  /** When the current snapshot was taken; null when there is none. */
  let snapshotAt: number | null = null;
  /** When the save path was last read; null before the first read. */
  let savePathAt: number | null = null;
  let lastOk: number | null = null;
  let status: MediaIngestQbitStatus = 'off';
  /** Finished torrents whose files were not found yet → attempts so far. */
  const unresolved = new Map<string, number>();
  let first:{ promise: Promise<void>; resolve: () => void } = settledGate();

  function settledGate(): { promise: Promise<void>; resolve: () => void } {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  function setStatus(next: MediaIngestQbitStatus): void {
    if (next === status) return;
    status = next;
    deps.onStatus(next);
  }

  function reschedule(gen: number, ms: number): void {
    if (gen !== generation) return;
    timer?.cancel();
    timer = deps.schedule(() => {
      timer = null;
      run(gen);
    }, ms);
  }

  function capHandled(): void {
    const handled = deps.state.handled;
    if (handled.size <= QBIT_HANDLED_LIMIT) return;
    const keep = [...handled].slice(handled.size - QBIT_HANDLED_LIMIT);
    handled.clear();
    for (const hash of keep) handled.add(hash);
  }

  /** False when none of the torrent's files could be found on this machine. */
  async function ingestTorrent(config: ScraperQbittorrentSettings, torrent: QbitTorrentSnapshot): Promise<boolean> {
    const listed = await deps.files(config, torrent.hash);
    const paths = deps.resolveFiles(torrent, listed.ok ? listed.value : null);
    if (!paths.length) return false;
    const hint = deps.ledgerHint(torrent.hash) ?? hintFromTags(torrent.tags);
    await deps.ingest(paths, hint, torrent);
    return true;
  }

  /**
   * A finished torrent whose files cannot be found here. It used to be marked
   * handled on the first miss and never looked at again — which, for a remote
   * client without a path mapping or a drive that was not mounted yet, meant
   * the download silently never arrived. It is now retried on later polls, up
   * to `QBIT_UNRESOLVED_RETRIES`, logged, and counted for the settings panel.
   */
  function noteUnresolved(torrent: QbitTorrentSnapshot): boolean {
    const hash = torrent.hash.toLowerCase();
    const attempts = (unresolved.get(hash) ?? 0) + 1;
    unresolved.set(hash, attempts);
    const final = attempts >= QBIT_UNRESOLVED_RETRIES;
    if (attempts === 1 || final) {
      deps.log?.(
        `Finished torrent "${torrent.name}" (${hash.slice(0, 8)}): no files found at "${torrent.contentPath || torrent.savePath}". `
        + (final
          ? 'Giving up; if qBittorrent runs on another machine, add a path mapping in its settings.'
          : 'Will retry on the next polls.'),
      );
    }
    if (final) unresolved.delete(hash);
    return final;
  }

  async function tick(gen: number): Promise<void> {
    if (gen !== generation) return;
    if (!deps.isEnabled()) {
      snapshot = [];
      setStatus('off');
      return;
    }
    const config = deps.getConfig();
    if (!config || !isScraperQbitConfigured(config) || !(await deps.hasCredential(config))) {
      snapshot = [];
      setStatus('not-configured');
      return;
    }
    if (gen !== generation) return;

    const polled = await deps.poll(config);
    if (gen !== generation) return;
    if (!polled.ok) {
      // Without a fresh list nothing can be claimed: the watch folders take over.
      snapshot = [];
      if (polled.status === 'unauthorized') {
        setStatus('unauthorized');
        return;
      }
      failures += 1;
      setStatus('unreachable');
      reschedule(gen, Math.min(QBIT_BACKOFF_MAX_MS, QBIT_BACKOFF_MIN_MS * 2 ** (failures - 1)));
      return;
    }

    failures = 0;
    snapshot = polled.value;
    snapshotAt = deps.now();
    lastOk = snapshotAt;
    setStatus('watching');

    if (savePathAt === null || snapshotAt - savePathAt >= QBIT_SAVE_PATH_REFRESH_MS) {
      savePathAt = snapshotAt;
      const savePath = await deps.defaultSavePath(config).catch(() => null);
      if (gen !== generation) return;
      if (savePath?.ok && savePath.value) deps.onSavePath(savePath.value);
    }

    const plan = planQbitCompletions(snapshot, deps.state, deps.ledgerHashes(), deps.ignoreCategories);
    let dirty = !deps.state.baselined || plan.baseline.length > 0;
    for (const hash of plan.baseline) deps.state.handled.add(hash);
    deps.state.baselined = true;
    for (const torrent of plan.toIngest) {
      if (gen !== generation) return;
      try {
        const found = await ingestTorrent(config, torrent);
        if (gen !== generation) return;
        // Not found yet: left unhandled (so the poller still claims it) and
        // retried on later polls until the cap gives up on it.
        if (!found && !noteUnresolved(torrent)) continue;
        if (found) unresolved.delete(torrent.hash.toLowerCase());
      } catch {
        // One torrent whose files cannot be read must not stall the others. It
        // is still marked handled: retrying it every poll would never succeed,
        // and a watched folder picks the files up if they appear later.
      }
      deps.state.handled.add(torrent.hash.toLowerCase());
      dirty = true;
    }
    if (dirty) {
      capHandled();
      deps.saveState();
    }
    reschedule(gen, snapshot.some(isActive) ? QBIT_POLL_ACTIVE_MS : QBIT_POLL_IDLE_MS);
  }

  function run(gen: number): Promise<void> {
    // A poll of an older generation bails at its first check without polling.
    // Sharing it would lose this generation's poll entirely: two `start()`s in
    // one tick (service start, then the renderer's config sync) left the poller
    // 'off' with nothing scheduled — the E2E suite caught it.
    if (inflight) return inflightGen === gen ? inflight : inflight.then(() => run(gen));
    inflightGen = gen;
    const gate = first;
    inflight = tick(gen)
      .catch(() => {
        // A throw is treated like an unreachable client: back off and retry.
        if (gen !== generation) return;
        failures += 1;
        snapshot = [];
        setStatus('unreachable');
        reschedule(gen, Math.min(QBIT_BACKOFF_MAX_MS, QBIT_BACKOFF_MIN_MS * 2 ** (failures - 1)));
      })
      .finally(() => {
        inflight = null;
        gate.resolve();
      });
    return inflight;
  }

  return {
    start() {
      generation += 1;
      timer?.cancel();
      timer = null;
      failures = 0;
      snapshot = [];
      snapshotAt = null;
      savePathAt = null;
      first = settledGate();
      const gen = generation;
      // A poll already in flight belongs to the old generation and bails out at
      // its next check; this one waits for it rather than racing it.
      const previous = inflight ?? Promise.resolve();
      void previous.then(() => run(gen));
    },
    stop() {
      generation += 1;
      timer?.cancel();
      timer = null;
      snapshot = [];
      first.resolve();
      setStatus('off');
    },
    async refresh(maxAgeMs = 0) {
      if (inflight) {
        await inflight;
        return;
      }
      // Only a client that is answering is polled early; an unreachable one keeps its back-off.
      if (status !== 'watching') return;
      if (snapshotAt !== null && deps.now() - snapshotAt < maxAgeMs) return;
      timer?.cancel();
      timer = null;
      await run(generation);
    },
    claims(filePath) {
      if (status !== 'watching') return false;
      const torrent = torrentOwningPath(snapshot, filePath, deps.keyOf);
      if (!torrent) return false;
      // The app's own subtitle fetches: claimed so no watcher imports them, and never imported here.
      if (deps.ignoreCategories.has(torrent.category)) return true;
      return !isTorrentComplete(torrent) || !deps.state.handled.has(torrent.hash.toLowerCase());
    },
    status: () => status,
    unresolvedCount: () => unresolved.size,
    lastCheckedAt: () => lastOk,
    firstPoll: () => first.promise,
  };
}
