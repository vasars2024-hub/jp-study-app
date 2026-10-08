/**
 * Which `desktopCapturer` screen source shows which display, and how a window
 * is made to cover exactly one display.
 *
 * Shared by the Reading Lens (`screenOcr.ts`, `readingLens.ts`) and the Region
 * Recorder (`regionRecorder.ts`). Deliberately free of any `electron` runtime
 * import: both rules are pure and are tested without a stubbed Electron.
 */

export interface ScreenSourceLike {
  display_id: string;
  thumbnail: { getSize: () => { width: number; height: number } };
}

export interface DisplayLike {
  id: number;
  bounds: { width: number; height: number };
}

/** Whether a source's thumbnail has the display's shape (it is letterboxed to it). */
function sameShape(source: ScreenSourceLike, display: DisplayLike): boolean {
  const { width, height } = source.thumbnail.getSize();
  if (!(width > 0 && height > 0 && display.bounds.width > 0 && display.bounds.height > 0)) return false;
  const a = width / height;
  const b = display.bounds.width / display.bounds.height;
  return Math.abs(a - b) / b < 0.02;
}

/**
 * Which `desktopCapturer` screen source shows `target`, or `null` when that
 * cannot be told.
 *
 * Which screen we grab has to be certain, not probable: a wrong pick OCRs (or
 * records) a different monitor and reports success, so the user gets pixels
 * that were never inside the box they drew. But "certain" is not the same as
 * "labelled". Electron fills `display_id` on Windows only when DXGI output
 * duplication works; where it is refused (hybrid-GPU laptops report access
 * denied) every source comes back with an empty id, and the old rule — refuse
 * unless there is exactly one screen — left capture unusable on any
 * two-monitor setup.
 *
 * So, in order, each step only where it cannot be wrong:
 *   1. the source whose `display_id` names the target;
 *   2. the one unlabelled source left when exactly one display is unclaimed;
 *   3. the only unlabelled source shaped like the target, when the target is
 *      the only unclaimed display of that shape (the thumbnail is letterboxed
 *      into the requested size, so it keeps the screen's aspect ratio);
 *   4. pairing by order — the capturer and `screen.getAllDisplays()` both walk
 *      the system's monitor list, which Electron itself relies on to label
 *      DXGI sources — but only when the counts agree and every pair has the
 *      same shape, so a mismatched order is caught rather than trusted.
 * Anything else is genuinely ambiguous and refuses.
 *
 * Steps 3 and 4 read the thumbnails' shape, so a caller must ask the capturer
 * for real (if small) thumbnails rather than 0×0 ones.
 */
export function pickScreenSource<S extends ScreenSourceLike>(
  sources: S[],
  displays: DisplayLike[],
  target: DisplayLike,
): S | null {
  const byId = sources.find((s) => s.display_id === String(target.id));
  if (byId) return byId;

  const known = new Set(displays.map((d) => String(d.id)));
  const claimed = new Set(sources.map((s) => s.display_id).filter((id) => known.has(id)));
  // A source labelled with another display is that display's, never ours.
  const unlabelled = sources.filter((s) => !known.has(s.display_id));
  const open = displays.filter((d) => !claimed.has(String(d.id)));
  if (!unlabelled.length || !open.some((d) => d.id === target.id)) return null;

  if (unlabelled.length === 1 && open.length === 1) return unlabelled[0];

  const shaped = unlabelled.filter((s) => sameShape(s, target));
  if (shaped.length === 1 && open.filter((d) => sameShape(shaped[0], d)).length === 1) {
    return shaped[0];
  }

  if (unlabelled.length === open.length && open.every((d, i) => sameShape(unlabelled[i], d))) {
    return unlabelled[open.findIndex((d) => d.id === target.id)] ?? null;
  }
  return null;
}

/**
 * Make a window cover exactly `bounds` (one display, in DIP).
 *
 * Electron on Windows sizes a window that lands on a monitor whose scale factor differs from
 * the one it was created or last shown on in the wrong DIPs. Measured on a 1280×720 @150%
 * primary with a 1920×1080 @100% second monitor: the overlay for the second monitor came up
 * 1280×720, so the right and bottom thirds of that screen could not be selected. Once the
 * window is on the target monitor, setting the same bounds again sticks.
 */
export function coverDisplay(
  win: { setBounds: (bounds: Electron.Rectangle) => void; getBounds: () => Electron.Rectangle },
  bounds: Electron.Rectangle,
): void {
  win.setBounds(bounds);
  const got = win.getBounds();
  if (got.x !== bounds.x || got.y !== bounds.y || got.width !== bounds.width || got.height !== bounds.height) {
    win.setBounds(bounds);
  }
}
