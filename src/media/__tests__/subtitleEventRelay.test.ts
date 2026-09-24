import { describe, expect, it } from 'vitest';
import type { MKVParser_SubtitleEvent } from '../../../vendor/seanime/generated/types';
import { createSubtitleEventRelay, type SubtitleEventSink } from '../subtitleEventRelay';

/** A VideoCore manager stand-in with the real dedup rule: one entry per track/start/duration/text. */
class FakeManager implements SubtitleEventSink {
  readonly cues = new Map<string, MKVParser_SubtitleEvent>();
  destroyed = false;
  onSubtitleEvents(events: MKVParser_SubtitleEvent[]): void {
    if (this.destroyed) return;
    for (const e of events) this.cues.set(`${e.trackNumber}:${e.startTime}:${e.duration}:${e.text}`, e);
  }
  lines(track: number): string[] {
    return [...this.cues.values()].filter((e) => e.trackNumber === track).sort((a, b) => a.startTime - b.startTime).map((e) => e.text);
  }
}

const cue = (trackNumber: number, startTime: number, text: string): MKVParser_SubtitleEvent =>
  ({ trackNumber, startTime, duration: 3500, text, codecID: 'S_TEXT/ASS', extraData: {} }) as unknown as MKVParser_SubtitleEvent;

// The measured order from subtitle harness 6h: cue 1 of each track alone, then the rest in one batch.
const JA1 = cue(3, 1023, 'おはようございます。');
const EN1 = cue(4, 1023, 'Good morning.');
const REST = [cue(3, 4523, 'そうですね。'), cue(4, 4523, 'It is.'), cue(3, 8523, 'いいですよ。'), cue(4, 8523, 'Sure.')];

describe('subtitle event relay', () => {
  it('keeps the cues a manager that VideoCore then replaced had received', () => {
    const relay = createSubtitleEventRelay<FakeManager>();
    const first = new FakeManager();
    relay.attach(first);
    relay.receive([JA1]);
    relay.receive([EN1]);
    // VideoCore: setSubtitleManager(p => { p.destroy(); return new VideoCoreSubtitleManager(...) })
    first.destroyed = true;
    const second = new FakeManager();
    relay.receive(REST); // still delivered to the destroyed one: the handler has not re-subscribed yet
    relay.attach(second);
    expect(second.lines(3)).toEqual(['おはようございます。', 'そうですね。', 'いいですよ。']);
    expect(second.lines(4)).toEqual(['Good morning.', 'It is.', 'Sure.']);
  });

  it('holds events that arrive before any manager exists', () => {
    const relay = createSubtitleEventRelay<FakeManager>();
    relay.receive([JA1, EN1]);
    const manager = new FakeManager();
    relay.attach(manager);
    relay.receive(REST);
    expect(manager.cues.size).toBe(6);
    expect(relay.received).toBe(6);
  });

  it('replays nothing twice into the same manager', () => {
    let deliveries = 0;
    const relay = createSubtitleEventRelay<FakeManager>((m, events) => { deliveries += events.length; m.onSubtitleEvents(events); });
    const manager = new FakeManager();
    relay.attach(manager);
    relay.receive([JA1]);
    relay.attach(manager);
    expect(deliveries).toBe(1);
  });

  it('does not hand one stream’s cues to the next stream’s manager', () => {
    const relay = createSubtitleEventRelay<FakeManager>();
    relay.attach(new FakeManager());
    relay.receive([JA1, EN1]);
    relay.reset();
    relay.attach(null);
    const next = new FakeManager();
    relay.attach(next);
    expect(next.cues.size).toBe(0);
    expect(relay.received).toBe(0);
  });
});
