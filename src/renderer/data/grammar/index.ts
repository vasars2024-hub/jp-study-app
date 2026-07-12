import type { GrammarPoint, JlptLevel } from './types';
import { N5 } from './n5';
import { N4 } from './n4';
import { N3 } from './n3';
import { N2 } from './n2';
import { N2_EXTRA } from './n2-extra';
import { N1 } from './n1';
import { N1_EXTRA } from './n1-extra';

export * from './types';
export { GUIDES } from './guides';

// Core lists plus the extra Mazii-sourced points, kept together per level.
const N2_ALL = [...N2, ...N2_EXTRA];
const N1_ALL = [...N1, ...N1_EXTRA];

/** All grammar points, ordered N5 → N1. */
export const GRAMMAR: GrammarPoint[] = [...N5, ...N4, ...N3, ...N2_ALL, ...N1_ALL];

/** How many points each level has (for badges/labels). */
export const GRAMMAR_COUNTS: Record<JlptLevel, number> = {
  N5: N5.length,
  N4: N4.length,
  N3: N3.length,
  N2: N2_ALL.length,
  N1: N1_ALL.length,
};
