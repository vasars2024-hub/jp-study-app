import type { GrammarLang } from './types';

/**
 * The key two grammar records share when they are the same pattern.
 *
 * Split from practiceFilters.ts so the data layer (index.ts) can group twins
 * without importing the filter layer.
 *
 * Identity key for a grammar pattern, independent of notation.
 *
 * The two Japanese sources write the same pattern differently — the authored
 * files use `〜前に`, the supplement dump uses `... 前に` — so a whitespace-only
 * key (what this module used to do) matched **zero** of them. 189 supplement
 * records duplicate 159 of the 325 authored points, and every pair was being
 * shown as two separate entries: one with examples and a real explanation, one
 * hollow.
 *
 * Stripping the ellipsis/tilde placeholders collapses them. Verified not to
 * over-merge: it causes no collisions among the 325 authored titles and leaves
 * no record with an empty key.
 *
 * Phase 1.5 widened the strip set after measuring what still surfaced twice.
 * Three notation gaps remained, all mechanical rather than editorial:
 *
 *  - **ASCII `~`.** The set covered `〜` (wave dash) and `～` (fullwidth) but
 *    not plain `~`, and the supplement dump mixes all three — `ほど~ない` and
 *    `ほど～ない` were two rows.
 *  - **Parenthesis characters**, stripped while keeping what is inside them.
 *    The dump marks optional trailing particles as `ため(に)` / `場合(は)`, which
 *    is the same pattern the authored files write as `〜ために` / `〜場合は`.
 *    Only the brackets are removed; the content still distinguishes patterns.
 *  - **Both slashes.** `〜なりに / 〜なりの` vs `～なりに／～なりの`.
 *
 * That collapses 26 further groups, 14 of which pair an authored record with a
 * hollow supplement shadow, so `contentRank` recovers the authored copy.
 * Re-verified against the same two invariants, plus: no authored record is
 * displaced by a hollow twin. `practiceFilters.test.ts` pins all three.
 */
export function grammarTitleKey(lang: GrammarLang, title: string): string {
  const normalized = String(title || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[〜～~.．…・/／()（）]/g, '');
  return `${lang}|${normalized}`;
}
