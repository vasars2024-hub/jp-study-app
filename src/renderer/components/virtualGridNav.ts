/**
 * Keyboard movement for `VirtualGrid`'s opt-in ARIA grid, as pure functions so the
 * arithmetic is testable without a layout engine.
 */

/** What a cell's controls are, for the grid's roving tabindex. */
export const CELL_FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([data-vgrid-cell])';

/**
 * The cell a key moves to from `from`, or `null` when the key is not a grid key.
 * Arrows move by one cell / one row (staying put at an edge), Home / End go to the row's
 * ends (the grid's ends with Ctrl), Page keys move by a screen of rows.
 */
export function gridKeyTarget(
  key: string,
  ctrl: boolean,
  from: number,
  count: number,
  columns: number,
  pageRows: number,
): number | null {
  const last = count - 1;
  const rowStart = from - (from % columns);
  switch (key) {
    case 'ArrowRight':
      return Math.min(last, from + 1);
    case 'ArrowLeft':
      return Math.max(0, from - 1);
    case 'ArrowDown':
      return from + columns <= last ? from + columns : from;
    case 'ArrowUp':
      return from - columns >= 0 ? from - columns : from;
    case 'Home':
      return ctrl ? 0 : rowStart;
    case 'End':
      return ctrl ? last : Math.min(last, rowStart + columns - 1);
    case 'PageDown':
      return Math.min(last, from + pageRows * columns);
    case 'PageUp':
      return Math.max(0, from - pageRows * columns);
    default:
      return null;
  }
}
