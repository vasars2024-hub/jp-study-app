/**
 * The one registry for OS-wide (Windows) hotkeys.
 *
 * Every command marked `global: true` in Settings → Shortcuts is held here,
 * and nowhere else calls `globalShortcut.register`. Features plug in with
 *
 *   registerGlobalCommand('lens.region', () => openLens('select'));
 *
 * and never see a chord: the chord is the user's, chosen in Settings →
 * Shortcuts (the renderer's store is the source of truth and pushes the whole
 * map over `globalCommands:sync` on boot and on every rebind). Main keeps the
 * last pushed map in `global-commands.json` so hotkeys work from the first
 * second of a boot, before any window has loaded.
 *
 * What the registry guarantees, so no feature has to:
 *  - two Gum commands never hold the same chord (the later one reports
 *    `duplicate` with the holder's id);
 *  - a rebind releases the old accelerator before claiming the new one;
 *  - a chord Windows refuses (another program owns it) is reported as
 *    `in-use` per command instead of dying silently;
 *  - a feature that is switched off holds nothing (`setGlobalCommandAvailable`);
 *  - everything is released on quit (`stopGlobalCommands`).
 *
 * ---------------------------------------------------------------------------
 * API for other features (live captions etc.):
 *
 *   registerGlobalCommand(id, handler, opts?) → dispose()
 *     id       — the Shortcuts catalog id (add a `global: true` row with the
 *                same id to `COMMAND_CATALOG` in renderer/keyboardShortcuts.ts
 *                and its default to GLOBAL_COMMAND_DEFAULTS in
 *                shared/globalCommands.ts so it can be rebound).
 *     handler  — () => void | Promise<void>; errors are caught and logged.
 *     opts.defaultKeys — default chord when the id is not in GLOBAL_COMMAND_DEFAULTS.
 *     opts.available   — boolean | () => boolean; false holds no chord.
 *     opts.legacyKeys  — () => string; a chord a pre-registry settings file held.
 *   runGlobalCommand(id) → boolean   run it now (tray, radial wheel, IPC).
 *   setGlobalCommandAvailable(id, on)
 *   listGlobalCommands() → GlobalCommandStatus[]
 *   getGlobalCommandChord(id) → string
 *   onGlobalCommandsChanged(cb) → off()
 * ---------------------------------------------------------------------------
 */

import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import path from 'node:path';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { LOCK_SAFE_COMMANDS, refuseWhileLocked } from './lockGuard';
import {
  chordToAccelerator,
  GLOBAL_COMMAND_DEFAULTS,
  normalizeGlobalChord,
  planGlobalRegistrations,
  type GlobalCommandError,
  type GlobalCommandStatus,
} from '../shared/globalCommands';

export type { GlobalCommandStatus } from '../shared/globalCommands';

export type GlobalCommandHandler = () => void | Promise<void>;

export interface GlobalCommandOptions {
  /** Default chord for an id that is not in GLOBAL_COMMAND_DEFAULTS. */
  defaultKeys?: string;
  /** Hold the chord only while this is true (a feature's own on/off switch). */
  available?: boolean | (() => boolean);
  /** The chord a pre-registry settings file held; used until the renderer first pushes. */
  legacyKeys?: () => string;
}

interface Entry {
  id: string;
  handler: GlobalCommandHandler | null;
  defaultKeys: string;
  available: boolean | (() => boolean);
  legacyKeys: (() => string) | null;
  /** Accelerator currently held with Windows. */
  held: string | null;
  error?: GlobalCommandError;
  /** What `register` threw, for a `failed` error. */
  errorDetail?: string;
  conflictWith?: string;
}

interface StoredState {
  version: 1;
  /** Chords pushed by Settings → Shortcuts; an id absent here has never been pushed. */
  chords: Record<string, string>;
}

const STATE_FILE = 'global-commands.json';

const entries = new Map<string, Entry>();
let pushed: Record<string, string> | null = null;
let stopped = false;
const listeners = new Set<(list: GlobalCommandStatus[]) => void>();

function statePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE);
}

function loadPushed(): Record<string, string> {
  if (pushed) return pushed;
  const parsed = readJsonSync<Partial<StoredState>>(statePath(), {}, {
    validate: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  });
  const chords: Record<string, string> = {};
  if (parsed.chords && typeof parsed.chords === 'object') {
    for (const [id, chord] of Object.entries(parsed.chords)) {
      if (typeof chord === 'string') chords[id] = chord;
    }
  }
  pushed = chords;
  return chords;
}

function savePushed(): void {
  try {
    writeJsonAtomicSync(statePath(), { version: 1, chords: pushed ?? {} } satisfies StoredState);
  } catch (err) {
    console.error('[globalCommands] failed to persist chords', err);
  }
}

function ensureEntry(id: string): Entry {
  let entry = entries.get(id);
  if (!entry) {
    entry = {
      id,
      handler: null,
      defaultKeys: GLOBAL_COMMAND_DEFAULTS[id] ?? '',
      available: true,
      legacyKeys: null,
      held: null,
    };
    entries.set(id, entry);
  }
  return entry;
}

/** The chord a command is bound to right now ('' = unbound). */
export function getGlobalCommandChord(id: string): string {
  const store = loadPushed();
  if (id in store) return normalizeGlobalChord(store[id]!);
  const entry = entries.get(id);
  const legacy = entry?.legacyKeys ? safeLegacy(entry.legacyKeys) : '';
  if (legacy) return normalizeGlobalChord(legacy);
  return normalizeGlobalChord(entry?.defaultKeys ?? GLOBAL_COMMAND_DEFAULTS[id] ?? '');
}

function safeLegacy(fn: () => string): string {
  try {
    return String(fn() ?? '').trim();
  } catch {
    return '';
  }
}

function isAvailable(entry: Entry): boolean {
  try {
    return typeof entry.available === 'function' ? entry.available() !== false : entry.available !== false;
  } catch {
    return false;
  }
}

/** Built-ins first in their catalog order, then everything else in registration order. */
function orderedIds(): string[] {
  const builtins = Object.keys(GLOBAL_COMMAND_DEFAULTS).filter((id) => entries.has(id));
  const others = [...entries.keys()].filter((id) => !(id in GLOBAL_COMMAND_DEFAULTS));
  return [...builtins, ...others];
}

function release(entry: Entry): void {
  if (!entry.held) return;
  try {
    globalShortcut.unregister(entry.held);
  } catch {
    /* already gone */
  }
  entry.held = null;
}

function fire(id: string): void {
  const handler = entries.get(id)?.handler;
  if (!handler) return;
  // The one chokepoint for chords, tray rows, the radial wheel and the IPC: while
  // locked only the commands that bring the lock UI forward run (lockGuard.ts).
  if (!LOCK_SAFE_COMMANDS.has(id) && refuseWhileLocked(`command:${id}`)) return;
  try {
    const out = handler();
    if (out && typeof (out as Promise<void>).catch === 'function') {
      (out as Promise<void>).catch((err) => console.error(`[globalCommands] ${id} failed`, err));
    }
  } catch (err) {
    console.error(`[globalCommands] ${id} failed`, err);
  }
}

/**
 * Bring what Windows holds in line with the chords and switches. Releases
 * first, then claims, so a swap (A↔B) never collides with itself.
 */
function reconcile(): void {
  if (stopped) return;
  const ids = orderedIds();
  const plan = planGlobalRegistrations(
    ids.map((id) => {
      const entry = entries.get(id)!;
      return { id, chord: getGlobalCommandChord(id), active: Boolean(entry.handler) && isAvailable(entry) };
    }),
  );
  for (const step of plan) {
    const entry = entries.get(step.id)!;
    if (entry.held && entry.held !== step.accelerator) release(entry);
  }
  for (const step of plan) {
    const entry = entries.get(step.id)!;
    entry.error = step.error;
    entry.errorDetail = undefined;
    entry.conflictWith = step.conflictWith;
    if (!step.accelerator || entry.held === step.accelerator) continue;
    try {
      const ok = globalShortcut.register(step.accelerator, () => fire(step.id));
      if (ok) entry.held = step.accelerator;
      else entry.error = 'in-use';
    } catch (err) {
      entry.error = 'failed';
      entry.errorDetail = err instanceof Error ? err.message : String(err);
      console.warn(`[globalCommands] ${step.id}: register("${step.accelerator}") threw`, err);
    }
  }
  emit();
}

function statusOf(entry: Entry): GlobalCommandStatus {
  return {
    id: entry.id,
    chord: getGlobalCommandChord(entry.id),
    accelerator: entry.held,
    registered: entry.held !== null,
    available: isAvailable(entry),
    hasHandler: Boolean(entry.handler),
    ...(entry.error ? { error: entry.error } : {}),
    ...(entry.conflictWith ? { conflictWith: entry.conflictWith } : {}),
  };
}

export function listGlobalCommands(): GlobalCommandStatus[] {
  return orderedIds().map((id) => statusOf(entries.get(id)!));
}

export function getGlobalCommandStatus(id: string): GlobalCommandStatus | null {
  const entry = entries.get(id);
  return entry ? statusOf(entry) : null;
}

function emit(): void {
  const list = listGlobalCommands();
  for (const cb of listeners) {
    try {
      cb(list);
    } catch {
      /* a listener's failure is its own */
    }
  }
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('globalCommands:changed', list);
    }
  } catch {
    /* no windows yet */
  }
}

export function onGlobalCommandsChanged(cb: (list: GlobalCommandStatus[]) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Give a command its behaviour. Claims the chord at once when the command is
 * available. Returns a disposer that releases the chord and forgets the handler
 * (the chord itself stays the user's).
 */
export function registerGlobalCommand(
  id: string,
  handler: GlobalCommandHandler,
  opts: GlobalCommandOptions = {},
): () => void {
  const entry = ensureEntry(id);
  entry.handler = handler;
  if (typeof opts.defaultKeys === 'string' && !(id in GLOBAL_COMMAND_DEFAULTS)) entry.defaultKeys = opts.defaultKeys;
  if (opts.available !== undefined) entry.available = opts.available;
  if (opts.legacyKeys) entry.legacyKeys = opts.legacyKeys;
  stopped = false;
  reconcile();
  return () => {
    if (entry.handler !== handler) return;
    release(entry);
    entry.handler = null;
    entry.error = undefined;
    entry.conflictWith = undefined;
    reconcile();
  };
}

/** A feature's own on/off switch (popup dictionary, Reading Lens …). */
export function setGlobalCommandAvailable(id: string, available: boolean | (() => boolean)): void {
  ensureEntry(id).available = available;
  reconcile();
}

/** Re-check every `available` function (after e.g. the Startup helper was installed). */
export function refreshGlobalCommands(): void {
  reconcile();
}

/** Run a command now, as if its chord had been pressed. */
export function runGlobalCommand(id: string): boolean {
  const entry = entries.get(id);
  if (!entry?.handler || !isAvailable(entry)) return false;
  fire(id);
  return true;
}

/**
 * The whole map from Settings → Shortcuts. Ids missing from `chords` keep what
 * they had; an explicit '' unbinds.
 */
export function applyGlobalCommandChords(chords: Record<string, unknown>): GlobalCommandStatus[] {
  const store = { ...loadPushed() };
  for (const [id, chord] of Object.entries(chords ?? {})) {
    if (typeof chord !== 'string' || !id || id.length > 120) continue;
    store[id] = normalizeGlobalChord(chord);
    ensureEntry(id);
  }
  pushed = store;
  savePushed();
  reconcile();
  return listGlobalCommands();
}

/** One command's chord (the pre-registry IPC channels use this). */
export function setGlobalCommandChord(id: string, chord: string): GlobalCommandStatus {
  applyGlobalCommandChords({ [id]: chord });
  return statusOf(ensureEntry(id));
}

/**
 * `{ ok, error }` in the shape the per-command channels always returned
 * (`blanc:setGlobalShortcut`, `app:setToggleShortcut`, `lens:setHotkey` …).
 * English on purpose: these strings only reach logs and older callers; the
 * Settings UI translates the error code itself.
 */
export function legacyChordResult(status: GlobalCommandStatus | null): { ok: boolean; error?: string } {
  const entry = status ? entries.get(status.id) : undefined;
  switch (status?.error) {
    case undefined:
      return { ok: true };
    case 'needs-modifier':
      return { ok: false, error: 'Global shortcuts need at least one modifier key.' };
    case 'invalid':
      return { ok: false, error: 'This shortcut cannot be registered system-wide.' };
    case 'in-use':
      return { ok: false, error: `"${acceleratorOf(status.chord)}" is already in use by another application.` };
    case 'duplicate':
      return { ok: false, error: `Already used by ${status.conflictWith ?? 'another Gum shortcut'}.` };
    default:
      return { ok: false, error: entry?.errorDetail || 'Could not register the global shortcut.' };
  }
}

function acceleratorOf(chord: string): string {
  const parsed = chordToAccelerator(chord);
  return parsed.ok ? parsed.accelerator : chord;
}

/**
 * Chords the old per-module settings pages held, for the renderer's one-time
 * migration into the Shortcuts profiles.
 */
export function legacyGlobalChords(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of entries.values()) {
    const legacy = entry.legacyKeys ? safeLegacy(entry.legacyKeys) : '';
    if (legacy) out[entry.id] = legacy;
  }
  return out;
}

/** Release every accelerator (app quit). */
export function stopGlobalCommands(): void {
  for (const entry of entries.values()) release(entry);
  stopped = true;
}

export function registerGlobalCommandsIpc(): void {
  ipcMain.handle('globalCommands:sync', (_e, chords: unknown): GlobalCommandStatus[] =>
    applyGlobalCommandChords(chords && typeof chords === 'object' ? (chords as Record<string, unknown>) : {}),
  );
  ipcMain.handle('globalCommands:list', (): GlobalCommandStatus[] => listGlobalCommands());
  ipcMain.handle('globalCommands:run', (_e, id: unknown): boolean =>
    typeof id === 'string' ? runGlobalCommand(id) : false,
  );
  ipcMain.handle('globalCommands:legacyChords', (): Record<string, string> => legacyGlobalChords());
}

export const __globalCommandsTestables = {
  reset(): void {
    for (const entry of entries.values()) release(entry);
    entries.clear();
    pushed = null;
    stopped = false;
    listeners.clear();
  },
  statePath,
};
