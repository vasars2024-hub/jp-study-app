/**
 * Grammar progress as Statistics and the level estimate read it.
 *
 * `grammarFamiliarity.ts` owns the per-point store; this module only reads it
 * against the corpus: how many points of each JLPT / HSK level are known or
 * being learned, how many were reviewed recently, and what share of a level's
 * grammar is known — the number `levelService` blends into its estimate.
 *
 * The corpus is ~1.8 MB of generated data, so it is never imported statically
 * here: `loadGrammarCorpus` pulls the chunk on demand and caches it. Callers
 * that must answer synchronously (the level estimate) read the cache and simply
 * run without grammar until it has arrived.
 */

import type { LevelSlotId, StudyLang } from '../shared/levelScale';
import type { NormalizedGrammarPoint } from './data/grammar/normalize';
import { GX_KNOWN_THRESHOLD, type FamiliarityState } from './grammarFamiliarity';

/** Levels shown per study language, easiest first, with the level slot each proves. */
const LEVELS: Record<StudyLang, ReadonlyArray<{ level: string; slot: LevelSlotId }>> = {
  ja: [
    { level: 'N5', slot: 'jlpt-n5' },
    { level: 'N4', slot: 'jlpt-n4' },
    { level: 'N3', slot: 'jlpt-n3' },
    { level: 'N2', slot: 'jlpt-n2' },
    { level: 'N1', slot: 'jlpt-n1' },
  ],
  zh: [
    { level: 'HSK1', slot: 'hsk-1' },
    { level: 'HSK2', slot: 'hsk-2' },
    { level: 'HSK3', slot: 'hsk-3' },
    { level: 'HSK4', slot: 'hsk-4' },
    { level: 'HSK5', slot: 'hsk-5' },
    { level: 'HSK6', slot: 'hsk-6' },
  ],
};

/**
 * How much the grammar share of a level counts in that level's coverage.
 *
 * The estimate has always been vocabulary coverage of the user's band lists;
 * grammar now joins it as a weighted input:
 *
 *   coverage(slot) = (1 - W) * vocabulary + W * grammar,   W = 0.3
 *
 * Vocabulary keeps the larger share because it is the evidence the estimate
 * was calibrated on (the 0.8 threshold, the tier-7 known-word count) and
 * because a level's word list is several times larger than its grammar list.
 * 0.3 is large enough that knowing a level's words while ignoring its grammar
 * no longer clears the default threshold on its own (0.7 * 1.0 = 0.7 < 0.8),
 * which is the gap this input exists to close.
 */
export const GRAMMAR_LEVEL_WEIGHT = 0.3;

/**
 * Share of a level's grammar points that must carry any familiarity record
 * before grammar is blended into that level at all.
 *
 * A point nobody has practised or rated is not evidence of not knowing it —
 * the store starts empty and fills only from answers and hand-set levels. So a
 * user who has never opened the grammar tools keeps exactly the vocabulary
 * estimate they had, and one who has worked through a level gets it counted.
 */
export const GRAMMAR_MIN_ASSESSED = 0.2;

export interface GrammarLevelProgress {
  /** Corpus level, e.g. "N3" or "HSK2". */
  level: string;
  slot: LevelSlotId;
  total: number;
  /** Familiar or Known — the same "known" threshold as vocabulary. */
  known: number;
  /** Learning (band 1). */
  learning: number;
  /** Points with any familiarity record (answered, or set by hand). */
  assessed: number;
}

/** Per-level counts for one study language, easiest first. Duplicated ids count once. */
export function grammarLevelProgress(
  points: readonly NormalizedGrammarPoint[],
  state: FamiliarityState,
  lang: StudyLang,
): GrammarLevelProgress[] {
  const rows = LEVELS[lang].map(({ level, slot }) => ({ level, slot, total: 0, known: 0, learning: 0, assessed: 0 }));
  const byLevel = new Map(rows.map((row) => [row.level, row]));
  const seen = new Set<string>();
  for (const point of points) {
    if (point.lang !== lang || seen.has(point.id)) continue;
    const row = byLevel.get(point.level);
    if (!row) continue;
    seen.add(point.id);
    row.total += 1;
    const entry = state[point.id];
    if (!entry) continue;
    row.assessed += 1;
    if (entry.l >= GX_KNOWN_THRESHOLD) row.known += 1;
    else if (entry.l === 1) row.learning += 1;
  }
  return rows;
}

export interface GrammarSlotCoverage {
  /** Known share of the level's points, 0..1. */
  coverage: number;
  /** Share of the level's points with any familiarity record, 0..1. */
  assessedShare: number;
}

export function grammarCoverageBySlot(
  progress: readonly GrammarLevelProgress[],
): Partial<Record<LevelSlotId, GrammarSlotCoverage>> {
  const out: Partial<Record<LevelSlotId, GrammarSlotCoverage>> = {};
  for (const row of progress) {
    if (row.total === 0) continue;
    out[row.slot] = { coverage: row.known / row.total, assessedShare: row.assessed / row.total };
  }
  return out;
}

/**
 * Blend grammar into per-slot vocabulary coverage (see GRAMMAR_LEVEL_WEIGHT).
 *
 * Only slots that have a vocabulary list are touched: the band lists stay the
 * backbone of the estimate, and grammar alone never proves a level. A slot
 * whose grammar has not been assessed enough keeps its vocabulary coverage.
 */
export function blendGrammarCoverage(
  vocabulary: Partial<Record<LevelSlotId, number>>,
  grammar: Partial<Record<LevelSlotId, GrammarSlotCoverage>>,
  weight: number = GRAMMAR_LEVEL_WEIGHT,
): Partial<Record<LevelSlotId, number>> {
  const out: Partial<Record<LevelSlotId, number>> = {};
  for (const [slot, vocab] of Object.entries(vocabulary) as Array<[LevelSlotId, number]>) {
    const g = grammar[slot];
    out[slot] = g && g.assessedShare >= GRAMMAR_MIN_ASSESSED
      ? (1 - weight) * vocab + weight * g.coverage
      : vocab;
  }
  return out;
}

/**
 * Distinct grammar points answered at or after `since` (epoch ms).
 *
 * Each record keeps the time of its latest answer, and a window that ends now
 * contains a point exactly when its latest answer falls inside it — so this is
 * exact for "today" and "the last seven days", and covers answers given before
 * grammar reviews reached the review log.
 */
export function grammarReviewedSince(
  points: readonly NormalizedGrammarPoint[] | null,
  state: FamiliarityState,
  since: number,
  lang?: StudyLang,
): number {
  const inLang = points && lang ? new Set(points.filter((p) => p.lang === lang).map((p) => p.id)) : null;
  let count = 0;
  for (const [id, entry] of Object.entries(state)) {
    if (entry.at < since) continue;
    if (inLang && !inLang.has(id)) continue;
    count += 1;
  }
  return count;
}

/** Local midnight of `now`, and the start of the six days before it. */
export function reviewWindows(now: number = Date.now()): { today: number; week: number } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const today = d.getTime();
  d.setDate(d.getDate() - 6);
  return { today, week: d.getTime() };
}

// ---- corpus loading --------------------------------------------------------

let corpus: NormalizedGrammarPoint[] | null = null;
let corpusLoading: Promise<NormalizedGrammarPoint[]> | null = null;

/** The corpus when it has been loaded this session, else null. */
export function getLoadedGrammarCorpus(): NormalizedGrammarPoint[] | null {
  return corpus;
}

/** Load (once) the grammar corpus chunk. */
export function loadGrammarCorpus(): Promise<NormalizedGrammarPoint[]> {
  if (corpus) return Promise.resolve(corpus);
  if (!corpusLoading) {
    corpusLoading = import('./data/grammar').then(
      (mod) => {
        corpus = mod.GRAMMAR;
        return corpus;
      },
      (err: unknown) => {
        corpusLoading = null;
        throw err;
      },
    );
  }
  return corpusLoading;
}

/** Test seam. */
export function setGrammarCorpusForTests(points: NormalizedGrammarPoint[] | null): void {
  corpus = points;
  corpusLoading = null;
}
