import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
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
