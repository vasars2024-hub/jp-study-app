/**
 * Storage service — the one place that knows where every piece of user data
 * lives, split by weight:
 *
 *   IndexedDB (durable, async, big):   flashcard deck store, CSV editor
 *                                      draft, clipboard, calendar.
 *   localStorage (sync, tiny, UI):     theme, env (particles/companions/walls),
 *                                      display, shortcuts, study prefs.
 *   Host (main process):               mining config, AI config, desktop layout,
 *                                      study profiles.
 *
 * Memory & storage inventories domains via settingsCatalog. Backups are the
 * archive in `backupClient.ts` / `main/backup` (everything, including the
 * library); `exportAllData`/`importAllData` remain for the OLD single-JSON
 * format, which covers the renderer tiers and four host settings only.
 */

import { kvDelete, kvEntries, kvGet, kvSet, setIdbWritesBlocked } from './db';
import {
  collectLocalStorageSnapshot,
  domainById,
  enrichDomainInventory,
  listDomainInventoryLocal,
  removeKeysForDomain,
  SETTINGS_DOMAINS,
  type DomainInventoryItem,
  type HostBlobKey,
} from './settingsCatalog';
import { DEFAULT_TRADITIONAL_MINING_CONFIG } from '../../shared/mining';
import { DEFAULT_ENVIRONMENT, buildDefaultDayCyclePlaylist, buildDefaultRules } from '../environment/types';

/** IndexedDB keys for heavy data. */
export const IDB_KEYS = {
  flashcardDeck: 'flashcard-deck',
  csvEditor: 'csv-editor',
  clipboardHistory: 'clipboard-history',
  calendarEvents: 'calendar-events',
  /** Map of bookId → personal highlight annotations (H-key marks). */
  annotations: 'reading-annotations',
  /** Map of bookId → bookmarks. */
  bookmarks: 'reading-bookmarks',
  /** Map of grammar point id → human review verdict on its imported examples. */
  grammarCuration: 'grammar-curation',
  /** Versioned envelope of grammar point id → per-point familiarity level. */
  grammarFamiliarity: 'grammar-familiarity',
  /** Last-used practice session shape (count, direction, types, ratio). */
  grammarSessionOptions: 'grammar-session-options',
  /** Versioned envelope of completed practice sessions, newest first. */
  grammarSessionHistory: 'grammar-session-history',
  /** Versioned media language profiles and study-session history. */
  mediaStudy: 'media-study-database',
  /** Potentially large imported JLPT/HSK/custom vocabulary lists. */
  levelLists: 'level-lists',
} as const;

/** localStorage keys that hold the matching hot-path caches. */
export const LS_KEYS = {
  flashcardDeck: 'jp-flashcard-deck',
  csvEditor: 'jp-study-csv-editor-v1',
  clipboardHistory: 'jp-clipboard-history',
  calendarEvents: 'jp-calendar-events',
  mediaTracking: 'jp-media-tracking-v1',
  mediaStudy: 'jp-media-study-database-v1',
} as const;

/** localStorage keys that are pure UI state (kept out of IndexedDB). */
export const UI_STATE_KEYS = [
  'jp-os-theme',
  'jp-os-accent',
  'jp-os-reduce-motion',
  'jp-app-zoom',
] as const;

const pendingMirrors = new Map<string, unknown>();
let mirrorTimer: number | null = null;

function scheduleIdle(fn: () => void): void {
  const idle = window.requestIdleCallback as
    | ((cb: IdleRequestCallback, opts?: IdleRequestOptions) => number)
    | undefined;
  if (idle) {
    idle(fn, { timeout: 2500 });
    return;
  }
  window.setTimeout(fn, 250);
}

function flushMirrors(): void {
  mirrorTimer = null;
  const batch = Array.from(pendingMirrors.entries());
  pendingMirrors.clear();
  for (const [key, value] of batch) {
    void kvSet(key, value).catch((err) => {
      console.error(`[storage] IndexedDB mirror failed for ${key}:`, err);
    });
  }
}

/** Fire-and-forget mirror of a heavy value into IndexedDB, off the click path. */
export function mirrorToIdb(key: string, value: unknown): void {
  if (writeBlock) return;
  pendingMirrors.set(key, value);
  if (mirrorTimer != null) return;
  mirrorTimer = window.setTimeout(() => scheduleIdle(flushMirrors), 120);
}

/**
 * Land every pending mirror now. A restore calls this before it snapshots the
 * current data, so the copy it keeps aside is not missing the last edits.
 */
export async function flushPendingMirrors(): Promise<void> {
  if (mirrorTimer != null) {
    window.clearTimeout(mirrorTimer);
    mirrorTimer = null;
  }
  const batch = Array.from(pendingMirrors.entries());
  pendingMirrors.clear();
  await Promise.all(batch.map(([key, value]) => kvSet(key, value).catch((err) => {
    console.error(`[storage] IndexedDB mirror failed for ${key}:`, err);
  })));
}

// ── restore write block ──────────────────────────────────────────────────────

/**
 * While a backup restore replaces this origin's renderer data, and until the
 * app relaunches, nothing in any window may write it: a pending mirror or an
 * in-memory store saving itself would land on top of the restored values.
 *
 * - `'idb'`: IndexedDB kv writes and mirrors are dropped (pending ones too).
 *   The restoring window uses this while it applies the snapshot itself.
 * - `'all'`: localStorage writes are dropped as well.
 *
 * The window that applies the restore sets this itself; every other window
 * gets it from main (`backup:restoring`).
 */
let writeBlock: 'idb' | 'all' | null = null;
let storageWrites: Pick<Storage, 'setItem' | 'removeItem' | 'clear'> | null = null;

export function rendererWritesBlocked(): 'idb' | 'all' | null {
  return writeBlock;
}

export function setRendererWriteBlock(scope: 'idb' | 'all' | null): void {
  writeBlock = scope;
  setIdbWritesBlocked(scope !== null);
  if (scope !== null) {
    pendingMirrors.clear();
    if (mirrorTimer != null) {
      window.clearTimeout(mirrorTimer);
      mirrorTimer = null;
    }
  }
  if (typeof Storage === 'undefined' || typeof localStorage === 'undefined') return;
  const proto = Storage.prototype;
  if (scope === 'all' && !storageWrites) {
    const original = { setItem: proto.setItem, removeItem: proto.removeItem, clear: proto.clear };
    storageWrites = original;
    const blocked = (target: Storage): boolean => {
      try {
        return target === window.localStorage;
      } catch {
        return false;
      }
    };
    proto.setItem = function setItem(this: Storage, key: string, value: string): void {
      if (!blocked(this)) original.setItem.call(this, key, value);
    };
    proto.removeItem = function removeItem(this: Storage, key: string): void {
      if (!blocked(this)) original.removeItem.call(this, key);
    };
    proto.clear = function clear(this: Storage): void {
      if (!blocked(this)) original.clear.call(this);
    };
  } else if (scope !== 'all' && storageWrites) {
    proto.setItem = storageWrites.setItem;
    proto.removeItem = storageWrites.removeItem;
    proto.clear = storageWrites.clear;
    storageWrites = null;
  }
}

if (typeof window !== 'undefined') {
  try {
    (window as { api?: Partial<Window['api']> }).api?.onBackupRestoring?.((state) => {
      setRendererWriteBlock(state?.active ? 'all' : null);
    });
  } catch {
    /* no bridge (tests, plain browser) */
  }
}

export interface StoredItemInfo {
  key: string;
  label: string;
  tier?: 'indexeddb' | 'localStorage' | 'host' | 'mixed';
  category?: string;
  count?: number;
  modifiedAt?: number;
  bytes: number;
  detail?: string;
  clearable?: boolean;
  domainId?: string;
}

function estimateBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value) ?? '']).size;
  } catch {
    return 0;
  }
}

// `formatBytes` lives in shared/assetRegistry (tested, handles TB, used in ~40
// places). A second copy here formatted the same numbers differently.

async function collectIdbSnapshot(): Promise<Record<string, unknown>> {
  const idb: Record<string, unknown> = {};
  try {
    for (const [key, value] of await kvEntries()) idb[key] = value;
  } catch (err) {
    console.warn(
      '[storage] IndexedDB snapshot failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
  return idb;
}

async function collectHostSnapshot(): Promise<Partial<Record<HostBlobKey, unknown>>> {
  const host: Partial<Record<HostBlobKey, unknown>> = {};
  const api = typeof window !== 'undefined' ? window.api : null;
  if (!api) return host;
  try {
    host.mining = await api.miningGetConfig();
  } catch {
    /* ignore */
  }
  try {
    host.ai = await api.aiGetConfig();
  } catch {
    /* ignore */
  }
  try {
    host.desktopLayout = await api.desktopGetLayout();
  } catch {
    /* ignore */
  }
  try {
    host.profiles = await api.profileList();
  } catch {
    /* ignore */
  }
  return host;
}

/** Domain-aware inventory for Memory & storage UI. */
export async function listSettingsDomains(): Promise<DomainInventoryItem[]> {
  const base = listDomainInventoryLocal();
  const idb = await collectIdbSnapshot();
  const host = await collectHostSnapshot();
  return enrichDomainInventory(base, { idb, host });
}

/** Flat inventory (domains + any leftover raw keys). */
export async function listStoredItems(): Promise<StoredItemInfo[]> {
  const domains = await listSettingsDomains();
  const fromDomains: StoredItemInfo[] = domains
    .filter((d) => d.present || d.bytes > 0)
    .map((d) => ({
      key: `domain:${d.id}`,
      domainId: d.id,
      label: d.label,
      tier:
        d.tier === 'host'
          ? 'host'
          : d.tier === 'durable'
            ? 'indexeddb'
            : d.tier === 'mixed'
              ? 'mixed'
              : 'localStorage',
      category: d.category,
      count: d.count,
      bytes: d.bytes,
      detail: d.detail,
      clearable: d.clearable,
    }));

  // Surface orphan localStorage keys not claimed by any domain
  const claimed = new Set<string>();
  for (const def of SETTINGS_DOMAINS) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (def.lsKeys?.includes(k) || def.lsPrefixes?.some((p) => k.startsWith(p))) {
          if (!(def.id === 'lyrics-cache' && k === 'jp-lyrics-settings')) claimed.add(k);
        }
      }
    } catch {
      /* ignore */
    }
  }

  const orphans: StoredItemInfo[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || claimed.has(k)) continue;
      const v = localStorage.getItem(k);
      if (v == null) continue;
      orphans.push({
        key: `orphan:${k}`,
        label: k,
        tier: 'localStorage',
        category: 'Other',
        bytes: estimateBytes(v) + estimateBytes(k),
        count: 1,
        detail: 'Uncategorized local key',
      });
    }
  } catch {
    /* ignore */
  }

  return [...fromDomains, ...orphans].sort(
    (a, b) => b.bytes - a.bytes || a.label.localeCompare(b.label),
  );
}

export interface StorageBackup {
  app: 'jp-study-app';
  /** 1 = LS+IDB only; 2 = + host configs + domain manifest */
  format: 1 | 2;
  exportedAt: number;
  localStorage: Record<string, string>;
  indexedDb: Record<string, unknown>;
  host?: Partial<Record<HostBlobKey, unknown>>;
  domains?: Array<{ id: string; label: string; bytes: number; detail: string }>;
}

/** The old single-JSON export: localStorage, IndexedDB and four host settings — NOT the library or main-process stores. */
export async function exportAllData(): Promise<StorageBackup> {
  // Ensure reading highlights / bookmarks are mirrored into IDB before snapshot.
  try {
    const { collectAllAnnotationsMap } = await import('../annotations');
    const { collectAllBookmarksMap } = await import('../bookmarks');
    await kvSet(IDB_KEYS.annotations, collectAllAnnotationsMap());
    await kvSet(IDB_KEYS.bookmarks, collectAllBookmarksMap());
  } catch {
    /* ignore — LS still exported */
  }
  const ls = collectLocalStorageSnapshot();
  const idb = await collectIdbSnapshot();
  const host = await collectHostSnapshot();
  const domains = await listSettingsDomains();
  return {
    app: 'jp-study-app',
    format: 2,
    exportedAt: Date.now(),
    localStorage: ls,
    indexedDb: idb,
    host,
    domains: domains
      .filter((d) => d.present || d.bytes > 0)
      .map((d) => ({ id: d.id, label: d.label, bytes: d.bytes, detail: d.detail })),
  };
}

/**
 * Re-apply the four host settings the old single-JSON export carried, each
 * through its own validated IPC. Returns what could not be applied — the old
 * version swallowed every failure and the UI reported success.
 */
export async function restoreLegacyHost(
  host: Partial<Record<HostBlobKey, unknown>> | Record<string, unknown> | undefined,
): Promise<Array<{ what: string; error: string }>> {
  const failures: Array<{ what: string; error: string }> = [];
  if (!host) return failures;
  const api = window.api;
  if (!api) return [{ what: 'host', error: 'unavailable' }];
  const attempt = async (what: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      failures.push({ what, error: err instanceof Error ? err.message : String(err) });
    }
  };
  const h = host as Partial<Record<HostBlobKey, unknown>>;

  if (h.mining && typeof h.mining === 'object') {
    await attempt('mining', () => api.miningSetConfig(h.mining as Parameters<typeof api.miningSetConfig>[0]));
  }

  if (h.ai && typeof h.ai === 'object') {
    const ai = h.ai as {
      providerId?: string;
      selectedPresetId?: string;
      selectedFormatId?: string;
      outputFormat?: 'anki' | 'csv';
      cardCount?: number;
    };
    if (ai.providerId) {
      await attempt('ai.provider', () => api.aiSetProvider(ai.providerId as Parameters<typeof api.aiSetProvider>[0]));
    }
    if (ai.selectedPresetId) await attempt('ai.preset', () => api.aiSelectPreset(ai.selectedPresetId as string));
    if (typeof ai.selectedFormatId === 'string' && ai.selectedFormatId) {
      await attempt('ai.format', () =>
        api.aiSetFormat({
          formatId: ai.selectedFormatId as string,
          outputFormat: ai.outputFormat,
          cardCount: ai.cardCount,
        }),
      );
    }
  }

  if (h.desktopLayout && typeof h.desktopLayout === 'object') {
    const snap = h.desktopLayout as {
      viewports?: Array<{ desktopIndex: number; [k: string]: unknown }>;
      activeDesktopIndex?: number;
    };
    if (Array.isArray(snap.viewports)) {
      for (const vp of snap.viewports) {
        await attempt(`desktopLayout.${vp.desktopIndex}`, () =>
          api.desktopCommitLayout(
            vp.desktopIndex as Parameters<typeof api.desktopCommitLayout>[0],
            vp as unknown as Parameters<typeof api.desktopCommitLayout>[1],
          ),
        );
      }
    }
    if (typeof snap.activeDesktopIndex === 'number') {
      await attempt('desktopLayout.active', () =>
        api.desktopSwitch(snap.activeDesktopIndex as Parameters<typeof api.desktopSwitch>[0]),
      );
    }
  }

  if (Array.isArray(h.profiles)) {
    for (const p of h.profiles) {
      if (!p || typeof p !== 'object') continue;
      const prof = p as { id?: string; name?: string; [k: string]: unknown };
      if (typeof prof.id !== 'string') continue;
      try {
        await api.profileUpdate(prof.id as Parameters<typeof api.profileUpdate>[0], prof);
      } catch {
        // Profile may not exist — create then update.
        await attempt(`profile.${prof.name ?? prof.id}`, async () => {
          if (typeof prof.name !== 'string') throw new Error('profile has no name');
          await api.profileCreate(prof.name);
          await api.profileUpdate(prof.id as Parameters<typeof api.profileUpdate>[0], prof);
        });
      }
    }
  }
  return failures;
}

/**
 * Restore an OLD single-JSON backup (format 1 or 2). Returns an error string
 * on bad input or when anything failed — never "success" after a failed write.
 * localStorage and IndexedDB are replaced all-or-nothing (backupSnapshot.ts);
 * the new archive format goes through `backupClient.ts` instead.
 */
export async function importAllData(raw: string): Promise<string | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'Not a valid JSON file.';
  }
  const { applyRendererSnapshot, isLegacyBackup, legacyToSnapshot } = await import('./backupSnapshot');
  if (!isLegacyBackup(parsed)) {
    return 'This file is not a jp-study-app backup.';
  }
  try {
    await applyRendererSnapshot(legacyToSnapshot(parsed));
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  const failures = await restoreLegacyHost(parsed.format && parsed.format >= 2 ? parsed.host : undefined);

  // Rehydrate per-book highlights/bookmarks from durable IDB maps if LS missed any.
  try {
    const { restoreAnnotationsFromIdb } = await import('../annotations');
    const { restoreBookmarksFromIdb } = await import('../bookmarks');
    await restoreAnnotationsFromIdb();
    await restoreBookmarksFromIdb();
  } catch {
    /* ignore */
  }

  return failures.length ? failures.map((f) => `${f.what}: ${f.error}`).join('; ') : null;
}

function dispatchMany(events: string[]): void {
  for (const name of events) {
    try {
      window.dispatchEvent(new CustomEvent(name));
    } catch {
      /* ignore */
    }
  }
}

/** Clear one settings domain (local + idb + known host). */
export async function clearSettingsDomain(domainId: string): Promise<string | null> {
  const def = domainById(domainId);
  if (!def) return 'Unknown settings domain.';
  if (!def.clearable) return 'This domain cannot be cleared from here.';

  removeKeysForDomain(def);

  if (def.idbKeys) {
    for (const k of def.idbKeys) {
      try {
        await kvDelete(k);
      } catch {
        /* ignore */
      }
    }
  }

  // Domain-specific restore to defaults / events
  switch (domainId) {
    case 'environment': {
      const next = {
        ...DEFAULT_ENVIRONMENT,
        playlists: [buildDefaultDayCyclePlaylist()],
        rules: buildDefaultRules(),
      };
      try {
        localStorage.setItem('jp-os-environment-v1', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      try {
        window.dispatchEvent(
          new CustomEvent('jp-os-environment-changed', { detail: next }),
        );
      } catch {
        /* ignore */
      }
      break;
    }
    case 'appearance':
      dispatchMany(['jp-os-personalization-changed', 'jp-os-custom-css-changed']);
      break;
    case 'display':
      dispatchMany(['jp-os-display-prefs-changed', 'app-zoom-changed']);
      break;
    case 'desktop-prefs':
      dispatchMany(['jp-os-desktop-prefs-changed']);
      break;
    case 'shortcuts':
      dispatchMany(['shortcuts-changed']);
      break;
    case 'flashcards':
      dispatchMany(['flashcard-deck-changed']);
      break;
    case 'clipboard':
      dispatchMany(['clipboard-history-changed']);
      break;
    case 'calendar':
      dispatchMany(['calendar-events-changed']);
      break;
    case 'lookups':
      dispatchMany(['lookup-history-changed']);
      break;
    case 'study-progress':
      dispatchMany(['word-knowledge-changed', 'level-lists-changed']);
      break;
    case 'mining':
      try {
        await window.api.miningSetConfig(DEFAULT_TRADITIONAL_MINING_CONFIG);
      } catch {
        /* ignore */
      }
      break;
    default:
      break;
  }

  return null;
}

/** Delete only the CSV editor draft (grid contents), nothing else. */
export async function clearCsvGrid(): Promise<void> {
  await clearSettingsDomain('csv');
}

/** Delete flashcard decks (cards + folders). */
export async function clearFlashcardDecks(): Promise<void> {
  await clearSettingsDomain('flashcards');
}

/** Delete the clipboard history (pinned entries included). */
export async function clearClipboardHistoryStore(): Promise<void> {
  await clearSettingsDomain('clipboard');
}

/** Delete calendar events (list + IndexedDB mirror). */
export async function clearCalendarEventsStore(): Promise<void> {
  await clearSettingsDomain('calendar');
}

/** Drop cached lyrics JSON under jp-lyrics-*. */
export function clearLyricsCacheStore(): void {
  void clearSettingsDomain('lyrics-cache');
}

/** Drop dictionary lookup history ring buffer. */
export function clearLookupHistoryStore(): void {
  void clearSettingsDomain('lookups');
}

/** Read a heavy value, preferring the localStorage cache, falling back to IndexedDB. */
export async function readHeavy<T>(lsKey: string, idbKey: string): Promise<T | null> {
  try {
    const cached = localStorage.getItem(lsKey);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    /* fall through to IndexedDB */
  }
  const stored = await kvGet<T>(idbKey);
  return stored ?? null;
}

export type { DomainInventoryItem };
