/**
 * Example sentences ranked by how much of them the learner already knows.
 *
 * The comprehensible-input rule for picking a sentence to learn a word from is
 * "i+1": everything in it is known except the one thing being learned. Tatoeba
 * returns sentences in corpus order, so the first example under a word was often
 * one with four other unknown words in it — and it is also the one mining puts on
 * the card by default. This counts, per sentence, the content words below the
 * known threshold OTHER than the looked-up word itself, and orders by that count.
 *
 * Pure: the tokens and the level lookup are passed in, so the scoring is testable
 * without kuromoji or the knowledge store. Ties keep the corpus order.
 */

export interface ExampleCoverage {
  /** Distinct content words in the sentence below the known threshold, excluding the target. */
  unknown: number;
  /** Distinct content words in the sentence, excluding the target. */
  words: number;
}

export interface CoverageToken {
  surface: string;
  lemma: string;
  content: boolean;
  proper: boolean;
}

/** Familiar (2) or Known (3) counts as known — the threshold level lists use too. */
export const EXAMPLE_KNOWN_LEVEL = 2;

export function exampleCoverage(
  tokens: readonly CoverageToken[],
  target: ReadonlySet<string>,
  levelOf: (key: string) => number,
  knownAt = EXAMPLE_KNOWN_LEVEL,
): ExampleCoverage {
  const seen = new Set<string>();
  let unknown = 0;
  for (const token of tokens) {
    if (!token.content || token.proper) continue;
    const key = (token.lemma || token.surface).trim();
    if (!key || seen.has(key)) continue;
    if (target.has(key) || target.has(token.surface)) continue;
    seen.add(key);
    if (levelOf(key) < knownAt) unknown += 1;
  }
  return { unknown, words: seen.size };
}

/**
 * Items ordered by fewest unknown words first. Items with no coverage (the
 * sentence could not be tokenized) keep their relative order after the scored
 * ones; when nothing could be scored the order is untouched.
 */
export function rankByCoverage<T>(items: readonly T[], coverageOf: (item: T) => ExampleCoverage | null): T[] {
  const scored = items.map((item, index) => ({ item, index, coverage: coverageOf(item) }));
  if (scored.every((row) => row.coverage === null)) return [...items];
  scored.sort((a, b) => {
    if (a.coverage && b.coverage) return a.coverage.unknown - b.coverage.unknown || a.index - b.index;
    if (a.coverage) return -1;
    if (b.coverage) return 1;
    return a.index - b.index;
  });
  return scored.map((row) => row.item);
}
