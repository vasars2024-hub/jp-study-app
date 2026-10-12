/**
 * snd6 — study modes (and study audio) in pop-out windows.
 *
 * The study-mode link (studyModeSoundscape.ts) reads the command registry, and
 * the registry is per window: a book or a review session popped out into its
 * own OS window registered its commands THERE, so the main window — the only
 * one that owns the mixer — never saw it. A pop-out now publishes what it is
 * (its study mode, and whether speech or video is audible in it) to a small
 * shared localStorage record; the main window reads that record alongside its
 * own registry, and hears about changes through the `storage` event, which a
 * browser delivers to every OTHER window of the same origin.
 *
 * Each window keeps one entry, refreshed on change and on a heartbeat. An entry
 * not refreshed for STALE_MS is ignored, so a pop-out that crashed (and never
 * ran its `pagehide` cleanup) cannot hold the main window in a mode forever.
 *
 * This module is light on purpose: a pop-out loads it without the mixer.
 */
import { COMMAND_HANDLERS_EVENT, hasCommandHandler } from '../keyboardShortcuts';
import { isLocalForegroundAudioActive, onForegroundAudioChanged } from '../foregroundAudio';
import { writeLocalStorageJson } from '../localStorageWrite';
import type { StudyModeId } from './soundscapeModel';

export const PRESENCE_KEY = 'jp-soundscape-presence-v1';
export const PRESENCE_STALE_MS = 75_000;
export const PRESENCE_HEARTBEAT_MS = 25_000;

/** The commands a study surface registers while it is up. */
export const MODE_SIGNALS: Readonly<Record<StudyModeId, readonly string[]>> = {
  review: ['flashcards.flip'],
  listening: ['video.replayLine', 'music.replayLine'],
  reading: ['reader.pageNext', 'manga.nextPage'],
};

/** Review and listening are deliberate sittings and win over a book left open behind them. */
export const MODE_PRIORITY: readonly StudyModeId[] = ['review', 'listening', 'reading'];

/** The mode this window is in, or null. */
export function detectStudyMode(has: (id: string) => boolean = hasCommandHandler): StudyModeId | null {
  for (const mode of MODE_PRIORITY) {
    if (MODE_SIGNALS[mode].some((id) => has(id))) return mode;
  }
  return null;
}

/** The highest-priority mode among several windows' modes. */
export function pickStudyMode(modes: readonly (StudyModeId | null | undefined)[]): StudyModeId | null {
  for (const mode of MODE_PRIORITY) if (modes.includes(mode)) return mode;
  return null;
}

export interface PresenceEntry {
  mode: StudyModeId | null;
  /** Speech, a card clip or a video is audible in that window. */
  audio: boolean;
  /** Epoch ms of the last refresh. */
  at: number;
}

function isMode(value: unknown): value is StudyModeId {
  return value === 'review' || value === 'listening' || value === 'reading';
}

/** Every window's entry that is still fresh at `now`. Malformed entries are dropped. */
export function readPresence(now: number = Date.now()): Record<string, PresenceEntry> {
  const out: Record<string, PresenceEntry> = {};
  let raw: unknown;
  try {
    const text = localStorage.getItem(PRESENCE_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    return out;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || id.length > 64) continue;
    const entry = value as Partial<PresenceEntry>;
    if (typeof entry.at !== 'number' || !Number.isFinite(entry.at)) continue;
    if (now - entry.at > PRESENCE_STALE_MS || entry.at - now > PRESENCE_STALE_MS) continue;
    out[id] = { mode: isMode(entry.mode) ? entry.mode : null, audio: entry.audio === true, at: entry.at };
  }
  return out;
}

/** Modes other windows are in (fresh entries only). */
export function remoteStudyModes(now: number = Date.now(), except?: string): StudyModeId[] {
  return Object.entries(readPresence(now))
    .filter(([id, entry]) => id !== except && entry.mode !== null)
    .map(([, entry]) => entry.mode as StudyModeId);
}

/** True when another window reports audible study audio. */
export function remoteStudyAudio(now: number = Date.now(), except?: string): boolean {
  return Object.entries(readPresence(now)).some(([id, entry]) => id !== except && entry.audio);
}

/** True while any fresh entry exists (the main window then re-checks staleness on a timer). */
export function hasPresence(now: number = Date.now()): boolean {
  return Object.keys(readPresence(now)).length > 0;
}

function writeEntry(id: string, entry: PresenceEntry | null, now: number): void {
  const map: Record<string, PresenceEntry> = readPresence(now);
  if (entry) map[id] = entry;
  else delete map[id];
  writeLocalStorageJson(PRESENCE_KEY, map);
}

/**
 * Pop-out side: publish this window's mode and audio, now and whenever either
 * changes, plus a heartbeat. Returns an uninstall that withdraws the entry.
 */
export function installStudyModePresence(windowId = `w-${Math.random().toString(36).slice(2, 10)}`): () => void {
  let last: { mode: StudyModeId | null; audio: boolean } | null = null;
  let lastAt = 0;
  const publish = (force = false): void => {
    const now = Date.now();
    const next = { mode: detectStudyMode(), audio: isLocalForegroundAudioActive() };
    const idle = next.mode === null && !next.audio;
    const same = last !== null && last.mode === next.mode && last.audio === next.audio;
    if (same && !force) return;
    // A window with nothing to report keeps no entry at all.
    if (idle) {
      if (last === null || (last.mode === null && !last.audio && !force)) {
        last = next;
        return;
      }
      writeEntry(windowId, null, now);
    } else {
      writeEntry(windowId, { ...next, at: now }, now);
      lastAt = now;
    }
    last = next;
  };
  const onHandlers = (): void => publish();
  const offAudio = onForegroundAudioChanged(() => publish());
  const heartbeat = setInterval(() => {
    if (last && (last.mode !== null || last.audio) && Date.now() - lastAt >= PRESENCE_HEARTBEAT_MS - 50) publish(true);
  }, PRESENCE_HEARTBEAT_MS);
  const withdraw = (): void => writeEntry(windowId, null, Date.now());
  window.addEventListener(COMMAND_HANDLERS_EVENT, onHandlers);
  window.addEventListener('pagehide', withdraw);
  publish();
  return () => {
    window.removeEventListener(COMMAND_HANDLERS_EVENT, onHandlers);
    window.removeEventListener('pagehide', withdraw);
    offAudio();
    clearInterval(heartbeat);
    withdraw();
  };
}
