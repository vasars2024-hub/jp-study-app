/**
 * Exam levels when the learner has uploaded no level lists.
 *
 * Every media difficulty read "Unrated" without uploaded JLPT / HSK / CEFR
 * lists, although the offline dictionary already carries KANJIDIC2's JLPT
 * level for each common kanji, HSK levels for Chinese characters, and
 * frequency ranks for words in every language. These map that data onto each
 * language's scale. The result is an estimate and is always labelled as one.
 */
import type { StudyLang } from './levelScale';

/** Level order, easiest first, per language (the labels the level slots use). */
export const LEVEL_ORDER: Readonly<Record<StudyLang, readonly string[]>> = {
  ja: ['N5', 'N4', 'N3', 'N2', 'N1'],
  zh: ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'],
  ru: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
};

/**
 * KANJIDIC2 stores the pre-2010 four-level JLPT (4 easiest). Old 2 spans what
 * are now N3 and N2; it is read as N2, the level at which it was tested.
 */
export function jlptFromKanjidic(value: string | undefined): string | null {
  const v = String(value ?? '').trim().toUpperCase();
  if (/^N[1-5]$/.test(v)) return v;
  return ({ '4': 'N5', '3': 'N4', '2': 'N2', '1': 'N1' } as Record<string, string>)[v] ?? null;
}

export function hskLabel(value: string | undefined): string | null {
  const m = /(\d)/.exec(String(value ?? ''));
  if (!m) return null;
  const n = Math.min(6, Math.max(1, Number(m[1])));
  return `HSK${n}`;
}

/**
 * Cumulative word-frequency ceilings per level. JLPT and HSK follow the
 * published vocabulary sizes (HSK 3.0: 500 / 1,272 / 2,245 / 3,245 / 4,316 /
 * 5,456 words); CEFR follows the usual receptive-vocabulary estimates.
 */
const RANK_CEILINGS: Readonly<Record<StudyLang, readonly number[]>> = {
  ja: [800, 1_800, 3_750, 6_000],
  zh: [500, 1_272, 2_245, 3_245, 4_316],
  ru: [800, 1_500, 3_000, 5_000, 10_000],
};

/** A frequency rank as a level label on the language's scale. */
export function levelFromRank(rank: number | undefined, lang: StudyLang): string | null {
  if (!rank || !Number.isFinite(rank) || rank <= 0) return null;
  const ceilings = RANK_CEILINGS[lang];
  const order = LEVEL_ORDER[lang];
  const index = ceilings.findIndex((ceiling) => rank <= ceiling);
  return order[index === -1 ? order.length - 1 : index];
}

/**
 * The level at which `share` of the weighted items are covered — "you need N3
 * to know 90% of the words in this". Items with no level are left out of both
 * sides; with nothing levelled the answer is null.
 */
export function levelCovering(
  items: ReadonlyArray<{ level: string | null; weight: number }>,
  lang: StudyLang,
  share = 0.9,
): string | null {
  const order = LEVEL_ORDER[lang];
  const levelled = items.filter((item) => item.level && order.includes(item.level));
  const total = levelled.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return null;
  let running = 0;
  for (const label of order) {
    running += levelled.filter((item) => item.level === label).reduce((sum, item) => sum + item.weight, 0);
    if (running / total >= share) return label;
  }
  return order[order.length - 1];
}
