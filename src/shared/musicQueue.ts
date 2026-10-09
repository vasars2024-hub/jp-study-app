/**
 * The music player's hand-arranged queue: "Play next", "Add to queue", reordering what
 * plays after the current track, and turning that queue into a playlist.
 *
 * The player walks a `PlayOrder` (`musicPlayOrder.ts`): `ids` with a `cursor` on the
 * current track. Everything here works on that shape, by id, so the current track keeps
 * its place whatever moves around it — the cursor is recomputed from the current id
 * rather than shifted by arithmetic.
 *
 * "Add to queue" follows the familiar player rule: a track the user queued by hand goes
 * after the other hand-queued tracks, not after the rest of a thousand-track library.
 * The hand-queued set is the caller's to keep; this module only reads it.
 *
 * Pure: no DOM, no storage, no player.
 */

/** The ids that play after the current one (everything after the cursor). */
export function queueUpcoming(ids: readonly string[], cursor: number): string[] {
  return ids.slice(cursor + 1);
}

/** `id` first in `upcoming`, moved there if it was already queued. The current track never moves. */
export function queueInsertNext(upcoming: readonly string[], id: string, currentId: string | null): string[] {
  if (!id || id === currentId) return upcoming.slice();
  return [id, ...upcoming.filter((x) => x !== id)];
}

/**
 * `id` after the last hand-queued track in `upcoming` (or first, when none is queued),
 * moved there if it was already queued. The current track never moves.
 */
export function queueAppend(
  upcoming: readonly string[],
  id: string,
  currentId: string | null,
  handQueued: ReadonlySet<string>,
): string[] {
  if (!id || id === currentId) return upcoming.slice();
  const rest = upcoming.filter((x) => x !== id);
  let at = 0;
  for (let i = 0; i < rest.length; i++) if (handQueued.has(rest[i])) at = i + 1;
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** `list` with the entry at `from` moved to `to` (clamped). Out-of-range `from` is a no-op. */
export function queueMoveEntry<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  if (target === from) return out;
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}

/**
 * Rebuild a whole play order so that, after the current track, `head` plays first and in
 * that order. Tracks not named in `head` keep their relative order: history stays before
 * the current track, the rest of the upcoming tracks follow `head`. `head` may name ids
 * that were not in the order (a track queued from search) and ids from the history (the
 * wrapped part of "Up next" under repeat-all); each id appears once in the result.
 *
 * Returns the new ids and the current track's index in them (-1 with no current track).
 */
export function arrangeQueueOrder(
  ids: readonly string[],
  cursor: number,
  currentId: string | null,
  head: readonly string[],
): { ids: string[]; cursor: number } {
  const current = currentId;
  const headIds: string[] = [];
  const named = new Set<string>();
  for (const id of head) {
    if (!id || id === current || named.has(id)) continue;
    named.add(id);
    headIds.push(id);
  }
  const before = cursor >= 0 ? ids.slice(0, cursor) : [];
  const after = cursor >= 0 ? ids.slice(cursor + 1) : ids.slice();
  const keep = (id: string): boolean => !named.has(id) && id !== current;
  const history = before.filter(keep);
  const tail = after.filter(keep);
  const next = current
    ? [...history, current, ...headIds, ...tail]
    : [...history, ...headIds, ...tail];
  return { ids: next, cursor: current ? history.length : -1 };
}

/**
 * Where a keyboard/drag move lands, or null when it would not move: `delta` -1 is up,
 * +1 is down. Positions are 0-based within the movable list.
 */
export function queueKeyboardMove(index: number, delta: number, length: number): number | null {
  if (index < 0 || index >= length) return null;
  const to = Math.max(0, Math.min(length - 1, index + delta));
  return to === index ? null : to;
}

/** The track ids to save when the queue becomes a playlist: the current track, then what follows. */
export function queueAsPlaylistIds(currentId: string | null, upcoming: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of currentId ? [currentId, ...upcoming] : upcoming) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
