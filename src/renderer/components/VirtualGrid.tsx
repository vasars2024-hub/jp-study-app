import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useElementSize } from '../hooks';

// Same windowing idea as VirtualList, but for a responsive multi-column card
// grid (mirrors `grid-template-columns: repeat(auto-fill, minmax(minColWidth, 1fr))`).
// Items are chunked into fixed-height "rows" of `columns` cards; only the rows
// intersecting the viewport are rendered.

export interface VirtualGridProps<T> {
  items: T[];
  minColWidth: number;
  gap: number;
  /**
   * Fixed row height, or a function of the resolved column width. Aspect-ratio
   * cards (a 2:3 poster plus its caption) can only be sized once the responsive
   * column math has run, and that math lives in here — so they pass a callback
   * rather than duplicating the `columns` formula at every call site.
   */
  rowHeight: number | ((colWidth: number) => number);
  overscan?: number;
  className?: string;
  style?: React.CSSProperties;
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  emptyState?: ReactNode;
}

export default function VirtualGrid<T>({
  items,
  minColWidth,
  gap,
  rowHeight,
  overscan = 2,
  className,
  style,
  getKey,
  renderItem,
  emptyState,
}: VirtualGridProps<T>) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);

  const onScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(containerRef.current?.scrollTop ?? 0);
    });
  }, [containerRef]);

  const columns = Math.max(1, Math.floor((size.width + gap) / (minColWidth + gap)));
  // Mirrors the `repeat(columns, 1fr)` track below, so a callback row height sees
  // the same width the cards will actually render at. Falls back to minColWidth
  // until ResizeObserver reports a width, which keeps the first paint sane.
  const colWidth = size.width > 0
    ? Math.max(1, (size.width - gap * (columns - 1)) / columns)
    : minColWidth;
  const resolvedRowHeight = Math.max(
    1,
    typeof rowHeight === 'function' ? rowHeight(colWidth) : rowHeight,
  );
  const rowCount = Math.ceil(items.length / columns);
  const viewportH = size.height || 0;
  const startRow = Math.max(0, Math.floor(scrollTop / resolvedRowHeight) - overscan);
  // Until ResizeObserver reports a height, render every row so a collapsed
  // flex parent doesn't blank the grid (zero-height viewport → zero cards).
  const visibleRows =
    viewportH > 0 ? Math.ceil(viewportH / resolvedRowHeight) + overscan * 2 : Math.max(rowCount, 1);
  const endRow = Math.min(rowCount, startRow + visibleRows);
  const totalHeight = rowCount * resolvedRowHeight;

  const rows = useMemo(() => {
    const out: { row: number; slice: T[] }[] = [];
    for (let r = startRow; r < endRow; r++) {
      out.push({ row: r, slice: items.slice(r * columns, r * columns + columns) });
    }
    return out;
  }, [items, startRow, endRow, columns]);

  return (
    <div ref={containerRef} className={className} style={{ overflowY: 'auto', position: 'relative', ...style }} onScroll={onScroll}>
      {items.length === 0
        ? emptyState ?? null
        : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            {rows.map(({ row, slice }) => (
              <div
                key={row}
                style={{
                  position: 'absolute',
                  top: row * resolvedRowHeight,
                  left: 0,
                  right: 0,
                  height: resolvedRowHeight,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, 1fr)`,
                  gap,
                }}
              >
                {slice.map((item, i) => (
                  <div key={getKey(item, row * columns + i)}>{renderItem(item, row * columns + i)}</div>
                ))}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
