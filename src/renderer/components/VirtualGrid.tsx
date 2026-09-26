import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { CELL_FOCUSABLE, gridKeyTarget } from './virtualGridNav';

// Same windowing idea as VirtualList, but for a responsive multi-column card
// grid (mirrors `grid-template-columns: repeat(auto-fill, minmax(minColWidth, 1fr))`).
// Items are chunked into fixed-height "rows" of `columns` cards; only the rows
// intersecting the viewport are rendered.

export interface VirtualGridProps<T> {
  items: T[];
  minColWidth: number;
  /**
   * Widest a single card may usefully get. Opt-in, and it turns on the sparse-row
   * behaviour below; leaving it out keeps the plain `auto-fill` layout exactly as
   * it was.
   */
  maxColWidth?: number;
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
  /**
   * Opt-in ARIA grid: `role="grid"` with rows and gridcells, one Tab stop (a roving
   * tabindex over the cells' controls) and arrow / Home / End / Page keys between cells,
   * scrolling rows the window has not rendered yet into view. Omitted, nothing changes.
   */
  grid?: { label: string };
}


/**
 * How much to render while the viewport height is still unknown (or measured as
 * 0): about two screens. It used to be EVERY row, so a 1,400-title library painted
 * 1,400 cards before its first measurement and froze the main thread for seconds
 * on every open and every Back. Two screens still fill a collapsed flex parent
 * that grows to its content, which is what the old fallback was protecting.
 */
function fallbackViewportHeight(): number {
  const screen = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 800;
  return screen * 2;
}

/**
 * The container's box, read before paint. `useLayoutEffect` rather than an effect
 * so the first measured frame is the first painted one — no full-height flash, no
 * second render after the browser has already laid out the fallback.
 */
function useMeasuredBox<E extends HTMLElement>(): [React.RefObject<E | null>, { width: number; height: number }] {
  const ref = useRef<E | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const apply = (width: number, height: number): void => setSize((prev) => (
      prev.width === width && prev.height === height ? prev : { width, height }
    ));
    apply(el.clientWidth, el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) apply(box.width, box.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

interface RowProps<T> {
  row: number;
  slice: T[];
  top: number;
  height: number;
  columns: number;
  template: string;
  justify: string | undefined;
  gap: number;
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  asGrid: boolean;
}

/**
 * A row is unchanged when it shows the same items in the same place. The slice is
 * a fresh array whenever the window moves, so it is compared by element; `getKey`
 * is left out because callers commonly pass an inline arrow for a pure lookup.
 */
function sameRow<T>(a: RowProps<T>, b: RowProps<T>): boolean {
  if (a.row !== b.row || a.top !== b.top || a.height !== b.height || a.columns !== b.columns
    || a.template !== b.template || a.justify !== b.justify || a.gap !== b.gap || a.asGrid !== b.asGrid
    || a.renderItem !== b.renderItem || a.slice.length !== b.slice.length) return false;
  for (let i = 0; i < a.slice.length; i += 1) if (a.slice[i] !== b.slice[i]) return false;
  return true;
}

/**
 * One row, memoised: scrolling by a row re-renders the row that entered and the
 * one that left, not every card on screen.
 */
const GridRow = memo(function GridRow<T>({ row, slice, top, height, columns, template, justify, gap, getKey, renderItem, asGrid }: RowProps<T>) {
  return (
    <div
      role={asGrid ? 'row' : undefined}
      aria-rowindex={asGrid ? row + 1 : undefined}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height,
        // Placed by transform, not `top`, and contained: a row entering the
        // window is laid out and painted on its own, without invalidating the
        // rows around it (47 ms of layout per row added, measured on the Gum grid).
        transform: `translateY(${top}px)`,
        contain: 'layout paint',
        display: 'grid',
        gridTemplateColumns: template,
        justifyContent: justify,
        gap,
      }}
    >
      {slice.map((item, i) => (
        asGrid ? (
          <div
            key={getKey(item, row * columns + i)}
            role="gridcell"
            aria-colindex={i + 1}
            data-vgrid-cell={row * columns + i}
          >
            {renderItem(item, row * columns + i)}
          </div>
        ) : (
          <div key={getKey(item, row * columns + i)}>{renderItem(item, row * columns + i)}</div>
        )
      ))}
    </div>
  );
}, sameRow) as <T>(props: RowProps<T>) => ReactNode;

export default function VirtualGrid<T>({
  items,
  minColWidth,
  maxColWidth,
  gap,
  rowHeight,
  overscan = 2,
  className,
  style,
  getKey,
  renderItem,
  emptyState,
  grid,
}: VirtualGridProps<T>) {
  const [containerRef, size] = useMeasuredBox<HTMLDivElement>();
  /** The grid's one Tab stop (a cell index), and a cell waiting to be focused once rendered. */
  const [active, setActive] = useState(0);
  const focusPending = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);

  const onScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(containerRef.current?.scrollTop ?? 0);
    });
  }, [containerRef]);

  const autoFillColumns = Math.max(1, Math.floor((size.width + gap) / (minColWidth + gap)));
  // A view holding fewer items than there are tracks used to leave the surplus
  // tracks empty, so the media library's "Continue watching" — one title — painted
  // a 187px card against a 431x532 void at 1080x700: 22.1% of the viewport, against
  // the 15% bar in rubric category 4. With a declared `maxColWidth` the sparse row
  // drops the empty tracks instead, the cards grow into the space up to that cap,
  // and whatever the cap leaves over is split either side so the row reads as
  // centred rather than abandoned against the left edge. Without one, nothing here
  // changes — an uncapped single item would otherwise stretch to the full pane.
  const columns = maxColWidth != null && items.length > 0
    ? Math.max(1, Math.min(autoFillColumns, items.length))
    : autoFillColumns;
  // Mirrors the `repeat(columns, 1fr)` track below, so a callback row height sees
  // the same width the cards will actually render at. Falls back to minColWidth
  // until ResizeObserver reports a width, which keeps the first paint sane.
  const trackWidth = size.width > 0
    ? Math.max(1, (size.width - gap * (columns - 1)) / columns)
    : minColWidth;
  const capped = maxColWidth != null && trackWidth > maxColWidth;
  const colWidth = capped ? maxColWidth : trackWidth;
  const resolvedRowHeight = Math.max(
    1,
    typeof rowHeight === 'function' ? rowHeight(colWidth) : rowHeight,
  );
  const rowCount = Math.ceil(items.length / columns);
  // Until a height is measured, render about two screens of rows — bounded, so the
  // cost of a first paint does not grow with the library.
  const viewportH = size.height > 0 ? size.height : fallbackViewportHeight();
  const startRow = Math.max(0, Math.floor(scrollTop / resolvedRowHeight) - overscan);
  const visibleRows = Math.ceil(viewportH / resolvedRowHeight) + overscan * 2;
  const endRow = Math.min(rowCount, startRow + visibleRows);
  const totalHeight = rowCount * resolvedRowHeight;
  // `minmax(0, 1fr)`, not `1fr`: a `1fr` track is `minmax(auto, 1fr)` and floors at
  // the card's min-content, so the media library's grid still scrolled sideways
  // (129 > 100) in a pane narrower than one poster. The row height is fixed by the
  // caller either way, so a track that follows the pane is the only correct one here.
  const template = capped ? `repeat(${columns}, ${colWidth}px)` : `repeat(${columns}, minmax(0, 1fr))`;
  const justify = capped ? 'center' : undefined;

  const activeCell = Math.min(active, Math.max(0, items.length - 1));

  // Roving tabindex: only the active cell's controls are in the Tab order. Written to the
  // DOM (the cards' own markup is the caller's), after every render so recycled rows follow.
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!grid || !root) return;
    for (const cell of root.querySelectorAll<HTMLElement>('[data-vgrid-cell]')) {
      const tabIndex = Number(cell.dataset.vgridCell) === activeCell ? 0 : -1;
      for (const control of cell.querySelectorAll<HTMLElement>(CELL_FOCUSABLE)) control.tabIndex = tabIndex;
    }
    const pending = focusPending.current;
    if (pending === null) return;
    const target = root.querySelector<HTMLElement>(`[data-vgrid-cell="${pending}"]`)?.querySelector<HTMLElement>(CELL_FOCUSABLE);
    if (target) {
      focusPending.current = null;
      target.focus({ preventScroll: true });
    }
  });

  const onGridFocus = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-vgrid-cell]');
    if (cell) setActive(Number(cell.dataset.vgridCell));
  }, []);

  const pageRows = Math.max(1, Math.floor(viewportH / resolvedRowHeight));
  const onGridKey = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-vgrid-cell]');
    if (!cell || event.altKey || event.metaKey) return;
    const from = Number(cell.dataset.vgridCell);
    const to = gridKeyTarget(event.key, event.ctrlKey, from, items.length, columns, pageRows);
    if (to === null) return;
    event.preventDefault();
    if (to === from) return;
    setActive(to);
    focusPending.current = to;
    // Bring the target row inside the viewport; the window then renders it and the layout
    // effect above focuses it.
    const root = containerRef.current;
    if (!root) return;
    const top = Math.floor(to / columns) * resolvedRowHeight;
    const bottom = top + resolvedRowHeight;
    const view = root.clientHeight || viewportH;
    let next = root.scrollTop;
    if (top < next) next = top;
    else if (bottom > next + view) next = bottom - view;
    if (next !== root.scrollTop) {
      root.scrollTop = next;
      setScrollTop(next);
    }
  }, [items.length, columns, pageRows, resolvedRowHeight, viewportH, containerRef]);

  const rows = useMemo(() => {
    const out: { row: number; slice: T[] }[] = [];
    for (let r = startRow; r < endRow; r++) {
      out.push({ row: r, slice: items.slice(r * columns, r * columns + columns) });
    }
    return out;
  }, [items, startRow, endRow, columns]);

  // Strict containment makes the scroller a layout boundary: nothing inside it
  // can resize or re-lay out anything outside. Its size containment is only
  // safe when a parent gives the scroller its height (it is scrolling, so it is
  // shorter than its content); a grid that grows with its content keeps
  // layout+paint containment, which never changes its size.
  const constrained = size.height > 0 && size.height < totalHeight;
  const contain = constrained ? 'strict' : 'layout paint';

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ overflowY: 'auto', position: 'relative', contain, ...style }}
      onScroll={onScroll}
      data-contain={contain}
      role={grid && items.length ? 'grid' : undefined}
      aria-label={grid && items.length ? grid.label : undefined}
      aria-rowcount={grid && items.length ? rowCount : undefined}
      aria-colcount={grid && items.length ? columns : undefined}
      onKeyDown={grid ? onGridKey : undefined}
      onFocus={grid ? onGridFocus : undefined}
    >
      {items.length === 0
        ? emptyState ?? null
        : (
          <div style={{ height: totalHeight, position: 'relative' }} role={grid ? 'presentation' : undefined}>
            {rows.map(({ row, slice }) => (
              <GridRow
                key={row}
                row={row}
                slice={slice}
                top={row * resolvedRowHeight}
                height={resolvedRowHeight}
                columns={columns}
                template={template}
                justify={justify}
                gap={gap}
                getKey={getKey}
                renderItem={renderItem}
                asGrid={!!grid}
              />
            ))}
          </div>
        )}
    </div>
  );
}
