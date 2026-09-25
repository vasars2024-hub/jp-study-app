// @vitest-environment node
/**
 * Audit r2 #12 — bookmarks and history were one list: every visit made a
 * "saved site", and "Save site" only set a flag nothing could unset. These run
 * the real IPC handlers against a temporary store.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImmersionSitesStore } from '../../shared/immersion';

const fixture = vi.hoisted(() => ({ root: '', handlers: new Map<string, (...a: unknown[]) => unknown>() }));
vi.mock('electron', () => ({
  app: { getPath: () => fixture.root },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: (channel: string, fn: (...a: unknown[]) => unknown) => fixture.handlers.set(channel, fn) },
}));
vi.mock('../immersion/visualNovels', () => ({ registerVisualNovelIpc: vi.fn() }));

import { loadSites, recordVisitFromBridge, registerImmersionIpc } from '../immersion';

const call = (channel: string, ...args: unknown[]) => fixture.handlers.get(channel)!({}, ...args) as Promise<unknown>;
const sitesFile = () => path.join(fixture.root, 'immersion', 'sites.json');
const readSites = (): ImmersionSitesStore => JSON.parse(fs.readFileSync(sitesFile(), 'utf8'));

beforeEach(() => {
  fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-immersion-bm-'));
  fixture.handlers.clear();
  registerImmersionIpc();
});
afterEach(() => {
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

describe('bookmarks are their own list', () => {
  it('migrates a v1 store: starred rows become bookmarks, every row stays history', () => {
    fs.mkdirSync(path.join(fixture.root, 'immersion'), { recursive: true });
    fs.writeFileSync(
      sitesFile(),
      JSON.stringify({
        schemaVersion: 1,
        sites: [
          { id: 'a', url: 'https://a.example/', title: 'A', favorite: true, tags: ['x'], folderId: 'f1' },
          { id: 'b', url: 'https://b.example/', title: 'B' },
        ],
        folders: [{ id: 'f1', name: 'News', order: 0 }],
      }),
    );
    const store = loadSites();
    expect(store.schemaVersion).toBe(2);
    expect(store.sites.map((s) => s.id)).toEqual(['a', 'b']);
    expect(store.bookmarks).toMatchObject([{ url: 'https://a.example/', title: 'A', tags: ['x'], folderId: 'f1' }]);
  });

  it('a visit is history only; a star is a bookmark; the star can be taken back', async () => {
    recordVisitFromBridge({ url: 'https://c.example/page' });
    expect(readSites().bookmarks ?? []).toHaveLength(0);

    await call('immersion:saveSite', { url: 'https://c.example/page', favorite: true, tags: ['kanji', 'kanji', ' '] });
    expect(readSites().bookmarks).toMatchObject([{ url: 'https://c.example/page', tags: ['kanji'] }]);

    await call('immersion:saveSite', { url: 'https://c.example/page', favorite: false });
    expect(readSites().bookmarks).toEqual([]);
    expect(readSites().sites).toHaveLength(1);
  });

  it('files a bookmark in a folder, and deleting the folder keeps the bookmark', async () => {
    await call('immersion:addFolder', 'Reading');
    const folderId = readSites().folders[0].id;
    await call('immersion:saveSite', { url: 'https://d.example/', favorite: true, folderId });
    expect(readSites().bookmarks[0].folderId).toBe(folderId);
    await call('immersion:removeFolder', folderId);
    expect(readSites().folders).toEqual([]);
    expect(readSites().bookmarks).toHaveLength(1);
    expect(readSites().bookmarks[0].folderId).toBeUndefined();
  });

  it('clears history by time range and leaves bookmarks alone', async () => {
    recordVisitFromBridge({ url: 'https://old.example/' });
    const store = readSites();
    store.sites[0].lastVisited = Date.now() - 3 * 24 * 60 * 60 * 1000;
    fs.writeFileSync(sitesFile(), JSON.stringify(store));
    recordVisitFromBridge({ url: 'https://new.example/' });
    await call('immersion:saveSite', { url: 'https://new.example/', favorite: true });

    await call('immersion:clearHistory', 'day');
    expect(readSites().sites.map((s) => s.url)).toEqual(['https://old.example/']);
    await call('immersion:clearHistory', 'all');
    expect(readSites().sites).toEqual([]);
    expect(readSites().bookmarks).toHaveLength(1);
    await expect(call('immersion:clearHistory', 'forever')).resolves.toMatchObject({ ok: false });
  });

  it('keeps at most the tab cap when a session is saved', async () => {
    const tabs = Array.from({ length: 8 }, (_, i) => ({ id: `tab-${i}`, url: '', title: '', mode: 'reader' }));
    await call('immersion:setSession', { activeTabId: 'tab-0', tabs, updatedAt: 1 });
    const session = (await call('immersion:getSession')) as { tabs: unknown[] };
    expect(session.tabs).toHaveLength(5);
  });
});
