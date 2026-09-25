/**
 * Music listening time for the study statistics.
 *
 * The video player has recorded watch time since Phase 6 slice 8; music recorded
 * nothing, so an evening of Japanese songs with the lyrics pane open left the day
 * empty. This is the music half, built on the SAME accumulator the video player uses
 * (`shared/seanimeWatchTime.ts`: wall-clock while playing, both ends of an interval
 * playing, gaps capped, a frozen clock earns nothing) and written to its own channel
 * in `stats.ts` (`recordListening`) — deliberately not folded into watch or read time,
 * which other surfaces label as such.
 *
 * `playerBus` owns one tracker and feeds it from the one `<audio>` element, so only
 * the window that actually plays records, once.
 */
import type { MediaItem } from '../shared/types';
import {
  createWatchTimeState,
  watchTimeFlush,
  watchTimeSample,
  watchTimeShouldFlush,
  type WatchTimeState,
} from '../shared/seanimeWatchTime';
import { recordListening } from './stats';
import { guessSongMeta } from './lyrics';

export type ListenRecorder = (trackId: string, title: string, seconds: number) => void;

export interface ListenTracker {
  /** Observe the element. Call on timeupdate/play/pause/ended. */
  sample(current: MediaItem | null, positionSec: number, playing: boolean, atMs?: number): void;
  /** Hand whatever has accrued to the ledger (pause, track change, close). */
  flush(): void;
}

function titleOf(item: MediaItem): string {
  const meta = guessSongMeta(item);
  const title = meta.title || item.title || item.fileName;
  return meta.artist ? `${meta.artist} — ${title}` : title;
}

export function createListenTracker(record: ListenRecorder = recordListening): ListenTracker {
  let state: WatchTimeState = createWatchTimeState();
  let track: MediaItem | null = null;

  const flush = (): void => {
    const out = watchTimeFlush(state);
    state = out.state;
    if (track && out.seconds > 0) record(track.id, titleOf(track), out.seconds);
  };

  return {
    sample(current, positionSec, playing, atMs = Date.now()) {
      if (!current) return;
      if (!track || track.id !== current.id) {
        // A new track starts a new interval: time from the old one is credited to it.
        flush();
        state = createWatchTimeState();
        track = current;
      }
      state = watchTimeSample(state, { atMs, positionSec, playing });
      if (watchTimeShouldFlush(state)) flush();
    },
    flush,
  };
}
