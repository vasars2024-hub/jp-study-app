/**
 * The airing-schedule job — keeps `nextAiring` current on the watch library.
 *
 * Once shortly after launch and every few hours, every Watching / Rewatching /
 * Plan-to-watch anime with a MAL or AniList id is asked about in batches of 50
 * (`anilistAiringBatch`, through the shared AniList limiter, so this and the
 * metadata passes never together exceed AniList's budget). Offline, or when
 * AniList does not answer, the run stops and the stored schedule stands.
 *
 * When a stored next episode of a title being watched has passed, it has aired:
 * the renderer is told once per episode (`watchAiring:aired`) and puts it in
 * the notification centre. What was announced lives in
 * `<userData>/watch-airing.json`, beside the run status.
 */

import { app, BrowserWindow, ipcMain, net } from 'electron';
import path from 'node:path';
import {
  airedEpisodesToAnnounce,
  airingNotifyKeys,
  airingBatches,
  airingCandidates,
  planAiringUpdates,
  type AiredEpisode,
  type AiringRow,
} from '../shared/watchAiring';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { anilistAiringBatch } from './mediaProviderClients';
import { onWatchLibraryChanged, readWatchLibrary, listWatchTitlesNeedingLookup, setWatchNextAiring } from './watchLibrary';

export const WATCH_AIRING_INTERVAL_MS = 3 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 45_000;
const STATE_FILE = 'watch-airing.json';

export interface WatchAiringStatus {
  running: boolean;
  /** Epoch ms of the last completed check, null = never. */
  lastCheckedAt: number | null;
  /** Why the last attempt stopped early, if it did. */
  lastError: 'offline' | 'unreachable' | null;
  /** Titles asked about on the last check. */
  checked: number;
  /** Titles with an upcoming episode now. */
  scheduled: number;
}

interface AiringState {
  lastCheckedAt: number | null;
  lastError: WatchAiringStatus['lastError'];
  checked: number;
  /** `mal:<id>` / `anilist:<id>` / title id → last episode announced (see `airingNotifyKeys`). */
  notified: Record<string, number>;
}

export interface WatchAiringDeps {
  fetchBatch?: (ids: readonly number[], by: 'mal' | 'anilist') => Promise<AiringRow[] | null>;
  online?: () => boolean;
  statePath?: () => string;
  /** Delivers announcements; returns false when nobody could receive them (so they are retried). */
  announce?: (episodes: AiredEpisode[]) => boolean;
}

const defaults = {
  fetchBatch: anilistAiringBatch,
  online: (): boolean => {
    try {
      return net.isOnline();
    } catch {
      return true;
    }
  },
  statePath: (): string => path.join(app.getPath('userData'), STATE_FILE),
  announce: (episodes: AiredEpisode[]): boolean => {
    const windows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
    for (const win of windows) win.webContents.send('watchAiring:aired', episodes);
    return windows.length > 0;
  },
};
let deps: Required<WatchAiringDeps> = { ...defaults };

export function __setWatchAiringDepsForTests(next: WatchAiringDeps | null): void {
  deps = { ...defaults, ...(next ?? {}) };
  running = false;
}

function readState(): AiringState {
  try {
    const raw = readJsonSync<Partial<AiringState>>(deps.statePath(), {});
    return {
      lastCheckedAt: typeof raw.lastCheckedAt === 'number' ? raw.lastCheckedAt : null,
      lastError: raw.lastError === 'offline' || raw.lastError === 'unreachable' ? raw.lastError : null,
      checked: typeof raw.checked === 'number' ? raw.checked : 0,
      notified: raw.notified && typeof raw.notified === 'object' ? raw.notified : {},
    };
  } catch {
    return { lastCheckedAt: null, lastError: null, checked: 0, notified: {} };
  }
}

function writeState(state: AiringState): void {
  try {
    writeJsonAtomicSync(deps.statePath(), state, { space: 0 });
  } catch {
    /* an unwritten state only means a check or an announcement repeats */
  }
}

let running = false;
let timer: NodeJS.Timeout | null = null;
let debounce: NodeJS.Timeout | null = null;

export function watchAiringStatus(now: number = Date.now()): WatchAiringStatus {
  const state = readState();
  const titles = readWatchLibrary().titles;
  return {
    running,
    lastCheckedAt: state.lastCheckedAt,
    lastError: state.lastError,
    checked: state.checked,
    scheduled: titles.filter((title) => title.nextAiring && title.nextAiring.at > now).length,
  };
}

/** Announces episodes that have aired (no network needed), once each. */
function announceAired(state: AiringState, now: number): void {
  const titles = readWatchLibrary().titles;
  const due = airedEpisodesToAnnounce(titles, state.notified, now);
  if (!due.length) return;
  if (!deps.announce(due)) return;
  const byId = new Map(titles.map((title) => [title.id, title]));
  for (const episode of due) {
    const title = byId.get(episode.titleId);
    for (const key of title ? airingNotifyKeys(title) : [episode.titleId]) state.notified[key] = episode.episode;
  }
}

/**
 * A dedupe merge removed titles: what was announced for them now belongs to the
 * title they were folded into, so the survivor does not announce it again.
 */
export function carryAiringStateOverMerge(merged: readonly { into: string; from: readonly string[] }[]): void {
  if (!merged.length) return;
  const state = readState();
  let changed = false;
  for (const { into, from } of merged) {
    const best = Math.max(state.notified[into] ?? 0, ...from.map((id) => state.notified[id] ?? 0));
    if (best > (state.notified[into] ?? 0)) {
      state.notified[into] = best;
      changed = true;
    }
  }
  if (changed) writeState(state);
}

/** One check. Never throws. */
export async function runWatchAiringCheck(now: () => number = Date.now): Promise<WatchAiringStatus> {
  if (running) return watchAiringStatus(now());
  running = true;
  const state = readState();
  try {
    // Folds freshly synced MAL rows in before reading.
    listWatchTitlesNeedingLookup();
    announceAired(state, now());
    if (!deps.online()) {
      state.lastError = 'offline';
    } else {
      await fetchAndStore(state, now);
    }
  } catch {
    state.lastError = 'unreachable';
  } finally {
    writeState(state);
    running = false;
  }
  return watchAiringStatus(now());
}

async function fetchAndStore(state: AiringState, now: () => number): Promise<void> {
  const candidates = airingCandidates(readWatchLibrary().titles);
  const rows: AiringRow[] = [];
  let failed = false;
  for (const batch of airingBatches(candidates)) {
    const answer = await deps.fetchBatch(batch.ids, batch.by);
    if (answer === null) {
      failed = true;
      break;
    }
    rows.push(...answer);
  }
  // Whatever did answer is applied; the rest keeps its stored schedule.
  setWatchNextAiring(planAiringUpdates(readWatchLibrary().titles, rows), now());
  state.lastError = failed ? 'unreachable' : null;
  if (!failed) {
    state.lastCheckedAt = now();
    state.checked = candidates.length;
  }
  // A schedule that just moved into the past (the check ran late) is news too.
  announceAired(state, now());
}

function schedule(delayMs: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runWatchAiringCheck().finally(() => schedule(WATCH_AIRING_INTERVAL_MS));
  }, delayMs);
}

/**
 * Starts the job: a first check shortly after launch, then every three hours;
 * a newly imported or added title is checked a minute later. `watchAiring:*`
 * lets the dashboard show when it last ran and ask for a check now.
 */
export function registerWatchAiring(): void {
  ipcMain.handle('watchAiring:status', () => watchAiringStatus());
  ipcMain.handle('watchAiring:refresh', () => runWatchAiringCheck());
  onWatchLibraryChanged((event) => {
    if (event.merged?.length) carryAiringStateOverMerge(event.merged);
    if (event.reason !== 'import' && event.reason !== 'add' && event.reason !== 'mal-sync' && event.reason !== 'update') return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      void runWatchAiringCheck();
    }, 60_000);
  });
  schedule(FIRST_RUN_DELAY_MS);
}

export function stopWatchAiring(): void {
  if (timer) clearTimeout(timer);
  if (debounce) clearTimeout(debounce);
  timer = null;
  debounce = null;
}
