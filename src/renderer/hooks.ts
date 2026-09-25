// Small standalone React hooks shared by the performance-sensitive list views
// (Music, Media). No external dependencies — matches the project's stance of
// hand-rolling small utilities instead of pulling in a library for them.
import { useEffect, useRef, useState } from 'react';

/** Debounce a fast-changing value so expensive derived work (search filtering,
 *  re-flattening a tree) only runs once typing/scrolling settles. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Track an element's content-box size via ResizeObserver.
 *
 * `axis` exists because the old unconditional `setSize({width, height})` allocated a NEW
 * object on every ResizeObserver callback, so a consumer that reads only one dimension
 * still re-rendered on every change to the other. Measured 2026-09-03 on Flashcards with a
 * 600-card deck: resizing the window re-rendered three `VirtualList`s (48 mounted rows) on
 * every frame purely because their WIDTH moved, and the resize gesture ran at renderer
 * frame p95 **30.0 ms** against an 8.5 ms compositor ceiling — 10 frames over 16 ms. Hiding
 * the three lists took the same gesture to p95 8.7 ms and 0 frames over 16, which is how the
 * cost was attributed to them rather than to the strip or the group headers.
 *
 * `'both'` (the default) is the original behaviour. A narrowed axis is a REAL narrowing:
 * the untracked dimension is never observed and stays at its initial 0, so ask for it only
 * when the consumer genuinely does not read the other value.
 */
export function useElementSize<T extends HTMLElement>(
  axis: 'both' | 'height' | 'width' = 'both',
): [React.RefObject<T>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (width: number, height: number): void => setSize((prev) => {
      const next = {
        width: axis === 'height' ? prev.width : width,
        height: axis === 'width' ? prev.height : height,
      };
      // Returning `prev` is what actually skips the render: React bails out on Object.is.
      return next.width === prev.width && next.height === prev.height ? prev : next;
    });
    apply(el.clientWidth, el.clientHeight);
    // No observer (jsdom, a stripped-down host): the first measurement stands.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) apply(box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [axis]);
  return [ref, size];
}
