/**
 * One playback channel for card audio.
 *
 * Every play site used to build its own `new Audio(...)` and drop the handle,
 * so nothing could stop a clip once it started. In audio-only review that is
 * not theoretical: the prompt autoplays on card change and the replay key is
 * deliberately not gated on the answer being revealed, so holding R or moving
 * quickly through a sitting stacked several sentences on top of each other and
 * there was no way to silence them.
 *
 * Bug 2: the channel let go of a clip when `play()` *resolved*, which is the
 * moment playback starts, so `stop()` (and the next clip) could not reach a clip
 * that was actually sounding and review clips still overlapped. A clip is now
 * the channel's until it ends, fails or is stopped; nothing else lets go of it.
 *
 * What silences the channel, deterministically:
 *  - the next `play()` (one clip at a time);
 *  - `stop()` (leaving review, opening the scene in the video, a card change);
 *  - the window losing focus (an app switch should not leave a sentence playing
 *    behind the learner's back);
 *  - a `claim()` gone stale: a caller that awaits a clip's source checks its
 *    ticket before playing, so a card the learner already left never speaks.
 *
 * The element factory and the focus host are injectable so the sequencing is
 * testable without a DOM audio device.
 */

import { trackForegroundMedia } from './foregroundAudio';

type ClipEvent = 'ended' | 'error';

export interface CardAudioElement {
  play(): Promise<void>;
  pause(): void;
  currentTime: number;
  addEventListener(type: ClipEvent, listener: () => void): void;
  removeEventListener(type: ClipEvent, listener: () => void): void;
}

export type CardAudioFactory = (src: string) => CardAudioElement;

/** Where the channel hears that the window lost focus (`blur`). */
export interface FocusHost {
  addEventListener(type: 'blur', listener: () => void): void;
}

/**
 * snd6: a real clip is reported as foreground audio, so the Soundscape ducks
 * under it for exactly as long as it sounds: from the `play()` call (not the
 * queued `play` event) to the `pause()` call, `ended` or `error`.
 */
const domFactory: CardAudioFactory = (src) => {
  const element = new Audio(src);
  trackForegroundMedia(element);
  return {
    play() {
      const started = element.play();
      trackForegroundMedia(element);
      return started;
    },
    pause() {
      element.pause();
      trackForegroundMedia(element);
    },
    get currentTime() {
      return element.currentTime;
    },
    set currentTime(seconds: number) {
      element.currentTime = seconds;
    },
    addEventListener: (type, listener) => element.addEventListener(type, listener),
    removeEventListener: (type, listener) => element.removeEventListener(type, listener),
  };
};

const CLIP_EVENTS: readonly ClipEvent[] = ['ended', 'error'];

export class CardAudioChannel {
  private current: CardAudioElement | null = null;
  private currentSrc: string | null = null;
  private detach: (() => void) | null = null;
  /** Bumped by every play, stop and claim; a ticket is live while it still matches. */
  private generation = 0;
  private focusBound = false;
  /** Clips this channel cut off itself, whose pending `play()` rejection is expected. */
  private readonly silenced = new WeakSet<CardAudioElement>();

  constructor(
    private readonly create: CardAudioFactory = domFactory,
    private readonly focusHost: FocusHost | null = typeof window === 'undefined' ? null : window,
  ) {}

  /**
   * Play `src` in place of whatever is playing. Rejects exactly as `play` does,
   * except when this clip was itself silenced (by `stop`, the next clip or a
   * blur) before it got going: that is not a playback failure, so it resolves.
   *
   * The new clip is started before the old one is paused, in the same task, so
   * the ducking signal stays on across a replay instead of blinking off and on.
   */
  async play(src: string): Promise<void> {
    const previous = this.current;
    this.generation += 1;
    this.release();
    this.bindFocus();
    let element: CardAudioElement;
    let started: Promise<void>;
    try {
      element = this.create(src);
      this.current = element;
      this.currentSrc = src;
      const mine = element;
      // Ended or failed: the clip is over and no longer ours to stop.
      const over = (): void => {
        if (this.current === mine) this.release();
      };
      for (const type of CLIP_EVENTS) mine.addEventListener(type, over);
      this.detach = () => {
        for (const type of CLIP_EVENTS) mine.removeEventListener(type, over);
      };
      started = mine.play();
    } finally {
      // Whatever happened to the new clip, the old one does not play on.
      this.silence(previous);
    }
    try {
      await started;
    } catch (error) {
      // `pause()` during a pending play rejects it with AbortError; a clip we
      // stopped on purpose must not read as "playback failed". A clip that
      // failed on its own (its `error` event can arrive before the rejection)
      // still does.
      if (this.silenced.has(element)) return;
      if (this.current === element) this.release();
      throw error;
    }
  }

  /**
   * Silence the channel: leaving review, a card change, or starting a different
   * clip. With `src`, only when that is the clip sounding: a surface tidying up
   * after itself must not cut off a clip another surface started since.
   */
  stop(src?: string): void {
    if (src !== undefined && (this.current === null || this.currentSrc !== src)) return;
    this.generation += 1;
    const element = this.current;
    this.release();
    this.silence(element);
  }

  /**
   * A ticket for a play that has to await its source first. It goes stale on the
   * next `claim`, `play` or `stop`, so the caller drops a clip that was
   * superseded (a later replay, a card change) while it loaded.
   */
  claim(): () => boolean {
    this.bindFocus();
    const mine = ++this.generation;
    return () => this.generation === mine;
  }

  /** True while a clip this channel started has neither ended, failed nor been stopped. */
  get playing(): boolean {
    return this.current !== null;
  }

  /** Pause and rewind a clip this channel no longer holds. */
  private silence(element: CardAudioElement | null): void {
    if (!element) return;
    this.silenced.add(element);
    try {
      element.pause();
      element.currentTime = 0;
    } catch {
      /* An element detached mid-teardown is already silent. */
    }
  }

  private release(): void {
    this.detach?.();
    this.detach = null;
    this.current = null;
    this.currentSrc = null;
  }

  private bindFocus(): void {
    if (this.focusBound || !this.focusHost) return;
    this.focusBound = true;
    // Also drops a clip still loading: coming back to the window must not start one.
    this.focusHost.addEventListener('blur', () => this.stop());
  }
}

/**
 * The channel every study clip shares: review cards and the short clips around
 * them (a dictionary word, the learner's own shadowing take,
 * a captured visual-novel line). One foreground clip at a time across the app:
 * a second clip cuts the first instead of talking over it.
 */
export const cardAudio = new CardAudioChannel();
