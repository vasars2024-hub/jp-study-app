import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useElementSize } from '../hooks';

// Fixed-row-height windowed list. However large `items` gets, only the rows
// that actually fit in the viewport (plus a small overscan margin) ever exist
// in the DOM — scrolling, and dragging the window that contains it, stays
// cheap regardless of collection size. No external dependency: this is a
// small, purpose-built replacement for a library like react-window.

export interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  className?: string;
  style?: React.CSSProperties;
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  emptyState?: ReactNode;
  /**
   * Bring this row into view when it changes — the minimum scroll that does it,
   * so a keyboard cursor walking the list does not jump the viewport around.
   *
   * A windowed list cannot be keyboard-navigated without this: the row the
   * cursor moves to may not be in the DOM at all, so it can neither be focused
   * nor referenced by `aria-activedescendant`.
   */
  scrollToIndex?: number;
}

export default function VirtualList<T>({
  items,
  itemHeight,
  overscan = 6,
  className,
  style,
  getKey,
  renderItem,
  emptyState,
  scrollToIndex,
}: VirtualListProps<T>) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Coalesce scroll events into at most one state update per animation frame,
  // always reading the LATEST scrollTop when the frame runs (not the value at
  // the moment the frame was requested) — near-zero rendering cost even
  // during a fast fling or while the containing window is being dragged.
  const onScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(containerRef.current?.scrollTop ?? 0);
    });
  }, [containerRef]);

  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0) return;
    const el = containerRef.current;
    if (!el) return;
    const top = scrollToIndex * itemHeight;
    const bottom = top + itemHeight;
    // Only move if the row is actually outside the viewport, and only as far as
    // it takes: re-centring on every arrow press makes the list feel unmoored.
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, [scrollToIndex, itemHeight, containerRef]);

  const total = items.length;
  const viewportH = size.height || 0;
  const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(viewportH / itemHeight) + overscan * 2;
  const endIdx = Math.min(total, startIdx + visibleCount);
  const offsetY = startIdx * itemHeight;
  const totalHeight = total * itemHeight;

  const visible = useMemo(() => items.slice(startIdx, endIdx), [items, startIdx, endIdx]);

  return (
    <div ref={containerRef} className={className} style={{ overflowY: 'auto', position: 'relative', ...style }} onScroll={onScroll}>
      {total === 0
        ? emptyState ?? null
        : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
              {visible.map((item, i) => (
                <div key={getKey(item, startIdx + i)} style={{ height: itemHeight }}>
                  {renderItem(item, startIdx + i)}
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
