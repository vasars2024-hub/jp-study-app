// @vitest-environment jsdom
/**
 * `recordCueAudio` records one cue in real time from a media element and must
 * hand the player back exactly as it found it (time, rate, paused or playing)
 * on every path, including a throw. A fake element and a fake MediaRecorder
 * stand in for the browser's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordCueAudio, waitForSeek } from '../cueAudioCapture';

class FakeRecorder {
  static supported = true;
  static isTypeSupported(mime: string): boolean {
    return FakeRecorder.supported && mime === 'audio/webm;codecs=opus';
  }
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  private listeners = new Map<string, Array<(e: unknown) => void>>();
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? '';
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    for (const fn of this.listeners.get('dataavailable') ?? []) fn({ data: new Blob([new Uint8Array(64)], { type: this.mimeType }) });
    for (const fn of this.listeners.get('stop') ?? []) fn({});
  }
}

function fakeMedia(options: { paused?: boolean; audioTracks?: number; capture?: boolean } = {}) {
  const target = new EventTarget();
  const track = { stop: vi.fn(), kind: 'audio' };
  let time = 42;
  const media = Object.assign(target, {
    paused: options.paused ?? false,
    playbackRate: 1.5,
    pause: vi.fn(() => { media.paused = true; }),
    play: vi.fn(async () => { media.paused = false; }),
    ...(options.capture === false ? {} : {
      captureStream: () => ({
        getAudioTracks: () => Array.from({ length: options.audioTracks ?? 1 }, () => track),
        getTracks: () => [track],
      }),
    }),
  });
  // An accessor, as on a real element: setting it seeks, and `seeked` follows.
  Object.defineProperty(media, 'currentTime', {
    get: () => time,
    set: (value: number) => {
      time = value;
      queueMicrotask(() => target.dispatchEvent(new Event('seeked')));
    },
  });
  return { media: media as unknown as HTMLMediaElement & { pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }, track };
}

beforeEach(() => {
  FakeRecorder.supported = true;
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('MediaStream', class { constructor(public tracks: unknown[]) {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recordCueAudio', () => {
  it('records the cue and gives the player back as it was (playing, same time and rate)', async () => {
    const { media, track } = fakeMedia({ paused: false });
    const asset = await recordCueAudio(media, { startSec: 10, endSec: 10.2, filenameStem: 'ep1-cue7' });
    expect(asset.filename).toBe('ep1-cue7.webm');
    expect(asset.mimeType).toContain('audio/webm');
    expect(asset.bytes).toBe(64);
    expect(asset.base64.length).toBeGreaterThan(0);
    expect(media.currentTime).toBe(42);
    expect(media.playbackRate).toBe(1.5);
    expect(media.play).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it('a paused player stays paused afterwards', async () => {
    const { media } = fakeMedia({ paused: true });
    await recordCueAudio(media, { startSec: 1, endSec: 1.15, filenameStem: 'x' });
    expect(media.paused).toBe(true);
    expect(media.currentTime).toBe(42);
  });

  it('refuses a cue under 100 ms or over 30 s before touching the player', async () => {
    const { media } = fakeMedia();
    await expect(recordCueAudio(media, { startSec: 1, endSec: 1.05, filenameStem: 'x' })).rejects.toThrow();
    await expect(recordCueAudio(media, { startSec: 0, endSec: 31, filenameStem: 'x' })).rejects.toThrow();
    expect(media.pause).not.toHaveBeenCalled();
  });

  it('a source with no audio track fails and still restores the player', async () => {
    const { media } = fakeMedia({ audioTracks: 0, paused: false });
    await expect(recordCueAudio(media, { startSec: 5, endSec: 5.2, filenameStem: 'x' })).rejects.toThrow();
    expect(media.currentTime).toBe(42);
    expect(media.playbackRate).toBe(1.5);
    expect(media.play).toHaveBeenCalled();
  });

  it('fails cleanly where the engine cannot record or capture', async () => {
    const { media } = fakeMedia({ capture: false });
    await expect(recordCueAudio(media, { startSec: 5, endSec: 5.2, filenameStem: 'x' })).rejects.toThrow();
    vi.stubGlobal('MediaRecorder', undefined);
    await expect(recordCueAudio(fakeMedia().media, { startSec: 5, endSec: 5.2, filenameStem: 'x' })).rejects.toThrow();
  });
});

describe('waitForSeek', () => {
  it('resolves at once when already there, and on `seeked` otherwise', async () => {
    const { media } = fakeMedia();
    await expect(waitForSeek(media, 42.01)).resolves.toBeUndefined();
    await expect(waitForSeek(media, 7)).resolves.toBeUndefined();
    expect(media.currentTime).toBe(7);
  });
});
