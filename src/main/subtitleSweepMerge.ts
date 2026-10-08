/**
 * Keeps the user's own subtitle edits when a sweep writes its answer back.
 *
 * A sweep reads an item, spends seconds to minutes asking providers, then
 * writes the item's whole subtitle list. Anything the user did to that item in
 * between — attached a file, removed a wrong track, nudged a sync offset — was
 * overwritten by the list built from the stale read. This replays those edits
 * onto what the sweep is about to write:
 *
 *   added by the user   (in `current`, not in `snapshot`) -> kept
 *   removed by the user (in `snapshot`, not in `current`) -> stays removed
 *   changed by the user (same id, different content)       -> the user's version
 *
 * Records the sweep itself added or dropped are left as the sweep decided.
 */

import type { SubtitleRecord } from '../shared/subtitleRecord';

function sameRecord(a: SubtitleRecord, b: SubtitleRecord): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function mergeSweepSubtitles(
  snapshot: readonly SubtitleRecord[] | undefined,
  current: readonly SubtitleRecord[] | undefined,
  written: readonly SubtitleRecord[],
): SubtitleRecord[] {
  const before = new Map((snapshot ?? []).map((record) => [record.id, record]));
  const now = new Map((current ?? []).map((record) => [record.id, record]));
  // Removed by the user while the sweep ran: the sweep's copy came from the stale read.
  const out = written.filter((record) => !before.has(record.id) || now.has(record.id));
  for (const record of current ?? []) {
    const old = before.get(record.id);
    if (old && sameRecord(old, record)) continue;
    // Added or edited by the user while the sweep ran.
    const at = out.findIndex((entry) => entry.id === record.id);
    if (at >= 0) out[at] = record;
    else out.push(record);
  }
  return out;
}
