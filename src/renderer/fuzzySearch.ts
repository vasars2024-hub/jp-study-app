/**
 * Ranked text match for the palette, Blanc's context search and grammar lookup.
 * Higher is better; `null` means "does not match at all".
 *
 * Until round 2 this was a scattered-subsequence scorer: any hay that contained
 * the needle's letters in order matched. With the palette's hay being a label
 * plus a sub-line plus hidden keyword lists, almost everything contained almost
 * any short word that way — "backup" ranked the Wallpaper widget first
 * ("BAcKground … UPload"), and the Settings rows the user wanted fell past the
 * 40-row cut behind hundreds of grammar points.
 *
 * A match now has to be a real one, in tiers that never overlap:
 *
 *   exact  >  prefix  >  word-prefix  >  contiguous substring
 *          >  every query word found (word-prefix, then substring)  >  acronym
 *
 * Within a tier, an earlier and a tighter match wins (the penalty is capped
 * below the gap between tiers, so it can reorder a tier but never cross one).
 *
 * Pure scattered subsequences no longer score. The single exception is an
 * ACRONYM — a 2–4 letter query matching the initials of consecutive words
 * ("ps" → "Playback Speed", "tf" → "Toggle furigana"). That is the one
 * subsequence people type on purpose, and restricting it to word initials is
 * what keeps "backup" from finding "Wallpaper" again.
 *
 * CJK text has no spaces, so the word tiers rarely apply to it; a Japanese or
 * Chinese query still matches through the substring tier, which is how a
 * learner searches kana/kanji anyway.
 */

export const FUZZY_TIER = {
  exact: 1000,
  prefix: 900,
  wordPrefix: 800,
  substring: 600,
  allWordsPrefix: 500,
  allWordsSubstring: 400,
  acronym: 300,
} as const;

/** Largest in-tier penalty; smaller than the smallest gap between tiers. */
const MAX_PENALTY = 90;

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordStart(hay: string, index: number): boolean {
  if (index === 0) return true;
  const prev = hay[index - 1]!;
  const cur = hay[index]!;
  if (!WORD_CHAR.test(prev)) return true;
  // camelCase / PascalCase inside ids ("subtitleStyle") counts as a boundary.
  return prev === prev.toLowerCase() && cur !== cur.toLowerCase() && cur === cur.toUpperCase();
}

/** Index of the first occurrence of `needle` that starts a word, or -1. */
function wordPrefixIndex(hayRaw: string, hay: string, needle: string): number {
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return -1;
    if (isWordStart(hayRaw, at)) return at;
    from = at + 1;
  }
}

function penalty(position: number, hayLength: number, needleLength: number): number {
  const p = Math.min(50, position * 0.5) + Math.min(40, Math.max(0, hayLength - needleLength) * 0.05);
  return Math.min(MAX_PENALTY, p);
}

function initials(hayRaw: string): string {
  let out = '';
  for (let i = 0; i < hayRaw.length; i++) {
    if (WORD_CHAR.test(hayRaw[i]!) && isWordStart(hayRaw, i)) out += hayRaw[i]!.toLowerCase();
  }
  return out;
}

export function fuzzyScore(needle: string, hay: string): number | null {
  const n = needle.trim().toLowerCase();
  if (!n) return 0;
  const h = hay.toLowerCase();
  // `toLowerCase` keeps indices aligned for every script this app ships, but a
  // few code points change length when lowered (e.g. 'İ'). Word-boundary checks
  // then fall back to the lowered text, which only loses the camelCase rule.
  const raw = hay.length === h.length ? hay : h;

  if (h === n) return FUZZY_TIER.exact;
  if (h.startsWith(n)) return FUZZY_TIER.prefix - penalty(0, h.length, n.length);
  const wp = wordPrefixIndex(raw, h, n);
  if (wp >= 0) return FUZZY_TIER.wordPrefix - penalty(wp, h.length, n.length);
  const sub = h.indexOf(n);
  if (sub >= 0) return FUZZY_TIER.substring - penalty(sub, h.length, n.length);

  const words = n.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    let allPrefix = true;
    let first = Infinity;
    for (const w of words) {
      const at = wordPrefixIndex(raw, h, w);
      if (at >= 0) {
        first = Math.min(first, at);
        continue;
      }
      const s = h.indexOf(w);
      if (s < 0) return null;
      allPrefix = false;
      first = Math.min(first, s);
    }
    const tier = allPrefix ? FUZZY_TIER.allWordsPrefix : FUZZY_TIER.allWordsSubstring;
    return tier - penalty(first, h.length, n.length);
  }

  if (n.length >= 2 && n.length <= 4 && /^[a-z]+$/.test(n)) {
    const at = initials(raw).indexOf(n);
    if (at >= 0) return FUZZY_TIER.acronym - penalty(at, h.length, n.length);
  }
  return null;
}

/**
 * How far a label match outranks a match in the sub-line or hidden terms.
 * A label is what the row SAYS, so "Backup & restore" answering "backup" by
 * its title must beat a row that only carries the word in a keyword list. The
 * sub/terms score is also capped at the word-prefix tier: that text is a bag of
 * phrases, so "starts with" or "equals" means nothing there.
 */
const LABEL_BONUS = 200;

/** Score a palette-style row, or null when neither its label nor its hidden text matches. */
export function scoreLabelledItem(
  query: string,
  item: { label: string; sub?: string; terms?: string },
): number | null {
  const label = fuzzyScore(query, item.label);
  if (label != null) return label + LABEL_BONUS;
  const rest = fuzzyScore(query, `${item.sub ?? ''} ${item.terms ?? ''}`);
  return rest == null ? null : Math.min(rest, FUZZY_TIER.wordPrefix);
}
