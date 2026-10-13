// @vitest-environment node
/**
 * Scorecard bug 15: `filesapp:mine-source` read any `{ store: 'file', path }`
 * the renderer sent. The request's location is now only a name for a row of
 * main's own index — a path the catalogue never indexed is refused, the
 * reader is chosen by the ROW's kind, and the file read is the row's path.
 *
 * Two layers: the pure gate, and the real handler over a stubbed index (so
 * the assertion is on what the handler actually reads, not on a helper).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilesIndexSnapshot, FilesItem } from '../../shared/filesApp/catalog';
import { resolveFilesMineRequest, sameFilePath } from '../filesApp/mineSourceGate';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-mine-gate-'));
const handlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>();
const indexRows = vi.hoisted(() => ({ current: [] as unknown[], builds: 0 }));
const reads = vi.hoisted(() => [] as Array<{ path: string; kind: string }>);

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: {
    handle: (channel: string, fn: (e: unknown, ...args: unknown[]) => unknown) => handlers.set(channel, fn),
    removeHandler: () => undefined,
  },
  clipboard: {},
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));
vi.mock('../filesApp/enumerators', () => {
  const snapshot = (): FilesIndexSnapshot =>
    ({ items: indexRows.current, counts: [], enumerators: [], builtAt: Date.now() }) as unknown as FilesIndexSnapshot;
  return {
    buildFilesIndex: () => snapshot(),
    buildFilesIndexAsync: async () => {
      indexRows.builds += 1;
      return snapshot();
    },
  };
});
vi.mock('../filesApp/mineSource', () => ({
  readFilesMineSource: (filePath: string, kind: string) => {
    reads.push({ path: filePath, kind });
    return { ok: true, passages: [], readCount: 0 };
  },
}));

const { registerFilesAppIpc, invalidateFilesIndex } = await import('../filesApp/ipc');
registerFilesAppIpc();

const mine = (location: unknown, kind: unknown) =>
  handlers.get('filesapp:mine-source')?.(null, location, kind) as Promise<{ ok: boolean; reasonKey?: string }>;

function row(id: string, kind: FilesItem['kind'], filePath: string): Pick<FilesItem, 'id' | 'kind' | 'location'> {
  return { id, kind, location: { store: 'file', path: filePath } };
}

const SUB = path.join(tmpRoot, 'subs', 'ep01.srt');
const SECRET = path.join(tmpRoot, 'not-in-the-catalogue.srt');

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
beforeEach(() => {
  reads.length = 0;
  indexRows.builds = 0;
  indexRows.current = [row('sub:1', 'subtitle', SUB), row('db:1', 'dictionary', path.join(tmpRoot, 'dict.db'))];
  invalidateFilesIndex();
});

describe('the gate', () => {
  const items = [row('sub:1', 'subtitle', 'C:\\Media\\Show\\ep01.srt'), row('book:1', 'book', 'C:\\lib\\a\\original.epub')];

  it('refuses a path that is no row of the index', () => {
    expect(resolveFilesMineRequest(items, { store: 'file', path: 'C:\\Users\\me\\secrets.srt' }, 'subtitle', 'win32')).toEqual({
      ok: false,
      reasonKey: 'filesApp.mine.refuse.notIndexed',
    });
  });

  it('refuses a real row asked for as another kind (the row decides the reader)', () => {
    expect(resolveFilesMineRequest(items, { store: 'file', path: 'C:\\lib\\a\\original.epub' }, 'subtitle', 'win32')).toEqual({
      ok: false,
      reasonKey: 'filesApp.mine.refuse.notIndexed',
    });
  });

  it('accepts a row, matching paths the way Windows does, and answers with the INDEX path', () => {
    expect(resolveFilesMineRequest(items, { store: 'file', path: 'c:/media/SHOW/./ep01.srt' }, 'subtitle', 'win32')).toEqual({
      ok: true,
      path: 'C:\\Media\\Show\\ep01.srt',
      kind: 'subtitle',
    });
    expect(sameFilePath('/a/B.srt', '/a/b.srt', 'linux')).toBe(false);
  });

  it('keeps the named refusals for malformed requests', () => {
    expect(resolveFilesMineRequest(items, null, 'subtitle')).toMatchObject({ reasonKey: 'filesApp.mine.refuse.notFileBacked' });
    expect(resolveFilesMineRequest(items, { store: 'sqlite', database: 'x' }, 'subtitle')).toMatchObject({
      reasonKey: 'filesApp.mine.refuse.notFileBacked',
    });
    expect(resolveFilesMineRequest(items, { store: 'file', path: '' }, 'subtitle')).toMatchObject({
      reasonKey: 'filesApp.mine.refuse.notFileBacked',
    });
    expect(resolveFilesMineRequest(items, { store: 'file', path: 'C:\\Media\\Show\\ep01.srt' }, 'video', 'win32')).toMatchObject({
      reasonKey: 'filesApp.mine.refuse.kindHasNoText',
    });
  });
});

describe('the handler', () => {
  it('reads an indexed file through the row', async () => {
    await expect(mine({ store: 'file', path: SUB }, 'subtitle')).resolves.toMatchObject({ ok: true });
    expect(reads).toEqual([{ path: SUB, kind: 'subtitle' }]);
  });

  it('never reads a path the catalogue did not index — after one forced rebuild', async () => {
    await expect(mine({ store: 'file', path: SECRET }, 'subtitle')).resolves.toEqual({
      ok: false,
      reasonKey: 'filesApp.mine.refuse.notIndexed',
    });
    expect(reads).toEqual([]);
    // The cached snapshot first, then one rebuild in case the row is brand new.
    expect(indexRows.builds).toBe(2);
  });

  it('finds a row that arrived after the cached snapshot', async () => {
    await mine({ store: 'file', path: SUB }, 'subtitle');
    const fresh = path.join(tmpRoot, 'subs', 'ep02.srt');
    indexRows.current = [...indexRows.current, row('sub:2', 'subtitle', fresh)];
    await expect(mine({ store: 'file', path: fresh }, 'subtitle')).resolves.toMatchObject({ ok: true });
    expect(reads.map((r) => r.path)).toEqual([SUB, fresh]);
  });

  it('a row whose kind has no text (a dictionary file) is still refused', async () => {
    await expect(mine({ store: 'file', path: path.join(tmpRoot, 'dict.db') }, 'subtitle')).resolves.toMatchObject({
      ok: false,
      reasonKey: 'filesApp.mine.refuse.notIndexed',
    });
    expect(reads).toEqual([]);
  });
});
