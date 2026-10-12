/**
 * kbd5 — key hints that follow the user's keymap.
 *
 * A tooltip that says "(Ctrl+Shift+E)" is a promise about a rebindable command,
 * and a promise the app stopped keeping the moment the user rebound it. The
 * round-5 audit also found four that were wrong out of the box (the default had
 * moved and the string had not): the reader's translation toggle, the Immersion
 * bookmark, the perf HUD and the reader's "add to collection". Every such hint
 * now names its command and reads the live binding through here.
 */

import { useEffect, useState } from 'react';
import { effectiveKeys, formatKeysDisplay, onShortcutsChanged } from './keyboardShortcuts';
import { t } from './i18n';

/** The command's current keys, `Ctrl+K · Ctrl+P` style; '' when unbound. */
export function shortcutKeys(id: string): string {
  return formatKeysDisplay(effectiveKeys(id));
}

/** `label (keys)`, or the bare label when the command has no keys. */
export function withShortcut(label: string, id: string): string {
  const keys = shortcutKeys(id);
  return keys ? `${label} (${keys})` : label;
}

/** The keys, or the localized "no key set" phrase for use inside a sentence. */
export function keysOrUnset(id: string): string {
  return shortcutKeys(id) || t('kbd5.keys.unset');
}

/**
 * Re-render when any binding changes, so a hint on screen while the user
 * rebinds in Settings updates in place. Returns a counter to put in memo deps.
 */
export function useShortcutRevision(): number {
  const [rev, setRev] = useState(0);
  useEffect(() => onShortcutsChanged(() => setRev((n) => n + 1)), []);
  return rev;
}

/** The live keys of one command, for a component. */
export function useShortcutKeys(id: string): string {
  useShortcutRevision();
  return shortcutKeys(id);
}

/**
 * Notes in Settings > Shortcuts that name ANOTHER command's keys ("Ctrl+P opens
 * the same palette in search mode"). The note's `{keys}` placeholder is filled
 * with that command's live binding.
 */
export const NOTE_KEY_REFS: Readonly<Record<string, string>> = {
  'nav.palette': 'nav.search',
  'settings.focusSearch': 'toolbox.search',
  'window.showDesktop': 'window.restoreAll',
  'window.closeAll': 'nav.closeWindow',
  'window.zoomIn': 'reader.fontUp',
  'window.zoomOut': 'reader.fontDown',
  'reader.toggleTranslation': 'toolbox.reopenLastTool',
  'manga.zoomIn': 'reader.fontUp',
  'manga.zoomOut': 'reader.fontDown',
  'manga.zoomReset': 'reader.zoomReset',
  'dictionary.playPronunciation': 'toolbox.commandPalette',
  'immersion.focusUrl': 'toolbox.focusSidebar',
  'immersion.reload': 'toolbox.openRecent',
  'immersion.bookmark': 'reader.dictLookup',
  'perf.toggleOverlay': 'reader.saveToCollection',
};

/** Fill a note's `{keys}` with the referenced command's live binding. */
export function fillNoteKeys(id: string, note: string): string {
  const ref = NOTE_KEY_REFS[id];
  if (!ref || !note.includes('{keys}')) return note;
  return note.split('{keys}').join(keysOrUnset(ref));
}
