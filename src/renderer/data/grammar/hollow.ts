/**
 * Is a grammar record hollow — does it say nothing beyond its title and gloss?
 *
 * Split from authoredContent.ts so the filter layer can sort by it without
 * importing the authored content modules.
 */
import type { GrammarPoint } from './types';

function sameText(a: string | undefined, b: string | undefined): boolean {
  const norm = (s: string | undefined) => String(s ?? '').replace(/\s+/g, '').trim();
  return norm(a) === norm(b);
}

/** Structure that only repeats the pattern tells the learner nothing. */
export function structureCopiesTitle(p: Pick<GrammarPoint, 'structure' | 'title'>): boolean {
  return !p.structure?.trim() || sameText(p.structure, p.title);
}

/** Explanation that only repeats the gloss tells the learner nothing. */
export function explanationCopiesMeaning(p: Pick<GrammarPoint, 'explanation' | 'meaning'>): boolean {
  return !p.explanation?.trim() || sameText(p.explanation, p.meaning);
}

/**
 * A record with no content of its own: neither a structure nor an explanation
 * that says anything beyond the title and gloss. Examples attached from a
 * corpus do not change that — they show the pattern, they do not explain it.
 */
export function isHollowGrammarPoint(
  p: Pick<GrammarPoint, 'structure' | 'title' | 'explanation' | 'meaning'>,
): boolean {
  return structureCopiesTitle(p) && explanationCopiesMeaning(p);
}

