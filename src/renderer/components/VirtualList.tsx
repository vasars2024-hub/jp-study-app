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
  /**
   * Keep list semantics through the window. Set both together.
   *
   * Windowing is invisible to sighted users and catastrophic to a screen reader
   * unless it is declared: with `<ul>/<li>` replaced by slot `div`s, a list of
   * 883 announces as no list at all, and even with `role="listitem"` restored it
   * announces "3 of 20" — the DOM count — rather than the real size. So each
   * slot carries `aria-setsize` (the FULL `items.length`, never the rendered
   * count) and its true 1-based `aria-posinset`, and the two structural wrappers
   * between container and slot are marked `presentation` so the list still owns
   * its items.
   */
  listRole?: 'list' | 'group';
  itemRole?: 'listitem';
  /**
   * Keep TABLE/GRID semantics through the window, for a caller whose
   * `renderItem` already returns its own `role="row"`.
   *
   * This is not `listRole` under another name and the difference is the reason
   * it exists. A `row` must be OWNED by a `table`, `grid`, `treegrid` or
   * `rowgroup`; every scraper table in this app puts four generic `div`s between
   * the two — its own `.scr-tbody`, this component's scroll container, and the
   * spacer and offset boxes below — so every row was orphaned and the table
   * exposed no rows at all. Setting this marks the container a `rowgroup` and
   * every box under it `presentation`, which re-parents the caller's rows onto
   * it without the caller changing a line of `renderItem`.
   *
   * The row's OWN slot is `presentation` too, unlike the `listitem` path: the
   * row role is the caller's, so a role here would nest a row inside a row.
   * The count a screen reader announces therefore cannot come from this
   * component — it is `aria-rowcount` on the caller's table plus
   * `aria-rowindex` on each row, both of which the caller renders. Without
   * them a 4,000-row table windowed to 20 announces twenty rows.
   */
  gridRole?: 'rowgroup';
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
  listRole,
  itemRole,
  gridRole,
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

  // The spacer and the offset box exist for geometry only. Once the collection
  // has declared a role — list or rowgroup — they have to be invisible to the
  // accessibility tree, or they sit between the collection and its items and
  // break the ownership the role just promised.
  const structural = listRole || gridRole ? ('presentation' as const) : undefined;

  return (
    <div ref={containerRef} className={className} style={{ overflowY: 'auto', position: 'relative', ...style }} onScroll={onScroll} role={listRole ?? gridRole}>
      {total === 0
        ? emptyState ?? null
        : (
          <div style={{ height: totalHeight, position: 'relative' }} role={structural}>
            <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }} role={structural}>
              {visible.map((item, i) => (
                <div
                  key={getKey(item, startIdx + i)}
                  style={{ height: itemHeight }}
                  role={itemRole ?? structural}
                  aria-setsize={itemRole ? total : undefined}
                  aria-posinset={itemRole ? startIdx + i + 1 : undefined}
                >
                  {renderItem(item, startIdx + i)}
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
