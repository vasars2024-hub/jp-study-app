// Remote Resources catalogue: fetch from GitHub, cache in userData, serve offline.
//
// Fetch style mirrors src/main/release.ts (AbortController, 15s timeout, null on
// failure). The userData JSON cache uses the atomic temp-file-then-rename pattern
// from src/main/immersion/index.ts. The cache is only ever overwritten on a
// successful fetch — a failed refresh never deletes what we already have.

import fs from 'node:fs';
import path from 'node:path';
import { app, ipcMain } from 'electron';
import {
  CATALOG_URL,
  NOVELS_URL,
  isNovelsCatalog,
  isResourcesCatalog,
  type NovelsCatalog,
  type ResourcesCatalog,
} from '../shared/resourcesCatalog';

function cachePath(): string {
  return path.join(app.getPath('userData'), 'resources-catalog.json');
}

function novelsCachePath(): string {
  return path.join(app.getPath('userData'), 'novels-catalog.json');
}

function atomicWrite(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, file);
}

/** Return the cached catalogue, or null if there is no valid cache yet. */
function readCache(): ResourcesCatalog | null {
  try {
    const file = cachePath();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    return isResourcesCatalog(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
    atomicWrite(cachePath(), JSON.stringify(data));
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Return the cached novels catalogue, or null if none yet. */
function readNovelsCache(): NovelsCatalog | null {
  try {
    const file = novelsCachePath();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    return isNovelsCatalog(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
    atomicWrite(novelsCachePath(), JSON.stringify(data));
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

  // Fetch fresh; fall back to cache on failure so the renderer always gets usable data.
  ipcMain.handle('catalog:refresh', async () => {
    const fresh = await fetchCatalog();
    return fresh ?? readCache();
  });

  // Remote levelled novels catalogue (same cache-first pattern).
  ipcMain.handle('novels:get', () => readNovelsCache());
  ipcMain.handle('novels:refresh', async () => {
    const fresh = await fetchNovels();
    return fresh ?? readNovelsCache();
  });
}
