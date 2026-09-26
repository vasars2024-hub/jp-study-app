/**
 * The OS-wide half of Settings → Shortcuts.
 *
 * A command marked `global: true` in the Shortcuts catalog is registered with
 * Windows (Electron `globalShortcut`, i.e. RegisterHotKey) by ONE registry in
 * main (`src/main/globalCommands.ts`). Before it existed every module claimed
 * its own accelerator — the popup dictionary from `system-dictionary.json`,
 * the Reading Lens from `reading-lens.json`, Toolbox / hide-show / restart from
 * three separate IPC channels — so two of them could hold the same chord
 * without anything noticing, and the Lens and dictionary hotkeys could only be
 * changed on their own settings pages.
 *
 * This file is the pure part both processes share: the built-in defaults (main
 * needs them before the renderer has pushed anything), chord → Electron
 * accelerator translation, the conflict plan, and the one-time migration of
 * the chords users had set on the old per-module pages.
 */

/** Built-in OS-wide commands and their default chords ('' = unbound until the user binds it). */
export const GLOBAL_COMMAND_DEFAULTS: Readonly<Record<string, string>> = {
  // Companion — reach Gum from any app.
  'companion.wheel': 'Alt+Shift+Q',
  'companion.lookupSelection': 'Ctrl+Alt+J',
  'companion.lookupClipboard': '',
  'companion.cardPreview': '',
  'companion.mineLast': '',
  'lens.atCursor': 'Ctrl+Alt+Shift+J',
  'lens.region': 'Ctrl+Shift+Space',
  'lens.auto': '',
  'lens.repeat': '',
  'lens.clipboard': '',
  'vn.toggleCapture': '',
  'app.focus': '',
  'app.toggleMiniView': '',
  // Older global rows, now registered through the same registry.
  'app.toggle': 'Ctrl+Alt+Shift+G',
  'app.restart': 'Ctrl+Alt+Shift+R',
  'toolbox.open': 'Ctrl+Alt+B',
};

/**
 * The companion actions, in the order the tray menu and the Settings group
 * list them. Commands other features register (live captions …) are listed
 * after these by the registry in registration order.
 */
export const COMPANION_COMMAND_ORDER: readonly string[] = [
  'companion.wheel',
  'companion.lookupSelection',
  'lens.atCursor',
  'companion.lookupClipboard',
  'companion.cardPreview',
  'companion.mineLast',
  'lens.region',
  'lens.auto',
  'lens.repeat',
  'lens.clipboard',
  'vn.toggleCapture',
  'app.focus',
  'app.toggleMiniView',
];

/** Chords the old per-module settings pages started from; anything else there was the user's choice. */
export const LEGACY_GLOBAL_DEFAULTS: Readonly<Record<string, string>> = {
  'companion.lookupSelection': 'Ctrl+Alt+J',
  'lens.region': 'Ctrl+Shift+Space',
};

export type GlobalCommandError =
  /** The chord has no key Windows can register (a mouse button, an unknown key name). */
  | 'invalid'
  /** No Ctrl, Alt or Win — it would swallow ordinary typing in every app. */
  | 'needs-modifier'
  /** Windows refused it: another application already holds this chord. */
  | 'in-use'
  /** Another Gum command earlier in the list already holds this chord. */
  | 'duplicate'
  /** `globalShortcut.register` threw. */
  | 'failed';

export interface GlobalCommandStatus {
  id: string;
  /** The chord in the app's own format ("Ctrl+Alt+J"); '' = unbound. */
  chord: string;
  /** What was handed to Windows ("Ctrl+Alt+J"), or null when nothing is held. */
  accelerator: string | null;
  registered: boolean;
  /** False while the owning feature is switched off (e.g. the popup dictionary). */
  available: boolean;
  /** False until the owning module has registered its handler. */
  hasHandler: boolean;
  error?: GlobalCommandError;
  /** For `duplicate`: the command that holds the chord. */
  conflictWith?: string;
}

// ---------------------------------------------------------------------------
// Chords

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

/** Canonical "Ctrl+Alt+Shift+Meta+Key" for one alternative (mirrors the renderer's normalizeChord). */
export function normalizeGlobalChord(chord: string): string {
  const first = String(chord ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  return first
    .map((alt) => {
      const mods = new Set<string>();
      let key = '';
      for (const raw of alt.split('+').map((s) => s.trim()).filter(Boolean)) {
        const l = raw.toLowerCase();
        if (l === 'ctrl' || l === 'control' || l === 'cmdorctrl' || l === 'commandorcontrol') mods.add('Ctrl');
        else if (l === 'alt' || l === 'option') mods.add('Alt');
        else if (l === 'shift') mods.add('Shift');
        else if (l === 'meta' || l === 'win' || l === 'super' || l === 'cmd' || l === 'command') mods.add('Meta');
        else if (l === 'space') key = 'Space';
        else key = raw.length === 1 ? raw.toUpperCase() : raw;
      }
      if (!key) return '';
      return [...MOD_ORDER.filter((m) => mods.has(m)), key].join('+');
    })
    .filter(Boolean)
    .join('|');
}

const NAMED_KEYS: Record<string, string> = {
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  space: 'Space',
  tab: 'Tab',
  enter: 'Enter',
  return: 'Enter',
  escape: 'Esc',
  esc: 'Esc',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  printscreen: 'PrintScreen',
  plus: 'Plus',
};

const PUNCTUATION = new Set([',', '.', ';', "'", '[', ']', '/', '\\', '`', '=', '-']);

/**
 * The first keyboard alternative of a chord as an Electron accelerator.
 *
 * Only ONE alternative is registered system-wide (the rest keep working inside
 * the app): an OS hotkey is a scarce, visible claim on every other program, and
 * a row reading "Ctrl+Alt+J · Ctrl+Alt+K" should not quietly take two.
 */
export function chordToAccelerator(
  chord: string,
): { ok: true; accelerator: string } | { ok: false; error: GlobalCommandError } {
  const alternatives = normalizeGlobalChord(chord).split('|').filter(Boolean);
  if (!alternatives.length) return { ok: true, accelerator: '' };
  const keyboard = alternatives.find((alt) => !/Mouse(Left|Middle|Right|4|5)$/i.test(alt));
  if (!keyboard) return { ok: false, error: 'invalid' };
  const parts = keyboard.split('+');
  const key = parts.pop() ?? '';
  const mods = parts;
  let accelKey = '';
  if (/^[A-Z0-9]$/.test(key)) accelKey = key;
  else if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(key)) accelKey = key.toUpperCase();
  else if (PUNCTUATION.has(key)) accelKey = key;
  else if (key === '+') accelKey = 'Plus';
  else accelKey = NAMED_KEYS[key.toLowerCase()] ?? '';
  if (!accelKey) return { ok: false, error: 'invalid' };
  // Shift alone is not enough: Shift+A is a capital A in every text box on the machine.
  if (!mods.some((m) => m === 'Ctrl' || m === 'Alt' || m === 'Meta')) return { ok: false, error: 'needs-modifier' };
  const accelMods = mods.map((m) => (m === 'Meta' ? 'Super' : m));
  return { ok: true, accelerator: [...accelMods, accelKey].join('+') };
}

// ---------------------------------------------------------------------------
// Conflict plan

export interface GlobalRegistrationRequest {
  id: string;
  chord: string;
  /** Has a handler AND its feature is on. */
  active: boolean;
}

export interface GlobalRegistrationPlan {
  id: string;
  /** What to hold, or null. */
  accelerator: string | null;
  error?: GlobalCommandError;
  conflictWith?: string;
}

/**
 * Which command gets which accelerator. The first command (in the order given)
 * to ask for a chord keeps it; a later one gets `duplicate` naming the holder,
 * so Settings can say "also bound to …" instead of Windows silently handing the
 * key to whichever module booted first.
 */
export function planGlobalRegistrations(requests: readonly GlobalRegistrationRequest[]): GlobalRegistrationPlan[] {
  const holders = new Map<string, string>();
  return requests.map((req) => {
    if (!req.active) return { id: req.id, accelerator: null };
    const parsed = chordToAccelerator(req.chord);
    if (!parsed.ok) return { id: req.id, accelerator: null, error: parsed.error };
    if (!parsed.accelerator) return { id: req.id, accelerator: null };
    const key = parsed.accelerator.toLowerCase();
    const holder = holders.get(key);
    if (holder) return { id: req.id, accelerator: null, error: 'duplicate', conflictWith: holder };
    holders.set(key, req.id);
    return { id: req.id, accelerator: parsed.accelerator };
  });
}

// ---------------------------------------------------------------------------
// Migration from the per-module settings pages

type Overrides = Record<string, string | null>;

/**
 * Carry a chord the user set on the old Popup dictionary / Reading Lens pages
 * into the Shortcuts profiles, once.
 *
 * - A legacy chord equal to that page's own default was never a choice: nothing moves.
 * - A profile that already overrides the command keeps its override.
 * - Otherwise the legacy chord becomes the profile's override, so the key the
 *   user pressed yesterday is the key that works today.
 */
export function migrateLegacyGlobalChords(
  profiles: Record<string, Overrides>,
  legacy: Readonly<Record<string, string>>,
  defaults: Readonly<Record<string, string>> = GLOBAL_COMMAND_DEFAULTS,
): boolean {
  let changed = false;
  for (const [id, raw] of Object.entries(legacy)) {
    const chord = normalizeGlobalChord(raw);
    if (!chord) continue;
    const legacyDefault = normalizeGlobalChord(LEGACY_GLOBAL_DEFAULTS[id] ?? '');
    if (chord === legacyDefault) continue;
    if (chord === normalizeGlobalChord(defaults[id] ?? '')) continue;
    for (const prof of Object.values(profiles)) {
      if (!prof || typeof prof !== 'object') continue;
      if (id in prof) continue;
      prof[id] = chord;
      changed = true;
    }
  }
  return changed;
}
