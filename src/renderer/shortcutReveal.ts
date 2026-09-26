import { openSectionSurface } from './sectionSurface';
import type { CommandCategory } from './keyboardShortcuts';

/**
 * "Change in Shortcuts" from anywhere: open Settings → Shortcuts with one
 * group (or one row) expanded and in view. System-wide chords are rebound
 * only there now, so the Lens and popup-dictionary pages, the tray and the
 * companion wheel all point at it instead of keeping hotkey fields of their own.
 */
export interface ShortcutRevealTarget {
  category?: CommandCategory;
  id?: string;
}

export const SHORTCUT_REVEAL_EVENT = 'shortcuts:reveal';

let pending: ShortcutRevealTarget | null = null;

/** Consumed by a Shortcuts page that mounts after the request (Settings was closed). */
export function takePendingShortcutReveal(): ShortcutRevealTarget | null {
  const out = pending;
  pending = null;
  return out;
}

export function revealShortcut(target: ShortcutRevealTarget): void {
  pending = target;
  openSectionSurface('settings');
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'shortcuts' } }));
    window.dispatchEvent(new CustomEvent(SHORTCUT_REVEAL_EVENT, { detail: target }));
  }, 80);
}
