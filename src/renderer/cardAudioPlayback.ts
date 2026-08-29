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
 * The element factory is injectable so the sequencing is testable without a
 * DOM audio device.
 */

export interface CardAudioElement {
  play(): Promise<void>;
  pause(): void;
  currentTime: number;
}

export type CardAudioFactory = (src: string) => CardAudioElement;

const domFactory: CardAudioFactory = (src) => new Audio(src) as unknown as CardAudioElement;

export class CardAudioChannel {
  private current: CardAudioElement | null = null;

  constructor(private readonly create: CardAudioFactory = domFactory) {}

  /** Stop whatever is playing, then play `src`. Rejects exactly as `play` does. */
  async play(src: string): Promise<void> {
    this.stop();
    const element = this.create(src);
    this.current = element;
    try {
      await element.play();
    } finally {
      // A clip that finished, failed or was superseded is no longer ours to
      // stop; clearing here keeps `stop()` from rewinding a stranger's element.
      if (this.current === element) this.current = null;
    }
  }

  /** Silence the channel — leaving review, or starting a different clip. */
  stop(): void {
    const element = this.current;
    this.current = null;
    if (!element) return;
    try {
      element.pause();
      element.currentTime = 0;
    } catch {
      /* An element detached mid-teardown is already silent. */
    }
  }

  /** True while a clip this channel started is still in flight. */
  get playing(): boolean {
    return this.current !== null;
  }
}

/** The channel every card surface shares. */
export const cardAudio = new CardAudioChannel();
