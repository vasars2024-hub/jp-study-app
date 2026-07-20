/**
 * Grammar filter query layer.
 *
 * Kept free of React so result counts, the visible list, and bulk "select all
 * matching" all run the exact same predicate. When counting and selecting use
 * different code paths they drift, and the user gets a button that acts on a
 * different set than the number beside it promised.
 *
 * Semantics, which the UI states explicitly:
 *   - OR within a group (two levels ticked = either level)
 *   - AND between groups (a level AND a category AND a register)
 *   - exclusions always win over inclusions
 */

import type { GxLevel, WithFamiliarity } from '../../grammarFamiliarity';
import type { GrammarFunctionId } from './functions';
import { GRAMMAR_FUNCTION_LABELS } from './functions';
import {
  hasTrustworthyCategories,
  hasTrustworthyRegister,
  type NormalizedGrammarPoint,
} from './normalize';
import { resolveCategories } from './taxonomy';
import type { GrammarLang, GrammarLevel, GrammarRegister } from './types';

/**
 * A point as the filter reads it. Familiarity is learner state applied over the
 * corpus by `applyFamiliarity`, not a property of the data module, so it is
 * optional here: an undecorated point reads as New (0), never as a crash. Every
 * caller that offers the familiarity filter must feed decorated points, or the
 * whole corpus looks New — the two Explorer/Practice screens both decorate.
 */
export type FilterablePoint = NormalizedGrammarPoint & Partial<WithFamiliarity>;

export type GrammarSort = 'level' | 'alphabetical' | 'completeness' | 'random';

export interface PracticeFilters {
  lang: GrammarLang | 'all';
  levels: GrammarLevel[];
  /** Canonical taxonomy ids (see taxonomy.ts). */
  categories: string[];
  /** Canonical ids to subtract from the result, applied after inclusion. */
  excludeCategories: string[];
  registers: GrammarRegister[];
  /**
   * Hide records whose tags came from gloss-regex inference. Default true:
   * a filter should not answer with data it knows is a guess.
   */
  verifiedTagsOnly: boolean;
  /** Hide records with no examples/explanation — unusable in study or export. */
  studyReadyOnly: boolean;
  requireExamples: boolean;
  /** Learner-state bands (New/Learning/Familiar/Known) to keep; empty = all. */
  familiarity: GxLevel[];
  query: string;
  sort: GrammarSort;
}

export const PRACTICE_FILTERS_KEY = 'jp-grammarx-practice-filters-v2';
/** Pre-taxonomy key. Read once for migration, never written again. */
export const LEGACY_PRACTICE_FILTERS_KEY = 'jp-grammarx-practice-filters-v1';

export const DEFAULT_PRACTICE_FILTERS: PracticeFilters = {
  lang: 'all',
  levels: [],
  categories: [],
  excludeCategories: [],
  registers: [],
  verifiedTagsOnly: true,
  studyReadyOnly: false,
  requireExamples: false,
  familiarity: [],
  query: '',
  sort: 'level',
};

export interface LegacyPracticeFilters {
  lang?: GrammarLang | 'all';
  levels?: GrammarLevel[];
  functions?: GrammarFunctionId[];
  business?: boolean;
  casual?: boolean;
  query?: string;
}

/**
 * v1 stored raw Mazii function ids and two register booleans. Map both forward
 * so a user who had filters set does not silently get a different result set.
 */
export function migrateLegacyFilters(legacy: LegacyPracticeFilters): PracticeFilters {
  const registers: GrammarRegister[] = [];
  if (legacy.business) registers.push('business');
  if (legacy.casual) registers.push('casual');

  return {
    ...DEFAULT_PRACTICE_FILTERS,
    lang: legacy.lang ?? 'all',
    levels: Array.isArray(legacy.levels) ? legacy.levels : [],
    categories: resolveCategories(Array.isArray(legacy.functions) ? legacy.functions : []),
    registers,
    query: typeof legacy.query === 'string' ? legacy.query : '',
    /*
     * A returning user's saved register filter was matching heuristic tags.
     * Leaving verifiedTagsOnly on would shrink their result set with no
     * explanation, so preserve the old (looser) behaviour and let them opt in.
     */
    verifiedTagsOnly: registers.length === 0,
  };
}

function coerce(parsed: Partial<PracticeFilters>): PracticeFilters {
  return {
    ...DEFAULT_PRACTICE_FILTERS,
    ...parsed,
    levels: Array.isArray(parsed.levels) ? parsed.levels : [],
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    excludeCategories: Array.isArray(parsed.excludeCategories) ? parsed.excludeCategories : [],
    registers: Array.isArray(parsed.registers) ? parsed.registers : [],
    // A v2 payload written before familiarity existed simply has no key here;
    // the DEFAULT spread supplies [] and this guard rejects a corrupt value.
    // No key-version bump is needed — only a changed field meaning warrants one.
    familiarity: Array.isArray(parsed.familiarity)
      ? (parsed.familiarity.filter((n) => n === 0 || n === 1 || n === 2 || n === 3) as GxLevel[])
      : [],
    query: typeof parsed.query === 'string' ? parsed.query : '',
  };
}

/**
 * The Explorer keeps its own saved filters.
 *
 * Sharing one key with Practice sounds tidier but means narrowing a browse to
 * "N2 conditionals" silently reaches into the next study session. They are
 * different tasks, so they get different state.
 */
export const EXPLORER_FILTERS_KEY = 'jp-grammarx-explorer-filters-v1';

export function loadPracticeFilters(key: string = PRACTICE_FILTERS_KEY): PracticeFilters {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return coerce(JSON.parse(raw) as Partial<PracticeFilters>);
  } catch {
    /* fall through to the legacy read */
  }
  // Only the Practice key has a v1 predecessor to migrate from.
  if (key !== PRACTICE_FILTERS_KEY) return { ...DEFAULT_PRACTICE_FILTERS };
  try {
    const legacyRaw = localStorage.getItem(LEGACY_PRACTICE_FILTERS_KEY);
    if (legacyRaw) {
      // The v1 key is left in place — nothing is removed, matching the
      // non-destructive convention in storage/migrationRunner.ts.
      return migrateLegacyFilters(JSON.parse(legacyRaw) as LegacyPracticeFilters);
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PRACTICE_FILTERS };
}

export function savePracticeFilters(
  filters: PracticeFilters,
  key: string = PRACTICE_FILTERS_KEY,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

export function hasActiveFilters(f: PracticeFilters): boolean {
  return (
    f.lang !== 'all' ||
    f.levels.length > 0 ||
    f.categories.length > 0 ||
    f.excludeCategories.length > 0 ||
    f.registers.length > 0 ||
    f.studyReadyOnly ||
    f.requireExamples ||
    f.familiarity.length > 0 ||
    f.query.trim().length > 0
  );
}

/** Search hits pattern, meaning, structure, explanation, and legacy tag labels. */
function matchesQuery(point: NormalizedGrammarPoint, q: string): boolean {
  if (
    `${point.title} ${point.meaning} ${point.structure} ${point.explanation}`
      .toLowerCase()
      .includes(q)
  ) {
    return true;
  }
  // Legacy wording stays searchable so old vocabulary still finds records.
  return point.functions.some((f) => {
    const label = GRAMMAR_FUNCTION_LABELS[f];
    return f.includes(q) || (label ? label.toLowerCase().includes(q) : false);
  });
}

export function matchesFilters(point: FilterablePoint, filters: PracticeFilters): boolean {
  if (filters.lang !== 'all' && point.lang !== filters.lang) return false;
  if (filters.levels.length && !filters.levels.includes(point.level)) return false;

  if (filters.familiarity.length && !filters.familiarity.includes(point.familiarity ?? 0)) {
    return false;
  }

  if (filters.categories.length) {
    if (!filters.categories.some((c) => point.categories.includes(c))) return false;
    /*
     * A category query answered from regex-derived tags is the same class of
     * lie as the register one; gate it identically — but on the *category*
     * provenance only, so a guessed register does not suppress a real category.
     */
    if (filters.verifiedTagsOnly && !hasTrustworthyCategories(point)) return false;
  }
  if (filters.excludeCategories.length) {
    if (filters.excludeCategories.some((c) => point.categories.includes(c))) return false;
  }

  if (filters.registers.length) {
    if (!filters.registers.includes(point.register)) return false;
    /*
     * The fix for the Business filter. A record only answers a register query
     * if its register was authored or derived from the pattern's own
     * morphology — never if it came from a regex over the English gloss.
     */
    if (filters.verifiedTagsOnly && !hasTrustworthyRegister(point)) return false;
  }

  if (filters.studyReadyOnly && point.provenance.verification === 'missing') return false;
  if (filters.requireExamples && !(point.examples && point.examples.length > 0)) return false;

  const q = filters.query.trim().toLowerCase();
  if (q && !matchesQuery(point, q)) return false;

  return true;
}

const LEVEL_ORDER: Record<string, number> = {
  N5: 0,
  N4: 1,
  N3: 2,
  N2: 3,
  N1: 4,
  HSK1: 0,
  HSK2: 1,
  HSK3: 2,
  HSK4: 3,
  HSK5: 4,
  HSK6: 5,
  HSK7: 6,
  HSK8: 7,
  HSK9: 8,
  HSK10: 9,
};

function completenessScore(p: NormalizedGrammarPoint): number {
  let n = 0;
  if (p.examples?.length) n += 2;
  if (p.explanation?.trim()) n += 1;
  if (p.structure?.trim()) n += 1;
  if (p.categories.length) n += 1;
  if (p.provenance.tagSource !== 'heuristic') n += 1;
  return n;
}

/** Deterministic shuffle so a 'random' sort is stable within a session. */
function seededSort(list: NormalizedGrammarPoint[], seed: number): NormalizedGrammarPoint[] {
  return [...list].sort((a, b) => {
    const ha = (a.id.length * 2654435761 + seed) % 1000;
    const hb = (b.id.length * 2654435761 + seed) % 1000;
    return ha - hb || a.id.localeCompare(b.id);
  });
}

export function sortGrammarPoints<T extends NormalizedGrammarPoint>(
  points: T[],
  sort: GrammarSort,
  seed = 1,
): T[] {
  switch (sort) {
    case 'alphabetical':
      return [...points].sort((a, b) => a.title.localeCompare(b.title));
    case 'completeness':
      return [...points].sort(
        (a, b) => completenessScore(b) - completenessScore(a) || a.title.localeCompare(b.title),
      );
    case 'random':
      return seededSort(points, seed);
    case 'level':
    default:
      return [...points].sort(
        (a, b) =>
          (LEVEL_ORDER[a.level] ?? 99) - (LEVEL_ORDER[b.level] ?? 99) ||
          a.title.localeCompare(b.title),
      );
  }
}

/**
 * Generic over the point type so a corpus decorated by `applyFamiliarity`
 * keeps its `familiarity` field through the filter — the Explorer rows read it
 * to draw a band badge, and losing it here would force a second lookup that
 * could disagree with what was filtered.
 */
export function filterGrammarPoints<T extends NormalizedGrammarPoint>(
  points: readonly T[],
  filters: PracticeFilters,
): T[] {
  const out = points.filter((p) => matchesFilters(p, filters));
  return sortGrammarPoints(out, filters.sort);
}

/** Counts must come from the same predicate the list uses. */
export function countMatching(
  points: readonly NormalizedGrammarPoint[],
  filters: PracticeFilters,
): number {
  let n = 0;
  for (const p of points) if (matchesFilters(p, filters)) n += 1;
  return n;
}

/**
 * Per-category result counts for the filter UI, computed against every *other*
 * active filter. Showing a category's global total next to a filtered list is
 * how you get chips promising results that a click then fails to deliver.
 */
export function categoryCounts(
  points: readonly NormalizedGrammarPoint[],
  filters: PracticeFilters,
): Record<string, number> {
  const base: PracticeFilters = { ...filters, categories: [], excludeCategories: [] };
  const out: Record<string, number> = {};
  for (const p of points) {
    if (!matchesFilters(p, base)) continue;
    for (const c of p.categories) out[c] = (out[c] || 0) + 1;
  }
  return out;
}

/**
 * Per-band result counts for the familiarity filter, computed against every
 * *other* active filter — the same recipe as `categoryCounts`, so each band's
 * number is what ticking it will actually yield. Points must be decorated;
 * undecorated ones all read as New.
 */
export function familiarityFilterCounts(
  points: readonly FilterablePoint[],
  filters: PracticeFilters,
): Record<GxLevel, number> {
  const base: PracticeFilters = { ...filters, familiarity: [] };
  const out: Record<GxLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const p of points) {
    if (!matchesFilters(p, base)) continue;
    out[p.familiarity ?? 0] += 1;
  }
  return out;
}

/**
 * Identity key for a grammar pattern, independent of notation.
 *
 * The two Japanese sources write the same pattern differently — the authored
 * files use `〜前に`, the Mazii dump uses `... 前に` — so a whitespace-only key
 * (what this module used to do) matched **zero** of them. 189 Mazii records
 * duplicate 159 of the 325 authored points, and every pair was being shown as
 * two separate entries: one with examples and a real explanation, one hollow.
 *
 * Stripping the ellipsis/tilde placeholders collapses them. Verified not to
 * over-merge: it causes no collisions among the 325 authored titles and leaves
 * no record with an empty key.
 *
 * Phase 1.5 widened the strip set after measuring what still surfaced twice.
 * Three notation gaps remained, all mechanical rather than editorial:
 *
 *  - **ASCII `~`.** The set covered `〜` (wave dash) and `～` (fullwidth) but
 *    not plain `~`, and the Mazii dump mixes all three — `ほど~ない` and
 *    `ほど～ない` were two rows.
 *  - **Parenthesis characters**, stripped while keeping what is inside them.
 *    Mazii marks optional trailing particles as `ため(に)` / `場合(は)`, which
 *    is the same pattern the authored files write as `〜ために` / `〜場合は`.
 *    Only the brackets are removed; the content still distinguishes patterns.
 *  - **Both slashes.** `〜なりに / 〜なりの` vs `～なりに／～なりの`.
 *
 * That collapses 26 further groups, 14 of which pair an authored record with a
 * hollow Mazii shadow, so `contentRank` recovers the authored copy. Re-verified
 * against the same two invariants, plus: no authored record is displaced by a
 * hollow twin. `practiceFilters.test.ts` pins all three.
 */
export function grammarTitleKey(lang: GrammarLang, title: string): string {
  const normalized = String(title || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[〜～~.．…・/／()（）]/g, '');
  return `${lang}|${normalized}`;
}

/** How much real content a record carries, for choosing a merge survivor. */
function contentRank(p: NormalizedGrammarPoint): number {
  let n = 0;
  if (p.examples?.length) n += 4;
  // Mazii records copy title into structure and meaning into explanation, so a
  // field only counts when it actually says something the other fields don't.
  if ((p.explanation || '').trim() && p.explanation.trim() !== (p.meaning || '').trim()) n += 2;
  if ((p.structure || '').trim() && p.structure.trim() !== (p.title || '').trim()) n += 1;
  if (p.provenance.tagSource !== 'heuristic') n += 1;
  return n;
}

/**
 * Collapse duplicate patterns, keeping the record with the most content.
 *
 * Order cannot be relied on to favour the authored copy — `index.ts` emits
 * N4_MAZII before N3, so a Mazii N4 record can precede its authored N3 twin.
 * The survivor is chosen by content, and a level disagreement between sources
 * is preserved on `alternateLevels` rather than silently resolved: 53 of the
 * 189 pairs disagree (〜前に is N5 authored, N4 in Mazii), and dropping that
 * quietly would present one source's guess as settled fact.
 */
export function dedupeGrammarByTitle(
  points: readonly NormalizedGrammarPoint[],
): NormalizedGrammarPoint[] {
  const byKey = new Map<string, NormalizedGrammarPoint>();
  const order: string[] = [];
  const altLevels = new Map<string, Set<string>>();

  for (const p of points) {
    const key = grammarTitleKey(p.lang, p.title);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, p);
      order.push(key);
      continue;
    }
    if (existing.level !== p.level) {
      if (!altLevels.has(key)) altLevels.set(key, new Set());
      altLevels.get(key)!.add(existing.level).add(p.level);
    }
    if (contentRank(p) > contentRank(existing)) byKey.set(key, p);
  }

  return order.map((key) => {
    const winner = byKey.get(key)!;
    const alts = altLevels.get(key);
    if (!alts) return winner;
    const others = [...alts].filter((l) => l !== winner.level);
    return others.length ? { ...winner, alternateLevels: others as GrammarLevel[] } : winner;
  });
}
