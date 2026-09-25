/**
 * Volume normalization on the real player's element (round-2 audit B, item 19).
 * The Media Center's toggle drove a graph on an element nothing attached, so it
 * never touched audio. These pin the three properties that make the new one
 * safe: the MediaElementSource is created once per element (a second call
 * throws in Chromium), "off" on an untouched element builds nothing, and an
 * element Web Audio may not read is refused rather than silenced.
 */
import { describe, expect, it, vi } from 'vitest';
import { mediaAudioReadable, setVolumeNormalization } from './volumeNormalization';

function fakeContext() {
  const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(), gain: param() });
  const gains: Array<ReturnType<typeof node>> = [];
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: {},
    createMediaElementSource: vi.fn(() => node()),
    createDynamicsCompressor: vi.fn(() => ({
      connect: vi.fn(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    })),
    createGain: vi.fn(() => {
      const g = node();
      gains.push(g);
      return g;
    }),
    resume: vi.fn(async () => undefined),
  };
  return { ctx, gains };
}

function media(overrides: Partial<HTMLMediaElement> = {}): HTMLMediaElement {
  return { crossOrigin: 'anonymous', currentSrc: 'http://127.0.0.1:43211/stream', src: '', ...overrides } as HTMLMediaElement;
}

describe('setVolumeNormalization', () => {
  it('builds the graph once per element and crossfades on later toggles', async () => {
    const { ctx, gains } = fakeContext();
    const create = vi.fn(() => ctx as unknown as AudioContext);
    const el = media();
    expect(await setVolumeNormalization(el, true, create)).toBe('on');
    expect(await setVolumeNormalization(el, false, create)).toBe('off');
    expect(await setVolumeNormalization(el, true, create)).toBe('on');
    expect(create).toHaveBeenCalledTimes(1);
    expect(ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
    const [normalized, bypass] = gains;
    expect(normalized.gain.setTargetAtTime.mock.calls.map((c) => c[0])).toEqual([1.25, 0, 1.25]);
    expect(bypass.gain.setTargetAtTime.mock.calls.map((c) => c[0])).toEqual([0, 1, 0]);
  });

  it('builds nothing to turn off an untouched element', async () => {
    const create = vi.fn();
    expect(await setVolumeNormalization(media(), false, create as never)).toBe('off');
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an element whose audio Web Audio may not read, instead of silencing it', async () => {
    const create = vi.fn();
    const el = media({ crossOrigin: null, currentSrc: 'http://other.example/video.mp4' });
    expect(mediaAudioReadable(el, 'http://localhost:5173')).toBe(false);
    expect(await setVolumeNormalization(el, true, create as never)).toBe('blocked');
    expect(create).not.toHaveBeenCalled();
  });
});
