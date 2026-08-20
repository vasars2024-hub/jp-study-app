/**
 * Reading Lens region geometry — resizing an already-scanned rectangle.
 *
 * The lens frames the region it OCR'd, and OCR routinely clips the thing the
 * reader actually wanted: the last line of a subtitle, the right column of a
 * vertical panel, a ruby gloss sitting just outside the drag. Redrawing the
 * whole region for that is the wrong gesture — the fix is to move one edge.
 *
 * Kept here, pure, for the reason `readingLensLineOrder.ts` and
 * `readingLensCorrection.ts` are: the overlay's drag plumbing is untestable
 * without a live window, while the arithmetic that decides where an edge lands
 * is exactly what goes wrong, and is worth pinning down on its own.
 */

/** Compass handles: one per edge, one per corner. */
export const LENS_RESIZE_HANDLES = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'] as const;

export type LensResizeHandle = (typeof LENS_RESIZE_HANDLES)[number];

export interface LensRegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Matches `MIN_REGION` in the overlay and in `main/readingLens.ts`. */
export const LENS_MIN_REGION = 12;

export function isLensResizeHandle(value: unknown): value is LensResizeHandle {
  return typeof value === 'string' && (LENS_RESIZE_HANDLES as readonly string[]).includes(value);
}

/**
 * Clamp that keeps the *minimum-size* invariant when the two limits conflict.
 *
 * They conflict only for a region that already overflows the display — a stored
 * rectangle replayed onto a monitor that shrank, say. Given the choice between
 * a rectangle that pokes past the screen edge and one that has collapsed below
 * `MIN_REGION`, the first still OCRs (the capture crops) and the second is a
 * stray click by the overlay's own definition, so `lo` wins.
 */
function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Move the edges named by `handle` by (`dx`, `dy`) and return the new rect.
 *
 * Edges are moved independently and clamped independently, so a drag that
 * pushes one edge past the opposite one *stops* there rather than flipping the
 * rectangle inside out — dragging the bottom grip up past the top would
 * otherwise silently re-frame a different piece of the screen than the one
 * under the cursor. Results are integer DIP: the OCR capture crops to whole
 * pixels anyway, and a fractional rect makes the persisted `lastRegion`
 * compare unequal to itself on every replay.
 */
export function resizeLensRegion(
  region: LensRegionRect,
  handle: LensResizeHandle,
  dx: number,
  dy: number,
  bounds: { width: number; height: number },
  minSize: number = LENS_MIN_REGION,
): LensRegionRect {
  let left = region.x;
  let top = region.y;
  let right = region.x + region.width;
  let bottom = region.y + region.height;

  if (handle.includes('w')) left = clamp(left + dx, 0, right - minSize);
  if (handle.includes('e')) right = clamp(right + dx, left + minSize, bounds.width);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - minSize);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + minSize, bounds.height);

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
}

/**
 * Whether a resize actually changed the rectangle.
 *
 * A grip that is grabbed and released without travel, or one dragged into a
 * clamp it was already sitting against, must NOT trigger a rescan: the rescan
 * re-captures the screen, and re-OCRing the identical rectangle throws away the
 * reader's corrections and any open panel to arrive at the same text.
 */
export function lensRegionChanged(a: LensRegionRect, b: LensRegionRect): boolean {
  return a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height;
}
