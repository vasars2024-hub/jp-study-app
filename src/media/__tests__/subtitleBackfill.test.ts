import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MKVParser_SubtitleEvent } from '../../../vendor/seanime/generated/types';
import { createSubtitleBackfill, type SubtitleBackfill } from '../subtitleBackfill';
import { createSubtitleEventRelay, type SubtitleEventSink } from '../subtitleEventRelay';

/** A VideoCore manager stand-in with the real dedup rule: one entry per track/start/duration/text. */
class FakeManager implements SubtitleEventSink {
  readonly cues = new Map<string, MKVParser_SubtitleEvent>();
  delivered = 0;
  onSubtitleEvents(events: MKVParser_SubtitleEvent[]): void {
    this.delivered += events.length;
    for (const e of events) this.cues.set(`${e.trackNumber}:${e.startTime}:${e.duration}:${e.text}`, e);
  }
  lines(track: number): string[] {
    return [...this.cues.values()]
      .filter((e) => e.trackNumber === track)
      .sort((a, b) => a.startTime - b.startTime)
      .map((e) => e.text);
  }
}

const cue = (trackNumber: number, startTime: number, text: string): MKVParser_SubtitleEvent =>
  ({ trackNumber, startTime, duration: 3500, text, codecID: 'S_TEXT/ASS', extraData: {} }) as unknown as MKVParser_SubtitleEvent;

// Subtitle harness 6h's file: 5 cues x 2 tracks (3 = Japanese, 4 = English). The first cluster
// holds cues 1 and 2, so the sidecar's restart after a seek to 0.023 s skips both.
const CLUSTERS: Array<{ endMs: number; events: MKVParser_SubtitleEvent[] }> = [
  { endMs: 8000, events: [cue(3, 1023, 'JA1'), cue(4, 1023, 'EN1'), cue(3, 4523, 'JA2'), cue(4, 4523, 'EN2')] },
  { endMs: 12000, events: [cue(3, 8523, 'JA3'), cue(4, 8523, 'EN3')] },
  { endMs: 16000, events: [cue(3, 12523, 'JA4'), cue(4, 12523, 'EN4')] },
  { endMs: 20000, events: [cue(3, 16523, 'JA5'), cue(4, 16523, 'EN5')] },
];
const ALL_JA = ['JA1', 'JA2', 'JA3', 'JA4', 'JA5'];
const ALL_EN = ['EN1', 'EN2', 'EN3', 'EN4', 'EN5'];
const EVENT_MS = 5;

/**
 * The directstream sidecar's subtitle extraction as its log shows it: `video-loaded-metadata`
 * starts one read at byte 0 (once per stream); every `video-seeked` stops the read in
 * progress and starts a new one — at byte 0 for a seek to exactly 0, otherwise at the
 * cluster AFTER the one holding the seek position. A read sends one event every `eventMs`.
 */
class FakeSidecar {
  private readTimer: ReturnType<typeof setTimeout> | null = null;
  private metadataRead = false;
  readonly log: string[] = [];
  constructor(
    private readonly send: (events: MKVParser_SubtitleEvent[]) => void,
    private readonly eventMs = EVENT_MS,
  ) {}

  loadedMetadata(): void {
    if (this.metadataRead) return;
    this.metadataRead = true;
    this.read(0);
  }

  seeked(currentTime: number): void {
    this.stop();
    const holding = CLUSTERS.findIndex((c) => currentTime * 1000 < c.endMs);
    this.read(currentTime === 0 ? 0 : holding + 1);
  }

  private stop(): void {
    if (this.readTimer) clearTimeout(this.readTimer);
    this.readTimer = null;
  }

  private read(fromCluster: number): void {
    this.log.push(`read from cluster ${fromCluster}`);
    const queue = CLUSTERS.slice(fromCluster).flatMap((c) => c.events);
    const next = () => {
      const event = queue.shift();
      if (!event) {
        this.readTimer = null;
        return;
      }
      this.send([event]);
      this.readTimer = setTimeout(next, this.eventMs);
    };
    this.readTimer = setTimeout(next, this.eventMs);
  }
}

/** The slice's wiring: sidecar -> relay -> manager, and the video's own events -> backfill. */
function setup({ backfillEnabled, eventMs = EVENT_MS }: { backfillEnabled: boolean; eventMs?: number }) {
  const manager = new FakeManager();
  const relay = createSubtitleEventRelay<FakeManager>();
  // The slice sends `video-seeked` at 0 for a whole-file read.
  const backfill: SubtitleBackfill = createSubtitleBackfill({ requestFullPass: () => sidecar.seeked(0) });
  const sidecar = new FakeSidecar((events) => {
    relay.receive(events);
    backfill.onEvents();
  }, eventMs);
  backfill.reset(backfillEnabled);
  relay.attach(manager);
  const player = {
    loadedMetadata() {
      sidecar.loadedMetadata();
      backfill.onStreamStarted();
    },
    seek(currentTime: number) {
      sidecar.seeked(currentTime);
      backfill.onSeeked();
    },
  };
  return { manager, relay, backfill, sidecar, player };
}

/** Open as measured in the packaged build: Chromium's own `seeked` at 0.023 s, 7 ms in. */
function openWithBootstrapSeek(player: { loadedMetadata(): void; seek(t: number): void }): void {
  player.loadedMetadata();
  vi.advanceTimersByTime(7);
  player.seek(0.023);
}

describe('subtitle backfill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('without it, a bootstrap seek during the first read loses cue 1 English and all of cue 2', () => {
    const { manager, relay, player } = setup({ backfillEnabled: false });
    openWithBootstrapSeek(player);
    vi.advanceTimersByTime(60_000);
    expect(relay.received).toBe(7);
    expect(manager.lines(3)).toEqual(['JA1', 'JA3', 'JA4', 'JA5']);
    expect(manager.lines(4)).toEqual(['EN3', 'EN4', 'EN5']);
  });

  it('asks for a whole-file read once the seeks settle, and every cue arrives', () => {
    const { manager, relay, backfill, sidecar, player } = setup({ backfillEnabled: true });
    openWithBootstrapSeek(player);
    vi.advanceTimersByTime(1000);
    expect(backfill.requested).toBe(0); // still settling: the seek's own read goes first
    vi.advanceTimersByTime(60_000);
    expect(backfill.requested).toBe(1);
    expect(sidecar.log).toEqual(['read from cluster 0', 'read from cluster 1', 'read from cluster 0']);
    expect(manager.lines(3)).toEqual(ALL_JA);
    expect(manager.lines(4)).toEqual(ALL_EN);
    expect(relay.received).toBe(10);
    // The repeats of the whole-file read were dropped by the relay, not handed on again.
    expect(manager.delivered).toBe(10);
    expect(backfill.complete).toBe(true);
  });

  it('lets the read a seek started finish before replacing it', () => {
    // A slow disk: the read after the seek takes 6 x 400 ms to send cues 3-5.
    const { manager, backfill, player } = setup({ backfillEnabled: true, eventMs: 400 });
    player.loadedMetadata();
    vi.advanceTimersByTime(7);
    player.seek(0.023);
    vi.advanceTimersByTime(2000);
    expect(backfill.requested).toBe(0);
    vi.advanceTimersByTime(2400 + 1200);
    expect(backfill.requested).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(manager.lines(3)).toEqual(ALL_JA);
    expect(manager.lines(4)).toEqual(ALL_EN);
  });

  it('asks again when a seek cuts its whole-file read short', () => {
    const { manager, backfill, player } = setup({ backfillEnabled: true });
    player.loadedMetadata();
    vi.advanceTimersByTime(7);
    // A resume far into the file: the restart after it sends nothing, since the last cluster
    // is the one holding 17 s.
    player.seek(17);
    vi.advanceTimersByTime(1200 + EVENT_MS * 1 + 1); // the backfill read has sent one event...
    expect(backfill.requested).toBe(1);
    player.seek(17); // ...when the viewer seeks again, which cancels it
    vi.advanceTimersByTime(60_000);
    expect(backfill.requested).toBe(2);
    expect(manager.lines(3)).toEqual(ALL_JA);
    expect(manager.lines(4)).toEqual(ALL_EN);
  });

  it('stops asking once a whole-file read has run to the end', () => {
    const { backfill, player } = setup({ backfillEnabled: true });
    openWithBootstrapSeek(player);
    vi.advanceTimersByTime(60_000);
    expect(backfill.complete).toBe(true);
    player.seek(2);
    player.seek(9);
    vi.advanceTimersByTime(60_000);
    expect(backfill.requested).toBe(1);
  });

  it('never asks for a stream it is not enabled for, and a reset cancels a pending ask', () => {
    const disabled = setup({ backfillEnabled: false });
    openWithBootstrapSeek(disabled.player);
    vi.advanceTimersByTime(60_000);
    expect(disabled.backfill.requested).toBe(0);

    const next = setup({ backfillEnabled: true });
    openWithBootstrapSeek(next.player);
    vi.advanceTimersByTime(500);
    next.backfill.reset(false); // the viewer opened another file
    vi.advanceTimersByTime(60_000);
    expect(next.backfill.requested).toBe(0);
  });
});
