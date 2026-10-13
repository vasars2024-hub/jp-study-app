/**
 * Settings-only export and import (WP3, Settings row of docs/SCORECARD.md).
 *
 * A full backup carries everything, user data included. This carries only
 * preferences, chosen by group, so they can move to another install or be kept
 * as a known-good set. The groups and the keys they may carry are the catalog's
 * (`SETTINGS_TRANSFER_GROUPS`); the catalog also holds the deny list that keeps
 * secrets, user data and machine-specific state out of the file.
 *
 * The file:
 *
 *   { format: 'gum-settings', schemaVersion, appVersion, studyLanguage,
 *     exportedAt, groups: { <groupId>: { <storageKey>: value | null } } }
 *
 * `null` means "default here" (the key was absent), so an import reproduces the
 * exporting install's group exactly. JSON blobs are stored parsed, so the file
 * is readable; plain-text keys are stored as strings.
 *
 * Import is validate -> preview -> apply:
 *
 * 1. every group and key is checked against the catalog and a per-key validator.
 *    An unknown group or key, a denied key, a value of the wrong shape, a path
 *    from another machine, bad JSON or a newer schema refuses the whole file;
 * 2. `previewSettingsTransfer` diffs it against this install, field by field;
 * 3. `applySettingsTransfer` snapshots every key it touches, writes through the
 *    guarded writer, then has each key's owner announce the change (its change
 *    event, so open windows follow). Any failure puts the snapshot back and
 *    re-announces it: all or nothing. The returned `undo` re-applies the snapshot
 *    the same way.
 */
import {
  SETTINGS_TRANSFER_GROUPS,
  SETTINGS_TRANSFER_KEYS,
  settingsTransferKeyDenied,
  type SettingsTransferKeyName,
} from './settingsCatalog';
import { writeLocalStorage } from '../localStorageWrite';
import { markEnvironmentSwapped, saveEnvironment } from '../environment/environmentStore';
import { DEFAULT_ENVIRONMENT } from '../environment/types';
import { applyTheme, loadThemeId } from '../theme';
import { applyAutoThemeIfEnabled, savePersonalization } from '../osPersonalization';
import { loadCustomCss, sanitizeUserCss, saveCustomCss } from '../customCss';
import { saveDisplayPrefs } from '../displayPrefs';
import { setWindowChromeMode } from '../windowChrome';
import { saveDesktopPrefs } from '../desktopPrefs';
import { saveFileDropPrefs } from '../fileDropPrefs';
import { customCommandProblem, importShortcuts } from '../keyboardShortcuts';
import { loadVizSettings, saveVizSettings } from '../visualizerSettings';
import { loadMusicWidgetSettings, saveMusicWidgetSettings } from '../musicWidgetSettings';
import { loadLyricsSettings, saveLyricsSettings } from '../lyricsSettings';
import {
  DEFAULT_SETTINGS as READER_DEFAULTS,
  READER_SETTINGS_CHANGED,
  loadSettings as loadReaderSettings,
} from '../readerSettings';
import { TRANSLATE_SOURCE_EVENT, getTranslateSource } from '../translateSource';
import { TRANSLATE_TARGET_EVENT, getTranslateTarget } from '../translateTarget';
import { saveToolboxSettings } from '../toolboxSettings';
import { DEFAULT_TOOLBOX_SETTINGS } from '../../shared/toolboxSettings';
import { getStudyLang } from '../studyEnvironment';
import { SECRET_SHELL_THEMES } from '../components/settings/settingsRegistry';

export const SETTINGS_TRANSFER_FORMAT = 'gum-settings';
/** Bump when the file's shape changes; an import refuses anything newer. */
export const SETTINGS_TRANSFER_SCHEMA_VERSION = 1;

const K = SETTINGS_TRANSFER_KEYS;

// ---------------------------------------------------------------------------
// Value checks
// ---------------------------------------------------------------------------

type FieldType = 'boolean' | 'number' | 'string' | 'array' | 'object';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function typeOf(v: unknown): FieldType | null {
  if (Array.isArray(v)) return 'array';
  if (v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? 'number' : null;
  if (typeof v === 'boolean' || typeof v === 'string' || typeof v === 'object') return typeof v as FieldType;
  return null;
}

/** The field types a defaults object implies (null / undefined defaults are unchecked). */
function shapeOf(defaults: object): Record<string, FieldType> {
  const shape: Record<string, FieldType> = {};
  for (const [field, value] of Object.entries(defaults)) {
    const type = typeOf(value);
    if (type) shape[field] = type;
  }
  return shape;
}

/**
 * A plain object whose known fields have the right types. Unknown fields pass:
 * the owner's loader drops or normalizes them, and refusing them would refuse
 * every file from a slightly newer build of the same schema.
 */
function fieldsMatch(v: unknown, shape: Record<string, FieldType>): boolean {
  if (!isPlainObject(v)) return false;
  for (const [field, type] of Object.entries(shape)) {
    if (!(field in v) || v[field] === undefined) continue;
    if (typeOf(v[field]) !== type) return false;
  }
  return true;
}

const LANG_CODE = /^[A-Za-z][A-Za-z0-9-]{0,15}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const THEME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EXAMPLE_LANGS = ['en', 'ru', 'zh', 'ja'];
const MAX_CSS_CHARS = 200_000;

const ENVIRONMENT_SHAPE = shapeOf(DEFAULT_ENVIRONMENT);
const READER_SHAPE = shapeOf(READER_DEFAULTS);
const TOOLBOX_SHAPE = shapeOf(DEFAULT_TOOLBOX_SETTINGS);

/**
 * A string that names a place on some machine: a drive path, a UNC share, a
 * home directory or a file URL. A settings file must carry none — on another
 * PC they point nowhere, and on this one they say where the owner keeps things.
 */
const MACHINE_PATH = /(?:file:\/\/|(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]|^\\\\[^\\]|(?:^|[\s"'(])\/(?:Users|home|mnt|Volumes)\/)/;

/** The first string inside `value` that looks like a machine path, or null. */
export function findMachinePath(value: unknown, depth = 0): string | null {
  if (depth > 32) return null;
  if (typeof value === 'string') return MACHINE_PATH.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findMachinePath(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) {
      const hit = findMachinePath(item, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Environment: image and video wallpapers are files on this PC
// ---------------------------------------------------------------------------

interface PlaylistLike {
  id?: unknown;
  items?: unknown;
}

function isLocalWallpaper(item: unknown): boolean {
  return isPlainObject(item) && item.kind !== 'preset';
}

/** The environment without wallpaper items that are files (kind image / video). */
function stripLocalWallpapers(env: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(env.playlists)) return env;
  return {
    ...env,
    playlists: env.playlists.map((pl: unknown) => {
      if (!isPlainObject(pl) || !Array.isArray(pl.items)) return pl;
      return { ...pl, items: pl.items.filter((item) => !isLocalWallpaper(item)) };
    }),
  };
}

/**
 * Keep this PC's own image and video wallpapers when an environment comes in:
 * they are appended back to the playlist (by id) they were in. Without this an
 * import would silently drop every picture the owner added here.
 */
function keepLocalWallpapers(incoming: Record<string, unknown>, currentRaw: string | null): Record<string, unknown> {
  if (!currentRaw || !Array.isArray(incoming.playlists)) return incoming;
  let current: unknown;
  try {
    current = JSON.parse(currentRaw);
  } catch {
    return incoming;
  }
  if (!isPlainObject(current) || !Array.isArray(current.playlists)) return incoming;
  const localByPlaylist = new Map<unknown, unknown[]>();
  for (const pl of current.playlists as PlaylistLike[]) {
    if (!isPlainObject(pl) || !Array.isArray(pl.items)) continue;
    const local = pl.items.filter(isLocalWallpaper);
    if (local.length) localByPlaylist.set(pl.id, local);
  }
  if (!localByPlaylist.size) return incoming;
  return {
    ...incoming,
    playlists: incoming.playlists.map((pl: unknown) => {
      if (!isPlainObject(pl) || !Array.isArray(pl.items)) return pl;
      const local = localByPlaylist.get(pl.id);
      return local ? { ...pl, items: [...pl.items, ...local] } : pl;
    }),
  };
}

// ---------------------------------------------------------------------------
// Per-key rules: how the value is stored, what it must look like, and how its
// owner announces a change.
// ---------------------------------------------------------------------------

interface KeyRule {
  /** `json`: the stored string is JSON and the file carries it parsed. `text`: a plain string. */
  kind: 'json' | 'text';
  validate: (value: unknown) => boolean;
  /** Export side: strip what must not leave this PC. */
  forExport?: (value: unknown) => unknown;
  /** Import side: fold in what must stay on this PC. */
  forImport?: (value: unknown, currentRaw: string | null) => unknown;
  /**
   * Make the owner pick up the stored value and fire its change event. Called
   * after the raw write; it may rewrite the key in normalized form. Throws when
   * the owner refuses the value.
   */
  announce: () => void;
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const RULES: Record<SettingsTransferKeyName, KeyRule> = {
  environment: {
    kind: 'json',
    validate: (v) => fieldsMatch(v, ENVIRONMENT_SHAPE),
    forExport: (v) => (isPlainObject(v) ? stripLocalWallpapers(v) : v),
    forImport: (v, currentRaw) => (isPlainObject(v) ? keepLocalWallpapers(stripLocalWallpapers(v), currentRaw) : v),
    announce: () => {
      // A wholesale replacement: writers holding the previous environment must
      // not put it back (see `markEnvironmentSwapped`).
      markEnvironmentSwapped();
      saveEnvironment({});
    },
  },
  theme: {
    kind: 'text',
    validate: (v) => typeof v === 'string' && THEME_ID.test(v),
    announce: () => {
      applyTheme(loadThemeId());
      applyAutoThemeIfEnabled();
    },
  },
  personalization: {
    kind: 'json',
    validate: (v) =>
      fieldsMatch(v, {
        accentMode: 'string',
        accentPreset: 'string',
        customAccent: 'string',
        density: 'string',
        radius: 'string',
        chrome: 'string',
        shadow: 'string',
        fontFamily: 'string',
        wallpaperDim: 'number',
        autoTheme: 'boolean',
        customCssEnabled: 'boolean',
      })
      && (!('accentMode' in (v as object)) || ['preset', 'custom'].includes((v as { accentMode: string }).accentMode))
      && (!('customAccent' in (v as object)) || HEX_COLOR.test((v as { customAccent: string }).customAccent)),
    announce: () => {
      const next = savePersonalization({});
      // Auto theme masks the manual one; when it is off, the manual one shows.
      if (!next.autoTheme) applyTheme(loadThemeId());
    },
  },
  customCss: {
    kind: 'text',
    validate: (v) => typeof v === 'string' && v.length <= MAX_CSS_CHARS && sanitizeUserCss(v).ok,
    announce: () => {
      const result = saveCustomCss(loadCustomCss());
      if (!result.ok) throw new Error(result.error ?? 'custom CSS refused');
    },
  },
  displayPrefs: {
    kind: 'json',
    validate: (v) =>
      fieldsMatch(v, {
        baseFontPx: 'number',
        boldText: 'boolean',
        contrast: 'string',
        letterSpacing: 'string',
        nightLight: 'number',
        brightness: 'number',
        saturation: 'number',
        transparency: 'string',
        focusRing: 'string',
        scrollbarMode: 'string',
        smoothScroll: 'boolean',
        pointerSize: 'string',
        animationLevel: 'string',
        colorFilter: 'string',
        reduceFlashes: 'boolean',
        underlineLinks: 'boolean',
        windowChromeMode: 'string',
        remapLayoutProportionally: 'boolean',
      }),
    announce: () => {
      const next = saveDisplayPrefs({});
      // `saveDisplayPrefs` only tells main when the mode differs from what it
      // read, and it read the value just written.
      void setWindowChromeMode(next.windowChromeMode);
    },
  },
  desktopPrefs: {
    kind: 'json',
    validate: (v) =>
      fieldsMatch(v, {
        iconSize: 'string',
        iconLabel: 'string',
        iconTextColor: 'string',
        snapGrid: 'string',
        iconsLocked: 'boolean',
        singleClickOpen: 'boolean',
        taskbarSize: 'string',
        clockSeconds: 'boolean',
        clockShowDate: 'boolean',
        restoreSessionWindows: 'boolean',
        companionHostDisplays: 'string',
      }),
    announce: () => {
      saveDesktopPrefs({});
    },
  },
  fileDropPrefs: {
    kind: 'json',
    validate: (v) =>
      fieldsMatch(v, { autoRoute: 'boolean', alwaysTriage: 'boolean', undoDepth: 'number', overrides: 'object' }),
    announce: () => {
      saveFileDropPrefs({});
    },
  },
  shortcuts: {
    kind: 'json',
    validate: (v) =>
      isPlainObject(v)
      && isPlainObject(v.profiles)
      && (v.active === undefined || typeof v.active === 'string')
      && (v.customCommands === undefined
        || (Array.isArray(v.customCommands) && v.customCommands.every((c) => customCommandProblem(c) === null))),
    announce: () => {
      // The shortcut store lives in memory; its own import is the way in, and it
      // is all-or-nothing on its side too.
      const raw = readRaw(K.shortcuts) ?? JSON.stringify({ profiles: {}, customCommands: [] });
      const result = importShortcuts(raw);
      if (!result.ok) throw new Error(`shortcuts refused: ${result.error ?? 'unknown'}`);
    },
  },
  visualizer: {
    kind: 'json',
    validate: (v) =>
      fieldsMatch(v, {
        enabled: 'boolean',
        mode: 'string',
        style: 'string',
        intensity: 'number',
        freqTarget: 'string',
        fftSize: 'number',
        colorTheme: 'string',
        customColors: 'array',
      }),
    announce: () => saveVizSettings(loadVizSettings()),
  },
  musicWidget: {
    kind: 'json',
    validate: (v) => fieldsMatch(v, { showLyrics: 'boolean' }),
    announce: () => saveMusicWidgetSettings(loadMusicWidgetSettings()),
  },
  lyricsSettings: {
    kind: 'json',
    validate: (v) => fieldsMatch(v, { useAlbumInSearch: 'boolean' }),
    announce: () => saveLyricsSettings(loadLyricsSettings()),
  },
  readerSettings: {
    kind: 'json',
    validate: (v) => fieldsMatch(v, READER_SHAPE),
    announce: () => {
      window.dispatchEvent(new CustomEvent(READER_SETTINGS_CHANGED, { detail: loadReaderSettings() }));
    },
  },
  exampleCount: {
    kind: 'text',
    validate: (v) => typeof v === 'string' && /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 30,
    // No live listener: the dictionary reads it each time it renders a result.
    announce: () => undefined,
  },
  exampleLangs: {
    kind: 'json',
    validate: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && EXAMPLE_LANGS.includes(x)),
    // As above: read on the dictionary's next render.
    announce: () => undefined,
  },
  translateSource: {
    kind: 'text',
    validate: (v) => typeof v === 'string' && LANG_CODE.test(v),
    announce: () => {
      window.dispatchEvent(new CustomEvent<string>(TRANSLATE_SOURCE_EVENT, { detail: getTranslateSource('') }));
    },
  },
  translateTarget: {
    kind: 'text',
    validate: (v) => typeof v === 'string' && LANG_CODE.test(v),
    announce: () => {
      window.dispatchEvent(new CustomEvent<string>(TRANSLATE_TARGET_EVENT, { detail: getTranslateTarget() }));
    },
  },
  toolboxSettings: {
    kind: 'json',
    validate: (v) => fieldsMatch(v, TOOLBOX_SHAPE),
    announce: () => {
      saveToolboxSettings({});
    },
  },
};

/**
 * Owners announce in this order: the theme before personalization (auto theme
 * overrides the manual theme, so it must come last) and both before the
 * environment, whose Aero bridge listens to theme changes.
 */
const ANNOUNCE_ORDER: SettingsTransferKeyName[] = [
  'theme',
  'personalization',
  'customCss',
  ...(Object.keys(RULES) as SettingsTransferKeyName[]).filter(
    (n) => n !== 'theme' && n !== 'personalization' && n !== 'customCss',
  ),
];

function nameForKey(storageKey: string): SettingsTransferKeyName | null {
  for (const [name, key] of Object.entries(K)) {
    if (key === storageKey) return name as SettingsTransferKeyName;
  }
  return null;
}

/** Stored string -> the value a file carries, or `undefined` when it cannot be read. */
function decode(name: SettingsTransferKeyName, raw: string): unknown {
  if (RULES[name].kind === 'text') return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function encode(name: SettingsTransferKeyName, value: unknown): string {
  return RULES[name].kind === 'text' ? String(value) : JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface SettingsTransferFile {
  format: typeof SETTINGS_TRANSFER_FORMAT;
  schemaVersion: number;
  appVersion: string;
  studyLanguage: string;
  exportedAt: string;
  groups: Record<string, Record<string, unknown>>;
}

/** Why a key was left out of an export, or out of an import's changes. */
export type SettingsTransferSkipReason = 'unreadable' | 'machinePath' | 'secretShellTheme';

export interface SettingsTransferSkip {
  group: string;
  key: string;
  reason: SettingsTransferSkipReason;
}

export function listSettingsTransferGroups(): string[] {
  return SETTINGS_TRANSFER_GROUPS.map((g) => g.id);
}

/**
 * Build a settings file from the chosen groups. Allow-listed keys only, each
 * checked against the deny list once more; a value that cannot be read, or still
 * names a path on this PC after its export rule ran, is left out and reported.
 */
export function buildSettingsTransfer(
  groupIds: readonly string[],
  meta: { appVersion: string; now?: Date },
): { file: SettingsTransferFile; text: string; skipped: SettingsTransferSkip[] } {
  const groups: Record<string, Record<string, unknown>> = {};
  const skipped: SettingsTransferSkip[] = [];
  for (const group of SETTINGS_TRANSFER_GROUPS) {
    if (!groupIds.includes(group.id)) continue;
    const out: Record<string, unknown> = {};
    for (const name of group.keys) {
      const key = K[name];
      if (settingsTransferKeyDenied(key)) continue;
      const raw = readRaw(key);
      if (raw == null) {
        out[key] = null;
        continue;
      }
      let value = decode(name, raw);
      if (value === undefined) {
        skipped.push({ group: group.id, key, reason: 'unreadable' });
        continue;
      }
      const { forExport } = RULES[name];
      if (forExport) value = forExport(value);
      if (findMachinePath(value)) {
        skipped.push({ group: group.id, key, reason: 'machinePath' });
        continue;
      }
      out[key] = value;
    }
    groups[group.id] = out;
  }
  const file: SettingsTransferFile = {
    format: SETTINGS_TRANSFER_FORMAT,
    schemaVersion: SETTINGS_TRANSFER_SCHEMA_VERSION,
    appVersion: meta.appVersion,
    studyLanguage: getStudyLang(),
    exportedAt: (meta.now ?? new Date()).toISOString(),
    groups,
  };
  return { file, text: `${JSON.stringify(file, null, 2)}\n`, skipped };
}

/** `gum-settings-2026-10-13.json` */
export function settingsTransferFileName(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `gum-settings-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// ---------------------------------------------------------------------------
// Import: parse and validate
// ---------------------------------------------------------------------------

export type SettingsTransferError =
  | 'badJson'
  | 'notSettings'
  | 'newerSchema'
  | 'unknownGroup'
  | 'unknownKey'
  | 'forbiddenKey'
  | 'badValue'
  | 'machinePath'
  | 'empty';

export interface SettingsTransferEntry {
  group: string;
  name: SettingsTransferKeyName;
  key: string;
  /** The string to store, or null to remove the key (the exporter had the default). */
  raw: string | null;
}

export interface ParsedSettingsTransfer {
  schemaVersion: number;
  appVersion: string;
  studyLanguage: string;
  exportedAt: string;
  entries: SettingsTransferEntry[];
}

export type SettingsTransferParseResult =
  | { ok: true; file: ParsedSettingsTransfer }
  | { ok: false; error: SettingsTransferError; key?: string };

/** Read a settings file. Anything wrong anywhere refuses the whole file. */
export function parseSettingsTransfer(text: string): SettingsTransferParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'badJson' };
  }
  if (!isPlainObject(data) || data.format !== SETTINGS_TRANSFER_FORMAT) return { ok: false, error: 'notSettings' };
  const version = data.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'notSettings' };
  }
  if (version > SETTINGS_TRANSFER_SCHEMA_VERSION) return { ok: false, error: 'newerSchema' };
  if (!isPlainObject(data.groups)) return { ok: false, error: 'notSettings' };

  const entries: SettingsTransferEntry[] = [];
  for (const [groupId, body] of Object.entries(data.groups)) {
    const group = SETTINGS_TRANSFER_GROUPS.find((g) => g.id === groupId);
    if (!group) return { ok: false, error: 'unknownGroup', key: groupId };
    if (!isPlainObject(body)) return { ok: false, error: 'badValue', key: groupId };
    for (const [key, value] of Object.entries(body)) {
      if (settingsTransferKeyDenied(key)) return { ok: false, error: 'forbiddenKey', key };
      const name = nameForKey(key);
      if (!name || !group.keys.includes(name)) return { ok: false, error: 'unknownKey', key };
      if (value === null) {
        entries.push({ group: groupId, name, key, raw: null });
        continue;
      }
      const rule = RULES[name];
      if (!rule.validate(value)) return { ok: false, error: 'badValue', key };
      if (findMachinePath(rule.forExport ? rule.forExport(value) : value)) {
        return { ok: false, error: 'machinePath', key };
      }
      entries.push({ group: groupId, name, key, raw: encode(name, value) });
    }
  }
  if (!entries.length) return { ok: false, error: 'empty' };
  return {
    ok: true,
    file: {
      schemaVersion: version,
      appVersion: typeof data.appVersion === 'string' ? data.appVersion : '',
      studyLanguage: typeof data.studyLanguage === 'string' ? data.studyLanguage : '',
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      entries,
    },
  };
}

// ---------------------------------------------------------------------------
// Import: preview
// ---------------------------------------------------------------------------

export interface SettingsTransferFieldChange {
  /** Top-level field of a JSON value; '' for a plain-text value or a whole-value change. */
  field: string;
  before: string;
  after: string;
}

export interface SettingsTransferChange {
  group: string;
  name: SettingsTransferKeyName;
  key: string;
  before: string | null;
  after: string | null;
  fields: SettingsTransferFieldChange[];
}

export interface SettingsTransferPreview {
  changes: SettingsTransferChange[];
  /** Keys in the file that already match this install. */
  unchanged: number;
  skipped: SettingsTransferSkip[];
  /** The exporter studied a different language (shown, never applied). */
  studyLanguageDiffers: boolean;
}

const SUMMARY_CHARS = 48;

function summarize(value: unknown): string {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text == null) return '—';
  return text.length > SUMMARY_CHARS ? `${text.slice(0, SUMMARY_CHARS - 1)}…` : text;
}

function fieldChanges(name: SettingsTransferKeyName, before: string | null, after: string | null): SettingsTransferFieldChange[] {
  const b = before == null ? undefined : decode(name, before);
  const a = after == null ? undefined : decode(name, after);
  if (RULES[name].kind === 'json' && isPlainObject(b) && isPlainObject(a)) {
    const fields = new Set([...Object.keys(b), ...Object.keys(a)]);
    const out: SettingsTransferFieldChange[] = [];
    for (const field of [...fields].sort()) {
      if (JSON.stringify(b[field]) === JSON.stringify(a[field])) continue;
      out.push({ field, before: summarize(b[field]), after: summarize(a[field]) });
    }
    return out;
  }
  return [{ field: '', before: summarize(b), after: summarize(a) }];
}

/** Equal as stored values: byte-equal, or (JSON) equal once parsed. */
function sameValue(name: SettingsTransferKeyName, before: string | null, after: string | null): boolean {
  if (before === after) return true;
  if (before == null || after == null || RULES[name].kind !== 'json') return false;
  const b = decode(name, before);
  return b !== undefined && JSON.stringify(b) === JSON.stringify(decode(name, after));
}

function isSecretShellTheme(id: string | null): boolean {
  return id != null && SECRET_SHELL_THEMES.includes(id);
}

/** What applying the file would change here, without changing anything. */
export function previewSettingsTransfer(file: ParsedSettingsTransfer): SettingsTransferPreview {
  const changes: SettingsTransferChange[] = [];
  const skipped: SettingsTransferSkip[] = [];
  let unchanged = 0;
  for (const entry of file.entries) {
    const before = readRaw(entry.key);
    let after = entry.raw;
    if (entry.name === 'theme' && (isSecretShellTheme(before) || isSecretShellTheme(after))) {
      // Entering or leaving Aero / WIRED swaps the whole living environment
      // through its own bridge; done as a side effect of an import it would
      // overwrite the environment this same file brings. Use the shell's own door.
      skipped.push({ group: entry.group, key: entry.key, reason: 'secretShellTheme' });
      continue;
    }
    const rule = RULES[entry.name];
    if (after != null && rule.kind === 'json') {
      let incoming = decode(entry.name, after);
      const current = before == null ? undefined : decode(entry.name, before);
      // Fields the file does not mention are left as they are here, the way
      // every owner's own save(partial) treats them. A file from this build
      // carries every field; one from an older build lacks the new ones, and
      // those should not snap back to defaults.
      if (isPlainObject(current) && isPlainObject(incoming)) incoming = { ...current, ...incoming };
      if (rule.forImport) incoming = rule.forImport(incoming, before);
      after = encode(entry.name, incoming);
    }
    if (sameValue(entry.name, before, after)) {
      unchanged += 1;
      continue;
    }
    changes.push({
      group: entry.group,
      name: entry.name,
      key: entry.key,
      before,
      after,
      fields: fieldChanges(entry.name, before, after),
    });
  }
  return {
    changes,
    unchanged,
    skipped,
    studyLanguageDiffers: Boolean(file.studyLanguage) && file.studyLanguage !== getStudyLang(),
  };
}

// ---------------------------------------------------------------------------
// Import: apply, roll back, undo
// ---------------------------------------------------------------------------

export type SettingsTransferApplyResult =
  | { ok: true; changed: number; undo: () => boolean }
  | { ok: false; error: 'writeFailed' | 'applyFailed'; key: string };

interface RawWrite {
  name: SettingsTransferKeyName;
  key: string;
  raw: string | null;
}

function writeRaw(key: string, raw: string | null): boolean {
  if (raw == null) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
  return writeLocalStorage(key, raw);
}

function announceAll(names: Set<SettingsTransferKeyName>, strict: boolean): SettingsTransferKeyName | null {
  for (const name of ANNOUNCE_ORDER) {
    if (!names.has(name)) continue;
    try {
      RULES[name].announce();
    } catch (err) {
      if (strict) return name;
      console.warn(`[settings-transfer] ${name} could not be re-announced:`, err);
    }
  }
  return null;
}

/**
 * Best effort: put every snapshot value back and let the owners re-read it.
 * Owners may rewrite their key in normalized form while announcing, so the
 * snapshot is written once more afterwards: a rollback leaves storage exactly
 * as it was, not merely equivalent to it.
 */
function restore(snapshot: RawWrite[]): boolean {
  let ok = true;
  for (const s of snapshot) {
    if (!writeRaw(s.key, s.raw)) ok = false;
  }
  announceAll(new Set(snapshot.map((s) => s.name)), false);
  for (const s of snapshot) {
    if (!writeRaw(s.key, s.raw)) ok = false;
  }
  return ok;
}

/**
 * Write, announce, and on any failure restore. `exact` (Undo) writes the values
 * once more after the owners announced, as `restore` does, so an undo leaves
 * storage byte-identical to before the import rather than owner-normalized.
 */
function applyWrites(writes: RawWrite[], exact = false): SettingsTransferApplyResult {
  const snapshot: RawWrite[] = writes.map((w) => ({ name: w.name, key: w.key, raw: readRaw(w.key) }));
  for (const w of writes) {
    if (!writeRaw(w.key, w.raw)) {
      restore(snapshot);
      return { ok: false, error: 'writeFailed', key: w.key };
    }
  }
  const failed = announceAll(new Set(writes.map((w) => w.name)), true);
  if (failed) {
    restore(snapshot);
    return { ok: false, error: 'applyFailed', key: K[failed] };
  }
  if (exact) {
    for (const w of writes) writeRaw(w.key, w.raw);
  }
  return {
    ok: true,
    changed: writes.length,
    undo: () => applyWrites(snapshot, true).ok,
  };
}

/**
 * Apply a preview's changes, all or nothing. On success the result carries an
 * `undo` that puts back exactly what was there before (also all or nothing).
 */
export function applySettingsTransfer(changes: readonly SettingsTransferChange[]): SettingsTransferApplyResult {
  return applyWrites(changes.map((c) => ({ name: c.name, key: c.key, raw: c.after })));
}
