/**
 * Hide Gum / Show Gum (the `app.toggle` chord, the tray and `app:toggle`).
 *
 * Hide takes every visible window off the screen — the main window and what
 * floats over other apps: the live-captions bar, the desktop companions, a
 * pop-out, the Toolbox. Show used to bring back only the main window, so the
 * captions bar stayed hidden while its own state said "open" (it took two
 * toggles to get it back) and the desktop companions were gone until something
 * else woke them. Show now brings back what Hide took.
 *
 * Except the surfaces that dismiss themselves — the radial wheel, the notice
 * pill, the Reading Lens and the popup dictionary: they were answering one
 * gesture, and bringing them back later would show a stale answer.
 */
import type { BrowserWindow } from 'electron';

const TRANSIENT = /[?&](?:companion=(?:wheel|notice)|readingLens=1|sysDict=1|regionRecorder=select)(?:&|#|$)/;

/**
 * Never hidden: the Region Recorder's pill and region border say that the
 * screen is being recorded, and Hide must not make a running recording invisible.
 */
const RECORDING_INDICATORS = /[?&]regionRecorder=(?:panel|frame)(?:&|#|$)/;

let hiddenByToggle: BrowserWindow[] = [];

function urlMatches(win: BrowserWindow, pattern: RegExp): boolean {
  try {
    return pattern.test(win.webContents.getURL());
  } catch {
    return false;
  }
}

function isTransient(win: BrowserWindow): boolean {
  return urlMatches(win, TRANSIENT);
}

/** Hide every visible window, remembering which, for `restoreHiddenWindows`. */
export function hideAllWindows(windows: readonly BrowserWindow[]): void {
  hiddenByToggle = windows.filter((win) => !win.isDestroyed() && win.isVisible() && !urlMatches(win, RECORDING_INDICATORS));
  for (const win of hiddenByToggle) win.hide();
}

/**
 * Show again, without taking focus, what `hideAllWindows` hid — other than
 * `main`, which the caller shows and focuses itself.
 */
export function restoreHiddenWindows(main: BrowserWindow | null): void {
  const hidden = hiddenByToggle;
  hiddenByToggle = [];
  for (const win of hidden) {
    if (win === main || win.isDestroyed() || win.isVisible() || isTransient(win)) continue;
    win.showInactive();
  }
}
