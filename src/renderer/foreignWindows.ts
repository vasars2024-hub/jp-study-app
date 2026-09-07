/**
 * The "windows from every desktop" taskbar list, as a pure selection.
 *
 * Lifted out of `DesktopShell.tsx` for the same reason `desktopLayoutFit.ts`
 * was: the shell cannot be imported under vitest, so anything left inside it is
 * only ever testable by mounting a live app. The selection rules below are
 * exactly the ones that were inline, and they now have tests that can fail.
 *
 * The rules, and why each one is a rule rather than an accident:
 *
 * - **Opt-in only.** An empty list when `showAllWindows` is off, so the default
 *   taskbar costs nothing and shows only what lives here.
 * - **Never the active desktop.** Those windows are already in the taskbar's own
 *   list; including them would double every entry on this monitor.
 * - **Minimised windows are skipped.** A minimised window on *another* monitor
 *   has no visible presence to raise, and listing it would offer a click that
 *   lands on nothing the user can see.
 * - **The desktop name travels with the entry**, because the badge names the
 *   desktop and resolving it later — after a rename — would caption a window
 *   with a desktop it is no longer on.
 */
import type { DesktopIndex, WindowSnapshot } from '../shared/desktop';

export interface ForeignWindowEntry {
  win: WindowSnapshot;
  desktopIndex: DesktopIndex;
  desktopName: string;
}

export interface ForeignWindowSources {
  /** The `showAllWindows` flag from this display's assignment. */
  showAllWindows: boolean;
  /** The desktop this shell is currently showing. */
  activeDesktop: DesktopIndex;
  desktopCount: number;
  windowsOn: (index: DesktopIndex) => readonly WindowSnapshot[];
  nameOf: (index: DesktopIndex) => string;
}

/**
 * Windows living on desktops other than this shell's own.
 *
 * Takes its layout through accessors rather than reading the module store
 * directly. That is the point of the extraction and not merely a testing
 * convenience: the caller is a `useMemo`, and a memo that reaches into a store
 * React cannot observe goes stale in a way nothing reports. Passing the reads in
 * forces the caller to name what it depends on.
 */
export function collectForeignWindows(sources: ForeignWindowSources): ForeignWindowEntry[] {
  if (!sources.showAllWindows) return [];
  const out: ForeignWindowEntry[] = [];
  for (let index = 0; index < sources.desktopCount; index += 1) {
    if (index === sources.activeDesktop) continue;
    for (const win of sources.windowsOn(index)) {
      if (!win.visible) continue;
      out.push({ win, desktopIndex: index, desktopName: sources.nameOf(index) });
    }
  }
  return out;
}

export interface SwitchableDesktopSources {
  /** How many desktops the layout store actually holds. */
  desktopCount: number;
  /** The desktop this shell is currently showing. */
  activeDesktop: DesktopIndex;
  windowsOn: (index: DesktopIndex) => readonly WindowSnapshot[];
}

/**
 * Which desktops the taskbar switcher must offer a button for.
 *
 * The switcher used to be two hardcoded buttons, indices 0 and 1, and the
 * keyboard shortcut flipped between the same pair — while the layout store
 * grows a desktop per display assignment and one more for every taskbar
 * tear-off, up to `MAX_DESKTOPS`. Measured on the user's own machine: eight
 * desktops, two switches, and two maximized Scraper windows sitting on desktops
 * 3 and 5 with no route back to either (D149).
 *
 * The rules, and why each is a rule:
 *
 * - **0 and 1 always.** They are the two the shell has always shown and the two
 *   the seed layout creates; dropping one when it happens to be empty would
 *   make the taskbar's shape depend on what is open.
 * - **The active desktop always**, even if empty — a shell must be able to show
 *   which desktop it is on.
 * - **Any other desktop that holds a visible window.** That is the whole point:
 *   a desktop with something on it is somewhere the user can need to get to. A
 *   minimised-only desktop is skipped for the same reason the foreign-window
 *   list skips minimised windows — there is nothing to raise.
 * - **Empty extra desktops are omitted**, so a machine that has assigned six
 *   displays does not grow six dead buttons.
 * - **Ascending, deduplicated**, so the row is stable across renders.
 */
export function switchableDesktopIndexes(sources: SwitchableDesktopSources): DesktopIndex[] {
  const out = new Set<number>([0, 1, sources.activeDesktop]);
  for (let index = 0; index < sources.desktopCount; index += 1) {
    if (sources.windowsOn(index).some((win) => win.visible)) out.add(index);
  }
  return [...out]
    .filter((index) => index >= 0 && index < Math.max(2, sources.desktopCount))
    .sort((a, b) => a - b) as DesktopIndex[];
}
