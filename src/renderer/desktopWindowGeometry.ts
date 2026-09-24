export interface DesktopRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The Files app's first-open size. Its scaffold goes `wide` (rail with names,
 * list, details side by side) at 1120px of content; 1180 leaves room for the
 * window frame and padding. At the generic 820x580 the toolbar alone overflowed.
 */
export const FILES_DEFAULT_SIZE = { w: 1180, h: 720 } as const;

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

/**
 * Which desktop sections own the maximized state — ONE predicate, consulted both
 * by the chrome that renders the control and by every route that sets the flag.
 *
 * Two sections refuse it, for the same reason stated two ways: they render no
 * control that could clear it. A sticky note's bar carries only the presentation
 * toggle and Delete, and ignores double-click; the garden (`city`) is frameless
 * and its cluster is pop-out / presentation / minimize / close. Entering the
 * state anyway is not a cosmetic mismatch — the shell suppresses window drag and
 * all three resize handles while maximized, so the window becomes unmovable and
 * unresizable with nothing on it to undo that.
 */
export function canMaximizeSection(section: string): boolean {
  return section !== 'note' && section !== 'city';
}

/**
 * The one definition of what "maximized" means geometrically.
 *
 * Three routes ask for it — the title-bar Maximize button, the `window.maximize`
 * shortcut and `nav.nextAppFullscreen` (F11) — and until 2026-09-03 only the
 * button applied a size. The other two set the flag and nothing else, which is
 * not a smaller maximize but a distinct broken state: the window keeps its old
 * rect while drag and the resize handles stop working. Measured live on a
 * 1264x821 desk before the fix, F11 left the player at 94,54 1080x700 with the
 * maximized class on it, against 0,0 1264x765 from the button on the same build.
 *
 * `min: false` belongs here because a maximized window is by definition shown.
 */
export function maximizedGeometry(deskW: number, deskH: number) {
  return { max: true, min: false, x: 0, y: 0, w: deskW, h: deskH };
}

/**
 * Remember pre-snap geometry once, so restore returns to the authored size
 * rather than to whatever half-screen the last snap left behind.
 */
export function restorePoint(win: DesktopRect & { rect?: DesktopRect }): { rect?: DesktopRect } {
  return win.rect ? {} : { rect: { x: win.x, y: win.y, w: win.w, h: win.h } };
}
