// Immersion Browser main-process service: sites library, session, metrics, IPC.

import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import {
  IMMERSION_MAX_TABS,
  applyMetricsDelta,
  clearImmersionHistory,
  emptyDayMetrics,
  emptySession,
  emptySitesStore,
  immersionDayKey,
  migrateSitesStore,
  nextSiteStreak,
  normalizeImmersionUrl,
  type ImmersionBookmark,
  type ImmersionDayMetrics,
  type ImmersionHistoryRange,
  type ImmersionLang,
  type ImmersionMetricsDelta,
  type ImmersionMetricsMap,
  type ImmersionSaveSiteInput,
  type ImmersionSession,
  type ImmersionSite,
  type ImmersionSitesStore,
  type ImmersionVisitInput,
} from '../../shared/immersion';
import { registerVisualNovelIpc } from './visualNovels';
import { readJsonSync, writeJsonAtomicSync } from '../atomicJson';

function immersionDir(): string {
  const dir = path.join(app.getPath('userData'), 'immersion');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const isObject = (v: unknown): boolean => !!v && typeof v === 'object';

function readJson<T>(file: string, fallback: T): T {
  return readJsonSync<T>(file, fallback, { validate: isObject });
}

function sitesPath(): string {
  return path.join(immersionDir(), 'sites.json');
}
function sessionPath(): string {
  return path.join(immersionDir(), 'sessions.json');
}
function metricsPath(): string {
  return path.join(immersionDir(), 'metrics.json');
}

/** Exported for the migration test: reads either schema, answers v2. */
export function loadSites(): ImmersionSitesStore {
  const raw = readJson<unknown>(sitesPath(), emptySitesStore());
  return migrateSitesStore(raw);
}

function saveSites(store: ImmersionSitesStore): void {
  writeJsonAtomicSync(sitesPath(), store);
}

function loadSession(): ImmersionSession {
  const raw = readJson<ImmersionSession | null>(sessionPath(), null);
  if (!raw || !Array.isArray(raw.tabs) || raw.tabs.length === 0) return emptySession();
  const tabs = raw.tabs
    .filter((t) => t && typeof t.id === 'string')
    .slice(0, IMMERSION_MAX_TABS)
    .map((t) => ({
      id: t.id,
      url: typeof t.url === 'string' && (t.url === '' || normalizeImmersionUrl(t.url)) ? t.url : '',
      title: typeof t.title === 'string' ? t.title : '',
      mode: (t.mode === 'live' ? 'live' : t.mode === 'focus' ? 'focus' : 'reader') as ImmersionSession['tabs'][number]['mode'],
      scrollY: typeof t.scrollY === 'number' ? t.scrollY : undefined,
    }));
  if (tabs.length === 0) return emptySession();
  return {
    activeTabId:
      typeof raw.activeTabId === 'string' && tabs.some((t) => t.id === raw.activeTabId)
        ? raw.activeTabId
        : tabs[0].id,
    tabs,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

function saveSession(session: ImmersionSession): void {
  writeJsonAtomicSync(sessionPath(), { ...session, updatedAt: Date.now() });
}

function loadMetrics(): ImmersionMetricsMap {
  const raw = readJson<ImmersionMetricsMap>(metricsPath(), {});
  return raw && typeof raw === 'object' ? raw : {};
}

function saveMetrics(map: ImmersionMetricsMap): void {
  writeJsonAtomicSync(metricsPath(), map);
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function siteKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.replace(/\/$/, '') || u.host;
  } catch {
    return url;
  }
}

function findSiteByUrl(store: ImmersionSitesStore, url: string): ImmersionSite | undefined {
  const key = siteKey(url);
  return store.sites.find((s) => siteKey(s.url) === key);
}

function upsertVisit(input: ImmersionVisitInput): ImmersionSite {
  const url = normalizeImmersionUrl(input.url);
  if (!url) throw new Error('Invalid URL');
  const store = loadSites();
  const now = Date.now();
  const today = immersionDayKey();
  let site = findSiteByUrl(store, url);
  // An accumulation is not an arrival. `countVisit: false` banks the seconds and
  // characters onto the row and leaves the counter alone; anything that omits it
  // — the extension bridge included — still counts one, as it always did.
  const counts = input.countVisit !== false;
  if (!site) {
    const streak = nextSiteStreak(0, undefined, today);
    site = {
      id: crypto.randomUUID(),
      url,
      title: (input.title || url).trim(),
      lang: (input.lang as ImmersionLang) || 'auto',
      tags: [],
      completionPct: input.completionPct ?? 0,
      lastVisited: now,
      visitCount: counts ? 1 : 0,
      estimatedDifficulty: input.estimatedDifficulty ?? 0,
      streakDays: streak.streakDays,
      lastStreakDay: streak.lastStreakDay,
      totalSeconds: Math.max(0, input.seconds ?? 0),
      totalChars: Math.max(0, input.chars ?? 0),
      createdAt: now,
      updatedAt: now,
    };
    store.sites.push(site);
  } else {
    const streak = nextSiteStreak(site.streakDays, site.lastStreakDay, today);
    site.title = (input.title || site.title || url).trim();
    if (input.lang) site.lang = input.lang;
    site.lastVisited = now;
    if (counts) site.visitCount += 1;
    site.streakDays = streak.streakDays;
    site.lastStreakDay = streak.lastStreakDay;
    if (typeof input.seconds === 'number') site.totalSeconds += Math.max(0, input.seconds);
    if (typeof input.chars === 'number') site.totalChars += Math.max(0, input.chars);
    if (typeof input.completionPct === 'number') {
      site.completionPct = Math.min(100, Math.max(site.completionPct, input.completionPct));
    }
    if (typeof input.estimatedDifficulty === 'number') {
      site.estimatedDifficulty = Math.min(1, Math.max(0, input.estimatedDifficulty));
    }
    site.updatedAt = now;
  }
  saveSites(store);
  broadcast('immersion:sitesChanged', store);
  return site;
}

function findBookmarkByUrl(store: ImmersionSitesStore, url: string): ImmersionBookmark | undefined {
  const key = siteKey(url);
  return store.bookmarks.find((b) => siteKey(b.url) === key);
}

/**
 * Star, edit or unstar a page. Bookmarks are their own list now (audit r2 #12):
 * `favorite: false` REMOVES the bookmark — the reverse "Save site" never had —
 * and the page's history row, with its reading stats, is not touched either way.
 * Returns the bookmark, or `null` after an unstar.
 */
function saveSite(input: ImmersionSaveSiteInput): ImmersionBookmark | null {
  const url = normalizeImmersionUrl(input.url);
  if (!url) throw new Error('Invalid URL');
  const store = loadSites();
  const now = Date.now();
  let bookmark = findBookmarkByUrl(store, url);
  if (input.favorite === false) {
    if (bookmark) store.bookmarks = store.bookmarks.filter((b) => b.id !== bookmark?.id);
    const site = findSiteByUrl(store, url);
    if (site) site.favorite = false;
    saveSites(store);
    broadcast('immersion:sitesChanged', store);
    return null;
  }
  const folderId =
    typeof input.folderId === 'string' && store.folders.some((f) => f.id === input.folderId)
      ? input.folderId
      : undefined;
  if (!bookmark) {
    bookmark = {
      id: crypto.randomUUID(),
      url,
      title: (input.title || findSiteByUrl(store, url)?.title || url).trim(),
      lang: input.lang || findSiteByUrl(store, url)?.lang || 'auto',
      tags: cleanTags(input.tags ?? []),
      folderId,
      createdAt: now,
      updatedAt: now,
    };
    store.bookmarks.push(bookmark);
  } else {
    if (input.title) bookmark.title = input.title.trim();
    if (input.lang) bookmark.lang = input.lang;
    if (input.tags) bookmark.tags = cleanTags(input.tags);
    if (input.folderId === null) bookmark.folderId = undefined;
    else if (folderId) bookmark.folderId = folderId;
    bookmark.updatedAt = now;
  }
  // Kept in step for any reader of the old flag (the extension bridge, v1 tooling).
  const site = findSiteByUrl(store, url);
  if (site) site.favorite = true;
  saveSites(store);
  broadcast('immersion:sitesChanged', store);
  return bookmark;
}

function cleanTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean))].slice(0, 20);
}

/** "Clear history" over a time range. Bookmarks are a separate list and stay. */
function clearHistory(range: ImmersionHistoryRange): ImmersionSitesStore {
  const store = loadSites();
  store.sites = clearImmersionHistory(store.sites, range, Date.now());
  saveSites(store);
  broadcast('immersion:sitesChanged', store);
  return store;
}

function addFolder(name: string): ImmersionSitesStore {
  const store = loadSites();
  const clean = name.trim().slice(0, 80);
  if (clean && !store.folders.some((f) => f.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) {
    store.folders.push({ id: crypto.randomUUID(), name: clean, order: store.folders.length });
    saveSites(store);
    broadcast('immersion:sitesChanged', store);
  }
  return store;
}

/** Remove a folder; its bookmarks stay, unfiled. */
function removeFolder(id: string): ImmersionSitesStore {
  const store = loadSites();
  store.folders = store.folders.filter((f) => f.id !== id);
  for (const b of store.bookmarks) if (b.folderId === id) b.folderId = undefined;
  saveSites(store);
  broadcast('immersion:sitesChanged', store);
  return store;
}

function removeSite(id: string): ImmersionSitesStore {
  const store = loadSites();
  store.sites = store.sites.filter((s) => s.id !== id);
  saveSites(store);
  broadcast('immersion:sitesChanged', store);
  return store;
}

function bumpMetrics(delta: ImmersionMetricsDelta): ImmersionDayMetrics {
  const map = loadMetrics();
  const key = immersionDayKey();
  const next = applyMetricsDelta(map[key], delta);
  map[key] = next;
  saveMetrics(map);
  broadcast('immersion:metricsChanged', { dayKey: key, metrics: next, all: map });
  return next;
}

/** Extension bridge / non-IPC callers — same semantics as `immersion:recordVisit`. */
export function recordVisitFromBridge(
  input: ImmersionVisitInput,
): { ok: true; site: ImmersionSite } | { ok: false; error: string } {
  try {
    const site = upsertVisit(input);
    if ((input.seconds && input.seconds > 0) || (input.chars && input.chars > 0)) {
      bumpMetrics({ seconds: input.seconds, chars: input.chars });
    }
    return { ok: true, site };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function registerImmersionIpc(): void {
  immersionDir();
  registerVisualNovelIpc();

  ipcMain.handle('immersion:listSites', async () => loadSites());

  ipcMain.handle('immersion:saveSite', async (_e, input: ImmersionSaveSiteInput) => {
    try {
      return { ok: true as const, bookmark: saveSite(input) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('immersion:clearHistory', async (_e, range: unknown) => {
    const valid: ImmersionHistoryRange[] = ['hour', 'day', 'week', 'all'];
    if (!valid.includes(range as ImmersionHistoryRange)) return { ok: false as const, error: 'Invalid range' };
    return { ok: true as const, store: clearHistory(range as ImmersionHistoryRange) };
  });

  ipcMain.handle('immersion:addFolder', async (_e, name: unknown) => {
    if (typeof name !== 'string') return { ok: false as const, error: 'Invalid name' };
    return { ok: true as const, store: addFolder(name) };
  });

  ipcMain.handle('immersion:removeFolder', async (_e, id: unknown) => {
    if (typeof id !== 'string') return { ok: false as const, error: 'Invalid id' };
    return { ok: true as const, store: removeFolder(id) };
  });

  ipcMain.handle('immersion:removeSite', async (_e, id: string) => {
    if (typeof id !== 'string') return { ok: false as const, error: 'Invalid id' };
    return { ok: true as const, store: removeSite(id) };
  });

  ipcMain.handle('immersion:recordVisit', async (_e, input: ImmersionVisitInput) => {
    return recordVisitFromBridge(input);
  });

  ipcMain.handle('immersion:getSession', async () => loadSession());

  ipcMain.handle('immersion:setSession', async (_e, session: ImmersionSession) => {
    if (!session || !Array.isArray(session.tabs)) {
      return { ok: false as const, error: 'Invalid session' };
    }
    saveSession({ ...session, tabs: session.tabs.slice(0, IMMERSION_MAX_TABS) });
    return { ok: true as const };
  });

  ipcMain.handle('immersion:getMetrics', async () => {
    const all = loadMetrics();
    const dayKey = immersionDayKey();
    return { dayKey, today: all[dayKey] ?? emptyDayMetrics(), all };
  });

  ipcMain.handle('immersion:bumpMetrics', async (_e, delta: ImmersionMetricsDelta) => {
    return { ok: true as const, today: bumpMetrics(delta ?? {}) };
  });
}
