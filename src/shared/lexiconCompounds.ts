import { normalizeNeighborText } from './lexiconNeighbors';

/** Rows read from the headword index before selection. See `findLexiconCompounds`. */
export const COMPOUND_SCAN_ROWS = 200;
export const MAX_COMPOUND_RESULTS = 12;
/**
 * A one-character query already matches thousands of headwords, which is the
 * useful case. A long one is a sentence someone pasted, and searching for it
 * inside other headwords cannot match anything.
 */
export const MAX_COMPOUND_QUERY_CHARS = 16;

export interface LexiconCompound {
  lang: string;
  text: string;
  reading: string;
  dictId: string;
  dictTitle: string;
  /** The dictionary's own first gloss, when it carries one in a requested language. */
  gloss?: string;
}

export interface LexiconCompoundResult {
  query: string;
  compounds: LexiconCompound[];
}

export interface LexiconCompoundCandidate {
  /**
   * The row this candidate came from. Used only to fetch its gloss before the
   * result leaves the main process — headword ids are reassigned by every
   * re-import, so nothing outside one query may hold on to one.
   */
  headwordId: number;
  lang: string;
  text: string;
  reading: string;
  dictId: string;
  dictTitle: string;
}

/**
 * Does this word literally contain the queried one?
 *
 * The index is searched on `headwords.norm`, so the same NFKC + case fold has to
 * decide the claim the surface makes. Testing the displayed `text` instead would
 * let a full-width or cased spelling that the index legitimately matched fail a
 * check the reader is told the row passed.
 */
export function containsCompoundQuery(text: string, query: string): boolean {
  const needle = normalizeNeighborText(query);
  if (!needle) return false;
  return normalizeNeighborText(text).includes(needle);
}

/**
 * Split a compound into the part that is the queried word and the parts that are not.
 *
 * The list's whole claim is containment, so the surface shows where. This works on
 * the **displayed** string and returns a single unmatched part when it cannot find
 * the query there — a row matched only after NFKC folding is still a correct row,
 * and inventing a highlight offset for it would be marking a span the reader
 * cannot verify by looking.
 */
export function splitCompoundText(
  text: string,
  query: string,
): { text: string; match: boolean }[] {
  const needle = query.trim();
  if (!needle || !text.includes(needle)) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: needle, match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

/**
 * Choose the words a reader would call compounds of the query, from index rows.
 *
 * Every row is justified by a substring the reader can see, so this asserts
 * nothing about morphology: 手 legitimately returns 手袋 and 上手, and it also
 * returns 山手, where the character is the second element. Naming the surface
 * after containment rather than after word formation is what keeps that honest.
 *
 * The query word is never its own compound. Identity here is NFKC + case fold and
 * **not** the kana fold `rankLexiconNeighbors` applies, which is a deliberate
 * difference rather than an oversight: 子猫 and 子ネコ are two spellings a list of
 * written forms has to keep apart, and folding them would silently drop one. The
 * kana fold is also not needed for the exclusion — ネコ cannot reach it, because a
 * katakana spelling of the query does not contain the query and the containment
 * test above has already dropped it. What the fold *is* needed for is a spelling
 * that differs only in width or case, which is why a plain `===` is not enough.
 *
 * Order comes from SQL, which sorts by the importer's own commonness score and
 * then by length. This preserves that order and only deduplicates: one word
 * supplied by two dictionaries collapses into a single row keeping the first —
 * highest-scoring — dictionary's attribution.
 */
export function selectLexiconCompounds(
  query: string,
  candidates: readonly LexiconCompoundCandidate[],
  limit = MAX_COMPOUND_RESULTS,
): LexiconCompoundCandidate[] {
  const queryKey = normalizeNeighborText(query);
  const grouped = new Map<string, LexiconCompoundCandidate>();
  const bounded = Math.max(1, Math.min(MAX_COMPOUND_RESULTS, Math.floor(limit)));

  for (const candidate of candidates) {
    const text = candidate.text.trim();
    if (!text || !containsCompoundQuery(text, query)) continue;
    if (normalizeNeighborText(text) === queryKey) continue;

    const reading = candidate.reading.trim();
    const key = [candidate.lang, normalizeNeighborText(text), normalizeNeighborText(reading)].join('\t');
    if (grouped.has(key)) continue;
    grouped.set(key, { ...candidate, text, reading });
    if (grouped.size >= bounded) break;
  }

  return [...grouped.values()];
}
