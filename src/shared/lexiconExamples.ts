import { normalizeNeighborText } from './lexiconNeighbors';

/**
 * Rows read from `examples` before selection. The scan stops here, so a common
 * word pays for a few hundred `instr` evaluations rather than for the table.
 * See `findExampleSentences`.
 */
export const EXAMPLE_SCAN_ROWS = 400;
export const MAX_EXAMPLE_RESULTS = 8;
/**
 * A sentence search is containment, so a query longer than a long compound is a
 * sentence someone pasted — and a sentence is not contained in other sentences.
 */
export const MAX_EXAMPLE_QUERY_CHARS = 32;

export interface LexiconExampleTranslation {
  lang: string;
  text: string;
}

export interface LexiconExampleSentence {
  lang: string;
  text: string;
  /** The sentence's own translations, in the source's order, already language-filtered. */
  translations: LexiconExampleTranslation[];
  dictId: string;
  dictTitle: string;
  /** The corpus's own id for this sentence, when it published one. */
  sourceId?: string;
  licence?: string;
}

export interface LexiconExampleResult {
  query: string;
  examples: LexiconExampleSentence[];
}

export interface LexiconExampleCandidate {
  /**
   * The row this candidate came from, used only to fetch its translations before
   * the result leaves the main process. Example ids are reassigned by every
   * re-import, so nothing outside one query may hold on to one — the durable name
   * of a sentence is `sourceId`.
   */
  exampleId: number;
  lang: string;
  text: string;
  dictId: string;
  dictTitle: string;
  sourceId?: string;
  licence?: string;
}

/**
 * Does this sentence literally contain the queried word?
 *
 * SQL matches with `instr` on the stored text, so the same NFKC + case fold that
 * decides the compound list decides this one. Checking the raw strings instead
 * would reject a full-width or cased spelling the scan legitimately matched.
 */
export function containsExampleQuery(text: string, query: string): boolean {
  const needle = normalizeNeighborText(query);
  if (!needle) return false;
  return normalizeNeighborText(text).includes(needle);
}

/**
 * Sentence-boundary punctuation, in both the CJK and the Latin widths a corpus
 * mixes freely. Only used to decide whether a row is the bare query dressed as a
 * sentence — never to alter what is displayed.
 */
const EDGE_PUNCTUATION = /^[\s。．.！!？?、，,;；:：「」『』"'“”‘’()（）\-—…]+|[\s。．.！!？?、，,;；:：「」『』"'“”‘’()（）\-—…]+$/g;

/**
 * The part of a sentence that carries content, for the "is this row just the
 * query?" test.
 *
 * Tatoeba genuinely contains bare-word entries, and they arrive as `猫。` rather
 * than as `猫` — punctuated, so an exact comparison lets every one of them through
 * and they then win the shortest-first ordering outright. Stripping edge
 * punctuation is deliberately all this does: anything cleverer would start
 * discarding real one-clause sentences.
 */
export function exampleBodyKey(text: string): string {
  return normalizeNeighborText(text.replace(EDGE_PUNCTUATION, ''));
}

/**
 * Split a sentence into the spans that are the queried word and the spans that
 * are not, for the surface that underlines what it claims to have matched.
 *
 * Works on the **displayed** string, and returns one unmatched part when the word
 * is not literally there: a row matched only after folding is still a correct row,
 * and inventing an offset for it would underline a span the reader cannot verify.
 */
export function splitExampleText(
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
 * Choose the sentences a learner would want to read, from scanned rows.
 *
 * Shortest first, which is the one ordering SQL cannot supply here: the scan is
 * deliberately unordered and truncated (a global `ORDER BY length` would have to
 * visit every sentence in the corpus before returning eight). Within a length,
 * scan order is preserved, so the choice is deterministic for a given database.
 *
 * A sentence whose content is only the query is dropped — see `exampleBodyKey`.
 * It contains the word, but a one-word "example" of that word teaches nothing
 * about how it is used, and being the shortest possible row it would otherwise
 * always be shown first.
 *
 * Deduplication is on the folded sentence, so the same sentence supplied by two
 * corpora collapses to one row keeping the first — shortest, then earliest —
 * corpus's attribution.
 */
export function selectLexiconExamples(
  query: string,
  candidates: readonly LexiconExampleCandidate[],
  limit = MAX_EXAMPLE_RESULTS,
): LexiconExampleCandidate[] {
  const queryKey = exampleBodyKey(query);
  const bounded = Math.max(1, Math.min(MAX_EXAMPLE_RESULTS, Math.floor(limit)));
  const eligible: { candidate: LexiconExampleCandidate; order: number }[] = [];

  candidates.forEach((candidate, order) => {
    const text = candidate.text.trim();
    if (!text || !containsExampleQuery(text, query)) return;
    if (exampleBodyKey(text) === queryKey) return;
    eligible.push({ candidate: { ...candidate, text }, order });
  });

  eligible.sort((a, b) =>
    [...a.candidate.text].length - [...b.candidate.text].length || a.order - b.order);

  const grouped = new Map<string, LexiconExampleCandidate>();
  for (const { candidate } of eligible) {
    const key = normalizeNeighborText(candidate.text);
    if (grouped.has(key)) continue;
    grouped.set(key, candidate);
    if (grouped.size >= bounded) break;
  }
  return [...grouped.values()];
}
