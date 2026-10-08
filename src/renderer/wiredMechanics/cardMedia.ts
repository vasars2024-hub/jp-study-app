/**
 * The card's own voice for the Wired consoles (intercept, signal decrypt).
 *
 * A card mined from the player carries the moment itself: a video clip
 * (`clipPath`) and/or the line's audio (`audioPath` / `audioDataUrl`). That is
 * the real speaker, so it beats the OS voice: clip first (its audio track is
 * played; nothing is shown), then the line audio, then TTS. A source that is
 * missing or fails to play falls through to the next one.
 */
import { cardAudioSource } from '../cardAudioSource';

export interface CardMediaFields {
  /** Mined scene clip (video file). Read structurally: older cards lack it. */
  clipPath?: string;
  audioPath?: string;
  audioDataUrl?: string;
}

export type CardMediaKind = 'clip' | 'audio' | 'tts';

/** The playback order for a card: clip > audio > TTS (TTS always last). */
export function cardMediaOrder(card: CardMediaFields | null | undefined): CardMediaKind[] {
  const order: CardMediaKind[] = [];
  if (card?.clipPath?.trim()) order.push('clip');
  if (card?.audioDataUrl || card?.audioPath?.trim()) order.push('audio');
  order.push('tts');
  return order;
}

/** True when the card has media of its own (anything better than TTS). */
export function cardHasOwnMedia(card: CardMediaFields | null | undefined): boolean {
  return cardMediaOrder(card)[0] !== 'tts';
}

export interface MediaElementLike {
  play(): Promise<void>;
  pause(): void;
  removeAttribute?(name: string): void;
  load?(): void;
}

export interface CardMediaDeps {
  resolveClip: (path: string) => Promise<string | null>;
  resolveAudio: (card: CardMediaFields) => Promise<string | null>;
  createElement: (src: string) => MediaElementLike;
}

const defaultDeps: CardMediaDeps = {
  resolveClip: async (path) => {
    try {
      return (await window.api.mediaFileUrl(path)) ?? null;
    } catch {
      return null;
    }
  },
  resolveAudio: cardAudioSource,
  // An <audio> element plays a video container's audio track; the clip is heard, not shown.
  createElement: (src) => new Audio(src) as unknown as MediaElementLike,
};

let current: MediaElementLike | null = null;
let generation = 0;

/** Silence whatever the Wired consoles started. Safe to call at any time. */
export function stopCardMedia(): void {
  generation += 1;
  const element = current;
  current = null;
  if (!element) return;
  try {
    element.pause();
    element.removeAttribute?.('src');
    element.load?.();
  } catch {
    /* already detached */
  }
}

/**
 * Play the best source the card has. `speak` is the TTS fallback and reports
 * whether the OS voice took it. Resolves to the kind that played, or null when
 * nothing could (or a newer request / stop superseded this one).
 */
export async function playCardMedia(
  card: CardMediaFields | null | undefined,
  speak: () => boolean,
  deps: CardMediaDeps = defaultDeps,
): Promise<CardMediaKind | null> {
  stopCardMedia();
  const mine = generation;
  for (const kind of cardMediaOrder(card)) {
    if (mine !== generation) return null;
    if (kind === 'tts') return speak() ? 'tts' : null;
    const src = kind === 'clip'
      ? await deps.resolveClip(card?.clipPath?.trim() ?? '')
      : await deps.resolveAudio(card ?? {});
    if (mine !== generation) return null;
    if (!src) continue;
    const element = deps.createElement(src);
    current = element;
    try {
      await element.play();
      if (mine !== generation) {
        element.pause();
        return null;
      }
      return kind;
    } catch {
      if (current === element) current = null;
    }
  }
  return null;
}
