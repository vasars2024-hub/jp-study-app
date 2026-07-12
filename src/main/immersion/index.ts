// Immersion Browser main-process service: sites library, session, metrics, IPC.

import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import {
  applyMetricsDelta,
  emptyDayMetrics,
  emptySession,
  emptySitesStore,
  immersionDayKey,
  nextSiteStreak,
  normalizeImmersionUrl,
  sanitizeSite,
  type ImmersionDayMetrics,
  type ImmersionLang,
  type ImmersionMetricsDelta,
  type ImmersionMetricsMap,
  type ImmersionSaveSiteInput,
  type ImmersionSession,
  type ImmersionSite,
  type ImmersionSitesStore,
  type ImmersionVisitInput,
} from '../../shared/immersion';

function immersionDir(): string {
  const dir = path.join(app.getPath('userData'), 'immersion');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function atomicWrite(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
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

function loadSites(): ImmersionSitesStore {
  const raw = readJson<unknown>(sitesPath(), emptySitesStore());
  if (!raw || typeof raw !== 'object') return emptySitesStore();
  const o = raw as Record<string, unknown>;
  const sites = Array.isArray(o.sites)
    ? (o.sites.map(sanitizeSite).filter(Boolean) as ImmersionSite[])
    : [];
  const folders = Array.isArray(o.folders)
    ? o.folders
        .filter((f): f is { id: string; name: string; order: number } => {
          if (!f || typeof f !== 'object') return false;
          const x = f as Record<string, unknown>;
          return typeof x.id === 'string' && typeof x.name === 'string';
        })
        .map((f) => ({
          id: f.id,
          name: f.name,
          order: typeof f.order === 'number' ? f.order : 0,
        }))
    : [];
  return { schemaVersion: 1, sites, folders };
}

function saveSites(store: ImmersionSitesStore): void {
  atomicWrite(sitesPath(), JSON.stringify(store, null, 2));
}

function loadSession(): ImmersionSession {
  const raw = readJson<ImmersionSession | null>(sessionPath(), null);
  if (!raw || !Array.isArray(raw.tabs) || raw.tabs.length === 0) return emptySession();
  return {
    activeTabId: typeof raw.activeTabId === 'string' ? raw.activeTabId : raw.tabs[0].id,
    tabs: raw.tabs
      .filter((t) => t && typeof t.id === 'string')
      .map((t) => ({
        id: t.id,
        url: typeof t.url === 'string' ? t.url : '',
        title: typeof t.title === 'string' ? t.title : 'Tab',
        mode: t.mode === 'live' ? 'live' : t.mode === 'focus' ? 'focus' : 'reader',
        scrollY: typeof t.scrollY === 'number' ? t.scrollY : undefined,
      })),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

function saveSession(session: ImmersionSession): void {
  atomicWrite(sessionPath(), JSON.stringify({ ...session, updatedAt: Date.now() }, null, 2));
}

function loadMetrics(): ImmersionMetricsMap {
  const raw = readJson<ImmersionMetricsMap>(metricsPath(), {});
  return raw && typeof raw === 'object' ? raw : {};
}

function saveMetrics(map: ImmersionMetricsMap): void {
  atomicWrite(metricsPath(), JSON.stringify(map, null, 2));
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
      visitCount: 1,
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
    site.visitCount += 1;
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

function saveSite(input: ImmersionSaveSiteInput): ImmersionSite {
  const url = normalizeImmersionUrl(input.url);
  if (!url) throw new Error('Invalid URL');
  const store = loadSites();
  const now = Date.now();
  let site = findSiteByUrl(store, url);
  if (!site) {
    site = {
      id: crypto.randomUUID(),
      url,
      title: (input.title || url).trim(),
      lang: input.lang || 'auto',
      tags: input.tags ?? [],
      completionPct: 0,
      lastVisited: now,
      visitCount: 0,
      estimatedDifficulty: 0,
      streakDays: 0,
      totalSeconds: 0,
      totalChars: 0,
      favorite: Boolean(input.favorite),
      folderId: input.folderId || undefined,
      createdAt: now,
      updatedAt: now,
    };
    store.sites.push(site);
  } else {
    if (input.title) site.title = input.title.trim();
    if (input.lang) site.lang = input.lang;
    if (input.tags) site.tags = input.tags;
    if (typeof input.favorite === 'boolean') site.favorite = input.favorite;
    if (input.folderId === null) site.folderId = undefined;
    else if (typeof input.folderId === 'string') site.folderId = input.folderId;
    site.updatedAt = now;
  }
  saveSites(store);
  broadcast('immersion:sitesChanged', store);
  return site;
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

export function registerImmersionIpc(): void {
  immersionDir();

  ipcMain.handle('immersion:listSites', async () => loadSites());

  ipcMain.handle('immersion:saveSite', async (_e, input: ImmersionSaveSiteInput) => {
    try {
      return { ok: true as const, site: saveSite(input) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('immersion:removeSite', async (_e, id: string) => {
    if (typeof id !== 'string') return { ok: false as const, error: 'Invalid id' };
    return { ok: true as const, store: removeSite(id) };
  });

  ipcMain.handle('immersion:recordVisit', async (_e, input: ImmersionVisitInput) => {
    try {
      const site = upsertVisit(input);
      if ((input.seconds && input.seconds > 0) || (input.chars && input.chars > 0)) {
        bumpMetrics({ seconds: input.seconds, chars: input.chars });
      }
      return { ok: true as const, site };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('immersion:getSession', async () => loadSession());

  ipcMain.handle('immersion:setSession', async (_e, session: ImmersionSession) => {
    if (!session || !Array.isArray(session.tabs)) {
      return { ok: false as const, error: 'Invalid session' };
    }
    saveSession(session);
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
