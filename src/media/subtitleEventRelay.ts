/**
 * Hands the directstream's muxed subtitle events to whichever VideoCore subtitle manager is
 * current, and never loses one on the way.
 *
 * ## The defect this exists for
 *
 * The sidecar sends each cue of a muxed MKV track once, as a `subtitle-event`, while it reads
 * the file — the first cues within a few hundred milliseconds of the stream starting, often
 * before or while VideoCore builds its `VideoCoreSubtitleManager`. Two things lost them:
 *
 *  - The slice delivered each event to the `manager` its message handler had closed over. The
 *    websocket listener is re-subscribed in a passive effect, so for a moment after the atom
 *    changes the handler still holds the previous manager — one VideoCore already destroyed.
 *  - VideoCore replaces the manager outright (`setSubtitleManager(p => { p.destroy(); return
 *    new … })`), and the new one starts with an empty event cache.
 *
 * Either way the cue was gone for good: the sidecar does not send it again. Measured in the
 * packaged build (subtitle harness 6h, `[Test] Yuru Camp - 03.mkv`, 5 cues × 2 tracks): 7 of
 * 10 events reached the manager, and cue 2 was missing on both lines, three runs out of three.
 *
 * So the relay keeps every event of the current stream and replays them into each new
 * manager. `onSubtitleEvents` keys events by track, start, duration and text (or the event's
 * own id), so a replay adds nothing the manager already has.
 *
 * The relay keeps each event once, by that same key: the sidecar sends a cue again whenever
 * it re-reads the part of the file that holds it (every seek restarts its extraction, and
 * `subtitleBackfill` asks for whole-file passes), and those repeats must not pile up here.
 */

import type { MKVParser_SubtitleEvent } from '../../vendor/seanime/generated/types';

export interface SubtitleEventSink {
  onSubtitleEvents(events: MKVParser_SubtitleEvent[]): Promise<void> | void;
}

export interface SubtitleEventRelay<M extends SubtitleEventSink> {
  /** A new stream is opening: the previous stream's events must not reach its manager. */
  reset(): void;
  /**
   * Events from the sidecar. The ones not seen before in this stream are kept, and delivered
   * now if a manager is attached. Returns how many were new.
   */
  receive(events: MKVParser_SubtitleEvent[]): number;
  /** The current manager (or none). A manager seen for the first time gets every kept event. */
  attach(manager: M | null): void;
  /** Distinct events kept for the current stream. */
  readonly received: number;
}

/** The identity `VideoCoreSubtitleManager` dedups events by (its `__eventMapKey`). */
export function subtitleEventKey(event: MKVParser_SubtitleEvent): string {
  const id = event.extraData?.['_id'];
  if (id) return `id:${id}`;
  return `${event.trackNumber}:${event.startTime}:${event.duration}:${event.text}`;
}

export function createSubtitleEventRelay<M extends SubtitleEventSink>(
  deliver: (manager: M, events: MKVParser_SubtitleEvent[]) => void = (manager, events) => {
    void manager.onSubtitleEvents(events);
  },
): SubtitleEventRelay<M> {
  let kept: MKVParser_SubtitleEvent[] = [];
  let seen = new Set<string>();
  let current: M | null = null;
  return {
    reset() {
      kept = [];
      seen = new Set();
    },
    receive(events) {
      const fresh = events.filter((event) => {
        const key = subtitleEventKey(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!fresh.length) return 0;
      kept.push(...fresh);
      if (current) deliver(current, fresh);
      return fresh.length;
    },
    attach(manager) {
      if (manager === current) return;
      current = manager;
      if (manager && kept.length) deliver(manager, kept.slice());
    },
    get received() {
      return kept.length;
    },
  };
}
