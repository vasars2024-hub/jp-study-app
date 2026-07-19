import type { GrammarLevel, GrammarPoint, HskLevel, JlptLevel } from './types';
import {
  normalizeGrammarList,
  type ModuleProvenance,
  type NormalizedGrammarPoint,
} from './normalize';
import { N5 } from './n5';
import { N4 } from './n4';
import { N4_MAZII } from './n4-mazii';
import { N3 } from './n3';
import { N3_MAZII } from './n3-mazii';
import { N2 } from './n2';
import { N2_EXTRA } from './n2-extra';
import { N2_MAZII } from './n2-mazii';
import { N1 } from './n1';
import { N1_EXTRA } from './n1-extra';
import { N1_MAZII } from './n1-mazii';
import { HSK } from './hsk';
import { TATOEBA_EXAMPLES } from './tatoebaExamples';

export * from './types';
export * from './functions';
export * from './taxonomy';
export { GUIDES } from './guides';
export {
  normalizeGrammarPoint,
  normalizeGrammarList,
  deriveRegister,
  hasTrustworthyTags,
  isStudyReady,
} from './normalize';
export type { NormalizedGrammarPoint, ModuleProvenance } from './normalize';

/*
 * Provenance is a property of the source module, not of the individual record —
 * which is the only reason it is recoverable at all. The Mazii dumps arrived
 * with `functions` and `register` already populated, so a record cannot be told
 * apart from authored data by inspecting it. But the *distribution* gives it
 * away: 288 of 627 n3-mazii records are tagged `['other']`, and 1814 of 1820
 * are 'neutral'. That is frozen regex output, so the whole module is marked
 * heuristic and the filter layer treats it accordingly.
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

function mazii(level: string): ModuleProvenance {
  return {
    source: `mazii-${level}-dump`,
    tagSource: 'heuristic',
    verification: 'imported-unreviewed',
  };
}

const HSK_SEED: ModuleProvenance = {
  source: 'authored:hsk-seed',
  tagSource: 'authored',
  verification: 'partial',
};

/** All grammar points (JA JLPT + ZH HSK), normalized with provenance. */
export const GRAMMAR: NormalizedGrammarPoint[] = [
  ...normalizeGrammarList(N5, CORE),
  ...normalizeGrammarList(N4, CORE),
  ...normalizeGrammarList(withImportedExamples(N4_MAZII), mazii('n4')),
  ...normalizeGrammarList(N3, CORE),
  ...normalizeGrammarList(withImportedExamples(N3_MAZII), mazii('n3')),
  ...normalizeGrammarList(N2, CORE),
  ...normalizeGrammarList(N2_EXTRA, CORE),
  ...normalizeGrammarList(withImportedExamples(N2_MAZII), mazii('n2')),
  ...normalizeGrammarList(N1, CORE),
  ...normalizeGrammarList(N1_EXTRA, CORE),
  ...normalizeGrammarList(withImportedExamples(N1_MAZII), mazii('n1')),
  ...normalizeGrammarList(HSK, HSK_SEED),
];

/** Raw per-module lists, for the corpus audit's provenance accounting. */
export const GRAMMAR_MODULES: Record<string, GrammarPoint[]> = {
  n5: N5,
  n4: N4,
  'n4-mazii': N4_MAZII,
  n3: N3,
  'n3-mazii': N3_MAZII,
  n2: N2,
  'n2-extra': N2_EXTRA,
  'n2-mazii': N2_MAZII,
  n1: N1,
  'n1-extra': N1_EXTRA,
  'n1-mazii': N1_MAZII,
  hsk: HSK,
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
  HSK7: countLevel('HSK7'),
  HSK8: countLevel('HSK8'),
  HSK9: countLevel('HSK9'),
  HSK10: countLevel('HSK10'),
};

export function grammarByLevel(level: GrammarLevel): NormalizedGrammarPoint[] {
  return GRAMMAR.filter((p) => p.level === level);
}
