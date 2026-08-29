import { describe, expect, it } from 'vitest';
import { CardAudioChannel, type CardAudioElement } from '../cardAudioPlayback';

class FakeAudio implements CardAudioElement {
  currentTime = 12;
  paused = false;
  resolve: (() => void) | undefined;
  reject: ((error: Error) => void) | undefined;

  constructor(readonly src: string) {}

  play(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  pause(): void {
    this.paused = true;
  }
}

function channel(): { channel: CardAudioChannel; made: FakeAudio[] } {
  const made: FakeAudio[] = [];
  return {
    channel: new CardAudioChannel((src) => {
      const element = new FakeAudio(src);
      made.push(element);
      return element;
    }),
    made,
  };
}

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

  it('stop() silences an in-flight clip and is safe when idle', () => {
    const { channel: audio, made } = channel();
    void audio.play('clip.mp3');
    expect(audio.playing).toBe(true);
    audio.stop();
    expect(made[0].paused).toBe(true);
    expect(audio.playing).toBe(false);
    expect(() => audio.stop()).not.toThrow();
  });

  it('releases a finished clip so a later stop cannot rewind it', async () => {
    const { channel: audio, made } = channel();
    const playing = audio.play('clip.mp3');
    made[0].resolve?.();
    await playing;

    expect(audio.playing).toBe(false);
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
});
