/**
 * A pause or loop armed while its switch was on must not fire after the switch is turned
 * off. The clock arms one timer for the next boundary; when the mode changed in between,
 * the armed action used to be carried out anyway when the timer (or a late `timeupdate`)
 * came round.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStudyCueClock, type StudyCueClock, type StudyCueClockMode } from '../studyCueClock';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

class FakeVideo {
  private base = 0;
  private startedAt = 0;
  paused = true;
  readonly playbackRate = 1;
  private readonly listeners = new Map<string, Set<() => void>>();

  get currentTime(): number {
    return this.paused ? this.base : this.base + (Date.now() - this.startedAt) / 1000;
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

  addEventListener(type: string, listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

const CUES: VideoCoreStudyCue[] = [
  { index: 0, trackNumber: 1, startMs: 1_000, endMs: 3_000, text: '一' },
  { index: 1, trackNumber: 1, startMs: 6_000, endMs: 8_000, text: '二' },
];

let video: FakeVideo;
let clock: StudyCueClock | null = null;
let mode: StudyCueClockMode;
let pauses: number[];
let seeks: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  video = new FakeVideo();
  pauses = [];
  seeks = [];
  clock = createStudyCueClock({
    video,
    getCues: () => CUES,
    getDelaySec: () => 0,
    getMode: () => mode,
    onStudyCue: () => undefined,
    pause: (line) => {
      pauses.push(line.index);
      video.pause();
    },
    seek: (to, reason) => {
      seeks.push(reason);
      video.currentTime = to;
    },
    timers: {
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  });
});

afterEach(() => {
  clock?.dispose();
  clock = null;
  vi.useRealTimers();
});

function playFrom(sec: number): void {
  video.currentTime = sec;
  video.play();
}

describe('study cue clock: switching a mode off cancels what it armed', () => {
  it('control: auto-pause on stops at the end of the line', () => {
    mode = { autoPause: true, lineLoop: false, ab: null };
    playFrom(1.5);
    vi.advanceTimersByTime(2_000);
    expect(pauses).toEqual([0]);
  });

  it('a pause armed before auto-pause was turned off does not fire', () => {
    mode = { autoPause: true, lineLoop: false, ab: null };
    playFrom(1.5);
    mode = { autoPause: false, lineLoop: false, ab: null };
    vi.advanceTimersByTime(2_000);
    expect(pauses).toEqual([]);
    expect(video.paused).toBe(false);
  });

  it('a late timeupdate does not carry out a pause the user switched off', () => {
    mode = { autoPause: true, lineLoop: false, ab: null };
    playFrom(1.5);
    mode = { autoPause: false, lineLoop: false, ab: null };
    // A throttled window: the timer has not run, the clock is past the boundary.
    vi.setSystemTime(Date.now() + 1_600);
    video.emit('timeupdate');
    expect(pauses).toEqual([]);
  });

  it('a line loop armed before the loop was turned off does not seek back', () => {
    mode = { autoPause: false, lineLoop: true, ab: null };
    playFrom(1.5);
    mode = { autoPause: false, lineLoop: false, ab: null };
    vi.advanceTimersByTime(2_000);
    expect(seeks).toEqual([]);
  });

  it('an A-B loop that was cleared does not jump back', () => {
    mode = { autoPause: false, lineLoop: false, ab: { startSec: 1, endSec: 2.5 } };
    playFrom(1.5);
    mode = { autoPause: false, lineLoop: false, ab: null };
    vi.advanceTimersByTime(1_500);
    expect(seeks).toEqual([]);
  });
});
