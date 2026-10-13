import { describe, expect, it } from 'vitest';
import { CardAudioChannel, type CardAudioElement, type FocusHost } from '../cardAudioPlayback';

type ClipEvent = 'ended' | 'error';

class FakeAudio implements CardAudioElement {
  currentTime = 12;
  paused = true;
  resolve: (() => void) | undefined;
  reject: ((error: Error) => void) | undefined;
  private readonly handlers = new Map<ClipEvent, Set<() => void>>();

  constructor(readonly src: string) {}

  play(): Promise<void> {
    this.paused = false;
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  pause(): void {
    this.paused = true;
    // As in the browser: pausing a pending play rejects it with AbortError.
    this.reject?.(Object.assign(new Error('The play() request was interrupted by a call to pause().'), { name: 'AbortError' }));
  }

  addEventListener(type: ClipEvent, listener: () => void): void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)?.add(listener);
  }

  removeEventListener(type: ClipEvent, listener: () => void): void {
    this.handlers.get(type)?.delete(listener);
  }

  emit(type: ClipEvent): void {
    if (type === 'ended') this.paused = true;
    for (const listener of [...(this.handlers.get(type) ?? [])]) listener();
  }

  listenerCount(): number {
    let n = 0;
    for (const set of this.handlers.values()) n += set.size;
    return n;
  }

  /** Playback actually began: the promise resolves (this is when bug 2 let go). */
  start(): void {
    this.resolve?.();
  }
}

class FakeWindow implements FocusHost {
  private readonly blurs: Array<() => void> = [];
  addEventListener(_type: 'blur', listener: () => void): void {
    this.blurs.push(listener);
  }
  blur(): void {
    for (const listener of this.blurs) listener();
  }
  get bound(): number {
    return this.blurs.length;
  }
}

function channel(): { channel: CardAudioChannel; made: FakeAudio[]; win: FakeWindow } {
  const made: FakeAudio[] = [];
  const win = new FakeWindow();
  return {
    channel: new CardAudioChannel((src) => {
      const element = new FakeAudio(src);
      made.push(element);
      return element;
    }, win),
    made,
    win,
  };
}

/** Let resolved play promises settle. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await Promise.resolve();
};

const sounding = (made: FakeAudio[]): string[] => made.filter((a) => !a.paused).map((a) => a.src);

describe('one playback channel for card audio', () => {
  it('stops and rewinds the previous clip before starting the next', () => {
    const { channel: audio, made } = channel();
    void audio.play('first.mp3');
    void audio.play('second.mp3');

    // The defect: holding the replay key in audio-only review stacked several
    // sentences over each other, with no handle to stop any of them.
    expect(made).toHaveLength(2);
    expect(made[0].paused).toBe(true);
    expect(made[0].currentTime).toBe(0);
    expect(made[1].paused).toBe(false);
  });

  it('bug 2: a clip that has STARTED playing is still stopped by the next one (no overlap)', async () => {
    const { channel: audio, made } = channel();
    const first = audio.play('first.mp3');
    made[0].start();
    await first;
    // `play()` resolved: the clip is sounding. The old channel had already let go here.
    expect(audio.playing).toBe(true);

    const second = audio.play('second.mp3');
    made[1].start();
    await second;
    expect(sounding(made)).toEqual(['second.mp3']);
    expect(made[0].currentTime).toBe(0);

    // Holding R: ten replays, still only ever one voice.
    for (let i = 0; i < 10; i += 1) {
      const next = audio.play(`r${i}.mp3`);
      made.at(-1)?.start();
      await next;
      expect(sounding(made)).toHaveLength(1);
    }
  });

  it('bug 2: stop() silences a clip that is already playing', async () => {
    const { channel: audio, made } = channel();
    const playing = audio.play('clip.mp3');
    made[0].start();
    await playing;
    audio.stop();
    expect(made[0].paused).toBe(true);
    expect(made[0].currentTime).toBe(0);
    expect(audio.playing).toBe(false);
    expect(() => audio.stop()).not.toThrow();
  });

  it('stop() silences an in-flight clip, and its interrupted play() is not a failure', async () => {
    const { channel: audio, made } = channel();
    const playing = audio.play('clip.mp3');
    expect(audio.playing).toBe(true);
    audio.stop();
    expect(made[0].paused).toBe(true);
    expect(audio.playing).toBe(false);
    // The browser rejects with AbortError; the caller must not report "playback failed".
    await expect(playing).resolves.toBeUndefined();
  });

  it('a superseded clip\'s pending play() resolves quietly too', async () => {
    const { channel: audio } = channel();
    const first = audio.play('first.mp3');
    void audio.play('second.mp3');
    await expect(first).resolves.toBeUndefined();
  });

  it('releases a clip when it ends, so a later stop cannot rewind it', async () => {
    const { channel: audio, made } = channel();
    const playing = audio.play('clip.mp3');
    made[0].start();
    await playing;
    expect(audio.playing).toBe(true);
    made[0].emit('ended');

    expect(audio.playing).toBe(false);
    expect(made[0].listenerCount()).toBe(0);
    made[0].currentTime = 7;
    audio.stop();
    expect(made[0].currentTime).toBe(7);
  });

  it('propagates a rejected play so the caller can report it', async () => {
    const { channel: audio, made } = channel();
    const playing = audio.play('clip.mp3');
    made[0].reject?.(new Error('NotAllowedError'));

    await expect(playing).rejects.toThrow('NotAllowedError');
    expect(audio.playing).toBe(false);
  });

  it('a source error is still reported when its `error` event arrives before the rejection', async () => {
    const { channel: audio, made } = channel();
    const playing = audio.play('broken.mp3');
    made[0].emit('error');
    expect(audio.playing).toBe(false);
    made[0].reject?.(new Error('NotSupportedError'));
    await expect(playing).rejects.toThrow('NotSupportedError');
  });

  it('the window losing focus silences the clip', async () => {
    const { channel: audio, made, win } = channel();
    const playing = audio.play('clip.mp3');
    made[0].start();
    await playing;
    win.blur();
    expect(made[0].paused).toBe(true);
    expect(audio.playing).toBe(false);
    // One focus listener for the life of the channel, not one per clip.
    void audio.play('again.mp3');
    void audio.play('again2.mp3');
    expect(win.bound).toBe(1);
  });

  it('a claim goes stale on a card change (stop), a newer claim, a play or a blur', async () => {
    const { channel: audio, win } = channel();
    const a = audio.claim();
    expect(a()).toBe(true);
    audio.stop();
    expect(a()).toBe(false);

    const b = audio.claim();
    const c = audio.claim();
    expect(b()).toBe(false);
    expect(c()).toBe(true);

    void audio.play('x.mp3');
    expect(c()).toBe(false);

    const d = audio.claim();
    win.blur();
    expect(d()).toBe(false);
    await flush();
  });

  it('a card left while its clip loads never speaks over the next card', async () => {
    const { channel: audio, made } = channel();
    let resolveOld: (src: string) => void = () => undefined;
    const loadOld = new Promise<string>((resolve) => {
      resolveOld = resolve;
    });
    // FlashcardsContent.playCurrentAudio: claim, await the source, check, play.
    const playCard = async (load: Promise<string>): Promise<void> => {
      const live = audio.claim();
      const src = await load;
      if (!live()) return;
      await audio.play(src);
    };
    const old = playCard(loadOld);
    audio.stop(); // the card changed
    const next = playCard(Promise.resolve('next.mp3'));
    await flush();
    made[0].start();
    resolveOld('old.mp3');
    await old;
    await next;
    expect(made.map((a) => a.src)).toEqual(['next.mp3']);
    expect(sounding(made)).toEqual(['next.mp3']);
  });

  it('stop(src) only stops that clip, so a surface tidying up cannot cut off another\'s', async () => {
    const { channel: audio, made } = channel();
    void audio.play('mine.webm');
    void audio.play('word.mp3');
    audio.stop('mine.webm');
    expect(sounding(made)).toEqual(['word.mp3']);
    audio.stop('word.mp3');
    expect(sounding(made)).toEqual([]);
    await flush();
  });
});
