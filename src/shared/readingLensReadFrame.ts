/**
 * Where the Reading Lens' Read sheet sits, and how big it is.
 *
 * Read is a DOM panel inside the lens window rather than a window of its own,
 * so nothing in the OS remembers its geometry for us: the frame is ours to
 * store, restore and — this is the part that bites — to keep on screen.
 *
 * This machine has two displays and the lens is stretched over whichever one
 * the capture came from, so a frame saved on a 2560-wide display is routinely
 * restored into a 1920-wide viewport. An unclamped restore would put the sheet
 * somewhere with no pixels and the reader would have no way to get it back, so
 * every entry point here goes through `clampReadFrame` and there is deliberately
 * no way to obtain an unclamped frame.
 */

export interface ReadFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReadViewport {
  width: number;
  height: number;
}

/**
 * The minimum is what keeps the sheet usable rather than merely visible: the
 * header's five typography controls and the close button have to stay on one
 * row, and at least one line of the passage has to remain legible under them.
 */
export const READ_FRAME_MIN_WIDTH = 360;
export const READ_FRAME_MIN_HEIGHT = 200;

/** The default sheet's inset from the viewport edge, and its preferred width. */
const DEFAULT_MARGIN = 24;
const DEFAULT_WIDTH = 760;

const round = (value: number): number => Math.round(value);

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The centred, near-full-height sheet a reader gets before they have moved it —
 * the geometry the CSS used to hardcode.
 */
export function defaultReadFrame(viewport: ReadViewport): ReadFrame {
  const width = Math.min(DEFAULT_WIDTH, Math.max(0, viewport.width - DEFAULT_MARGIN * 2));
  const height = Math.max(0, viewport.height - DEFAULT_MARGIN * 2);
  return clampReadFrame(
    { x: (viewport.width - width) / 2, y: DEFAULT_MARGIN, width, height },
    viewport,
  );
}

/**
 * Fit a frame inside the viewport, honouring the minimum size.
 *
 * Size is settled before position, because clamping x against a width that is
 * about to shrink leaves the sheet hanging off the right edge. A viewport
 * smaller than the minimum loses to the viewport — a sheet wider than the
 * screen is worse than a cramped one.
 */
export function clampReadFrame(frame: ReadFrame, viewport: ReadViewport): ReadFrame {
  const vw = Math.max(1, finite(viewport.width) ?? 1);
  const vh = Math.max(1, finite(viewport.height) ?? 1);
  const width = Math.min(Math.max(finite(frame.width) ?? READ_FRAME_MIN_WIDTH, READ_FRAME_MIN_WIDTH), vw);
  const height = Math.min(
    Math.max(finite(frame.height) ?? READ_FRAME_MIN_HEIGHT, READ_FRAME_MIN_HEIGHT),
    vh,
  );
  const x = Math.min(Math.max(finite(frame.x) ?? 0, 0), vw - width);
  const y = Math.min(Math.max(finite(frame.y) ?? 0, 0), vh - height);
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

/**
 * Read a stored frame back. Returns `null` — not a default — when there is
 * nothing usable stored, so a caller can tell "never moved it" from "moved it
 * somewhere that no longer exists"; the second still restores, clamped.
 */
export function parseReadFrame(raw: string | null | undefined, viewport: ReadViewport): ReadFrame | null {
  if (!raw) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!stored || typeof stored !== 'object') return null;
  const candidate = stored as Partial<ReadFrame>;
  if (
    finite(candidate.x) === null ||
    finite(candidate.y) === null ||
    finite(candidate.width) === null ||
    finite(candidate.height) === null
  ) {
    return null;
  }
  return clampReadFrame(candidate as ReadFrame, viewport);
}

/** Move a frame by a pointer delta, clamped — the drag gesture's whole model. */
export function moveReadFrame(
  origin: ReadFrame,
  dx: number,
  dy: number,
  viewport: ReadViewport,
): ReadFrame {
  return clampReadFrame({ ...origin, x: origin.x + dx, y: origin.y + dy }, viewport);
}

/** Which edges a resize grip drives. `''` in an axis means that axis is fixed. */
export type ReadResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const READ_RESIZE_HANDLES: readonly ReadResizeHandle[] = [
  'n',
  's',
  'e',
  'w',
  'ne',
  'nw',
  'se',
  'sw',
];

/**
 * Resize from one grip.
 *
 * A north or west grip moves the origin as well as the size, so the minimum has
 * to be enforced against the *opposite* edge — otherwise dragging the top edge
 * past the minimum walks the whole sheet down the screen instead of stopping.
 */
export function resizeReadFrame(
  origin: ReadFrame,
  handle: ReadResizeHandle,
  dx: number,
  dy: number,
  viewport: ReadViewport,
): ReadFrame {
  let { x, y, width, height } = origin;
  const right = origin.x + origin.width;
  const bottom = origin.y + origin.height;

  if (handle.includes('e')) width = origin.width + dx;
  if (handle.includes('w')) {
    x = Math.min(origin.x + dx, right - READ_FRAME_MIN_WIDTH);
    width = right - x;
  }
  if (handle.includes('s')) height = origin.height + dy;
  if (handle.includes('n')) {
    y = Math.min(origin.y + dy, bottom - READ_FRAME_MIN_HEIGHT);
    height = bottom - y;
  }
  return clampReadFrame({ x, y, width, height }, viewport);
}
