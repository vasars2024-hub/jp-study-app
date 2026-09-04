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
