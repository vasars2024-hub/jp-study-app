/**
 * Which newly mined cards get a reading written for them without being asked.
 *
 * The sibling of `flashcardAutoAudio`: same four mining families, same "off by
 * default" stance, same pure-decision split. Nothing here tokenizes — the
 * kuromoji pass is renderer-only because the dictionary lives there — so the
 * rules stay testable without the 20 MB IPADIC.
 *
 * Three refusals, each of them a correctness rule rather than a preference:
 *   - Never overwrite a reading the card already has. An imported deck's own
 *     reading is authored data; a morphological guess is not an upgrade.
 *   - Never annotate text with no kanji. かんじがない文 already reads itself,
 *     and a duplicate kana line is clutter dressed up as a feature.
 *   - Never annotate non-Japanese. A Latin gloss run through a Japanese
 *     tokenizer produces the surface back with no reading, which is noise.
 */

import { hasKanji } from './furigana';
import { hasHan, hasKana } from './langs';
import { autoAudioSourceFor, type AutoAudioSource } from './flashcardAutoAudio';

/**
 * The mining families, shared with automatic audio.
 *
 * Deliberately the same mapping function rather than a second copy: a card whose
 * source counts as "media" for narration and as something else for readings
 * would be a defect nobody would think to look for.
 */
export type AutoReadingSource = AutoAudioSource;
export const autoReadingSourceFor = autoAudioSourceFor;

/**
 * What gets written into the card's `reading` field.
 *
 * `kana` — the whole line folded to hiragana. `furigana` — Anki bracket ruby
 * over the kanji runs only (食[た]べる), which is what an exported note needs.
 */
export type AutoReadingForm = 'kana' | 'furigana';

export interface AutoReadingPreferences {
  epub: boolean;
  extension: boolean;
  media: boolean;
  import: boolean;
  form: AutoReadingForm;
  /**
   * The ceiling for one batch. Tokenizing is synchronous once kuromoji is
   * built, so an uncapped APKG import would block the renderer for as long as it
   * took; a capped run reports the remainder instead of stalling the UI.
   */
  maxPerBatch: number;
}

export const DEFAULT_AUTO_READING_PREFERENCES: AutoReadingPreferences = {
  epub: false,
  extension: false,
  media: false,
  import: false,
  form: 'furigana',
  maxPerBatch: 200,
};

const MAX_BATCH_CEILING = 2000;

export function normalizeAutoReadingPreferences(
  value?: Partial<AutoReadingPreferences> | null,
): AutoReadingPreferences {
  const cap = Number(value?.maxPerBatch);
  return {
    epub: value?.epub === true,
    extension: value?.extension === true,
    media: value?.media === true,
    import: value?.import === true,
    form: value?.form === 'kana' ? 'kana' : 'furigana',
    maxPerBatch: Number.isFinite(cap) && cap > 0
      ? Math.min(Math.floor(cap), MAX_BATCH_CEILING)
      : DEFAULT_AUTO_READING_PREFERENCES.maxPerBatch,
  };
}

/**
 * The text a reading is derived from.
 *
 * `word` first, unlike narration: the reading field annotates the headword, and
 * a whole mined sentence folded to kana is not what a `Reading` slot means. Only
 * a card with no word at all — a transcript sentence card — falls back to the
 * sentence, which is also the only text it has.
 */
export function autoReadingTextFor(card: { word?: string; sentence?: string }): string {
  return (card.word || card.sentence || '').trim();
}

/** Worth annotating: Japanese, and carrying at least one kanji to annotate. */
export function needsReading(text: string): boolean {
  if (!text) return false;
  if (!hasKana(text) && !hasHan(text)) return false;
  return hasKanji(text);
}

export interface AutoReadingSelection<T> {
  /** Cards to annotate, in order, already capped. */
  chosen: T[];
  /** Cards switched off, already read, kana-only, or not Japanese. */
  skipped: number;
  /** How many eligible cards the cap left out. Zero when nothing was cut. */
  deferred: number;
}

export function selectAutoReadingCards<
  T extends { source?: string; word?: string; sentence?: string; reading?: string },
>(cards: readonly T[], preferences: AutoReadingPreferences): AutoReadingSelection<T> {
  const eligible = cards.filter((card) => {
    if ((card.reading ?? '').trim()) return false;
    const family = autoReadingSourceFor(card.source);
    if (!family || !preferences[family]) return false;
    return needsReading(autoReadingTextFor(card));
  });
  const chosen = eligible.slice(0, preferences.maxPerBatch);
  return {
    chosen,
    skipped: cards.length - eligible.length,
    deferred: eligible.length - chosen.length,
  };
}
