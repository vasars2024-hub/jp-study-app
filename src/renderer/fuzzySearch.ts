/** Subsequence fuzzy score; higher is better, null = no match. */
export function fuzzyScore(needle: string, hay: string): number | null {
  if (!needle) return 0;
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  const direct = h.indexOf(n);
  if (direct >= 0) return 100 - direct - (h.length - n.length) * 0.1;
  let hi = 0;
  let score = 50;
  for (let ni = 0; ni < n.length; ni++) {
    const found = h.indexOf(n[ni]!, hi);
    if (found < 0) return null;
    score -= (found - hi) * 0.5;
    hi = found + 1;
  }
  return score - (h.length - n.length) * 0.1;
}
