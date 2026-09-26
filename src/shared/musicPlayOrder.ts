/**
 * The music player's play order — what "next", "previous" and "Up next" mean.
 *
 * Two defects shared one cause. Shuffle picked a random index on every advance, so a
 * track could come round again before the rest had played once, and Previous under
 * shuffle was just another random pick rather than the song the user had just heard.
 * And the Music window's "Up next" listed `queue.slice(0, 8)` — the first eight tracks
 * of the library, not the ones after the current track, and never the shuffled order.
 * Both needed the order to be a real, stable sequence the player walks, so it is one.
 *
 * `ids` is a permutation of the queue; `cursor` is the current track's index in it.
 * With shuffle off `ids` is simply the queue order. With shuffle on it is a shuffled
 * permutation drawn ONCE per cycle, with the current track at the front, so:
 *  - every track plays exactly once before any track repeats (a cycle);
 *  - `ids[0..cursor]` is the play history, so Previous walks back through it;
 *  - `ids[cursor+1..]` is the honest "Up next".
 *
 * Pure: no DOM, no storage, and the random source is injected so tests are exact.
 */

export interface PlayOrder {
  /** Track ids in the order they play. A permutation of the queue. */
  ids: string[];
  /** Index of the current track in `ids`, or -1 when nothing in the queue is current. */
  cursor: number;
  /** Whether `ids` is a shuffled cycle (true) or the queue's own order (false). */
  shuffled: boolean;
}

export type Rng = () => number;

export const EMPTY_PLAY_ORDER: PlayOrder = { ids: [], cursor: -1, shuffled: false };

/** Fisher–Yates over a copy. */
function shuffleIds(ids: readonly string[], rng: Rng): string[] {
  const out = ids.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** The queue in its own order, positioned on `currentId`. */
export function linearOrder(queueIds: readonly string[], currentId: string | null): PlayOrder {
  const ids = queueIds.slice();
  return { ids, cursor: currentId ? ids.indexOf(currentId) : -1, shuffled: false };
}

/**
 * A fresh shuffled cycle. The current track (when it is in the queue) goes first, so
 * the cycle starts where the listener already is and every OTHER track follows once.
 */
export function shuffledOrder(
  queueIds: readonly string[],
  currentId: string | null,
  rng: Rng = Math.random,
): PlayOrder {
  const hasCurrent = !!currentId && queueIds.includes(currentId);
  const rest = queueIds.filter((id) => id !== currentId);
  const ids = hasCurrent ? [currentId as string, ...shuffleIds(rest, rng)] : shuffleIds(rest, rng);
  return { ids, cursor: hasCurrent ? 0 : -1, shuffled: true };
}

/**
 * Bring an existing order in line with a changed queue WITHOUT reshuffling it.
 *
 * The Music app re-sets the queue whenever the list's sort or search changes, which is
 * often; reshuffling on each of those would make "each track once per cycle" false the
 * moment the user typed in the search box. So tracks that stay keep their place, tracks
 * that left are dropped, and new tracks join the part of the cycle not yet played.
 */
export function reconcileOrder(
  order: PlayOrder,
  queueIds: readonly string[],
  shuffle: boolean,
  currentId: string | null,
  rng: Rng = Math.random,
): PlayOrder {
  if (!shuffle) return linearOrder(queueIds, currentId);
  if (!order.shuffled) return shuffledOrder(queueIds, currentId, rng);
  const inQueue = new Set(queueIds);
  const kept = order.ids.filter((id) => inQueue.has(id));
  const known = new Set(kept);
  const added = queueIds.filter((id) => !known.has(id));
  let cursor = currentId ? kept.indexOf(currentId) : -1;
  if (added.length) {
    // New arrivals are spread through the unplayed remainder, never into history.
    const played = kept.slice(0, cursor + 1);
    const upcoming = shuffleIds([...kept.slice(cursor + 1), ...added], rng);
    const ids = [...played, ...upcoming];
    cursor = currentId ? ids.indexOf(currentId) : -1;
    return { ids, cursor, shuffled: true };
  }
  return { ids: kept, cursor, shuffled: true };
}

/**
 * The user chose a track directly. Under shuffle it becomes the next step of the cycle
 * (moved to just after the current position) rather than a jump that would skip, or
 * later repeat, whatever lay between — so the cycle still plays every track once.
 */
export function pickInOrder(order: PlayOrder, id: string): PlayOrder {
  const at = order.ids.indexOf(id);
  if (!order.shuffled) return { ...order, cursor: at };
  // A track from outside the queue (played from the Library tab, say) is not part of
  // this cycle; the cycle stays exactly where it was and resumes after it.
  if (at < 0 || at === order.cursor) return order;
  const ids = order.ids.filter((x) => x !== id);
  const base = at < order.cursor ? order.cursor - 1 : order.cursor;
  const insertAt = Math.max(0, base + 1);
  ids.splice(insertAt, 0, id);
  return { ids, cursor: insertAt, shuffled: true };
}

export interface StepOptions {
  repeat: 'off' | 'all' | 'one';
  /** True when the track ended by itself (vs. the user pressing Next/Previous). */
  fromEnded: boolean;
  rng?: Rng;
}

export interface StepResult {
  order: PlayOrder;
  /** The track to play, or null for "nothing" (end of list; or restart current on Previous). */
  nextId: string | null;
}

/**
 * One step forward (+1) or back (-1).
 *
 * Linear: the old behaviour exactly — wrap on a manual step, stop at the end of the list
 * when a track ends unless repeat is "all".
 * Shuffled: back walks the history; back at the first track of a cycle returns null
 * (the caller restarts the current track). Forward past the end of a cycle starts a new
 * cycle — on a manual step always, after a track ended only under repeat "all".
 */
export function stepOrder(order: PlayOrder, dir: 1 | -1, opts: StepOptions): StepResult {
  const n = order.ids.length;
  if (n === 0) return { order, nextId: null };
  if (!order.shuffled) {
    const j = order.cursor + dir;
    if (j < 0 || j >= n) {
      if (opts.fromEnded && opts.repeat !== 'all') return { order, nextId: null };
      const k = (j + n) % n;
      return { order: { ...order, cursor: k }, nextId: order.ids[k] };
    }
    return { order: { ...order, cursor: j }, nextId: order.ids[j] };
  }
  if (dir === -1) {
    if (order.cursor <= 0) return { order, nextId: null };
    const k = order.cursor - 1;
    return { order: { ...order, cursor: k }, nextId: order.ids[k] };
  }
  const j = order.cursor + 1;
  if (j < n) return { order: { ...order, cursor: j }, nextId: order.ids[j] };
  if (opts.fromEnded && opts.repeat !== 'all') return { order, nextId: null };
  // New cycle. The track that just finished is the new cycle's history, so the first
  // new track is never an immediate repeat of it.
  const current = order.cursor >= 0 ? order.ids[order.cursor] : null;
  const next = shuffledOrder(order.ids, current, opts.rng ?? Math.random);
  if (n === 1) return { order: next, nextId: next.ids[0] };
  const k = next.cursor + 1;
  return { order: { ...next, cursor: k }, nextId: next.ids[k] };
}

/**
 * What plays after the current track, in order, at most `limit` ids.
 *
 * With `wrap` (repeat "all", linear order) the list continues from the top of the queue,
 * because that is genuinely what plays next. A shuffled cycle does not wrap: the next
 * cycle is not drawn yet, and listing a guess would be a promise the player breaks.
 */
export function upcomingIds(order: PlayOrder, limit: number, wrap = false): string[] {
  const out: string[] = [];
  const n = order.ids.length;
  if (n === 0 || limit <= 0) return out;
  const start = order.cursor + 1;
  for (let i = start; i < n && out.length < limit; i++) out.push(order.ids[i]);
  if (wrap && !order.shuffled && order.cursor >= 0) {
    for (let i = 0; i < order.cursor && out.length < limit; i++) out.push(order.ids[i]);
  }
  return out;
}
