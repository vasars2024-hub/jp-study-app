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
  rowHeight: number;
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
  const rowCount = Math.ceil(items.length / columns);
  const viewportH = size.height || 0;
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleRows = Math.ceil(viewportH / rowHeight) + overscan * 2;
  const endRow = Math.min(rowCount, startRow + visibleRows);
  const totalHeight = rowCount * rowHeight;

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
                  top: row * rowHeight,
                  left: 0,
                  right: 0,
                  height: rowHeight,
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
