/**
 * The study cue clock: auto-pause, line loop and A-B loop land within 50 ms of the line's
 * end, for any subtitle source (it works off the cue list, not the subtitle manager's
 * events), between back-to-back lines, and at any playback rate.
 *
 * A fake element whose clock is driven by vitest's fake time stands in for the video, so
 * the measurement is of the clock's own scheduling: `timeupdate` is NOT emitted here, which
 * is the point — the old loops overshot by a `timeupdate` interval.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStudyCueClock,
  type StudyCueClock,
  type StudyCueClockMode,
} from '../studyCueClock';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

class FakeVideo {
  private base = 0;
  private startedAt = 0;
  paused = true;
  seeking = false;
  private rate = 1;
  private readonly listeners = new Map<string, Set<() => void>>();

  get playbackRate(): number { return this.rate; }

  get currentTime(): number {
    return this.paused ? this.base : this.base + ((Date.now() - this.startedAt) / 1000) * this.rate;
  }

  set currentTime(value: number) {
    this.base = value;
    this.startedAt = Date.now();
    this.emit('seeked');
  }

  play(): void {
    if (!this.paused) return;
    this.startedAt = Date.now();
    this.paused = false;
    this.emit('play');
  }

  pause(): void {
    if (this.paused) return;
    this.base = this.currentTime;
    this.paused = true;
    this.emit('pause');
  }

  setRate(rate: number): void {
    this.base = this.currentTime;
    this.startedAt = Date.now();
    this.rate = rate;
    this.emit('ratechange');
  }

  addEventListener(type: string, listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }

  private emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

function cue(index: number, startMs: number, endMs: number): VideoCoreStudyCue {
  return { index, trackNumber: 1, startMs, endMs, text: `台詞${index}` };
}

const CUES = [cue(0, 1_000, 3_000), cue(1, 5_000, 7_000), cue(2, 7_000, 9_000), cue(3, 12_000, 14_000)];

let video: FakeVideo;
let clock: StudyCueClock | null = null;
let mode: StudyCueClockMode;
let delaySec = 0;
const pauses: Array<{ index: number; atSec: number }> = [];
const seeks: Array<{ to: number; from: number; reason: string }> = [];
const studyLines: Array<number | null> = [];

function start(cues = CUES): void {
  clock = createStudyCueClock({
    video,
    getCues: () => cues,
    getDelaySec: () => delaySec,
    getMode: () => mode,
    onStudyCue: (next) => studyLines.push(next?.index ?? null),
    pause: (line) => {
      pauses.push({ index: line.index, atSec: video.currentTime });
      video.pause();
    },
    seek: (to, reason) => {
      seeks.push({ to, from: video.currentTime, reason });
      video.currentTime = to;
      video.play();
    },
    timers: {
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  video = new FakeVideo();
  mode = { autoPause: false, lineLoop: false, ab: null };
  delaySec = 0;
  pauses.length = 0;
  seeks.length = 0;
  studyLines.length = 0;
});

afterEach(() => {
  clock?.dispose();
  clock = null;
  vi.useRealTimers();
});

describe('auto-pause', () => {
  it('stops within 50 ms of the end of a line, without a timeupdate', () => {
    mode.autoPause = true;
    start();
    video.play();
    vi.advanceTimersByTime(4_000);
    expect(pauses).toHaveLength(1);
    expect(pauses[0]?.index).toBe(0);
    expect(Math.abs((pauses[0]?.atSec ?? 0) - 3)).toBeLessThan(0.05);
  });

  it('stops between back-to-back lines, which never leave the cue list empty', () => {
    mode.autoPause = true;
    video.currentTime = 5.5;
    start();
    video.play();
    vi.advanceTimersByTime(2_000);
    expect(pauses.map((entry) => entry.index)).toEqual([1]);
    expect(Math.abs((pauses[0]?.atSec ?? 0) - 7)).toBeLessThan(0.05);
    // Resume: it does not stop again at the same boundary, and stops at the next line's end.
    video.play();
    vi.advanceTimersByTime(2_500);
    expect(pauses.map((entry) => entry.index)).toEqual([1, 2]);
    expect(Math.abs((pauses[1]?.atSec ?? 0) - 9)).toBeLessThan(0.05);
  });

  it('keeps the line just heard as the study line while paused after it', () => {
    mode.autoPause = true;
    start();
    video.play();
    vi.advanceTimersByTime(3_500);
    expect(clock?.current()?.index).toBe(0);
    expect(studyLines.at(-1)).toBe(0);
  });

  it('scales its timer by the playback rate', () => {
    mode.autoPause = true;
    start();
    video.setRate(0.5);
    video.play();
    // At half speed line 0 ends after 6 s of wall time, not 3.
    vi.advanceTimersByTime(5_000);
    expect(pauses).toHaveLength(0);
    vi.advanceTimersByTime(1_500);
    expect(pauses).toHaveLength(1);
    expect(Math.abs((pauses[0]?.atSec ?? 0) - 3)).toBeLessThan(0.05);
  });

  it('honours the subtitle delay', () => {
    mode.autoPause = true;
    delaySec = 0.4;
    start();
    video.play();
    vi.advanceTimersByTime(4_000);
    expect(Math.abs((pauses[0]?.atSec ?? 0) - 3.4)).toBeLessThan(0.05);
  });
});

describe('line loop', () => {
  it('jumps back to the line start within 50 ms of its end, every time', () => {
    mode.lineLoop = true;
    video.currentTime = 5.2;
    start();
    video.play();
    vi.advanceTimersByTime(6_000);
    expect(seeks.length).toBeGreaterThanOrEqual(2);
    for (const seek of seeks) {
      expect(seek.reason).toBe('line');
      expect(seek.to).toBe(5);
      expect(seek.from).toBeLessThanOrEqual(7.05);
      expect(seek.from).toBeGreaterThan(6.95);
    }
    expect(clock?.current()?.index).toBe(1);
  });

  it('replays the line just heard when switched on in the gap after it', () => {
    video.currentTime = 3.5;
    start();
    video.play();
    mode.lineLoop = true;
    clock?.refresh();
    expect(seeks[0]).toMatchObject({ to: 1, reason: 'line' });
  });

  it('wins over auto-pause: a looping line is not also stopped', () => {
    mode.lineLoop = true;
    mode.autoPause = true;
    video.currentTime = 1.1;
    start();
    video.play();
    vi.advanceTimersByTime(5_000);
    expect(pauses).toHaveLength(0);
    expect(seeks.length).toBeGreaterThan(1);
  });
});

describe('A-B loop', () => {
  it('returns to A within 50 ms of B', () => {
    mode.ab = { startSec: 2, endSec: 6 };
    video.currentTime = 2;
    start();
    video.play();
    vi.advanceTimersByTime(4_500);
    expect(seeks[0]?.reason).toBe('ab');
    expect(seeks[0]?.to).toBe(2);
    expect(Math.abs((seeks[0]?.from ?? 0) - 6)).toBeLessThan(0.05);
  });
});

describe('seeks and lifecycle', () => {
  it('drops the held line on a seek into a gap, and picks up the next line when it starts', () => {
    start();
    video.play();
    vi.advanceTimersByTime(3_500);
    expect(clock?.current()?.index).toBe(0);
    video.currentTime = 10;
    expect(clock?.current()).toBeNull();
    vi.advanceTimersByTime(2_100);
    expect(clock?.current()?.index).toBe(3);
  });

  it('does nothing while paused, and removes every listener on dispose', () => {
    mode.autoPause = true;
    start();
    vi.advanceTimersByTime(10_000);
    expect(pauses).toHaveLength(0);
    clock?.dispose();
    clock = null;
    expect(video.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
