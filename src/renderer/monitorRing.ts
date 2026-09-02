/**
 * Which monitor is "the next one" (L11 bullet 4, clause 3).
 *
 * Extracted from `components/DesktopShell.tsx` 2026-09-01 for the same reason
 * `desktopLayoutFit.ts` was: it is pure data with no React and no DOM, but
 * living inside a 3,400-line shell that cannot be imported under vitest made it
 * untestable, and it had a defect that only a live machine with the wrong
 * monitors plugged in would ever show.
 *
 * THE DEFECT, measured on this machine 2026-09-01. `syncDesktopWindows` keeps an
 * assignment when its monitor is unplugged and only stops giving it a window
 * (`main/desktopWindows.ts:303`) — deliberately, so plugging the monitor back in
 * restores the arrangement. The ring, however, filtered on `enabled` alone. This
 * machine had three displays attached but EIGHT stored assignments, three of
 * them enabled, of which exactly one named an attached display. So "move window
 * to the next monitor" from the primary resolved to a `display|1920x1080|1` that
 * was not there; `deskwinFocusDesktop` answered `{ok:false}` for all three
 * enabled targets (while answering true for two desktops that really were on
 * screen), and the caller discarded that answer with `void` AFTER removing the
 * window from the desk. Observed end to end: the desk went from one window to
 * zero, no window opened, and nothing was said.
 *
 * `enabled` means "the user wants a shell there". `attached` means "there is a
 * monitor there". Moving a window needs both, and only the second one is a fact.
 */
import type { DisplayAssignment } from '../shared/desktop';

/**
 * The neighbouring display's key, or `null` when there is no neighbour.
 *
 * @param attached the display keys physically present, or `null` when that is
 *   not known yet. Never filter on unknown — a keypress in the first frame,
 *   before `displayList()` resolves, must not lose a real neighbour.
 */
export function neighbourDisplayKey(
  assignments: readonly DisplayAssignment[],
  attached: ReadonlySet<string> | null,
  myDisplayKey: string,
  dir: number,
): string | null {
  if (!myDisplayKey) return null;
  const keys = assignments
    .filter((a) => a.enabled && (!attached || attached.has(a.displayKey)))
    .map((a) => a.displayKey);
  // One monitor is not a ring. Returning null here is what makes the command a
  // no-op rather than a move to nowhere.
  if (keys.length < 2) return null;
  const here = keys.indexOf(myDisplayKey);
  if (here < 0) return null;
  // `dir` is a direction, not a distance: normalise so a stray detail of 3 does
  // not skip a monitor, and so a negative one still lands inside the array.
  const step = dir >= 0 ? 1 : -1;
  return keys[(here + step + keys.length) % keys.length];
}
