/**
 * Effective library level helpers — Inbox articles and file-imported books
 * share the same L1–L7 scale for sort / filter / group.
 */

import type { BookLevelEstimate } from './bookLevelEstimate';
import type { LibraryItem } from './types';
import { JA_SLOTS, ZH_SLOTS, type LevelTier } from './levelScale';

export type LibraryLang = 'ja' | 'zh' | 'en' | 'unknown';

/** Coarse L1–L7 from Inbox enrich or file-book levelMeta. */
export function effectiveLevelEstimate(item: LibraryItem): LevelTier | null {
  const fromInbox = item.inboxMeta?.levelEstimate;
  if (fromInbox != null) return fromInbox;
  const fromFile = item.levelMeta?.levelEstimate;
  return fromFile != null ? fromFile : null;
}

export function effectiveLang(item: LibraryItem): LibraryLang {
  return item.inboxMeta?.lang ?? item.levelMeta?.lang ?? 'unknown';
}

/** Map an exam-band cover estimate (N3 / HSK4) onto the shared 1–7 tier scale. */
export function tierFromBookEstimate(est: BookLevelEstimate): LevelTier | null {
  const slots = est.scheme === 'hsk' ? ZH_SLOTS : JA_SLOTS;
  const slot = slots.find((s) => s.id === est.slotId);
  return slot ? slot.tier : null;
}

/**
 * Sort/filter key: prefer known-ratio L, else exam-band tier from cover badge.
 * Missing → 99 so unleveled items sink to the end when sorting by level.
 */
export function levelSortKey(
  item: LibraryItem,
  bookEstimate?: BookLevelEstimate | null,
): number {
  const coarse = effectiveLevelEstimate(item);
  if (coarse != null) return coarse;
  if (bookEstimate) {
    const tier = tierFromBookEstimate(bookEstimate);
    if (tier != null) return tier;
  }
  return 99;
}

export const LIBRARY_LANG_CHIPS = ['all', 'ja', 'zh', 'en', 'unknown'] as const;
export const LIBRARY_LEVEL_CHIPS = ['all', '1', '2', '3', '4', '5', '6', '7'] as const;

/**
 * Which language / level filter chips can actually return something for a given list.
 *
 * Library rendered all thirteen unconditionally, so a shelf of Japanese books still offered
 * Chinese, English and Unknown, and every level from L1 to L7 whether or not anything carried
 * one. A filter that can only produce an empty result is a dead control, and measured on a
 * real 24-item library it was thirteen of the twenty-five controls the user has to scan
 * before doing anything (rubric category 5 Q4, `baselines/cat5-l6-library.json`).
 *
 * `all` is always kept, and so is whatever is currently selected — a filter you can apply and
 * then neither see nor undo is worse than the clutter this removes. The caller passes the
 * FOLDER-SCOPED list, because that is what the chips filter.
 */
export function availableFilterChips(
  scoped: readonly LibraryItem[],
  bookLevels: Readonly<Record<string, BookLevelEstimate | null | undefined>>,
  selected: { lang: string; level: string },
): { langs: LibraryLang[] | string[]; levels: string[] } {
  const langs = new Set<string>();
  const levels = new Set<string>();
  for (const it of scoped) {
    langs.add(effectiveLang(it));
    const lv = levelSortKey(it, bookLevels[it.id]);
    if (lv >= 1 && lv <= 7) levels.add(String(lv));
  }
  return {
    langs: LIBRARY_LANG_CHIPS.filter(
      (l) => l === 'all' || langs.has(l) || selected.lang === l,
    ) as string[],
    levels: LIBRARY_LEVEL_CHIPS.filter(
      (lv) => lv === 'all' || levels.has(lv) || selected.level === lv,
    ) as string[],
  };
}

/**
 * Does one item survive the language / level filter chips?
 *
 * The ONE predicate. Library used to apply the two filters inline while building the visible
 * grid and count folder chips over the unfiltered store, so the two answers drifted: on the
 * real 24-item library with Japanese selected, the `Manga` chip promised 3 and opened onto
 * "This folder is empty" — which was false (it holds 3) and pointed at the wrong remedy
 * (file a book into it, rather than clear the filter). Counting and showing must ask the same
 * question, so they call this and nothing else.
 *
 * The sibling `availableFilterChips` already applies the symmetric rule in the other
 * direction — lang/level chips are scoped to the active folder — on the stated grounds that a
 * filter which can only return nothing is a dead control. A folder chip is one too.
 */
export function matchesLibraryFilters(
  item: LibraryItem,
  bookLevels: Readonly<Record<string, BookLevelEstimate | null | undefined>>,
  selected: { lang: string; level: string },
): boolean {
  if (selected.lang !== 'all' && effectiveLang(item) !== selected.lang) return false;
  if (selected.level !== 'all' && levelSortKey(item, bookLevels[item.id]) !== Number(selected.level)) {
    return false;
  }
  return true;
}
