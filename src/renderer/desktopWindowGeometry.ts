export interface DesktopRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Keep a newly cascaded window inside the desktop work area at its actual origin. */
export function fitNewWindowRect(
  requested: DesktopRect,
  desk: { w: number; h: number },
  minimum: { w: number; h: number },
): DesktopRect {
  const x = Math.min(Math.max(0, requested.x), Math.max(0, desk.w - minimum.w - 2));
  const y = Math.min(Math.max(0, requested.y), Math.max(0, desk.h - minimum.h - 2));
  return {
    x,
    y,
    w: Math.min(requested.w, Math.max(minimum.w, desk.w - x - 2)),
    h: Math.min(requested.h, Math.max(minimum.h, desk.h - y - 2)),
  };
}
