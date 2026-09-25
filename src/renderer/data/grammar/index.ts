import type { CefrLevel, GrammarLevel, GrammarPoint, HskLevel, JlptLevel } from './types';
import {
  normalizeGrammarList,
  type ModuleProvenance,
  type NormalizedGrammarPoint,
} from './normalize';
import { N5 } from './n5';
import { N4 } from './n4';
import { N4_SUPPLEMENT } from './n4-supplement';
import { N3 } from './n3';
import { N3_SUPPLEMENT } from './n3-supplement';
import { N2 } from './n2';
import { N2_EXTRA } from './n2-extra';
import { N2_SUPPLEMENT } from './n2-supplement';
import { N1 } from './n1';
import { N1_EXTRA } from './n1-extra';
import { N1_SUPPLEMENT } from './n1-supplement';
import { HSK } from './hsk';
import { HSK_EXTRA } from './hsk-extra';
import { HSK_IMPORT } from './hsk-import';
import { RU_CEFR } from './ru-cefr';
import { TATOEBA_EXAMPLES } from './tatoebaExamples';

// `GrammarFunctionId` is exported by both: it is *defined* in ./functions and
// re-exported by ./types. eslint-plugin-import flags that as a duplicate export
// without noticing both names resolve to the same binding, which is legal and
// unambiguous in ESM — and it is a type, so nothing exists at runtime anyway.
/* eslint-disable-next-line import/export */
export * from './types';
/* eslint-disable-next-line import/export */
export * from './functions';
export * from './taxonomy';
export { GUIDES } from './guides';
export {
  normalizeGrammarPoint,
  normalizeGrammarList,
  deriveRegister,
  hasTrustworthyTags,
  hasTrustworthyRegister,
  hasTrustworthyCategories,
  isStudyReady,
} from './normalize';
export type { NormalizedGrammarPoint, ModuleProvenance } from './normalize';

/*
 * Provenance is a property of the source module, not of the individual record —
 * which is the only reason it is recoverable at all. The supplemental dumps
 * arrived with `functions` and `register` already populated, so a record cannot
 * be told apart from authored data by inspecting it. But the *distribution*
 * gives it away: 288 of 627 n3-supplement records are tagged `['other']`, and
 * 1814 of 1820 are 'neutral'. That is frozen regex output, so the whole module
 * is marked heuristic and the filter layer treats it accordingly.
 *
 * The hand-written core modules carry real examples and explanations but no
 * tags at all, so their categories come from the same inference — also
 * heuristic, but their *content* is authored, which `verification` records
 * separately from `tagSource`.
 */
const CORE: ModuleProvenance = {
  source: 'authored:core',
  tagSource: 'heuristic',
  verification: 'partial',
};

/**
 * Attach imported example sentences to records that have none of their own.
 *
 * This runs *before* normalization on purpose: `verificationFor` in normalize.ts
 * reports `missing` precisely when a record has no examples, and `missing` is
 * what the "Ready to study" filter excludes. So attaching examples here is what
 * promotes an imported record into study material — there is no second flag to
 * keep in sync, and a record that loses its examples falls back out on its own.
 *
 * Authored examples always win; this never overwrites hand-written content.
 */
function withImportedExamples(list: GrammarPoint[]): GrammarPoint[] {
  return list.map((p) => {
    if (p.examples && p.examples.length) return p;
    const imported = TATOEBA_EXAMPLES[p.id];
    return imported ? { ...p, examples: imported } : p;
  });
}

function supplement(level: string): ModuleProvenance {
  return {
    source: `supplement-${level}`,
    tagSource: 'heuristic',
    verification: 'imported-unreviewed',
  };
}

const HSK_SEED: ModuleProvenance = {
  source: 'authored:hsk-seed',
  tagSource: 'authored',
  verification: 'partial',
};

/*
 * The expansion is `verified` where the seed is `partial`, and the distinction
 * is real rather than optimistic: seed records carry legacy `functions` ids that
 * are resolved to categories through LEGACY_ALIASES, so their tags are one
 * inference step removed from anything a human wrote. Expansion records carry
 * canonical `categories` written against the taxonomy directly, with examples
 * authored alongside them — nothing in them was guessed from a gloss.
 */
const HSK_AUTHORED: ModuleProvenance = {
  source: 'authored:hsk-extra',
  tagSource: 'authored',
  verification: 'verified',
};

/*
 * The supplied HSK list (tools/hsk-import/source.tsv). Weakest provenance in
 * the corpus, and correctly so: it is a chat model's output rather than a
 * published syllabus, about a quarter of the original rows were vocabulary
 * rather than grammar, and several carried a wrong gloss or wrong pinyin.
 *
 * The records also have no examples, so `verificationFor` lowers each one to
 * 'missing' regardless of this ceiling — they answer level and category
 * queries but never reach "Ready to study". That is the accurate reading of a
 * pattern with a gloss and nothing else, and it is the same bar every other
 * example-less record in the corpus is held to.
 */
const HSK_IMPORTED: ModuleProvenance = {
  source: 'imported:hsk-list',
  tagSource: 'imported',
  verification: 'imported-unreviewed',
};

/*
 * Russian A1–B1, written for this app against the taxonomy (categories, not
 * gloss-regex functions), with examples authored alongside each point.
 */
const RU_AUTHORED: ModuleProvenance = {
  source: 'authored:ru-cefr',
  tagSource: 'authored',
  verification: 'verified',
};

/** All grammar points (JA JLPT + ZH HSK + RU CEFR), normalized with provenance. */
export const GRAMMAR: NormalizedGrammarPoint[] = [
  ...normalizeGrammarList(N5, CORE),
  ...normalizeGrammarList(N4, CORE),
  ...normalizeGrammarList(withImportedExamples(N4_SUPPLEMENT), supplement('n4')),
  ...normalizeGrammarList(N3, CORE),
  ...normalizeGrammarList(withImportedExamples(N3_SUPPLEMENT), supplement('n3')),
  ...normalizeGrammarList(N2, CORE),
  ...normalizeGrammarList(N2_EXTRA, CORE),
  ...normalizeGrammarList(withImportedExamples(N2_SUPPLEMENT), supplement('n2')),
  ...normalizeGrammarList(N1, CORE),
  ...normalizeGrammarList(N1_EXTRA, CORE),
  ...normalizeGrammarList(withImportedExamples(N1_SUPPLEMENT), supplement('n1')),
  ...normalizeGrammarList(HSK, HSK_SEED),
  ...normalizeGrammarList(HSK_EXTRA, HSK_AUTHORED),
  ...normalizeGrammarList(HSK_IMPORT, HSK_IMPORTED),
  ...normalizeGrammarList(RU_CEFR, RU_AUTHORED),
];

/** Raw per-module lists, for the corpus audit's provenance accounting. */
export const GRAMMAR_MODULES: Record<string, GrammarPoint[]> = {
  n5: N5,
  n4: N4,
  'n4-supplement': N4_SUPPLEMENT,
  n3: N3,
  'n3-supplement': N3_SUPPLEMENT,
  n2: N2,
  'n2-extra': N2_EXTRA,
  'n2-supplement': N2_SUPPLEMENT,
  n1: N1,
  'n1-extra': N1_EXTRA,
  'n1-supplement': N1_SUPPLEMENT,
  hsk: HSK,
  'hsk-extra': HSK_EXTRA,
  'hsk-import': HSK_IMPORT,
  'ru-cefr': RU_CEFR,
};

function countLevel(level: GrammarLevel): number {
  return GRAMMAR.reduce((n, p) => (p.level === level ? n + 1 : n), 0);
}

/*
 * Counts are measured from the normalized corpus rather than summed from module
 * lengths, so a badge can never claim coverage the corpus does not have.
 */
export const GRAMMAR_COUNTS: Record<JlptLevel, number> = {
  N5: countLevel('N5'),
  N4: countLevel('N4'),
  N3: countLevel('N3'),
  N2: countLevel('N2'),
  N1: countLevel('N1'),
};

export const HSK_COUNTS: Record<HskLevel, number> = {
  HSK1: countLevel('HSK1'),
  HSK2: countLevel('HSK2'),
  HSK3: countLevel('HSK3'),
  HSK4: countLevel('HSK4'),
  HSK5: countLevel('HSK5'),
  HSK6: countLevel('HSK6'),
  'HSK7-9': countLevel('HSK7-9'),
  HSK10: countLevel('HSK10'),
};

export const CEFR_COUNTS: Record<CefrLevel, number> = {
  A1: countLevel('A1'),
  A2: countLevel('A2'),
  B1: countLevel('B1'),
  B2: countLevel('B2'),
  C1: countLevel('C1'),
  C2: countLevel('C2'),
};

export function grammarByLevel(level: GrammarLevel): NormalizedGrammarPoint[] {
  return GRAMMAR.filter((p) => p.level === level);
}
