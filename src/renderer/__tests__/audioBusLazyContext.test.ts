// @vitest-environment jsdom
/**
 * Boot console error: `playerBus` attaches its <audio> element at module load,
 * and `attachAudio` created an AudioContext right there — opening an audio device
 * on every launch, which logs an AudioContext device error on a machine without
 * one. The context now waits for the first play.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
  connect(): void {
    /* graph edge */
  }
}

let constructed = 0;
class FakeAudioContext {
  destination = new FakeNode();
  constructor() {
    constructed += 1;
  }
  createAnalyser(): FakeNode {
    return new FakeNode();
  }
  createMediaElementSource(): FakeNode {
    return new FakeNode();
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  constructed = 0;
});

describe('audioBus — no AudioContext until something plays', () => {
  it('attaching does not open an audio device; the first play does, once', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const bus = await import('../audioBus');
    const el = document.createElement('audio');
    bus.attachAudio(el);
    bus.attachAudio(el);
    expect(constructed).toBe(0);
    el.dispatchEvent(new Event('play'));
    el.dispatchEvent(new Event('play'));
    expect(constructed).toBe(1);
    expect(bus.isPlaying()).toBe(true);
  });

  it('a host with no Web Audio still plays and logs nothing', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = await import('../audioBus');
    const el = document.createElement('audio');
    bus.attachAudio(el);
    el.dispatchEvent(new Event('play'));
    expect(bus.isPlaying()).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });
});
