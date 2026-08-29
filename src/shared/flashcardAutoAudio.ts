/**
 * Which newly mined cards get offline speech attached without being asked.
 *
 * Pure selection only — no storage, no IPC, no synthesizer. The renderer owns
 * the run; this file owns the decision, so the same rules are testable and are
 * identical for EPUB/novel mining, the extension, media study and imports.
 *
 * Two things it deliberately refuses to do:
 *   - Default to on. A single APKG import is thousands of cards, and thousands
 *     of unrequested synthesizer runs is not a feature.
 *   - Speak text that is not Japanese. The offline voice is selected by
 *     language, and a Latin-script gloss read by a Japanese voice is noise.
 */

import { hasHan, hasKana } from './langs';

/** The four mining families the preference distinguishes. */
export type AutoAudioSource = 'epub' | 'extension' | 'media' | 'import';

export interface AutoAudioPreferences {
  epub: boolean;
  extension: boolean;
  media: boolean;
  import: boolean;
  /**
   * The ceiling for one batch. The OS synthesizer owns one voice device and
   * runs sequentially, so an uncapped batch is an unbounded wait — a capped run
   * reports the remainder rather than silently doing part of the job.
   */
  maxPerBatch: number;
}

export const DEFAULT_AUTO_AUDIO_PREFERENCES: AutoAudioPreferences = {
  epub: false,
  extension: false,
  media: false,
  import: false,
  maxPerBatch: 50,
};

const MAX_BATCH_CEILING = 500;

export function normalizeAutoAudioPreferences(
  value?: Partial<AutoAudioPreferences> | null,
): AutoAudioPreferences {
  const cap = Number(value?.maxPerBatch);
  return {
    epub: value?.epub === true,
    extension: value?.extension === true,
    media: value?.media === true,
    import: value?.import === true,
    maxPerBatch: Number.isFinite(cap) && cap > 0
      ? Math.min(Math.floor(cap), MAX_BATCH_CEILING)
      : DEFAULT_AUTO_AUDIO_PREFERENCES.maxPerBatch,
  };
}

/**
 * Map a card's own `FlashcardSource` onto the preference family.
 *
 * `dictionary` and `jiten` are absent on purpose: those are single-word lookups
 * the user is already reading, not a mined batch, and they have their own
 * pronunciation path.
 */
export function autoAudioSourceFor(source: string | undefined): AutoAudioSource | null {
  switch (source) {
    case 'epub':
    case 'epub-ai':
      return 'epub';
    case 'extension':
      return 'extension';
    case 'media':
      return 'media';
    case 'import':
    case 'csv':
      return 'import';
    default:
      return null;
  }
}

/** The text a card would be read from, in the order the review UI speaks it. */
export function autoAudioTextFor(card: {
  sentence?: string;
  word?: string;
}): string {
  return (card.sentence || card.word || '').trim();
}

/** Japanese enough to hand to a ja-JP voice: kana, or Han in a kana-less line. */
export function isSpeakableJapanese(text: string): boolean {
  return hasKana(text) || hasHan(text);
}

export interface AutoAudioSelection<T> {
  /** Cards to synthesize, in order, already capped. */
  chosen: T[];
  /** Cards whose source is switched off, or which already carry audio. */
  skipped: number;
  /** How many eligible cards the cap left out. Zero when nothing was cut. */
  deferred: number;
}

export function selectAutoAudioCards<
  T extends {
    source?: string;
    sentence?: string;
    word?: string;
    audioPath?: string;
    audioDataUrl?: string;
  },
>(cards: readonly T[], preferences: AutoAudioPreferences): AutoAudioSelection<T> {
  const eligible = cards.filter((card) => {
    if (card.audioPath || card.audioDataUrl) return false;
    const family = autoAudioSourceFor(card.source);
    if (!family || !preferences[family]) return false;
    return isSpeakableJapanese(autoAudioTextFor(card));
  });
  const chosen = eligible.slice(0, preferences.maxPerBatch);
  return {
    chosen,
    skipped: cards.length - eligible.length,
    deferred: eligible.length - chosen.length,
  };
}
