/**
 * kbd5 — the one keymap the Shortcuts editor shows: every command the app owns
 * (built-in catalog, Toolbox/Blanc, system-wide rows, the user's custom ones),
 * the adopted video player's own keys, and the Chrome extension's commands.
 *
 * `keyboardShortcuts.ts` stays the owner of app bindings; this module adds what
 * an editor needs on top of it and nothing a keypress needs at runtime:
 *
 *  - a SCOPE per entry, so a conflict is judged by where the keys are heard
 *    (a reader key and a flashcard key may share a letter; a system-wide chord
 *    shares nothing, because Windows takes it before any window sees it);
 *  - conflict detection for a chord BEFORE it is committed, and the two
 *    resolutions a user actually wants — swap (the other command takes my old
 *    keys) and replace (the other command loses this chord);
 *  - the player keymap as editable rows (the vendor player reads the same
 *    localStorage key and merges per action, see playerKeymap.ts);
 *  - one JSON document for export/import that carries both keymaps.
 */

import {
  COMMAND_CATALOG,
  effectiveKeys,
  exportShortcuts,
  formatKeysDisplay,
  getBindings,
  importShortcuts,
  isKeySequence,
  normalizeChord,
  resetAllBindings,
  setBinding,
  splitChords,
  type AppCommand,
  type BindingRow,
} from './keyboardShortcuts';
import { keySequenceSteps } from './keyQuery';
import { PLAYER_DEFAULT_KEYBINDINGS, PLAYER_KEYBINDINGS_STORAGE_KEY, formatPlayerKeyCode } from './playerKeymap';
import { writeLocalStorageJson } from './localStorageWrite';

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

/** Where a binding is heard. */
export type KeymapScope =
  | 'system'
  | 'app'
  | 'reader'
  | 'manga'
  | 'flashcards'
  | 'immersion'
  | 'video'
  | 'player'
  | 'toolbox'
  | 'extension';

export const KEYMAP_SCOPES: readonly KeymapScope[] = [
  'system',
  'app',
  'reader',
  'manga',
  'flashcards',
  'immersion',
  'video',
  'player',
  'toolbox',
  'extension',
];

/** The scope of a catalog (or custom) command. */
export function scopeOfCommand(cmd: Pick<AppCommand, 'id' | 'category' | 'global' | 'scope'>): KeymapScope {
  if (cmd.global) return 'system';
  switch (cmd.category) {
    case 'Companion':
      return 'system';
    case 'Reader':
      return 'reader';
    case 'Manga':
      return 'manga';
    case 'Flashcards':
      return 'flashcards';
    case 'Immersion':
      return 'immersion';
    case 'Video':
      return 'video';
    case 'Toolbox':
      return cmd.scope === 'global-app' ? 'app' : 'toolbox';
    default:
      // Navigation, Window, Utility, Dictionary, Music, Custom: heard anywhere in Gum.
      return 'app';
  }
}

/**
 * Whether one keypress can reach both scopes. System-wide chords are taken by
 * Windows first, so they collide with everything — the Chrome extension too.
 * App-wide commands collide with every in-app context but not with Chrome. The
 * manga reader also listens to the reader's font keys, and the study overlay's
 * keys share the video surface with the player's own map.
 */
export function scopesOverlap(a: KeymapScope, b: KeymapScope): boolean {
  if (a === b) return true;
  if (a === 'system' || b === 'system') return true;
  if (a === 'extension' || b === 'extension') return false;
  if (a === 'app' || b === 'app') return true;
  const pair = new Set([a, b]);
  if (pair.has('reader') && pair.has('manga')) return true;
  if (pair.has('video') && pair.has('player')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// The video player's keys
// ---------------------------------------------------------------------------

export const PLAYER_ENTRY_PREFIX = 'player.';
export const PLAYER_KEYMAP_EVENT = 'player-keymap-changed';

const PUNCT_TO_CODE: Record<string, string> = {
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ',': 'Comma',
  '.': 'Period',
  ';': 'Semicolon',
  "'": 'Quote',
  '/': 'Slash',
  '\\': 'Backslash',
  '-': 'Minus',
  '=': 'Equal',
  '`': 'Backquote',
};

const NAMED_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'Insert',
  'Delete',
  'Backspace',
  'Tab',
]);

/** A `KeyboardEvent.code` as the chord the app's capture would record for it. */
export function playerCodeToChord(code: string): string {
  if (!code) return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (NAMED_KEYS.has(code) || /^F([1-9]|1[0-2])$/.test(code)) return code;
  const punct = Object.entries(PUNCT_TO_CODE).find(([, c]) => c === code);
  return punct ? punct[0] : code;
}

/**
 * The player's `code` for a chord, or null when the player cannot hear it. The
 * player ignores every modified key (Ctrl/Alt/Shift/Meta), so only a bare key
 * can be bound there.
 */
export function chordToPlayerCode(chord: string): string | null {
  const one = normalizeChord(chord);
  if (!one || one.includes('|')) return null;
  if (/^(Ctrl|Alt|Shift|Meta)\+/.test(one) || one.startsWith('Mouse')) return null;
  if (/^[A-Z]$/.test(one)) return `Key${one}`;
  if (/^[0-9]$/.test(one)) return `Digit${one}`;
  if (NAMED_KEYS.has(one) || /^F([1-9]|1[0-2])$/.test(one)) return one;
  return PUNCT_TO_CODE[one] ?? null;
}

type PlayerOverrides = Record<string, { key?: unknown; value?: unknown }>;

function readPlayerOverrides(): PlayerOverrides {
  try {
    const raw = localStorage.getItem(PLAYER_KEYBINDINGS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as PlayerOverrides) : {};
  } catch {
    return {};
  }
}

/** The player's current code per rebindable action ('' = unbound). */
export function playerBindings(): Record<string, string> {
  const stored = readPlayerOverrides();
  const out: Record<string, string> = {};
  for (const def of PLAYER_DEFAULT_KEYBINDINGS) {
    const override = stored[def.action];
    out[def.action] = typeof override?.key === 'string' ? override.key : def.code;
  }
  return out;
}

function announcePlayerKeymap(serialized: string | null): void {
  try {
    // The vendor reads this key through jotai's `atomWithStorage`, whose storage
    // subscription listens for `storage` events. A browser only fires those in
    // OTHER documents, so the window that made the change tells itself.
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: PLAYER_KEYBINDINGS_STORAGE_KEY,
        newValue: serialized,
        storageArea: localStorage,
      }),
    );
  } catch {
    /* StorageEvent unavailable (old test DOM) */
  }
  window.dispatchEvent(new CustomEvent(PLAYER_KEYMAP_EVENT));
}

/**
 * Bind one player action to `code` ('' unbinds). The vendor merges stored
 * entries over its defaults per action, so each stored entry is written whole,
 * keeping its step value.
 */
export function setPlayerBinding(action: string, code: string): boolean {
  const def = PLAYER_DEFAULT_KEYBINDINGS.find((d) => d.action === action);
  if (!def) return false;
  const stored = readPlayerOverrides();
  const prev = stored[action];
  const value = typeof prev?.value === 'number' && Number.isFinite(prev.value) ? prev.value : def.value;
  const next: PlayerOverrides = { ...stored };
  if (code === def.code && (value === def.value || value === undefined)) delete next[action];
  else next[action] = value === undefined ? { key: code } : { key: code, value };
  const ok = writeLocalStorageJson(PLAYER_KEYBINDINGS_STORAGE_KEY, next);
  announcePlayerKeymap(JSON.stringify(next));
  return ok;
}

export function resetPlayerBinding(action: string): void {
  const def = PLAYER_DEFAULT_KEYBINDINGS.find((d) => d.action === action);
  if (def) setPlayerBinding(action, def.code);
}

export function resetAllPlayerBindings(): void {
  try {
    localStorage.removeItem(PLAYER_KEYBINDINGS_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  announcePlayerKeymap(null);
}

export function onPlayerKeymapChanged(cb: () => void): () => void {
  window.addEventListener(PLAYER_KEYMAP_EVENT, cb);
  return () => window.removeEventListener(PLAYER_KEYMAP_EVENT, cb);
}

/** Keys the player handles itself and never lets anyone rebind. */
export const PLAYER_FIXED_CHORDS: readonly { action: string; chords: readonly string[] }[] = [
  { action: 'playPause', chords: ['Space', 'Enter'] },
  { action: 'toStart', chords: ['Home'] },
  { action: 'toEnd', chords: ['End'] },
  { action: 'jumpPercent', chords: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] },
  { action: 'frameBack', chords: [','] },
  { action: 'frameForward', chords: ['.'] },
  { action: 'exitFullscreen', chords: ['Escape'] },
];

// ---------------------------------------------------------------------------
// The Chrome extension's commands (read-only: Chrome owns them)
// ---------------------------------------------------------------------------

/** Mirror of `chrome-extension/manifest.json` `commands`; a test pins the two together. */
export const CHROME_KEY_COMMANDS: readonly { name: string; labelKey: string; suggested: string }[] = [
  { name: 'save-page', labelKey: 'kbd5.ext.cmd.savePage', suggested: 'Alt+Shift+R' },
  { name: 'dictionary-popup', labelKey: 'kbd5.ext.cmd.lookup', suggested: 'Alt+Shift+D' },
  { name: 'mine-selection', labelKey: 'kbd5.ext.cmd.mineSelection', suggested: 'Alt+Shift+M' },
  { name: 'action-wheel', labelKey: 'kbd5.ext.cmd.wheel', suggested: 'Alt+Shift+W' },
  { name: 'bulk-tabs', labelKey: 'kbd5.ext.cmd.bulkTabs', suggested: '' },
  { name: 'analyze-selection', labelKey: 'kbd5.ext.cmd.analyze', suggested: '' },
  { name: 'record-tab', labelKey: 'kbd5.ext.cmd.recordTab', suggested: '' },
];

export const CHROME_SHORTCUTS_URL = 'chrome://extensions/shortcuts';

// ---------------------------------------------------------------------------
// The unified keymap
// ---------------------------------------------------------------------------

export type KeymapSource = 'app' | 'player' | 'playerFixed' | 'extension';

export interface KeymapEntry {
  /** Command id; `player.<action>` for the player; `extension.<name>` for Chrome. */
  id: string;
  source: KeymapSource;
  scope: KeymapScope;
  /** Normalized chords. For the extension: Chrome's suggested default. */
  chords: string[];
  editable: boolean;
}

export function keymapEntries(rows: BindingRow[] = getBindings()): KeymapEntry[] {
  const out: KeymapEntry[] = rows.map((row) => ({
    id: row.id,
    source: 'app',
    scope: scopeOfCommand(row),
    chords: splitChords(row.keys),
    editable: row.editable !== false,
  }));
  const player = playerBindings();
  for (const def of PLAYER_DEFAULT_KEYBINDINGS) {
    const chord = playerCodeToChord(player[def.action] ?? '');
    out.push({
      id: `${PLAYER_ENTRY_PREFIX}${def.action}`,
      source: 'player',
      scope: 'player',
      chords: chord ? [chord] : [],
      editable: true,
    });
  }
  for (const fixed of PLAYER_FIXED_CHORDS) {
    out.push({
      id: `${PLAYER_ENTRY_PREFIX}${fixed.action}`,
      source: 'playerFixed',
      scope: 'player',
      chords: [...fixed.chords],
      editable: false,
    });
  }
  for (const ext of CHROME_KEY_COMMANDS) {
    out.push({
      id: `extension.${ext.name}`,
      source: 'extension',
      scope: 'extension',
      chords: ext.suggested ? [normalizeChord(ext.suggested)] : [],
      editable: false,
    });
  }
  return out;
}

export interface KeymapConflict {
  id: string;
  scope: KeymapScope;
  source: KeymapSource;
  /**
   * The other entry's keys that collide. For an exact clash that is the chord asked
   * about; for a prefix clash it is the other entry's own alternative (so `replace`
   * knows what to take away from it).
   */
  chord: string;
  /** True when one keypress reaches both: one of them will never fire. */
  overlapping: boolean;
  editable: boolean;
  /**
   * kbd6: not the same keys, but one is the first step(s) of the other's sequence.
   * The dispatcher lets the prefix win, so the shorter binding stops firing while the
   * sequence's command is live — "Ctrl+K starts the sequence for X".
   */
  prefix?: true;
  /** For a prefix clash: the shorter keys, the ones pressed first. */
  lead?: string;
}

/**
 * The shorter of two alternatives when it is the first step(s) of the longer one
 * ("Ctrl+K" and "Ctrl+K S"), else null. Equal keys are not a prefix.
 */
export function sequenceLead(a: string, b: string): string | null {
  const sa = keySequenceSteps(a);
  const sb = keySequenceSteps(b);
  if (sa.length === sb.length) return null;
  const [short, long] = sa.length < sb.length ? [sa, sb] : [sb, sa];
  if (!short.length || !short.every((s, i) => long[i] === s)) return null;
  return short.join(' ');
}

/**
 * Every other entry that already uses one of `chords` (a `|` list is split),
 * judged against the scope of `targetId` — and, since kbd6, every entry whose
 * keys are the start of one of `chords` or start with one of them (a prefix clash).
 */
export function findConflicts(targetId: string, chords: string, entries: KeymapEntry[] = keymapEntries()): KeymapConflict[] {
  const target = entries.find((e) => e.id === targetId);
  const targetScope: KeymapScope = target?.scope ?? 'app';
  const wanted = splitChords(normalizeChord(chords));
  const out: KeymapConflict[] = [];
  for (const entry of entries) {
    if (entry.id === targetId) continue;
    for (const chord of wanted) {
      if (entry.chords.includes(chord)) {
        out.push({
          id: entry.id,
          scope: entry.scope,
          source: entry.source,
          chord,
          overlapping: scopesOverlap(targetScope, entry.scope),
          editable: entry.editable,
        });
      }
      for (const other of entry.chords) {
        const lead = sequenceLead(chord, other);
        if (!lead) continue;
        out.push({
          id: entry.id,
          scope: entry.scope,
          source: entry.source,
          chord: other,
          overlapping: scopesOverlap(targetScope, entry.scope),
          editable: entry.editable,
          prefix: true,
          lead,
        });
      }
    }
  }
  return out;
}

/** Overlapping conflicts per entry id, for the row badges (prefix clashes included). */
export function conflictMap(entries: KeymapEntry[] = keymapEntries()): Map<string, KeymapConflict[]> {
  const byChord = new Map<string, KeymapEntry[]>();
  for (const entry of entries) {
    for (const chord of entry.chords) byChord.set(chord, [...(byChord.get(chord) ?? []), entry]);
  }
  const out = new Map<string, KeymapConflict[]>();
  const add = (id: string, conflict: KeymapConflict): void => {
    out.set(id, [...(out.get(id) ?? []), conflict]);
  };
  for (const entry of entries) {
    for (const chord of entry.chords) {
      for (const other of byChord.get(chord) ?? []) {
        if (other.id === entry.id || !scopesOverlap(entry.scope, other.scope)) continue;
        add(entry.id, {
          id: other.id,
          scope: other.scope,
          source: other.source,
          chord,
          overlapping: true,
          editable: other.editable,
        });
      }
    }
  }
  // kbd6: prefix clashes. Sequences are rare, so walk only from them: each pair is
  // reported on both rows (a sequence against a sequence is met from either side).
  for (const entry of entries) {
    for (const seq of entry.chords) {
      if (!isKeySequence(seq)) continue;
      for (const other of entries) {
        if (other.id === entry.id || !scopesOverlap(entry.scope, other.scope)) continue;
        for (const oc of other.chords) {
          const lead = sequenceLead(seq, oc);
          if (!lead) continue;
          add(entry.id, {
            id: other.id,
            scope: other.scope,
            source: other.source,
            chord: oc,
            overlapping: true,
            editable: other.editable,
            prefix: true,
            lead,
          });
          if (!isKeySequence(oc)) {
            add(other.id, {
              id: entry.id,
              scope: entry.scope,
              source: entry.source,
              chord: seq,
              overlapping: true,
              editable: entry.editable,
              prefix: true,
              lead,
            });
          }
        }
      }
    }
  }
  return out;
}

/** Current chords of any editable entry. */
export function entryChords(id: string): string[] {
  if (id.startsWith(PLAYER_ENTRY_PREFIX)) {
    const chord = playerCodeToChord(playerBindings()[id.slice(PLAYER_ENTRY_PREFIX.length)] ?? '');
    return chord ? [chord] : [];
  }
  return splitChords(effectiveKeys(id));
}

/**
 * Set an entry's chords. Player actions take one bare key: the first chord the
 * player can hear is kept, the rest are dropped. Returns false when nothing could
 * be written (a chord the player cannot hear, an unknown or read-only entry).
 */
export function setEntryChords(id: string, chords: string[]): boolean {
  if (id.startsWith('extension.')) return false;
  if (id.startsWith(PLAYER_ENTRY_PREFIX)) {
    const action = id.slice(PLAYER_ENTRY_PREFIX.length);
    if (!PLAYER_DEFAULT_KEYBINDINGS.some((d) => d.action === action)) return false;
    if (!chords.length) return setPlayerBinding(action, '');
    const code = chords.map(chordToPlayerCode).find((c): c is string => !!c);
    if (!code) return false;
    return setPlayerBinding(action, code);
  }
  setBinding(id, chords.join('|'), 'replace');
  return true;
}

export type ConflictResolution = 'swap' | 'replace' | 'keep';

export interface ResolutionResult {
  /** Entries whose binding changed besides the target. */
  changed: string[];
  ok: boolean;
}

/**
 * Commit `chord` to `targetId` and settle its conflicts.
 *
 * - `replace`: every overlapping, editable conflict loses this chord (its other
 *   alternatives stay).
 * - `swap`: the first overlapping conflict takes the target's previous keys in
 *   exchange; any further conflicts are replaced. With nothing to give back (the
 *   target was unbound) a swap is a replace.
 * - `keep`: both keep the chord. Allowed, because a deliberate double binding is
 *   the user's call; the row keeps saying so.
 *
 * `mode: 'add'` appends the chord as an alternative instead of replacing.
 */
export function bindWithResolution(
  targetId: string,
  chord: string,
  mode: 'replace' | 'add',
  resolution: ConflictResolution,
): ResolutionResult {
  const normalized = normalizeChord(chord);
  const conflicts = findConflicts(targetId, normalized).filter((c) => c.overlapping && c.editable);
  const before = entryChords(targetId);
  const changed: string[] = [];
  if (resolution !== 'keep') {
    const seen = new Set<string>();
    conflicts.forEach((conflict) => {
      if (seen.has(conflict.id)) return;
      seen.add(conflict.id);
      const remaining = entryChords(conflict.id).filter((c) => c !== conflict.chord);
      const giveBack =
        resolution === 'swap' && seen.size === 1 && mode === 'replace'
          ? before.filter((c) => c !== normalized && !remaining.includes(c))
          : [];
      if (setEntryChords(conflict.id, [...giveBack, ...remaining])) changed.push(conflict.id);
    });
  }
  const next = mode === 'add' ? [...new Set([...before, ...splitChords(normalized)])] : splitChords(normalized);
  const ok = setEntryChords(targetId, next);
  return { changed, ok };
}

// ---------------------------------------------------------------------------
// Export / import: one document for both keymaps
// ---------------------------------------------------------------------------

export const KEYMAP_FORMAT = 'gum-keymap';
export const KEYMAP_VERSION = 1;

export interface KeymapDocument {
  format: typeof KEYMAP_FORMAT;
  version: number;
  exportedAt: string;
  shortcuts: unknown;
  player: PlayerOverrides;
}

export function exportKeymap(now: Date = new Date()): string {
  const doc: KeymapDocument = {
    format: KEYMAP_FORMAT,
    version: KEYMAP_VERSION,
    exportedAt: now.toISOString(),
    shortcuts: JSON.parse(exportShortcuts()) as unknown,
    player: readPlayerOverrides(),
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * `invalidCustom`: a custom shortcut in the file is incomplete or damaged (`detail` is its
 * name when it has one); `rejected`: it could not be applied and nothing changed. `detail`
 * is never an English message — the Shortcuts page words every case (kbd7).
 */
export type KeymapImportError = 'notJson' | 'notKeymap' | 'invalidCustom' | 'rejected';

/**
 * Import either a keymap document or a bare shortcuts export (the format the
 * Shortcuts page wrote before kbd5). Player entries naming unknown actions or
 * carrying a non-string key are dropped rather than written through.
 */
export function importKeymap(json: string): { ok: true; player: number } | { ok: false; error: KeymapImportError; detail?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'notJson' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'notKeymap' };
  const doc = parsed as Partial<KeymapDocument> & { profiles?: unknown };
  const isDoc = doc.format === KEYMAP_FORMAT;
  const shortcuts = isDoc ? doc.shortcuts : parsed;
  if (!shortcuts || typeof shortcuts !== 'object' || !(shortcuts as { profiles?: unknown }).profiles) {
    return { ok: false, error: 'notKeymap' };
  }
  const res = importShortcuts(JSON.stringify(shortcuts));
  if (!res.ok) {
    if (res.error === 'invalidCustom') {
      return res.label ? { ok: false, error: 'invalidCustom', detail: res.label } : { ok: false, error: 'invalidCustom' };
    }
    if (res.error === 'notShortcuts') return { ok: false, error: 'notKeymap' };
    if (res.error === 'notJson') return { ok: false, error: 'notJson' };
    return { ok: false, error: 'rejected' };
  }
  let player = 0;
  if (isDoc && doc.player && typeof doc.player === 'object') {
    const clean: PlayerOverrides = {};
    for (const [action, entry] of Object.entries(doc.player)) {
      if (!PLAYER_DEFAULT_KEYBINDINGS.some((d) => d.action === action)) continue;
      if (!entry || typeof entry !== 'object' || typeof (entry as { key?: unknown }).key !== 'string') continue;
      const value = (entry as { value?: unknown }).value;
      clean[action] = typeof value === 'number' && Number.isFinite(value)
        ? { key: (entry as { key: string }).key, value }
        : { key: (entry as { key: string }).key };
      player += 1;
    }
    writeLocalStorageJson(PLAYER_KEYBINDINGS_STORAGE_KEY, clean);
    announcePlayerKeymap(JSON.stringify(clean));
  }
  return { ok: true, player };
}

/** Reset the app keymap and the player's together ("Reset all"). */
export function resetWholeKeymap(): void {
  resetAllBindings();
  resetAllPlayerBindings();
}

/** `Ctrl+K · Ctrl+P` for any entry; '' when unbound. */
export function entryKeysDisplay(id: string): string {
  return formatKeysDisplay(entryChords(id).join('|'));
}

/** Player action label key (shared with the Help page). */
export function playerActionLabelKey(action: string): string {
  return `helpKeys.player.${action}`;
}

/** Player rows for the editor, in the vendor's order. */
export function playerRows(): { action: string; id: string; code: string; keys: string; isDefault: boolean; value?: number }[] {
  const current = playerBindings();
  const stored = readPlayerOverrides();
  return PLAYER_DEFAULT_KEYBINDINGS.map((def) => {
    const code = current[def.action] ?? def.code;
    const value = typeof stored[def.action]?.value === 'number' ? (stored[def.action]?.value as number) : def.value;
    return {
      action: def.action,
      id: `${PLAYER_ENTRY_PREFIX}${def.action}`,
      code,
      keys: formatPlayerKeyCode(code),
      isDefault: code === def.code,
      value,
    };
  });
}

/** Every catalog id; used by the palette coverage test and the editor. */
export function catalogIds(): string[] {
  return COMMAND_CATALOG.map((c) => c.id);
}
