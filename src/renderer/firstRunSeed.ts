/**
 * The level step's optional "I already know the basics" seed.
 *
 * Marks the N most common words of the study language's bundled starter
 * frequency list as Known, where N comes from the self-estimated band. The
 * list ships inside the app (`shared/bundledFrequencyDicts.ts`), so this works
 * offline on a first boot before any download has finished — and its length
 * is the honest ceiling the UI quotes.
 *
 * Written through `bulkSetFromAnki`, the store's evidence-based bulk writer:
 * the seed is an estimate, not the user's hand, so a word they later grade
 * manually keeps their grade and a sync may still revise the rest.
 */
import { BUNDLED_FREQUENCY_DICTIONARIES } from '../shared/bundledFrequencyDicts';
import type { StudyLang } from '../shared/studyLang';
import { LEVEL_SEED_COUNTS, type LevelBand } from './firstRunSetup';

/** Unique words in rank order for one language's starter list. */
function starterList(lang: StudyLang): string[] {
  const dict = BUNDLED_FREQUENCY_DICTIONARIES.find((entry) => entry.language === lang);
  if (!dict) return [];
  return [...new Set(dict.words.map((word) => word.trim()).filter(Boolean))];
}

/** The words a band would mark known, most common first. */
export function seedWordsFor(lang: StudyLang, band: LevelBand): string[] {
  const limit = LEVEL_SEED_COUNTS[band];
  if (limit <= 0) return [];
  const list = starterList(lang);
  return Number.isFinite(limit) ? list.slice(0, limit) : list;
}

/** Apply the seed; resolves to how many words changed level. */
export async function seedKnownWords(lang: StudyLang, band: LevelBand): Promise<number> {
  const words = seedWordsFor(lang, band);
  if (words.length === 0) return 0;
  const { bulkSetFromAnki } = await import('./knownWords');
  const levels: Record<string, 3> = {};
  for (const word of words) levels[word] = 3;
  return bulkSetFromAnki(levels);
}
