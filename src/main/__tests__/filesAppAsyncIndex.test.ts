// @vitest-environment node
/**
 * D315 / D345 — the Files app froze on open and on refresh: the whole index was
 * built inside one synchronous IPC handler. The build now yields between stores
 * and concurrent requests share one walk.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { FilesIndexSnapshot, FilesItem } from '../../shared/filesApp/catalog';
// vi.mock('electron') below is hoisted above these imports.
import { buildFilesIndex, buildFilesIndexAsync } from '../filesApp/enumerators';
import { getFilesIndexAsync, invalidateFilesIndex, registerFilesAppIpc } from '../filesApp/ipc';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-async-index-'));
const handlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: {
    handle: (channel: string, fn: (e: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
    removeHandler: () => undefined,
  },
  dialog: {},
  shell: { showItemInFolder: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));

registerFilesAppIpc();

afterAll(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* a temp dir Windows still holds is cleaned up by the OS */
  }
});

function snapshot(builtAt = Date.now()): FilesIndexSnapshot {
  return { items: [], counts: [], enumerators: [], builtAt };
}

function enumerator(source: string, items: Partial<FilesItem>[]) {
  return { source, run: () => items as FilesItem[] };
}

describe('buildFilesIndexAsync', () => {
  it('yields to the event loop between enumerators', async () => {
    const yields = vi.fn(() => Promise.resolve());
    const list = [enumerator('a', []), enumerator('b', []), enumerator('c', [])];
    await buildFilesIndexAsync({ userDataPath: tmpRoot }, list, yields);
    expect(yields).toHaveBeenCalledTimes(3);
  });

  it('lets other work run while it builds', async () => {
    const order: string[] = [];
    const list = [
      { source: 'a', run: () => { order.push('a'); return []; } },
      { source: 'b', run: () => { order.push('b'); return []; } },
    ];
    const build = buildFilesIndexAsync({ userDataPath: tmpRoot }, list);
    setImmediate(() => order.push('other'));
    await build;
    expect(order.indexOf('other')).toBeLessThan(order.indexOf('b'));
  });

  it('produces the same snapshot as the synchronous build', async () => {
    const sync = buildFilesIndex({ userDataPath: tmpRoot });
    const async = await buildFilesIndexAsync({ userDataPath: tmpRoot });
    expect(async.items).toEqual(sync.items);
    expect(async.counts).toEqual(sync.counts);
    expect(async.enumerators.map((r) => r.source)).toEqual(sync.enumerators.map((r) => r.source));
  });
});

describe('getFilesIndexAsync', () => {
  it('shares one walk between concurrent requests and caches it', async () => {
    invalidateFilesIndex();
    const built = snapshot();
    const build = vi.fn(() => Promise.resolve(built));
    const [first, second] = await Promise.all([getFilesIndexAsync(true, build), getFilesIndexAsync(true, build)]);
    expect(build).toHaveBeenCalledTimes(1);
    expect(first).toBe(built);
    expect(second).toBe(built);
    // Inside the TTL the cached build is served without walking again.
    expect(await getFilesIndexAsync(false, build)).toBe(built);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('does not cache a build that an invalidation overtook', async () => {
    invalidateFilesIndex();
    let release: (value: FilesIndexSnapshot) => void = () => undefined;
    const stale = snapshot();
    const slow = vi.fn(() => new Promise<FilesIndexSnapshot>((resolve) => { release = resolve; }));
    const pending = getFilesIndexAsync(true, slow);
    invalidateFilesIndex();
    release(stale);
    expect(await pending).toBe(stale);
    const fresh = snapshot();
    const next = vi.fn(() => Promise.resolve(fresh));
    expect(await getFilesIndexAsync(false, next)).toBe(fresh);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('serves the index IPC asynchronously', async () => {
    // Seeded with a stub build: a real one would open the dictionary database
    // under the temp profile.
    invalidateFilesIndex();
    const built = snapshot();
    await getFilesIndexAsync(true, () => Promise.resolve(built));
    const result = handlers.get('filesapp:index')?.(null, false);
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe(built);
  });
});
