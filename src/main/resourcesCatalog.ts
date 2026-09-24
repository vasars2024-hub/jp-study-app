// Remote Resources catalogue: fetch from GitHub, cache in userData, serve offline.
//
// Fetch style mirrors src/main/release.ts (AbortController, 15s timeout, null on
// failure). The userData JSON cache is written through ./atomicJson (temp file,
// fsync, rename). The cache is only ever overwritten on a successful fetch — a
// failed refresh never deletes what we already have.

import path from 'node:path';
import { app, ipcMain } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import {
  CATALOG_URL,
  NOVELS_URL,
  isNovelsCatalog,
  isResourcesCatalog,
  type CatalogResult,
  type NovelsCatalog,
  type ResourcesCatalog,
} from '../shared/resourcesCatalog';

function cachePath(): string {
  return path.join(app.getPath('userData'), 'resources-catalog.json');
}

function novelsCachePath(): string {
  return path.join(app.getPath('userData'), 'novels-catalog.json');
}

/** Return the cached catalogue, or null if there is no valid cache yet. */
function readCache(): ResourcesCatalog | null {
  return readJsonSync<ResourcesCatalog | null>(cachePath(), null, { validate: isResourcesCatalog });
}

/** Fetch the remote catalogue; validate; write cache; return it (null on failure). */
async function fetchCatalog(): Promise<ResourcesCatalog | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(CATALOG_URL, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'jp-study-app' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!isResourcesCatalog(data)) return null;
    writeJsonAtomicSync(cachePath(), data, { space: 0, backup: false });
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Return the cached novels catalogue, or null if none yet. */
function readNovelsCache(): NovelsCatalog | null {
  return readJsonSync<NovelsCatalog | null>(novelsCachePath(), null, { validate: isNovelsCatalog });
}

async function fetchNovels(): Promise<NovelsCatalog | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(NOVELS_URL, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'jp-study-app' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!isNovelsCatalog(data)) return null;
    writeJsonAtomicSync(novelsCachePath(), data, { space: 0, backup: false });
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function registerResourcesCatalogIpc(): void {
  // Return the cached catalogue immediately (null if none) for a fast first paint.
  ipcMain.handle('catalog:get', () => readCache());

  /*
   * Fetch fresh; fall back to cache on failure so the renderer always gets
   * usable data — and say WHICH of the two happened.
   *
   * Returning a bare catalogue-or-null made the two failure modes
   * indistinguishable downstream, and the renderer guessed "offline" for both.
   * Since the catalogue repo is unpublished the cache can never exist, so that
   * guess was wrong every single time (audit F23). Only the main process knows
   * whether a saved copy is on disk, so only it can answer this.
   */
  ipcMain.handle('catalog:refresh', async (): Promise<CatalogResult<ResourcesCatalog>> => {
    const fresh = await fetchCatalog();
    if (fresh) return { catalog: fresh, source: 'remote' };
    const cached = readCache();
    return cached ? { catalog: cached, source: 'cache' } : { catalog: null, source: 'builtin' };
  });

  // Remote levelled novels catalogue (same cache-first pattern).
  ipcMain.handle('novels:get', () => readNovelsCache());
  ipcMain.handle('novels:refresh', async (): Promise<CatalogResult<NovelsCatalog>> => {
    const fresh = await fetchNovels();
    if (fresh) return { catalog: fresh, source: 'remote' };
    const cached = readNovelsCache();
    return cached ? { catalog: cached, source: 'cache' } : { catalog: null, source: 'builtin' };
  });
}
