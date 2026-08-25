/**
 * Reference identity for render props that a `memo()` boundary compares.
 *
 * `React.memo` is a shallow reference comparison, so a memoised child is only
 * ever skipped if EVERY prop it receives keeps its identity. A parent that maps
 * over a list and builds handlers or element trees inline hands the child a new
 * object for each of those props on every render, and the memo can then never
 * hit — the wrapper costs an extra comparison and buys nothing.
 *
 * That is exactly what `DesktopShell` did to `FloatingWindow`: six inline arrows
 * plus a fresh `children` element per window, so a single `patch()` re-rendered
 * every open window and every `AppSection` under it.
 *
 * The cache is deliberately NOT a `useMemo`: the values are per list item, and
 * hooks cannot run in a loop. It lives in a ref for the component's lifetime and
 * is keyed by the item's stable id.
 */

export interface RenderIdentityCache<K, S, V> {
  /**
   * The value for `key`, rebuilt only when `stamp` differs from the stamp it was
   * built with. Pass a stamp for the inputs that are baked into the value and
   * cannot be read late; anything read through a ref needs no stamp.
   */
  get(key: K, stamp: S): V;
  /** Drop every key not in `live`. Returns how many were dropped. */
  prune(live: Iterable<K>): number;
  /** Entries currently held — the number a leak would grow without bound. */
  readonly size: number;
}

export function createRenderIdentityCache<K, S, V>(
  build: (key: K, stamp: S) => V,
): RenderIdentityCache<K, S, V> {
  const entries = new Map<K, { stamp: S; value: V }>();
  return {
    get(key: K, stamp: S): V {
      const found = entries.get(key);
      if (found && Object.is(found.stamp, stamp)) return found.value;
      const value = build(key, stamp);
      entries.set(key, { stamp, value });
      return value;
    },
    prune(live: Iterable<K>): number {
      const keep = live instanceof Set ? (live as Set<K>) : new Set(live);
      let dropped = 0;
      for (const key of [...entries.keys()]) {
        if (keep.has(key)) continue;
        entries.delete(key);
        dropped += 1;
      }
      return dropped;
    },
    get size(): number {
      return entries.size;
    },
  };
}
