// @vitest-environment jsdom
/**
 * The Wired consoles (intercept, signal decrypt) play a card's own mined media
 * before the OS voice: clip > line audio > TTS, each failure falling through to
 * the next, and a stop or newer request silencing an older one.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  cardHasOwnMedia,
  cardMediaOrder,
  playCardMedia,
  stopCardMedia,
  type CardMediaDeps,
  type MediaElementLike,
} from '../wiredMechanics/cardMedia';

function element(fails = false): MediaElementLike & { paused: boolean } {
  const el = {
    paused: true,
    play: vi.fn(async () => {
      if (fails) throw new Error('NotSupportedError');
      el.paused = false;
    }),
    pause: vi.fn(() => {
      el.paused = true;
    }),
  };
  return el;
}

function deps(over: Partial<CardMediaDeps> = {}): CardMediaDeps & { played: string[] } {
  const played: string[] = [];
  return {
    played,
    resolveClip: async (path) => `clip:${path}`,
    resolveAudio: async (card) => (card.audioPath ? `audio:${card.audioPath}` : card.audioDataUrl ?? null),
    createElement: (src) => {
      played.push(src);
      return element();
    },
    ...over,
  };
}

describe('cardMediaOrder', () => {
  it('prefers clip, then audio, then TTS', () => {
    expect(cardMediaOrder({ clipPath: 'c.mp4', audioPath: 'a.mp3' })).toEqual(['clip', 'audio', 'tts']);
    expect(cardMediaOrder({ audioDataUrl: 'data:audio/mp3;base64,AA' })).toEqual(['audio', 'tts']);
    expect(cardMediaOrder({ clipPath: '  ' })).toEqual(['tts']);
    expect(cardMediaOrder(null)).toEqual(['tts']);
  });

  it('says whether a card has anything better than TTS', () => {
    expect(cardHasOwnMedia({ clipPath: 'c.mp4' })).toBe(true);
    expect(cardHasOwnMedia({ audioPath: 'a.mp3' })).toBe(true);
    expect(cardHasOwnMedia({})).toBe(false);
  });
});

describe('playCardMedia', () => {
  it('plays the clip when there is one, without speaking', async () => {
    const d = deps();
    const speak = vi.fn(() => true);
    expect(await playCardMedia({ clipPath: 'c.mp4', audioPath: 'a.mp3' }, speak, d)).toBe('clip');
    expect(d.played).toEqual(['clip:c.mp4']);
    expect(speak).not.toHaveBeenCalled();
  });

  it('falls back to the line audio when the clip cannot be resolved', async () => {
    const d = deps({ resolveClip: async () => null });
    expect(await playCardMedia({ clipPath: 'gone.mp4', audioPath: 'a.mp3' }, () => true, d)).toBe('audio');
    expect(d.played).toEqual(['audio:a.mp3']);
  });

  it('falls back to TTS when every element refuses to play', async () => {
    const played: string[] = [];
    const d = deps({
      createElement: (src) => {
        played.push(src);
        return element(true);
      },
    });
    const speak = vi.fn(() => true);
    expect(await playCardMedia({ clipPath: 'c.mp4', audioPath: 'a.mp3' }, speak, d)).toBe('tts');
    expect(played).toEqual(['clip:c.mp4', 'audio:a.mp3']);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('uses TTS directly for a card without media, and reports when no voice took it', async () => {
    expect(await playCardMedia({}, () => true, deps())).toBe('tts');
    expect(await playCardMedia({}, () => false, deps())).toBeNull();
  });

  it('a stop while the source is resolving cancels the playback', async () => {
    let release: (v: string) => void = () => undefined;
    const d = deps({ resolveClip: () => new Promise<string>((r) => { release = r; }) });
    const speak = vi.fn(() => true);
    const pending = playCardMedia({ clipPath: 'c.mp4' }, speak, d);
    stopCardMedia();
    release('clip:c.mp4');
    expect(await pending).toBeNull();
    expect(d.played).toEqual([]);
    expect(speak).not.toHaveBeenCalled();
  });

  it('stopCardMedia pauses what is playing', async () => {
    const el = element();
    await playCardMedia({ audioPath: 'a.mp3' }, () => true, deps({ createElement: () => el }));
    expect(el.paused).toBe(false);
    stopCardMedia();
    expect(el.pause).toHaveBeenCalled();
  });
});
