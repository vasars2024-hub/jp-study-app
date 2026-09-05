import type { MediaItem } from './types';

export type RepeatMode = 'off' | 'all' | 'one';

/** Cross-window music player state — mirrored by every renderer via IPC. */
export interface PlayerSnapshot {
  /** webContents.id of the window that owns the live <audio> element. */
  sourceId: number;
  /** Bumps on every track change so followers can ignore stale snapshots. */
  trackToken: number;
  current: MediaItem | null;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  mediaUrl: string;
}

/**
 * `sourceId` names the ONE window that owns the live `<audio>` element; every other
 * window mirrors it and forwards its transport there. Nothing cleared the snapshot when
 * that window went away, so a survivor kept delegating to a `webContents.id` that no
 * longer existed: measured live 2026-09-04 with `sourceId 3` surviving into a desk whose
 * only window was `1`, the Music widget showed the track, the duration and a Pause icon
 * while play, next, previous and seek all silently reached nobody.
 *
 * `sourceId: 0` is the sentinel the renderer ALREADY reads as "no leader"
 * (`isLeader()` is `remoteLeaderId === 0 || remoteLeaderId === myWindowId`), so handing
 * leadership back needs no new channel — only an honest snapshot on the existing one.
 * `playing` goes false and `mediaUrl` empties because the element that was playing is
 * gone; keeping the track lets the survivor restart it instead of losing the user's place.
 *
 * Returns the replacement snapshot, or `null` when the snapshot is still valid and must
 * be left exactly as it is.
 */
export function releasePlayerLeadership(
  snap: PlayerSnapshot | null,
  liveWindowIds: readonly number[],
): PlayerSnapshot | null {
  if (!snap) return null;
  if (snap.sourceId === 0) return null;
  if (liveWindowIds.includes(snap.sourceId)) return null;
  return { ...snap, sourceId: 0, playing: false, mediaUrl: '' };
}

/**
 * The minimum of a `BrowserWindow` this file needs. Structural, so the live set
 * can be falsified without an Electron window — inducing a real renderer crash to
 * test the crash path is exactly the sort of thing that never gets run.
 */
export interface PlayerHostWindow {
  isDestroyed(): boolean;
  readonly webContents?: { readonly id: number; isCrashed(): boolean } | null;
}

/**
 * Which windows can still OWN the `<audio>` element.
 *
 * The caller used to build this from `!w.isDestroyed()` alone, while its own doc
 * comment claimed that covered a renderer disappearing through
 * `render-process-gone`. **It did not.** A renderer crash leaves the
 * `BrowserWindow` perfectly alive with a dead `webContents` — `isDestroyed()` is
 * false — so the crashed window stayed in the live set, `releasePlayerLeadership`
 * saw its `sourceId` and returned `null`, and every survivor went on forwarding
 * play/next/seek into a process that no longer existed. That is the same silent
 * dead-transport the release mechanism was written to end, reached by the one
 * route it did not check. Boss audit 2026-09-05, Finding 4.
 *
 * `webContents.isCrashed()` is the state that actually separates them.
 */
export function livePlayerWindowIds(windows: readonly PlayerHostWindow[]): number[] {
  const out: number[] = [];
  for (const win of windows) {
    try {
      if (win.isDestroyed()) continue;
      const contents = win.webContents;
      // A window torn down between the destroyed check and this read has no
      // contents. Skipping it is right, and it must not throw: one bad window
      // would otherwise abort the release for every other window in the list.
      if (!contents || contents.isCrashed()) continue;
      out.push(contents.id);
    } catch {
      continue;
    }
  }
  return out;
}

export type PlayerCommand =
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; time: number }
  | { type: 'playItem'; id: string }
  | { type: 'setVolume'; volume: number }
  | { type: 'toggleShuffle' }
  | { type: 'cycleRepeat' }
  | { type: 'stop' };
