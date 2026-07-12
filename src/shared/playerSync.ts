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
