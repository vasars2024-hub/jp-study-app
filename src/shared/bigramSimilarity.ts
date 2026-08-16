// One owner for character-bigram similarity.
//
// This was `subtitleFusionCore`'s private scorer until `ankiDuplicates` needed
// exactly the same measure for near-duplicate notes. Two copies of a similarity
// function is how two surfaces end up disagreeing about whether the same pair of
// sentences is "the same" — the identical drift this repo already paid for with
// three near-copies of the kanji range, now consolidated in `furigana.ts`.
//
// Nothing else moved with it: fusion's `normalizeForFusionCompare` and the deck
// workbench's `normalizeDuplicateKey` stay in their own modules, because what
// counts as noise genuinely differs between a spoken cue and a note field.

/**
 * Sørensen–Dice coefficient over character bigrams.
 *
 * Bigrams rather than characters because Japanese has a small alphabet and a high
 * base rate of coincidental character overlap — two unrelated sentences routinely
 * share の, に and し. Bigrams rather than words because there is no whitespace to
 * split on and running a tokenizer here would drag a dictionary into a pure module.
 *
 * A one-character string has no bigrams, so it is compared as itself; without that
 * every single-character cue would score 0 against everything.
 */
export function bigramDice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s: string): Map<string, number> => {
    const out = new Map<string, number>();
    const units = [...s];
    if (units.length === 1) return new Map([[units[0], 1]]);
    for (let i = 0; i < units.length - 1; i += 1) {
      const key = units[i] + units[i + 1];
      out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  };
  const left = grams(a);
  const right = grams(b);
  let shared = 0;
  let leftTotal = 0;
  let rightTotal = 0;
  for (const count of left.values()) leftTotal += count;
  for (const [key, count] of right) {
    rightTotal += count;
    const other = left.get(key);
    if (other) shared += Math.min(other, count);
  }
  if (!leftTotal || !rightTotal) return 0;
  return (2 * shared) / (leftTotal + rightTotal);
}

/** Distinct bigrams of `text`, for an index that avoids comparing every pair. */
export function bigramSet(text: string): Set<string> {
  const units = [...text];
  if (units.length === 0) return new Set();
  if (units.length === 1) return new Set([units[0]]);
  const out = new Set<string>();
  for (let i = 0; i + 1 < units.length; i += 1) out.add(units[i] + units[i + 1]);
  return out;
}
