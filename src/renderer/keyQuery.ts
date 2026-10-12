// kbd6 — searching shortcuts by key, and where a command is heard, for the command
// palette and Settings > Shortcuts.
//
// "ctrl+k", "Ctrl K", "ctrl+shift+f", "F5", "ctrl+k s" and "alt+arrowleft" are keys;
// "reader", "save" and a lone "k" are words. A single key on its own counts only when
// it is a named key nobody types as a search word (F-keys, Escape, Tab, arrows,
// Page Up/Down). Kept out of keyboardShortcuts.ts on purpose: that module is on every
// window's boot path (Blanc's has a byte ceiling) and nothing here runs on a keypress.

import {
  commandHandlerInfo,
  KEY_SEQUENCE_MAX_STEPS,
  normalizeChord,
  scopeHasKeyboard,
  splitChords,
} from './keyboardShortcuts';

/** The steps of one alternative ("Ctrl+K S" → ["Ctrl+K", "S"]); a single chord is one step. */
export function keySequenceSteps(alt: string): string[] {
  return alt.split(' ').filter(Boolean);
}

/**
 * Where a command's keys would be heard right now, for the palette's scope chips:
 * - `here` — a view handler would take the key: an unscoped one, or a scoped one whose
 *   surface has the keyboard (`scopeHasKeyboard`);
 * - `anywhere` — a built-in (or a custom shortcut) answers wherever you are;
 * - `elsewhere` — a view registered it, but its surface does not have the keyboard;
 * - `inactive` — nothing would respond (its view is not open).
 * It reads focus, so a caller that moves focus (the palette's own input) snapshots it
 * first: once the palette has focus every scoped surface says no.
 */
export type CommandAvailability = 'here' | 'anywhere' | 'elsewhere' | 'inactive';

export function commandAvailability(id: string): CommandAvailability {
  const { scopes, builtin } = commandHandlerInfo(id);
  if (scopes.some((scope) => scope === undefined || scopeHasKeyboard(scope))) return 'here';
  if (builtin) return 'anywhere';
  return scopes.length ? 'elsewhere' : 'inactive';
}

const MODIFIERS: Record<string, string> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  ctl: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  opt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  win: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  super: 'Meta',
};

/** Named keys, by every spelling a person types, as `KeyboardEvent.key` spells them. */
const NAMED_KEYS: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  enter: 'Enter',
  return: 'Enter',
  space: 'Space',
  spacebar: 'Space',
  backspace: 'Backspace',
  del: 'Delete',
  delete: 'Delete',
  ins: 'Insert',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pgup: 'PageUp',
  pageup: 'PageUp',
  pgdn: 'PageDown',
  pagedown: 'PageDown',
  left: 'ArrowLeft',
  arrowleft: 'ArrowLeft',
  right: 'ArrowRight',
  arrowright: 'ArrowRight',
  up: 'ArrowUp',
  arrowup: 'ArrowUp',
  down: 'ArrowDown',
  arrowdown: 'ArrowDown',
  mouseleft: 'MouseLeft',
  mousemiddle: 'MouseMiddle',
  mouseright: 'MouseRight',
  mouse4: 'Mouse4',
  mouse5: 'Mouse5',
};

/** Named keys a query may give alone, with no modifier: none of them is a search word. */
const BARE_OK = new Set(['esc', 'escape', 'tab', 'backspace', 'pageup', 'pagedown', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown']);

/** A named key typed in any case or by alias ("f12" → F12, "pgup" → PageUp), else null. */
function namedKey(lower: string): string | null {
  if (/^f([1-9]|1\d|2[0-4])$/.test(lower)) return lower.toUpperCase();
  return NAMED_KEYS[lower] ?? null;
}

function keyToken(token: string): { key: string; bare: boolean } | null {
  const l = token.toLowerCase();
  const named = namedKey(l);
  if (named) return { key: named, bare: /^F\d/.test(named) || BARE_OK.has(l) };
  if (/^[a-z0-9]$/.test(l) || /^[`\-=[\]\\;',./]$/.test(token)) return { key: token.toUpperCase(), bare: false };
  return null;
}

/**
 * The chord (or sequence) a search query spells, normalized, or null when it reads as
 * words. The first step must carry a modifier or be a named key like F5, Escape or an
 * arrow; later steps may be bare ("ctrl+k s").
 */
export function keyQueryToChord(query: string): string | null {
  const tokens = query.trim().split(/[\s+]+/).filter(Boolean);
  const steps: string[] = [];
  let mods: string[] = [];
  let firstOk = false;
  for (const token of tokens) {
    const mod = MODIFIERS[token.toLowerCase()];
    if (mod) {
      mods.push(mod);
      continue;
    }
    const key = keyToken(token);
    if (!key) return null;
    if (!steps.length) firstOk = mods.length > 0 || key.bare;
    steps.push([...mods, key.key].join('+'));
    mods = [];
    if (steps.length > KEY_SEQUENCE_MAX_STEPS) return null;
  }
  if (mods.length || !steps.length || !firstOk) return null;
  return normalizeChord(steps.join(' ')) || null;
}

/**
 * True when `keys` (a `|` list) has an alternative that is `chordQuery`, or that starts
 * with it: "Ctrl+K" finds both Ctrl+K and the sequence "Ctrl+K S".
 */
export function keysMatchQuery(keys: string, chordQuery: string): boolean {
  const wanted = keySequenceSteps(chordQuery);
  if (!keys || !wanted.length) return false;
  return splitChords(keys).some((alt) => {
    const steps = keySequenceSteps(alt);
    return wanted.length <= steps.length && wanted.every((s, i) => steps[i] === s);
  });
}

/**
 * Keys typed by hand (Settings' "Type" field) with named keys put in the spelling a
 * keypress produces: "ctrl+shift+f12 esc" → "Ctrl+Shift+F12 Escape". Without this a
 * lower-case "f12" was stored as is and never matched the F12 key.
 */
export function normalizeTypedKeys(text: string): string {
  return normalizeChord(text.replace(/[A-Za-z][A-Za-z0-9]*/g, (w) => namedKey(w.toLowerCase()) ?? w));
}
