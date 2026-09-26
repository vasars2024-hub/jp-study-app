/**
 * A horizontal strip that only mounts the items near what is on screen.
 *
 * The review navigator lists the whole session — 1,794 due cards on the heavy
 * profile — and re-rendered every chip on every grade (each also searched the
 * session for its own index, O(n²)). Items outside the viewport (plus an
 * overscan) are replaced by two spacers of the same width, so the scroller's
 * geometry, its scrollbar and `scrollIntoView` on the active chip behave as
 * before. Short lists render whole.
 *
 * Layout only reads what the stylesheet already says: the item step is the
 * first item's width plus the strip's `column-gap`, measured, never assumed.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Below this many items the strip renders everything (nothing to save). */
export const STRIP_WINDOW_MIN = 80;
/** Items mounted beyond each edge of the viewport. */
const OVERSCAN = 12;
/** Until measured: `.flash-strip-card` is 200px with a 12px gap. */
const FALLBACK_STEP = 212;
const FALLBACK_GAP = 12;

export interface WindowedStripProps<T> {
  items: readonly T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Kept mounted even when scrolled away, so it can always be scrolled to. */
  activeKey?: string | null;
  className?: string;
}

/**
 * The index ranges to mount, each [start, end), sorted and disjoint: the
 * viewport plus overscan, and the active item wherever it is — it must exist to
 * be scrolled to, and the user's own scroll position must not be emptied to
 * make room for it. Exported for tests.
 */
export function stripWindow(
  count: number,
  scrollLeft: number,
  viewWidth: number,
  step: number,
  activeIndex: number,
  overscan = OVERSCAN,
): Array<[number, number]> {
  if (count < STRIP_WINDOW_MIN) return [[0, count]];
  const first = Math.floor(scrollLeft / step);
  const last = Math.ceil((scrollLeft + Math.max(viewWidth, step)) / step);
  const start = Math.max(0, Math.min(count, first - overscan));
  const end = Math.max(start, Math.min(count, last + overscan));
  const ranges: Array<[number, number]> = [[start, end]];
  if (activeIndex >= 0 && activeIndex < count && (activeIndex < start || activeIndex >= end)) {
    ranges.push([activeIndex, activeIndex + 1]);
    ranges.sort((x, y) => x[0] - y[0]);
  }
  return ranges.filter(([s0, e0]) => e0 > s0);
}

export default function WindowedStrip<T>({ items, itemKey, renderItem, activeKey, className }: WindowedStripProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ left: 0, width: 0 });
  const [metrics, setMetrics] = useState({ step: FALLBACK_STEP, gap: FALLBACK_GAP });
  const frame = useRef<number | null>(null);
  const windowed = items.length >= STRIP_WINDOW_MIN;

  const readView = useCallback(() => {
    frame.current = null;
    const el = ref.current;
    if (!el) return;
    setView((prev) => (prev.left === el.scrollLeft && prev.width === el.clientWidth
      ? prev
      : { left: el.scrollLeft, width: el.clientWidth }));
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !windowed) return;
    const item = el.querySelector<HTMLElement>(':scope > :not(.strip-window-spacer)');
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
    const width = item?.getBoundingClientRect().width ?? 0;
    if (width > 0) {
      const next = { step: width + gap, gap };
      setMetrics((prev) => (prev.step === next.step && prev.gap === next.gap ? prev : next));
    }
    readView();
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !windowed) return undefined;
    const onScroll = (): void => {
      if (frame.current == null) frame.current = requestAnimationFrame(readView);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [windowed, readView]);

  const activeIndex = activeKey == null ? -1 : items.findIndex((item) => itemKey(item) === activeKey);
  const ranges = stripWindow(items.length, view.left, view.width, metrics.step, activeIndex);
  // A run of k skipped items is k widths and k-1 gaps; the flex gap around the
  // spacer supplies the rest, so every mounted item sits where it always did.
  const spacer = (count: number, key: string): ReactNode => (count > 0
    ? <div key={key} aria-hidden="true" className="strip-window-spacer" style={{ flex: `0 0 ${Math.max(0, count * metrics.step - metrics.gap)}px` }} />
    : null);

  const children: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    children.push(spacer(start - cursor, `gap-${cursor}`));
    for (const item of items.slice(start, end)) {
      children.push(<Fragment key={itemKey(item)}>{renderItem(item)}</Fragment>);
    }
    cursor = end;
  }
  children.push(spacer(items.length - cursor, `gap-${cursor}`));

  return (
    <div ref={ref} className={className} role="list">
      {children}
    </div>
  );
}

