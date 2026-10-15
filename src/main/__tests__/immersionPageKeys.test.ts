// @vitest-environment node
/**
 * Bug 28 — the query string was dropped from the history and bookmark keys, so
 * pages that differ only by `?p=` (syosetu, kakuyomu, any `?id=` site) shared
 * one row. These run the real IPC handlers against a temporary store.
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
  fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-immersion-keys-'));
  fixture.handlers.clear();
  registerImmersionIpc();
});
afterEach(() => {
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

describe('pages that differ only by their query are kept apart', () => {
  it('two ?p= pages are two history rows, each with its own stats', () => {
    recordVisitFromBridge({ url: 'https://kakuyomu.example/works/1?p=1', seconds: 30, chars: 300 });
    recordVisitFromBridge({ url: 'https://kakuyomu.example/works/1?p=2', seconds: 10, chars: 100 });
    recordVisitFromBridge({ url: 'https://kakuyomu.example/works/1?p=1', seconds: 5, chars: 50 });
    const sites = readSites().sites;
    expect(sites).toHaveLength(2);
    const p1 = sites.find((s) => s.url.endsWith('?p=1'))!;
    const p2 = sites.find((s) => s.url.endsWith('?p=2'))!;
    expect(p1).toMatchObject({ visitCount: 2, totalSeconds: 35, totalChars: 350 });
    expect(p2).toMatchObject({ visitCount: 1, totalSeconds: 10, totalChars: 100 });
  });

  it('tracking parameters do not make a new page, and are not stored', () => {
    recordVisitFromBridge({ url: 'https://ncode.example/n1/?p=3', seconds: 20 });
    recordVisitFromBridge({ url: 'https://ncode.example/n1?utm_source=x&p=3&fbclid=abc', seconds: 5 });
    recordVisitFromBridge({ url: 'https://ncode.example/n1/?gclid=1&utm_campaign=y', seconds: 7 });
    const sites = readSites().sites;
    expect(sites).toHaveLength(2);
    expect(sites.find((s) => s.url.includes('p=3'))).toMatchObject({ visitCount: 2, totalSeconds: 25 });
    const bare = sites.find((s) => !s.url.includes('p=3'))!;
    expect(bare.url).toBe('https://ncode.example/n1/');
    expect(sites.every((s) => !/utm_|fbclid|gclid/.test(s.url))).toBe(true);
  });

  it('bookmarks are per page too: starring ?p=2 does not star ?p=1', async () => {
    await call('immersion:saveSite', { url: 'https://site.example/read?id=1', favorite: true });
    await call('immersion:saveSite', { url: 'https://site.example/read?id=2', favorite: true, tags: ['ch2'] });
    expect(readSites().bookmarks.map((b) => b.url).sort()).toEqual([
      'https://site.example/read?id=1',
      'https://site.example/read?id=2',
    ]);
    await call('immersion:saveSite', { url: 'https://site.example/read?id=1&utm_medium=social', favorite: false });
    expect(readSites().bookmarks).toMatchObject([{ url: 'https://site.example/read?id=2', tags: ['ch2'] }]);
  });
});

describe('the migration of host+path rows', () => {
  const write = (store: unknown): void => {
    fs.mkdirSync(path.join(fixture.root, 'immersion'), { recursive: true });
    fs.writeFileSync(sitesFile(), JSON.stringify(store));
  };
  const row = (over: Record<string, unknown>) => ({
    title: 'T', lang: 'ja', tags: [], completionPct: 0, lastVisited: 1, visitCount: 1, estimatedDifficulty: 0,
    streakDays: 1, totalSeconds: 0, totalChars: 0, createdAt: 1, updatedAt: 1, ...over,
  });

  it('an old row keeps its id, URL and every banked counter; the next page gets its own row', () => {
    // Before the fix, ?p=1 .. ?p=9 all banked onto the row first opened at ?p=1.
    write({
      schemaVersion: 2,
      sites: [row({ id: 'old', url: 'https://novel.example/book?p=1', visitCount: 9, totalSeconds: 900, totalChars: 9000, totalLookups: 12 })],
      folders: [],
      bookmarks: [],
    });
    const migrated = loadSites();
    expect(migrated.sites).toEqual([
      expect.objectContaining({ id: 'old', url: 'https://novel.example/book?p=1', visitCount: 9, totalSeconds: 900, totalChars: 9000, totalLookups: 12 }),
    ]);
    recordVisitFromBridge({ url: 'https://novel.example/book?p=2', seconds: 4 });
    recordVisitFromBridge({ url: 'https://novel.example/book?p=1', seconds: 6 });
    const sites = readSites().sites;
    expect(sites).toHaveLength(2);
    expect(sites.find((s) => s.id === 'old')).toMatchObject({ visitCount: 10, totalSeconds: 906 });
    expect(sites.find((s) => s.id !== 'old')).toMatchObject({ url: 'https://novel.example/book?p=2', totalSeconds: 4 });
  });

  it('rows that differ only in tracking parameters are folded together, adding every counter', () => {
    write({
      schemaVersion: 2,
      sites: [
        row({ id: 'a', url: 'https://x.example/a?utm_source=tw', visitCount: 3, totalSeconds: 30, totalChars: 300, totalLookups: 2, createdAt: 5, lastVisited: 50, completionPct: 40, tags: ['t1'] }),
        row({ id: 'b', url: 'https://x.example/a/', visitCount: 2, totalSeconds: 20, totalChars: 200, totalLookups: 1, createdAt: 2, lastVisited: 90, completionPct: 70, tags: ['t2'], favorite: true }),
        row({ id: 'c', url: 'https://x.example/a?p=2', visitCount: 1, totalSeconds: 1 }),
      ],
      folders: [],
      bookmarks: [
        { id: 'bm1', url: 'https://x.example/a?fbclid=z', title: 'A', lang: 'ja', tags: ['k'], createdAt: 9, updatedAt: 9 },
        { id: 'bm2', url: 'https://x.example/a', title: 'A newer', lang: 'ja', tags: ['m'], folderId: 'f', createdAt: 3, updatedAt: 20 },
      ],
    });
    const store = loadSites();
    expect(store.sites).toHaveLength(2);
    const merged = store.sites.find((s) => s.id === 'b')!;
    expect(merged).toMatchObject({
      url: 'https://x.example/a/',
      visitCount: 5,
      totalSeconds: 50,
      totalChars: 500,
      totalLookups: 3,
      completionPct: 70,
      lastVisited: 90,
      createdAt: 2,
      favorite: true,
    });
    expect([...merged.tags].sort()).toEqual(['t1', 't2']);
    expect(store.sites.find((s) => s.id === 'c')).toMatchObject({ visitCount: 1 });
    expect(store.bookmarks).toHaveLength(1);
    expect(store.bookmarks[0]).toMatchObject({ id: 'bm2', title: 'A newer', folderId: 'f', createdAt: 3 });
    expect([...store.bookmarks[0].tags].sort()).toEqual(['k', 'm']);
    // Idempotent: a second read changes nothing.
    expect(loadSites()).toEqual(store);
  });

  it('the totals across the whole store are the same before and after', () => {
    const sites = Array.from({ length: 40 }, (_, i) => row({
      id: `r${i}`,
      url: `https://h${i % 5}.example/p${i % 7}${i % 3 === 0 ? '?utm_source=z' : i % 3 === 1 ? '?q=1' : ''}`,
      visitCount: i + 1,
      totalSeconds: i * 10,
      totalChars: i * 100,
    }));
    write({ schemaVersion: 2, sites, folders: [], bookmarks: [] });
    const store = loadSites();
    const sum = (rows: Array<{ visitCount: number; totalSeconds: number; totalChars: number }>) =>
      rows.reduce((acc, r) => [acc[0] + r.visitCount, acc[1] + r.totalSeconds, acc[2] + r.totalChars], [0, 0, 0]);
    expect(sum(store.sites)).toEqual(sum(sites as never));
    expect(store.sites.length).toBeLessThan(sites.length);
  });
});
