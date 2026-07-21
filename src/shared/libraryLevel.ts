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
