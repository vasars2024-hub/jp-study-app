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
 *
 * onb3: the seed is undoable while setup is open. Going Back from a higher band
 * to a lower one (or unticking the seed) used to leave every word of the higher
 * band marked Known. Each seed now records the words IT changed and what they
 * were before, per study language; the next pass through the level step undoes
 * that record first. Only words still exactly where the seed put them (Known,
 * not set by hand) are restored, so a level the user picked manually since is
 * never touched. Closing setup for good forgets the record.
 */
import { BUNDLED_FREQUENCY_DICTIONARIES } from '../shared/bundledFrequencyDicts';
import type { StudyLang } from '../shared/studyLang';
import { LEVEL_SEED_COUNTS, type LevelBand } from './firstRunSetup';
import { writeLocalStorageJson } from './localStorageWrite';

/** word → the level it had before the seed raised it (0 = no entry). */
type SeedUndo = Record<string, 0 | 1 | 2>;

export const FIRST_RUN_SEED_UNDO_KEY = 'jp-study.firstRun.seedUndo.v1';

const SEED_LEVEL = 3;

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

function readUndo(): Partial<Record<StudyLang, SeedUndo>> {
  try {
    const raw = localStorage.getItem(FIRST_RUN_SEED_UNDO_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Partial<Record<StudyLang, SeedUndo>> = {};
    for (const [lang, words] of Object.entries(parsed as Record<string, unknown>)) {
      if (!words || typeof words !== 'object' || Array.isArray(words)) continue;
      const clean: SeedUndo = {};
      for (const [word, level] of Object.entries(words as Record<string, unknown>)) {
        if (word && (level === 0 || level === 1 || level === 2)) clean[word] = level;
      }
      out[lang as StudyLang] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

function writeUndo(next: Partial<Record<StudyLang, SeedUndo>>): void {
  const kept = Object.entries(next).filter(([, words]) => words && Object.keys(words).length > 0);
  if (kept.length === 0) {
    try {
      localStorage.removeItem(FIRST_RUN_SEED_UNDO_KEY);
    } catch {
      /* storage unavailable: nothing to forget */
    }
    return;
  }
  writeLocalStorageJson(FIRST_RUN_SEED_UNDO_KEY, Object.fromEntries(kept));
}

/**
 * Undo the last seed of `lang`: every word it raised that is still Known and
 * not set by hand goes back to its earlier level. Resolves to how many words
 * changed.
 */
export async function undoSeededKnownWords(lang: StudyLang): Promise<number> {
  const all = readUndo();
  const record = all[lang];
  if (!record || Object.keys(record).length === 0) return 0;
  const { bulkSetFromAnki, getLevel, isManualLevel } = await import('./knownWords');
  const levels: Record<string, 0 | 1 | 2> = {};
  for (const [word, previous] of Object.entries(record)) {
    if (isManualLevel(word) || getLevel(word) !== SEED_LEVEL) continue;
    levels[word] = previous;
  }
  const changed = bulkSetFromAnki(levels);
  delete all[lang];
  writeUndo(all);
  return changed;
}

/**
 * Apply the seed, replacing any earlier seed of the same language from this
 * setup; resolves to how many words the seed itself changed.
 */
export async function seedKnownWords(lang: StudyLang, band: LevelBand): Promise<number> {
  await undoSeededKnownWords(lang);
  const words = seedWordsFor(lang, band);
  if (words.length === 0) return 0;
  const { bulkSetFromAnki, getLevel, isManualLevel } = await import('./knownWords');
  const levels: Record<string, 3> = {};
  const undo: SeedUndo = {};
  for (const word of words) {
    if (isManualLevel(word)) continue;
    const previous = getLevel(word);
    if (previous === SEED_LEVEL) continue;
    levels[word] = SEED_LEVEL;
    undo[word] = previous;
  }
  const changed = bulkSetFromAnki(levels);
  writeUndo({ ...readUndo(), [lang]: undo });
  return changed;
}

/** Setup closed for good: what was seeded stays, and is no longer undone. */
export function forgetSeedUndo(): void {
  writeUndo({});
}
