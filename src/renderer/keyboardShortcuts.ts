// Centralized, user-configurable shortcut manager.
//
// Every shortcut is a Command in COMMAND_CATALOG (plus optional Custom commands).
// Views attach behavior with registerCommandHandler(id, fn). Users rebind in
// Settings → Shortcuts: multi-key chords (Ctrl/Alt/Shift/Meta), mouse buttons,
// alternatives (Space|Enter), profiles, import/export. One global keydown +
// mousedown listener dispatches everything.

import { toggleWordHighlight } from './readerSettings';
import { next as musicNext, prev as musicPrev, toggle as musicToggle, setVolume, getState } from './playerBus';
import { performUndo, canUndo, peekUndo } from './actionHistory';

export type CommandCategory =
  | 'Navigation'
  | 'Reader'
  | 'Manga'
  | 'Dictionary'
  | 'Flashcards'
  | 'Immersion'
  | 'Music'
  | 'Utility'
  | 'Custom';

export interface AppCommand {
  /** Stable id, e.g. "reader.copySentence". */
  id: string;
  label: string;
  category: CommandCategory;
  /**
   * Default chord(s). Use `|` for alternatives that all trigger the same command
   * (e.g. "Space|Enter"). "" = unbound by default.
   */
  defaultKeys: string;
  /** Note shown in the settings UI. */
  note?: string;
  /** When true, command was created by the user (not in the built-in catalog). */
  custom?: boolean;
}

/** What a custom shortcut does when fired. */
export type CustomAction =
  | { type: 'openApp'; appId: string }
  | { type: 'runCommand'; commandId: string }
  /** Run several built-in / custom commands in order (stacked macro). */
  | { type: 'runCommands'; commandIds: string[] }
  | { type: 'dispatch'; event: string; detail?: string };

export interface CustomCommandDef {
  id: string;
  label: string;
  defaultKeys: string;
  action: CustomAction;
}

// ---------------------------------------------------------------------------
// Built-in catalog — ids are the contract; views register handlers against them.
// ---------------------------------------------------------------------------
export const COMMAND_CATALOG: AppCommand[] = [
  // Navigation
  { id: 'nav.palette', label: 'Open command palette', category: 'Navigation', defaultKeys: 'Ctrl+Space' },
  { id: 'nav.search', label: 'Global search', category: 'Navigation', defaultKeys: 'Ctrl+P' },
  { id: 'nav.settings', label: 'Open settings', category: 'Navigation', defaultKeys: 'Ctrl+,' },
  { id: 'nav.home', label: 'Return home (close reader)', category: 'Navigation', defaultKeys: 'Ctrl+H' },
  { id: 'nav.closeWindow', label: 'Close window', category: 'Navigation', defaultKeys: 'Ctrl+W' },
  { id: 'nav.nextWindow', label: 'Next window', category: 'Navigation', defaultKeys: 'Ctrl+Tab' },
  { id: 'nav.prevWindow', label: 'Previous window', category: 'Navigation', defaultKeys: 'Ctrl+Shift+Tab' },
  {
    id: 'nav.nextAppFullscreen',
    label: 'Next app (full screen)',
    category: 'Navigation',
    defaultKeys: 'F11',
    note: 'Cycles through open apps and switches to full screen.',
  },
  {
    id: 'nav.nextDesktop',
    label: 'Switch to next desktop',
    category: 'Navigation',
    defaultKeys: 'Meta+Ctrl+ArrowRight',
    note: 'Cycles Desktop 1 → Desktop 2. Saves the current layout before switching.',
  },
  {
    id: 'nav.prevDesktop',
    label: 'Switch to previous desktop',
    category: 'Navigation',
    defaultKeys: 'Meta+Ctrl+ArrowLeft',
    note: 'Cycles Desktop 2 → Desktop 1. Saves the current layout before switching.',
  },
  {
    id: 'nav.undo',
    label: 'Undo last action',
    category: 'Navigation',
    defaultKeys: 'Ctrl+Shift+Z',
    note:
      'Reverses the last recorded action (e.g. reopening a closed desktop window, removing a just-added Anki note). Not a full text-editor undo.',
  },
  { id: 'nav.widgets', label: 'Open widget gallery', category: 'Navigation', defaultKeys: '' },
  {
    id: 'settings.focusSearch',
    label: 'Focus settings search',
    category: 'Utility',
    defaultKeys: 'Ctrl+F',
    note: 'Works while the Settings window is open.',
  },
  { id: 'nav.open.dictionary', label: 'Open Dictionary', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.library', label: 'Open Library', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.novels', label: 'Open Novels', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.flashcards', label: 'Open Flashcards', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.grammar', label: 'Open Grammar', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.translate', label: 'Open Translate', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.music', label: 'Open Music', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.player', label: 'Open Media player', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.immersion', label: 'Open Immersion', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.anki', label: 'Open Anki', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.stats', label: 'Open Statistics', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.calendar', label: 'Open Calendar', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.resources', label: 'Open Resources', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.city', label: 'Open Noctis', category: 'Navigation', defaultKeys: '' },

  // Reader (handlers attach while a book is open)
  {
    id: 'reader.highlightWord',
    label: 'Highlight current word',
    category: 'Reader',
    defaultKeys: 'H',
    note: 'Personal color mark (annotations) — independent of New/Learning/Known vocabulary levels.',
  },
  {
    id: 'reader.toggleWordHighlight',
    label: 'Toggle vocabulary highlighting',
    category: 'Reader',
    defaultKeys: 'Ctrl+Alt+H',
    note: 'LingQ-style New/Learning/Familiar/Known colors.',
  },
  { id: 'reader.dictLookup', label: 'Dictionary lookup (selection)', category: 'Reader', defaultKeys: 'Ctrl+D' },
  { id: 'reader.translateSel', label: 'Translate selection', category: 'Reader', defaultKeys: 'Ctrl+T' },
  { id: 'reader.fontUp', label: 'Increase font size', category: 'Reader', defaultKeys: 'Ctrl+=' },
  { id: 'reader.fontDown', label: 'Decrease font size', category: 'Reader', defaultKeys: 'Ctrl+-' },
  { id: 'reader.zoomReset', label: 'Reset font size', category: 'Reader', defaultKeys: 'Ctrl+0' },
  { id: 'reader.highlightSentence', label: 'Highlight current sentence', category: 'Reader', defaultKeys: 'Ctrl+Shift+S' },
  { id: 'reader.copySentence', label: 'Copy current sentence', category: 'Reader', defaultKeys: 'Ctrl+Shift+C' },
  { id: 'reader.copyWord', label: 'Copy current word', category: 'Reader', defaultKeys: 'Ctrl+Shift+W' },
  { id: 'reader.saveToCollection', label: 'Save selection as flashcard', category: 'Reader', defaultKeys: 'Ctrl+Shift+F' },
  {
    id: 'reader.selectSentence',
    label: 'Select sentence at click',
    category: 'Reader',
    defaultKeys: 'Alt+MouseLeft',
    note:
      'Hold the chord and click a word to select the full sentence (ends at 。！？ etc., not commas). ' +
      'Does not open the dictionary popup. Rebind freely — mouse buttons and modifiers supported.',
  },
  {
    id: 'reader.pageNext',
    label: 'Next page / scroll forward',
    category: 'Reader',
    defaultKeys: 'Space|PageDown|ArrowDown',
    note: 'Active in novel / EPUB readers. Arrow direction may follow vertical layout.',
  },
  {
    id: 'reader.pagePrev',
    label: 'Previous page / scroll back',
    category: 'Reader',
    defaultKeys: 'Shift+Space|PageUp|ArrowUp',
    note: 'Active in novel / EPUB readers.',
  },

  // Manga
  {
    id: 'manga.nextPage',
    label: 'Next manga page',
    category: 'Manga',
    defaultKeys: 'ArrowRight|ArrowDown|Space',
    note: 'Active while the manga reader is open.',
  },
  {
    id: 'manga.prevPage',
    label: 'Previous manga page',
    category: 'Manga',
    defaultKeys: 'ArrowLeft|ArrowUp',
    note: 'Active while the manga reader is open.',
  },
  { id: 'manga.zoomIn', label: 'Manga zoom in', category: 'Manga', defaultKeys: 'Ctrl+=', note: 'Manga reader only.' },
  { id: 'manga.zoomOut', label: 'Manga zoom out', category: 'Manga', defaultKeys: 'Ctrl+-', note: 'Manga reader only.' },
  { id: 'manga.zoomReset', label: 'Manga zoom reset', category: 'Manga', defaultKeys: 'Ctrl+0', note: 'Manga reader only.' },

  // Dictionary
  {
    id: 'dictionary.playPronunciation',
    label: 'Play pronunciation',
    category: 'Dictionary',
    defaultKeys: 'Ctrl+Shift+P',
    note: 'Works while a dictionary popup is open.',
  },

  // Flashcards — review session
  {
    id: 'flashcards.flip',
    label: 'Reveal / flip card',
    category: 'Flashcards',
    defaultKeys: 'Space|Enter',
    note: 'Active during a flashcard review session.',
  },
  {
    id: 'flashcards.again',
    label: 'Mark again (hard)',
    category: 'Flashcards',
    defaultKeys: '1|A',
    note: 'After the card is flipped.',
  },
  {
    id: 'flashcards.gotIt',
    label: 'Mark got it (good)',
    category: 'Flashcards',
    defaultKeys: '2|G',
    note: 'After the card is flipped.',
  },
  {
    id: 'flashcards.prev',
    label: 'Previous card',
    category: 'Flashcards',
    defaultKeys: 'ArrowLeft',
    note: 'Active during review.',
  },
  {
    id: 'flashcards.next',
    label: 'Next card',
    category: 'Flashcards',
    defaultKeys: 'ArrowRight',
    note: 'Active during review.',
  },
  {
    id: 'flashcards.end',
    label: 'End review session',
    category: 'Flashcards',
    defaultKeys: 'Escape',
    note: 'Active during review.',
  },

  // Immersion browser
  {
    id: 'immersion.focusUrl',
    label: 'Focus URL bar',
    category: 'Immersion',
    defaultKeys: 'Ctrl+L',
    note: 'Immersion view only.',
  },
  {
    id: 'immersion.reload',
    label: 'Reload page',
    category: 'Immersion',
    defaultKeys: 'Ctrl+R',
    note: 'Immersion view only.',
  },
  {
    id: 'immersion.bookmark',
    label: 'Save current site',
    category: 'Immersion',
    defaultKeys: 'Ctrl+D',
    note: 'Immersion view only — conflicts with reader dict when both open.',
  },
  {
    id: 'immersion.focusMode',
    label: 'Toggle focus mode',
    category: 'Immersion',
    defaultKeys: 'F6',
    note: 'Immersion view only.',
  },
  {
    id: 'immersion.cycleMode',
    label: 'Cycle immersion chrome mode',
    category: 'Immersion',
    defaultKeys: 'F8',
    note: 'Immersion view only.',
  },

  // Utility
  { id: 'clipboard.open', label: 'Open clipboard history', category: 'Utility', defaultKeys: 'Ctrl+Shift+V' },
  { id: 'calendar.open', label: 'Open calendar', category: 'Utility', defaultKeys: '' },
  {
    id: 'study.focusMode',
    label: 'Toggle focus mode',
    category: 'Utility',
    defaultKeys: 'Ctrl+Shift+E',
    note: 'Library, reader, dictionary, Anki, and mini music — no desktop.',
  },
  {
    id: 'perf.toggleOverlay',
    label: 'Toggle performance HUD',
    category: 'Utility',
    defaultKeys: 'Ctrl+Shift+F',
    note: 'FPS / heap / particle budget overlay.',
  },

  // Music
  {
    id: 'music.playPause',
    label: 'Play / pause',
    category: 'Music',
    defaultKeys: '',
    note: 'Unbound by default — Space is used by the reader / flashcards.',
  },
  { id: 'music.next', label: 'Next track', category: 'Music', defaultKeys: 'Ctrl+ArrowRight' },
  { id: 'music.prev', label: 'Previous track', category: 'Music', defaultKeys: 'Ctrl+ArrowLeft' },
  { id: 'music.volumeUp', label: 'Volume up', category: 'Music', defaultKeys: 'Ctrl+ArrowUp' },
  { id: 'music.volumeDown', label: 'Volume down', category: 'Music', defaultKeys: 'Ctrl+ArrowDown' },
];

/** App ids users can bind “Open …” shortcuts to. */
export const SHORTCUT_OPEN_APPS: { id: string; label: string }[] = [
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'library', label: 'Library' },
  { id: 'novels', label: 'Novels' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'translate', label: 'Translate' },
  { id: 'music', label: 'Music' },
  { id: 'player', label: 'Media player' },
  { id: 'immersion', label: 'Immersion' },
  { id: 'anki', label: 'Anki' },
  { id: 'stats', label: 'Statistics' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'resources', label: 'Resources' },
  { id: 'settings', label: 'Settings' },
  { id: 'city', label: 'Noctis' },
];

// ---------------------------------------------------------------------------
// Persistence: per-profile overrides. absent = default, string = override,
// null = explicitly unbound. Custom commands stored alongside.
// ---------------------------------------------------------------------------
type Overrides = Record<string, string | null>;
interface ShortcutStore {
  active: string;
  profiles: Record<string, Overrides>;
  customCommands: CustomCommandDef[];
}

const KEY = 'jp-shortcuts-v1';
const EVENT = 'shortcuts-changed';
const DEFAULT_PROFILE = 'Default';

const MOUSE_NAMES = ['MouseLeft', 'MouseMiddle', 'MouseRight', 'Mouse4', 'Mouse5'] as const;

function emptyStore(): ShortcutStore {
  return { active: DEFAULT_PROFILE, profiles: { [DEFAULT_PROFILE]: {} }, customCommands: [] };
}

/**
 * H used to toggle vocabulary colors; it is now personal highlight.
 * Migrate profiles that still bind bare H to toggleWordHighlight.
 */
function migrateHighlightHKey(profiles: Record<string, Overrides>): boolean {
  let changed = false;
  for (const prof of Object.values(profiles)) {
    if (!prof || typeof prof !== 'object') continue;
    const toggle = prof['reader.toggleWordHighlight'];
    if (typeof toggle === 'string') {
      const parts = toggle
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.some((p) => p.toUpperCase() === 'H') && parts.length === 1) {
        // Bare H was the old default for vocab toggle — move to new binding.
        prof['reader.toggleWordHighlight'] = 'Ctrl+Alt+H';
        // Free H for personal highlight unless user already bound it.
        if (prof['reader.highlightWord'] === undefined) {
          delete prof['reader.highlightWord'];
        }
        changed = true;
      }
    }
    // Ensure highlightWord is not left unbound while H is free of overrides.
    // (no-op if already default)
  }
  return changed;
}

function loadStore(): ShortcutStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ShortcutStore>;
      if (p && p.profiles && typeof p.profiles === 'object') {
        const profiles = p.profiles as Record<string, Overrides>;
        if (!profiles[DEFAULT_PROFILE]) profiles[DEFAULT_PROFILE] = {};
        const active = typeof p.active === 'string' && profiles[p.active] ? p.active : DEFAULT_PROFILE;
        const customCommands = Array.isArray(p.customCommands)
          ? p.customCommands.filter(
              (c): c is CustomCommandDef =>
                !!c &&
                typeof c === 'object' &&
                typeof (c as CustomCommandDef).id === 'string' &&
                typeof (c as CustomCommandDef).label === 'string' &&
                typeof (c as CustomCommandDef).defaultKeys === 'string' &&
                !!(c as CustomCommandDef).action,
            )
          : [];
        const migrated = migrateHighlightHKey(profiles);
        const next = { active, profiles, customCommands };
        if (migrated) {
          try {
            localStorage.setItem(KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
        }
        return next;
      }
    }
  } catch {
    /* fall through */
  }
  return emptyStore();
}

let store: ShortcutStore = loadStore();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onShortcutsChanged(cb: () => void): () => void {
  const h = (): void => cb();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

// ---------------------------------------------------------------------------
// Chord helpers. Canonical form: "Ctrl+Alt+Shift+Meta+Key" (modifiers in that
// order). Alternatives: "Space|Enter". Mouse: "Ctrl+MouseRight".
// ---------------------------------------------------------------------------

function mouseLabel(button: number): string | null {
  if (button >= 0 && button <= 4) return MOUSE_NAMES[button];
  return null;
}

function isModifierOnlyKey(k: string): boolean {
  return k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta';
}

function buildChord(mods: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }, label: string): string {
  const parts: string[] = [];
  if (mods.ctrl) parts.push('Ctrl');
  if (mods.alt) parts.push('Alt');
  if (mods.shift) parts.push('Shift');
  if (mods.meta) parts.push('Meta');
  parts.push(label);
  return parts.join('+');
}

/** Chord from a keyboard event, or null if modifier-only. */
export function chordFromEvent(e: KeyboardEvent): string | null {
  const k = e.key;
  if (isModifierOnlyKey(k)) return null;
  const label = k.length === 1 ? (k === ' ' ? 'Space' : k.toUpperCase()) : k;
  // For printable symbols Shift already changed the character (e.g. "+"), so
  // only record Shift for letters/space/named keys — Ctrl+Shift+H ≠ Ctrl+H.
  const shift = e.shiftKey && (k.length !== 1 || /[a-zA-Z ]/.test(k));
  return buildChord({ ctrl: e.ctrlKey, alt: e.altKey, shift, meta: e.metaKey }, label);
}

/** Chord from a mouse button event (includes modifiers). */
export function chordFromMouseEvent(e: MouseEvent): string | null {
  const label = mouseLabel(e.button);
  if (!label) return null;
  // Bare left-click is never a global shortcut (would hijack the whole UI).
  if (label === 'MouseLeft' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return null;
  return buildChord(
    { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey },
    label,
  );
}

/** Normalize one alternative (no `|`). */
function normalizeOne(c: string): string {
  const bits = c.split('+').map((s) => s.trim()).filter(Boolean);
  let ctrl = false;
  let alt = false;
  let shift = false;
  let meta = false;
  let key = '';
  for (const b of bits) {
    const l = b.toLowerCase();
    if (l === 'ctrl' || l === 'control') ctrl = true;
    else if (l === 'alt') alt = true;
    else if (l === 'shift') shift = true;
    else if (l === 'meta' || l === 'win' || l === 'cmd' || l === 'super' || l === 'command') meta = true;
    else if (l === 'mouseleft' || l === 'mouse0' || l === 'lmb') key = 'MouseLeft';
    else if (l === 'mousemiddle' || l === 'mouse1' || l === 'mmb') key = 'MouseMiddle';
    else if (l === 'mouseright' || l === 'mouse2' || l === 'rmb') key = 'MouseRight';
    else if (l === 'mouse4' || l === 'x1' || l === 'browserback') key = 'Mouse4';
    else if (l === 'mouse5' || l === 'x2' || l === 'browserforward') key = 'Mouse5';
    else if (l === 'space' || b === ' ') key = 'Space';
    else key = b.length === 1 ? b.toUpperCase() : b;
  }
  if (!key) return '';
  return buildChord({ ctrl, alt, shift, meta }, key);
}

/** Normalize full chord string (supports `|` alternatives). */
export function normalizeChord(c: string): string {
  if (!c.trim()) return '';
  return c
    .split('|')
    .map((part) => normalizeOne(part))
    .filter(Boolean)
    .join('|');
}

/** Split effective binding into individual chords. */
export function splitChords(keys: string): string[] {
  if (!keys) return [];
  return keys
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pretty display: "Ctrl+Shift+H · Space". */
export function formatKeysDisplay(keys: string): string {
  return splitChords(keys).join(' · ') || '';
}

function allCommands(): AppCommand[] {
  const customs: AppCommand[] = store.customCommands.map((c) => ({
    id: c.id,
    label: c.label,
    category: 'Custom' as const,
    defaultKeys: c.defaultKeys,
    custom: true,
    note: describeCustomAction(c.action),
  }));
  return [...COMMAND_CATALOG, ...customs];
}

function describeCustomAction(action: CustomAction): string {
  if (action.type === 'openApp') {
    const app = SHORTCUT_OPEN_APPS.find((a) => a.id === action.appId);
    return `Opens ${app?.label ?? action.appId}`;
  }
  if (action.type === 'runCommand') {
    const cmd = COMMAND_CATALOG.find((c) => c.id === action.commandId);
    return `Runs “${cmd?.label ?? action.commandId}”`;
  }
  if (action.type === 'runCommands') {
    const labels = action.commandIds.map((id) => {
      const c = COMMAND_CATALOG.find((x) => x.id === id);
      const custom = store.customCommands.find((x) => x.id === id);
      return c?.label ?? custom?.label ?? id;
    });
    return `Stack: ${labels.join(' → ')}`;
  }
  return `Dispatches ${action.event}${action.detail ? ` (${action.detail})` : ''}`;
}

/** Effective chord string for a command under the active profile ('' = unbound). */
export function effectiveKeys(id: string): string {
  const ov = store.profiles[store.active]?.[id];
  if (ov === null) return '';
  if (typeof ov === 'string') return ov;
  const fromCustom = store.customCommands.find((c) => c.id === id);
  if (fromCustom) return fromCustom.defaultKeys;
  return COMMAND_CATALOG.find((c) => c.id === id)?.defaultKeys ?? '';
}

/** True if chord matches any alternative in the effective binding. */
export function chordMatches(id: string, chord: string): boolean {
  const keys = effectiveKeys(id);
  if (!keys || !chord) return false;
  return splitChords(keys).some((k) => k === chord);
}

export interface BindingRow extends AppCommand {
  keys: string;
  isDefault: boolean;
  conflictsWith: string[];
}

export function getBindings(): BindingRow[] {
  const cmds = allCommands();
  const byChord = new Map<string, string[]>();
  for (const c of cmds) {
    for (const k of splitChords(effectiveKeys(c.id))) {
      byChord.set(k, [...(byChord.get(k) ?? []), c.id]);
    }
  }
  return cmds.map((c) => {
    const keys = effectiveKeys(c.id);
    const alts = splitChords(keys);
    const sharing = new Set<string>();
    for (const k of alts) {
      for (const id of byChord.get(k) ?? []) {
        if (id !== c.id) sharing.add(id);
      }
    }
    return {
      ...c,
      keys,
      isDefault: keys === c.defaultKeys,
      conflictsWith: [...sharing],
    };
  });
}

/**
 * Set/override a binding. Pass '' to unbind.
 * `mode: 'replace'` (default) sets the full binding to one chord.
 * `mode: 'add'` appends a chord as an alternative (`|`).
 */
export function setBinding(id: string, chord: string, mode: 'replace' | 'add' = 'replace'): string[] {
  const def = allCommands().find((c) => c.id === id)?.defaultKeys ?? '';
  const prof = store.profiles[store.active] ?? (store.profiles[store.active] = {});

  let next = '';
  if (!chord.trim()) {
    next = '';
  } else if (mode === 'add') {
    // Add mode always appends a single alternative.
    const one = normalizeOne(chord.includes('|') ? chord.split('|')[0] : chord);
    if (!one) return [];
    const cur = effectiveKeys(id);
    const parts = new Set(splitChords(cur));
    parts.add(one);
    next = [...parts].join('|');
  } else {
    // Replace accepts full multi-chord strings (Space|Enter).
    next = normalizeChord(chord);
  }

  if (next === def) delete prof[id];
  else prof[id] = next === '' ? null : next;
  persist();
  if (!next) return [];
  const conflicts: string[] = [];
  for (const k of splitChords(next)) {
    for (const c of allCommands()) {
      if (c.id !== id && chordMatches(c.id, k)) conflicts.push(c.id);
    }
  }
  return [...new Set(conflicts)];
}

export function resetBinding(id: string): void {
  const prof = store.profiles[store.active];
  if (prof) {
    delete prof[id];
    persist();
  }
}

export function resetAllBindings(): void {
  store.profiles[store.active] = {};
  persist();
}

// ----- custom commands -----
export function listCustomCommands(): CustomCommandDef[] {
  return [...store.customCommands];
}

export function addCustomCommand(input: {
  label: string;
  keys?: string;
  action: CustomAction;
}): { ok: true; id: string } | { ok: false; error: string } {
  const label = input.label.trim();
  if (!label) return { ok: false, error: 'Name is required.' };
  if (!input.action) return { ok: false, error: 'Pick an action.' };
  const id = `custom.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const defaultKeys = input.keys ? normalizeChord(input.keys) : '';
  store.customCommands = [
    ...store.customCommands,
    { id, label, defaultKeys, action: input.action },
  ];
  persist();
  return { ok: true, id };
}

export function updateCustomCommand(
  id: string,
  patch: Partial<Pick<CustomCommandDef, 'label' | 'defaultKeys' | 'action'>>,
): { ok: boolean; error?: string } {
  const i = store.customCommands.findIndex((c) => c.id === id);
  if (i < 0) return { ok: false, error: 'Custom shortcut not found.' };
  const prev = store.customCommands[i];
  const next: CustomCommandDef = {
    ...prev,
    label: typeof patch.label === 'string' ? patch.label.trim() || prev.label : prev.label,
    defaultKeys:
      typeof patch.defaultKeys === 'string' ? normalizeChord(patch.defaultKeys) : prev.defaultKeys,
    action: patch.action ?? prev.action,
  };
  store.customCommands = store.customCommands.map((c, idx) => (idx === i ? next : c));
  // If default keys changed and profile had no override, fine; if user had reset to default, keep.
  persist();
  return { ok: true };
}

export function removeCustomCommand(id: string): void {
  store.customCommands = store.customCommands.filter((c) => c.id !== id);
  for (const prof of Object.values(store.profiles)) {
    delete prof[id];
  }
  persist();
}

// ----- profiles -----
export function listShortcutProfiles(): { active: string; names: string[] } {
  return { active: store.active, names: Object.keys(store.profiles) };
}

export function switchShortcutProfile(name: string): void {
  if (!store.profiles[name]) return;
  store.active = name;
  persist();
}

export function addShortcutProfile(name: string): void {
  const n = name.trim();
  if (!n || store.profiles[n]) return;
  store.profiles[n] = { ...(store.profiles[store.active] ?? {}) };
  store.active = n;
  persist();
}

export function deleteShortcutProfile(name: string): void {
  if (name === DEFAULT_PROFILE || !store.profiles[name]) return;
  delete store.profiles[name];
  if (store.active === name) store.active = DEFAULT_PROFILE;
  persist();
}

// ----- import / export -----
export function exportShortcuts(): string {
  return JSON.stringify(store, null, 2);
}

export function importShortcuts(json: string): { ok: boolean; error?: string } {
  try {
    const p = JSON.parse(json) as Partial<ShortcutStore>;
    if (!p || typeof p !== 'object' || !p.profiles || typeof p.profiles !== 'object') {
      return { ok: false, error: 'Not a shortcuts export.' };
    }
    const profiles: Record<string, Overrides> = {};
    for (const [name, ov] of Object.entries(p.profiles)) {
      if (!ov || typeof ov !== 'object') continue;
      const clean: Overrides = {};
      for (const [id, v] of Object.entries(ov as Record<string, unknown>)) {
        if (v === null) clean[id] = null;
        else if (typeof v === 'string') clean[id] = normalizeChord(v);
      }
      profiles[name] = clean;
    }
    if (!profiles[DEFAULT_PROFILE]) profiles[DEFAULT_PROFILE] = {};
    const active = typeof p.active === 'string' && profiles[p.active] ? p.active : DEFAULT_PROFILE;
    const customCommands = Array.isArray(p.customCommands)
      ? (p.customCommands as CustomCommandDef[]).filter(
          (c) => c && typeof c.id === 'string' && typeof c.label === 'string' && c.action,
        )
      : store.customCommands;
    store = { active, profiles, customCommands };
    persist();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON.' };
  }
}

// ---------------------------------------------------------------------------
// Handlers. Views push onto a per-command stack while mounted; the newest
// registration wins (the topmost view owns the shortcut).
// ---------------------------------------------------------------------------
type Handler = (e: Event) => boolean | void;
const handlers = new Map<string, Handler[]>();

export function registerCommandHandler(id: string, fn: Handler): () => void {
  const list = handlers.get(id) ?? [];
  list.push(fn);
  handlers.set(id, list);
  return () => {
    const cur = handlers.get(id);
    if (!cur) return;
    const i = cur.indexOf(fn);
    if (i >= 0) cur.splice(i, 1);
  };
}

function openApp(appId: string): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: appId }));
}

/** Guard against custom stacks that re-enter themselves. */
let runDepth = 0;
const MAX_RUN_DEPTH = 12;

function runCustomAction(action: CustomAction, e: Event): boolean {
  if (action.type === 'openApp') {
    openApp(action.appId);
    return true;
  }
  if (action.type === 'runCommand') {
    return runCommand(action.commandId);
  }
  if (action.type === 'runCommands') {
    let any = false;
    for (const id of action.commandIds) {
      if (!id) continue;
      if (runCommand(id)) any = true;
    }
    return any;
  }
  if (action.type === 'dispatch') {
    window.dispatchEvent(new CustomEvent(action.event, { detail: action.detail }));
    return true;
  }
  void e;
  return false;
}

// Built-in handlers (always available; views never register these).
function builtinHandler(id: string): Handler | null {
  switch (id) {
    case 'nav.palette':
      return () => void window.dispatchEvent(new CustomEvent('palette:open', { detail: 'commands' }));
    case 'nav.search':
      return () => void window.dispatchEvent(new CustomEvent('palette:open', { detail: 'search' }));
    case 'nav.settings':
      return () => void openApp('settings');
    case 'nav.home':
      return () => void window.dispatchEvent(new CustomEvent('os:home'));
    case 'nav.closeWindow':
      return () => void window.dispatchEvent(new CustomEvent('os:close-window'));
    case 'nav.nextWindow':
      return () => void window.dispatchEvent(new CustomEvent('os:cycle-window', { detail: 1 }));
    case 'nav.prevWindow':
      return () => void window.dispatchEvent(new CustomEvent('os:cycle-window', { detail: -1 }));
    case 'nav.nextAppFullscreen':
      return () => void window.dispatchEvent(new CustomEvent('os:cycle-app-fullscreen', { detail: 1 }));
    case 'nav.nextDesktop':
      return () => void window.dispatchEvent(new CustomEvent('os:switch-desktop', { detail: 1 }));
    case 'nav.prevDesktop':
      return () => void window.dispatchEvent(new CustomEvent('os:switch-desktop', { detail: -1 }));
    case 'nav.undo':
      return () => {
        if (!canUndo()) {
          window.dispatchEvent(
            new CustomEvent('os:toast', { detail: { message: 'Nothing to undo', kind: 'muted' } }),
          );
          return;
        }
        const label = peekUndo()?.label ?? 'action';
        void performUndo().then((done) => {
          window.dispatchEvent(
            new CustomEvent('os:toast', {
              detail: { message: done ? `Undid: ${done}` : `Undid: ${label}`, kind: 'ok' },
            }),
          );
        });
      };
    case 'nav.widgets':
      return () => void window.dispatchEvent(new CustomEvent('os:widgets'));
    case 'nav.open.dictionary':
      return () => void openApp('dictionary');
    case 'nav.open.library':
      return () => void openApp('library');
    case 'nav.open.novels':
      return () => void openApp('novels');
    case 'nav.open.flashcards':
      return () => void openApp('flashcards');
    case 'nav.open.grammar':
      return () => void openApp('grammar');
    case 'nav.open.translate':
      return () => void openApp('translate');
    case 'nav.open.music':
      return () => void openApp('music');
    case 'nav.open.player':
      return () => void openApp('player');
    case 'nav.open.immersion':
      return () => void openApp('immersion');
    case 'nav.open.anki':
      return () => void openApp('anki');
    case 'nav.open.stats':
      return () => void openApp('stats');
    case 'nav.open.calendar':
      return () => void openApp('calendar');
    case 'nav.open.resources':
      return () => void openApp('resources');
    case 'nav.open.city':
      return () => void openApp('city');
    case 'reader.toggleWordHighlight':
      return () => void toggleWordHighlight();
    case 'clipboard.open':
      return () => void window.dispatchEvent(new CustomEvent('clipboard:open'));
    case 'calendar.open':
      return () => void openApp('calendar');
    case 'music.playPause':
      return () => void musicToggle();
    case 'music.next':
      return () => void musicNext();
    case 'music.prev':
      return () => void musicPrev();
    case 'music.volumeUp':
      return () => void setVolume(Math.min(1, getState().volume + 0.05));
    case 'music.volumeDown':
      return () => void setVolume(Math.max(0, getState().volume - 0.05));
    default: {
      const custom = store.customCommands.find((c) => c.id === id);
      if (custom) return (e) => runCustomAction(custom.action, e);
      return null;
    }
  }
}

/** Run a command by id (used by the command palette). Returns true if handled. */
export function runCommand(id: string): boolean {
  if (runDepth >= MAX_RUN_DEPTH) return false;
  runDepth++;
  try {
    const stack = handlers.get(id);
    const fn = stack && stack.length ? stack[stack.length - 1] : builtinHandler(id);
    if (!fn) return false;
    return fn(new KeyboardEvent('keydown')) !== false;
  } finally {
    runDepth--;
  }
}

/** True when a command currently has something that would respond to it. */
export function commandIsLive(id: string): boolean {
  const stack = handlers.get(id);
  if (stack != null && stack.length > 0) return true;
  if (builtinHandler(id) != null) return true;
  return store.customCommands.some((c) => c.id === id);
}

function isTypingTarget(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable;
}

function isInteractiveMouseTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(
    t.closest(
      'button, a, input, textarea, select, [contenteditable="true"], [role="button"], .os-icon, .os-taskbar, .os-start',
    ),
  );
}

function dispatchChord(chord: string, e: Event, opts?: { fromMouse?: boolean }): boolean {
  // While typing, only keyboard chords that carry Ctrl/Alt/Meta may fire.
  if (!opts?.fromMouse && isTypingTarget()) {
    const ke = e as KeyboardEvent;
    if (!ke.ctrlKey && !ke.altKey && !ke.metaKey) return false;
  }
  for (const c of allCommands()) {
    if (!chordMatches(c.id, chord)) continue;
    const stack = handlers.get(c.id);
    const fn = stack && stack.length ? stack[stack.length - 1] : builtinHandler(c.id);
    if (!fn) continue; // dead binding (view not mounted) — try the next match
    if (fn(e) !== false) {
      e.preventDefault();
      if (opts?.fromMouse) e.stopPropagation();
      return true;
    }
  }
  return false;
}

/**
 * Install global keydown + mousedown listeners. Call once from main.tsx.
 * Capture-mode in ShortcutSettings uses stopPropagation so it wins first.
 */
export function installKeyboardShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const chord = chordFromEvent(e);
    if (!chord) return;
    dispatchChord(chord, e);
  };

  const onMouse = (e: MouseEvent) => {
    // Skip pure UI chrome clicks unless they carry modifiers / non-left button.
    const chord = chordFromMouseEvent(e);
    if (!chord) return;
    if (e.button === 0 && isInteractiveMouseTarget(e.target) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      return;
    }
    dispatchChord(chord, e, { fromMouse: true });
  };

  window.addEventListener('keydown', onKey);
  // mousedown alone — auxclick would double-fire the same button after mouseup.
  window.addEventListener('mousedown', onMouse, true);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('mousedown', onMouse, true);
  };
}
