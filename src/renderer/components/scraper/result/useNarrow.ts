import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * True while the element is narrower than `breakpoint` CSS pixels.
 *
 * A container query cannot do this job for a windowed table: the row height is a
 * JS number handed to `VirtualList`, so a layout whose rows grow taller has to be
 * known to React, not only to the stylesheet. State changes only when the width
 * CROSSES the breakpoint, so dragging a window edge re-renders the table twice at
 * most rather than once per frame (see `useElementSize` for what the per-frame
 * version cost).
 */
export function useNarrow<T extends HTMLElement>(breakpoint: number): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (width: number) => {
      // 0 means "not laid out yet" (hidden tab, detached, jsdom) — not narrow.
      const next = width > 0 && width < breakpoint;
      setNarrow((prev) => (prev === next ? prev : next));
    };
    apply(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) apply(box.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [breakpoint]);
  return [ref, narrow];
}
