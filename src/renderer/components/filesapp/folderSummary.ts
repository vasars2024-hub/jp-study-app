/**
 * What the inspector column says when nothing is selected.
 *
 * Extracted out of `FilesApp.tsx` so the counting rules are testable without
 * mounting the whole surface — the two that matter are easy to get wrong and
 * silent when they are:
 *
 * 1. `sizeBytes: null` means "this store has no size", NOT zero. Folding those
 *    rows into the total invents a number, so they are summed separately and
 *    the count of them is reported alongside (`format.ts` draws the same
 *    distinction with an em dash for a single row).
 * 2. The kind breakdown is CAPPED for the column's height, and the remainder is
 *    counted rather than dropped, so what is on screen always adds up to the
 *    total above it.
 */
import type { FilesItem, FilesItemKind } from '../../../shared/filesApp/catalog';

/** Six is what fits the inspector column at the default window height. */
export const FOLDER_SUMMARY_MAX_KINDS = 6;

export type FolderSummary = {
  /** Total of every row that HAS a size. Never includes a `null` as zero. */
  bytes: number;
  /** How many rows contributed to `bytes`. */
  sizedCount: number;
  /** How many rows carry no size at all. `sizedCount + unsizedCount === total`. */
  unsizedCount: number;
  /** Rows whose backing file is gone. */
  broken: number;
  /** Up to `FOLDER_SUMMARY_MAX_KINDS` kinds, most numerous first. */
  kinds: Array<[FilesItemKind, number]>;
  /** How many DISTINCT kinds exist, including the ones `kinds` cut. */
  kindsTotal: number;
};

/**
 * Summarise the rows that are actually on screen.
 *
 * Callers pass the post-scope, post-search, post-filter list, so this can never
 * disagree with the list beside it. Ties in the kind breakdown fall back to
 * first-seen order (`Array.prototype.sort` is stable), which makes the output a
 * pure function of the input order rather than of `Map` internals.
 */
export function summarizeFolder(
  items: readonly FilesItem[],
  maxKinds: number = FOLDER_SUMMARY_MAX_KINDS,
): FolderSummary {
  let bytes = 0;
  let sizedCount = 0;
  let broken = 0;
  const kinds = new Map<FilesItemKind, number>();
  for (const item of items) {
    if (item.sizeBytes !== null) {
      bytes += item.sizeBytes;
      sizedCount += 1;
    }
    if (item.flags.brokenLink) broken += 1;
    kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
  }
  return {
    bytes,
    sizedCount,
    unsizedCount: items.length - sizedCount,
    broken,
    kinds: [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxKinds),
    kindsTotal: kinds.size,
  };
}
