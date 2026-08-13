/**
 * How hard a passage is, measured against the frequency lists on this machine.
 *
 * Every other rung of the ladder answers "what does this say?". This one answers
 * "is this worth my time?" — the question a learner actually asks before reading
 * something, and the one the Workbench could not answer at all. A previous
 * entry recorded difficulty scoring as blocked on a real frequency source; on
 * this installation the source is present and enabled (JPDB v2.2, 550,408
 * entries), so the block was a missing wire rather than missing data.
 *
 * What this refuses to do:
 *
 * - It does not invent a level. A rank is a position in one list — "the 1,509th
 *   most common word this list knows" — and it is reported as that, attributed
 *   to the list that supplied it. No JLPT band, no CEFR letter, no 1–10 score is
 *   derived from it, because none of those are in the data.
 * - It does not score what it cannot see. Words no enabled list ranks, and words
 *   no dictionary grounded, are counted and shown rather than folded into the
 *   ratio — a passage of names would otherwise read as trivially easy.
 * - It weighs a word once. A passage that says 猫 forty times is not forty words
 *   of difficulty, so the profile is built over the harvest's distinct entries.
 * - It does not count the grammar as vocabulary. When a morphological analysis
 *   is attached, particles, auxiliaries and other function words are set aside
 *   and reported as their own number rather than folded into the bands: を at
 *   rank 4 and で at rank 8 made a passage look like it was built from the most
 *   common words in the language, which is a statement about Japanese and not
 *   about the passage. A passage with no analysis is scored exactly as before.
 */

import { harvestLexiconVocabulary, type LexiconVocabularyItem } from './lexiconHarvest';
import type { LexiconFrequency, LexiconInterlinearResult } from './lexiconInterlinear';

/**
 * Resolve one headword's rank, or nothing when no enabled list knows it.
 *
 * Injected rather than imported: the lists live in the main process behind
 * file I/O, and this module has to stay pure so a passage can be scored in a
 * test, in the renderer, and in main from the same code.
 */
export type LexiconFrequencyResolver = (
  text: string,
  reading: string,
) => LexiconFrequency | undefined;

/**
 * Band edges, in ranks.
 *
 * These are positions in a list, not levels: `core` means "inside the first
 * 1,500 words this list ranks", and the UI says exactly that. Round numbers are
 * used so the label a reader sees is the number the band is defined by — a band
 * boundary at 1,487 would be a fake precision nothing in the data supports.
 */
export const LEXICON_DIFFICULTY_BANDS = [
  { id: 'core', maxRank: 1_500 },
  { id: 'common', maxRank: 5_000 },
  { id: 'wider', maxRank: 15_000 },
  { id: 'rare', maxRank: Number.POSITIVE_INFINITY },
] as const;

export type LexiconDifficultyBandId = (typeof LEXICON_DIFFICULTY_BANDS)[number]['id'];

/**
 * Enough of the hard words to plan a reading session. Past a dozen the list
 * stops being "look at these first" and becomes the vocabulary harvest, which
 * is already on the same surface.
 */
export const MAX_DIFFICULTY_WORDS = 12;

export interface LexiconDifficultyWord {
  /** The harvest's own grouping identity, so a row here is a row there. */
  key: string;
  text: string;
  reading: string;
  rank: number;
  source: string;
  count: number;
}

export interface LexiconDifficultyBand {
  id: LexiconDifficultyBandId;
  /** Distinct words in this band. */
  count: number;
}

export interface LexiconDifficultyProfile {
  bands: LexiconDifficultyBand[];
  /** Distinct grounded words an enabled list actually ranked. */
  ranked: number;
  /** Grounded words no enabled list ranks. Coverage, not rarity. */
  unranked: number;
  /** Words no installed dictionary knows at all. */
  ungrounded: number;
  /**
   * Distinct function words the analyser identified and this profile left out.
   * Zero when nothing analysed the passage, which is not the same as a passage
   * that genuinely contains no grammar.
   */
  functionWords: number;
  /** Whether a morphological analysis reached this passage at all. */
  analyzed: boolean;
  /** Distinct scored words, i.e. ranked + unranked + ungrounded. */
  distinct: number;
  /** Middle rank of the ranked words; absent when nothing was ranked. */
  medianRank?: number;
  /** Rarest first, capped. What to look up before reading. */
  hardest: LexiconDifficultyWord[];
  /** Every list that supplied a rank here, in first-seen order. */
  sources: string[];
  /**
   * False when no word was ranked. The panel then says the lists could not
   * speak for this passage instead of printing a profile of zeros, which reads
   * as "every word is rare".
   */
  scored: boolean;
}

/**
 * Attach frequency ranks to a grounded result.
 *
 * Resolution is memoized per headword+reading: a passage is thousands of tokens
 * and a few hundred distinct words, and the resolver behind this reaches into
 * every enabled list on every call. The key includes the reading for the same
 * reason the harvest's does — 生(なま) and 生(せい) are different words and rank
 * differently.
 *
 * Returns a new result; the input is not mutated, so a cached lookup can be
 * enriched without the cache changing underneath its other readers.
 */
export function attachLexiconFrequency(
  result: LexiconInterlinearResult,
  resolve: LexiconFrequencyResolver,
): LexiconInterlinearResult {
  const cache = new Map<string, LexiconFrequency | undefined>();
  const parts = result.parts.map((part) => {
    if (part.kind !== 'token' || !part.match) return part;
    const key = `${part.match.text}\u0000${part.match.reading}`;
    let frequency = cache.get(key);
    if (!cache.has(key)) {
      try {
        frequency = resolve(part.match.text, part.match.reading);
      } catch {
        // A broken or unreadable list must not take the gloss down with it: the
        // passage is still fully readable without a single rank.
        frequency = undefined;
      }
      cache.set(key, frequency);
    }
    if (!frequency) return part;
    return { ...part, match: { ...part.match, frequency } };
  });
  return { ...result, parts };
}

function bandOf(rank: number): LexiconDifficultyBandId {
  for (const band of LEXICON_DIFFICULTY_BANDS) {
    if (rank <= band.maxRank) return band.id;
  }
  return 'rare';
}

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function toWord(item: LexiconVocabularyItem, frequency: LexiconFrequency): LexiconDifficultyWord {
  return {
    key: item.key,
    text: item.text,
    reading: item.reading,
    rank: frequency.rank,
    source: frequency.source,
    count: item.count,
  };
}

/**
 * Build a passage's difficulty profile from ranks already attached to it.
 *
 * Deliberately derived from the harvest rather than from the token stream: the
 * harvest is the one definition of "a distinct word in this passage" that the
 * rest of the Workbench already uses, so a row in the hardest-words list is the
 * same row the reader can mine.
 */
export function scoreLexiconDifficulty(
  result: LexiconInterlinearResult,
  max: number = MAX_DIFFICULTY_WORDS,
): LexiconDifficultyProfile {
  const limit = Math.max(1, Math.floor(max));
  const items = harvestLexiconVocabulary(result).items;
  const counts = new Map<LexiconDifficultyBandId, number>();
  const ranked: LexiconDifficultyWord[] = [];
  const sources: string[] = [];
  let unranked = 0;
  let ungrounded = 0;
  let functionWords = 0;
  let analyzed = false;

  for (const item of items) {
    if (item.wordClass) analyzed = true;
    // Only an explicit `function` is set aside. An unknown tag classifies as
    // `other`, and dropping those would let a gap in the analyser's dictionary
    // silently delete real words from the passage's profile.
    if (item.wordClass === 'function') {
      functionWords += 1;
      continue;
    }
    if (!item.grounded) {
      ungrounded += 1;
      continue;
    }
    const frequency = item.frequency;
    if (!frequency) {
      unranked += 1;
      continue;
    }
    const band = bandOf(frequency.rank);
    counts.set(band, (counts.get(band) ?? 0) + 1);
    ranked.push(toWord(item, frequency));
    if (!sources.includes(frequency.source)) sources.push(frequency.source);
  }

  // Rarest first; a tie keeps the more frequent word in the passage ahead, since
  // that is the one the reader will meet more often.
  const hardest = [...ranked].sort((a, b) => b.rank - a.rank || b.count - a.count);
  const rankValues = ranked.map((word) => word.rank).sort((a, b) => a - b);

  return {
    bands: LEXICON_DIFFICULTY_BANDS.map((band) => ({
      id: band.id,
      count: counts.get(band.id) ?? 0,
    })),
    ranked: ranked.length,
    unranked,
    ungrounded,
    functionWords,
    analyzed,
    distinct: items.length - functionWords,
    ...(rankValues.length ? { medianRank: median(rankValues) } : {}),
    hardest: hardest.slice(0, limit),
    sources,
    scored: ranked.length > 0,
  };
}
