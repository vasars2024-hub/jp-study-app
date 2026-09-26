/**
 * Window geometry that holds on mixed-scale Windows setups.
 *
 * Two measured defects, one cause — Electron on Windows converts between DIP and
 * physical pixels with the wrong display's scale factor when a window lands on, or
 * is resized across, a monitor whose scale differs from the one it was created on:
 *
 *  - A desktop window created for a 1920x1080 @100% second monitor next to a
 *    1280x720 @150% primary came up 853x480 (the requested size divided by 1.5).
 *    Setting the same bounds again once the window is on the target monitor sticks
 *    — the pattern the Reading Lens uses (`readingLens.ts coverDisplay`).
 *  - The frameless main window (`thickFrame: false`) grew to 65,535 px tall when it
 *    was resized or moved, with its 940-DIP minimum wider than that 853-DIP screen.
 *
 * `applyBoundsVerified` is the first fix; `guardWindowToWorkArea` is the second: it
 * keeps a window's size inside the work area of the display it is on, and keeps its
 * minimum size no larger than that work area.
 */
import { screen, type BrowserWindow } from 'electron';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * The smallest main window the shell lays out without clipping: the taskbar, a
 * Start menu (`min(620px, 100vw - 32px)`) and a floating app window all fit, and at
 * the default 80% interface zoom this is a 1000x625 CSS-px viewport. It is also
 * below the 853x480 DIP of a 1280x720 @150% laptop screen, which the old 940x600
 * minimum could not fit on at all.
 */
export const MAIN_WINDOW_MIN_SIZE: Readonly<Size> = { width: 800, height: 500 };

export function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Set `rect`, read it back, and set it again when the window did not land there.
 * Returns true when the second set was needed.
 */
export function applyBoundsVerified(
  win: Pick<BrowserWindow, 'setBounds' | 'getBounds'>,
  rect: Rect,
): boolean {
  win.setBounds(rect);
  if (sameRect(win.getBounds(), rect)) return false;
  win.setBounds(rect);
  return true;
}

/** A minimum size that never exceeds the work area it has to fit in. */
export function minimumSizeFor(desired: Size, workArea: Rect): Size {
  return {
    width: Math.max(1, Math.min(desired.width, workArea.width)),
    height: Math.max(1, Math.min(desired.height, workArea.height)),
  };
}

/**
 * `rect` with its size capped to `workArea`. Position is left alone unless the size
 * had to shrink — a window dragged half off a monitor, or across to the next one,
 * is the user's choice — and then it is pulled fully inside, so the corrected
 * window is visible rather than a work-area-sized rectangle hanging off the edge.
 */
export function fitRectToWorkArea(rect: Rect, workArea: Rect): Rect {
  const width = Math.min(rect.width, workArea.width);
  const height = Math.min(rect.height, workArea.height);
  if (width === rect.width && height === rect.height) return rect;
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;
  return {
    x: Math.min(Math.max(rect.x, workArea.x), maxX),
    y: Math.min(Math.max(rect.y, workArea.y), maxY),
    width,
    height,
  };
}

function exceeds(rect: Rect, workArea: Rect): boolean {
  return rect.width > workArea.width || rect.height > workArea.height;
}

/** Minimum size for a window about to open at `bounds` (or on the primary display). */
export function minimumSizeAt(desired: Size, bounds?: Partial<Rect>): { minWidth: number; minHeight: number } {
  let workArea: Rect;
  try {
    workArea =
      bounds && typeof bounds.x === 'number' && typeof bounds.y === 'number'
        ? screen.getDisplayMatching({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width ?? desired.width,
            height: bounds.height ?? desired.height,
          }).workArea
        : screen.getPrimaryDisplay().workArea;
  } catch {
    return { minWidth: desired.width, minHeight: desired.height };
  }
  const min = minimumSizeFor(desired, workArea);
  return { minWidth: min.width, minHeight: min.height };
}

type GuardedWindow = Pick<
  BrowserWindow,
  | 'on'
  | 'removeListener'
  | 'getBounds'
  | 'setBounds'
  | 'setMinimumSize'
  | 'getMinimumSize'
  | 'isDestroyed'
  | 'isMaximized'
  | 'isMinimized'
  | 'isFullScreen'
>;

/**
 * Keep `win` inside the work area of the display it is on.
 *
 * - `will-resize` / `will-move` (user-driven only): a proposed size larger than
 *   the work area is refused.
 * - `resize` / `move` (after the fact, programmatic or DPI-driven too): a size that
 *   got through anyway is corrected with `applyBoundsVerified`.
 * - The minimum size follows the display: never larger than its work area.
 *
 * Maximized, minimized and full-screen windows are left alone — their geometry is
 * the OS's. Feedback loops are cut two ways: a correction's own events are ignored
 * while it runs, and a rectangle that a correction already failed to fix is not
 * retried (the next differing rectangle is).
 */
export function guardWindowToWorkArea(win: GuardedWindow, desiredMin: Size = MAIN_WINDOW_MIN_SIZE): () => void {
  let correcting = false;
  let lastFailed: Rect | null = null;

  const workAreaFor = (rect: Rect): Rect => screen.getDisplayMatching(rect).workArea;
  const leaveAlone = (): boolean =>
    win.isDestroyed() || win.isMaximized() || win.isMinimized() || win.isFullScreen();

  const syncMinimum = (workArea: Rect): void => {
    const next = minimumSizeFor(desiredMin, workArea);
    const [w, h] = win.getMinimumSize();
    if (w !== next.width || h !== next.height) win.setMinimumSize(next.width, next.height);
  };

  const correct = (): void => {
    if (correcting || win.isDestroyed()) return;
    const rect = win.getBounds();
    const workArea = workAreaFor(rect);
    syncMinimum(workArea);
    if (leaveAlone()) return;
    const target = fitRectToWorkArea(rect, workArea);
    if (sameRect(target, rect)) {
      lastFailed = null;
      return;
    }
    if (lastFailed && sameRect(lastFailed, rect)) return;
    correcting = true;
    try {
      applyBoundsVerified(win, target);
    } finally {
      correcting = false;
    }
    const landed = win.getBounds();
    lastFailed = sameRect(landed, target) ? null : landed;
  };

  const refuseOversize = (event: Electron.Event, next: Rect): void => {
    if (correcting || leaveAlone()) return;
    if (exceeds(next, workAreaFor(next))) event.preventDefault();
  };

  const onWillResize = (event: Electron.Event, next: Rect): void => refuseOversize(event, next);
  const onWillMove = (event: Electron.Event, next: Rect): void => refuseOversize(event, next);
  const onDisplayMetrics = (): void => {
    // `recreateMainWindow` strips 'closed' listeners before closing, so the
    // 'closed' unsubscribe below is not guaranteed to run.
    if (win.isDestroyed()) screen.removeListener('display-metrics-changed', onDisplayMetrics);
    else correct();
  };

  win.on('will-resize', onWillResize);
  win.on('will-move', onWillMove);
  win.on('resize', correct);
  win.on('move', correct);
  screen.on('display-metrics-changed', onDisplayMetrics);

  const dispose = (): void => {
    screen.removeListener('display-metrics-changed', onDisplayMetrics);
    if (win.isDestroyed()) return;
    win.removeListener('will-resize', onWillResize);
    win.removeListener('will-move', onWillMove);
    win.removeListener('resize', correct);
    win.removeListener('move', correct);
  };
  win.on('closed', () => screen.removeListener('display-metrics-changed', onDisplayMetrics));

  // A restored or default size can already be larger than a small screen.
  correct();
  return dispose;
}
