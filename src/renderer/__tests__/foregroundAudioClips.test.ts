// @vitest-environment jsdom
/**
 * snd6 ducking signal for detached clips: it must say "foreground audio" from
 * the moment a clip starts to the moment it stops, ends or fails, and forget
 * the clip afterwards. jsdom has no media pipeline, so `paused`/`ended`/`play`/
 * `pause` are driven by hand on real <audio> elements; events are dispatched
 * explicitly, as the browser would queue them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isForegroundAudioActive,
  onForegroundAudioChanged,
  resetForegroundAudioForTests,
  trackForegroundMedia,
} from '../foregroundAudio';
import { CardAudioChannel } from '../cardAudioPlayback';

interface MediaState {
  paused: boolean;
  ended: boolean;
}
const states = new WeakMap<HTMLMediaElement, MediaState>();
const stateOf = (el: HTMLMediaElement): MediaState => {
  let s = states.get(el);
  if (!s) {
    s = { paused: true, ended: false };
    states.set(el, s);
  }
  return s;
};

beforeEach(() => {
  resetForegroundAudioForTests();
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: HTMLMediaElement) {
    return stateOf(this).paused;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'ended', 'get').mockImplementation(function (this: HTMLMediaElement) {
    return stateOf(this).ended;
  });
  // Never a real device: play/pause only flip the flags (events are queued, so not sent here).
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    stateOf(this).paused = false;
    stateOf(this).ended = false;
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    stateOf(this).paused = true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetForegroundAudioForTests();
});

function changes(): boolean[] {
  const seen: boolean[] = [];
  onForegroundAudioChanged((active) => seen.push(active));
  return seen;
}

describe('foreground audio: detached clips', () => {
  it('counts a clip from play() to pause(), without waiting for the queued events', () => {
    const seen = changes();
    const clip = new Audio('a.mp3');
    trackForegroundMedia(clip);
    expect(isForegroundAudioActive()).toBe(false);

    void clip.play();
    trackForegroundMedia(clip);
    expect(isForegroundAudioActive()).toBe(true);

    clip.pause();
    trackForegroundMedia(clip);
    expect(isForegroundAudioActive()).toBe(false);
    // The late events change nothing and announce nothing twice.
    clip.dispatchEvent(new Event('play'));
    clip.dispatchEvent(new Event('pause'));
    expect(seen).toEqual([true, false]);
  });

  it('lets go on `ended`, and on `error` even while the element still reads un-paused', () => {
    const clip = new Audio('a.mp3');
    trackForegroundMedia(clip);
    void clip.play();
    clip.dispatchEvent(new Event('play'));
    expect(isForegroundAudioActive()).toBe(true);
    stateOf(clip).ended = true;
    stateOf(clip).paused = true;
    clip.dispatchEvent(new Event('ended'));
    expect(isForegroundAudioActive()).toBe(false);

    const broken = new Audio('b.mp3');
    trackForegroundMedia(broken);
    void broken.play();
    trackForegroundMedia(broken);
    expect(isForegroundAudioActive()).toBe(true);
    // jsdom has no `error` attribute at all; give this element the one a failed decode sets.
    Object.defineProperty(broken, 'error', { value: { code: 4 }, configurable: true });
    broken.dispatchEvent(new Event('error'));
    expect(isForegroundAudioActive()).toBe(false);
  });

  it('forgets a stopped clip: a stray event on it later does not duck again', () => {
    const clip = new Audio('a.mp3');
    trackForegroundMedia(clip);
    void clip.play();
    trackForegroundMedia(clip);
    clip.pause();
    trackForegroundMedia(clip);
    clip.dispatchEvent(new Event('volumechange'));
    expect(isForegroundAudioActive()).toBe(false);
    // Re-used (Listen mode keeps one element): it counts again when it plays again.
    void clip.play();
    clip.dispatchEvent(new Event('playing'));
    expect(isForegroundAudioActive()).toBe(true);
  });

  it('a muted clip is not foreground audio', () => {
    const clip = new Audio('a.mp3');
    clip.muted = true;
    trackForegroundMedia(clip);
    void clip.play();
    trackForegroundMedia(clip);
    expect(isForegroundAudioActive()).toBe(false);
    clip.muted = false;
    clip.dispatchEvent(new Event('volumechange'));
    expect(isForegroundAudioActive()).toBe(true);
  });

  it('ignores a stand-in without events instead of throwing', () => {
    expect(() => trackForegroundMedia({} as HTMLMediaElement)).not.toThrow();
    expect(isForegroundAudioActive()).toBe(false);
  });
});

describe('foreground audio: the card channel reports exactly when a clip sounds', () => {
  const focus = { addEventListener: () => undefined };

  it('on at play, still on (and only one clip) across a replay, off at stop', async () => {
    const seen = changes();
    const audio = new CardAudioChannel(undefined, focus);
    await audio.play('one.mp3');
    expect(isForegroundAudioActive()).toBe(true);
    await audio.play('two.mp3');
    expect(isForegroundAudioActive()).toBe(true);
    audio.stop();
    expect(isForegroundAudioActive()).toBe(false);
    // No flicker off-and-on between the two clips: one start, one end.
    expect(seen).toEqual([true, false]);
  });

  it('off when the clip ends on its own', async () => {
    const created: HTMLAudioElement[] = [];
    const RealAudio = window.Audio;
    const Spy = function (this: unknown, src?: string) {
      const el = new RealAudio(src);
      created.push(el);
      return el;
    } as unknown as typeof Audio;
    window.Audio = Spy;
    try {
      const audio = new CardAudioChannel(undefined, focus);
      await audio.play('one.mp3');
      expect(isForegroundAudioActive()).toBe(true);
      stateOf(created[0]).ended = true;
      stateOf(created[0]).paused = true;
      created[0].dispatchEvent(new Event('ended'));
      expect(isForegroundAudioActive()).toBe(false);
      expect(audio.playing).toBe(false);
    } finally {
      window.Audio = RealAudio;
    }
  });
});
