// @vitest-environment node
/**
 * library.json robustness (audit robust #3, #4):
 *
 * - a damaged library.json is served from its last-good copy and the damaged
 *   bytes are kept — the old `catch { return [] }` let the next import write a
 *   one-item library over the user's whole collection;
 * - page-turn progress is coalesced instead of rewriting library.json per page;
 * - `library:remove` refuses an id that would escape the library root.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../../shared/types';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'library-robust-'));
const handlers = vi.hoisted(() => new Map<string, (e: unknown, ...args: unknown[]) => unknown>());

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: { handle: (ch: string, fn: (e: unknown, ...args: unknown[]) => unknown) => handlers.set(ch, fn) },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));
vi.mock('./readabilityExtract', () => ({ extractReadableFromUrl: () => Promise.resolve(null) }));
vi.mock('./readingFetch', () => ({ fetchReadingContent: () => Promise.resolve(null) }));
vi.mock('./i18n', () => ({ mt: (k: string) => k }));
vi.mock('./epubMeta', () => ({ extractEpubTitleFromOpf: () => undefined }));
vi.mock('../readingFinishWatcher', () => ({ observeReadingProgress: () => undefined }));

const lib = await import('../library');
const { flushAllJsonWriters, __resetAtomicJsonForTests } = await import('../atomicJson');

const dbFile = path.join(tmpRoot, 'library.json');
const readFile = (): LibraryItem[] => JSON.parse(fs.readFileSync(dbFile, 'utf8')) as LibraryItem[];
const call = (ch: string, ...args: unknown[]) => handlers.get(ch)?.({}, ...args);

beforeEach(() => {
  __resetAtomicJsonForTests();
  for (const name of fs.readdirSync(tmpRoot)) fs.rmSync(path.join(tmpRoot, name), { recursive: true, force: true });
  lib.resetLibraryItemsAddedListenersForTesting();
  lib.ensureLibrary();
  if (!handlers.size) lib.registerLibraryIpc();
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('library.json never loses data to a parse failure', () => {
  it('serves the last-good copy and keeps the damaged file', () => {
    lib.importGeneratedArticle({ title: 'A', html: '<p>a</p>' });
    lib.importGeneratedArticle({ title: 'B', html: '<p>b</p>' });
    // Crash mid-write: the file on disk is truncated.
    fs.writeFileSync(dbFile, '[{"id":"trunc');
    // The next import must not write a one-item library over the collection.
    lib.importGeneratedArticle({ title: 'C', html: '<p>c</p>' });
    const titles = readFile().map((i) => i.title);
    expect(titles).toContain('A');
    expect(titles).toContain('C');
    const aside = fs.readdirSync(tmpRoot).filter((n) => n.startsWith('library.json.corrupt-'));
    expect(aside).toHaveLength(1);
    expect(fs.readFileSync(path.join(tmpRoot, aside[0]), 'utf8')).toBe('[{"id":"trunc');
  });
});

describe('page-turn progress is coalesced', () => {
  it('does not rewrite library.json per page turn, and lands on flush', () => {
    const { item } = lib.importGeneratedArticle({ title: 'Novel', html: '<p>x</p>' });
    const id = item?.id ?? '';
    const before = fs.statSync(dbFile).mtimeMs;
    const writes = vi.spyOn(fs, 'renameSync');
    for (let page = 1; page <= 20; page++) call('library:setProgress', id, { page } as never);
    expect(writes).not.toHaveBeenCalled();
    expect(fs.statSync(dbFile).mtimeMs).toBe(before);
    // Readers in this process already see the newest position.
    const listed = call('library:list') as LibraryItem[] | undefined;
    if (listed) expect(listed.find((i) => i.id === id)?.progress).toEqual({ page: 20 });
    flushAllJsonWriters();
    writes.mockRestore();
    expect(readFile().find((i) => i.id === id)?.progress).toEqual({ page: 20 });
  });
});

describe('library:remove validates the id before deleting anything', () => {
  it('rejects traversal and separators, and deletes nothing outside the root', () => {
    const outside = path.join(tmpRoot, 'precious');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'x');
    for (const bad of ['..', '../precious', '..\\precious', 'a/b', 'C:\\Windows', '', '.', 42]) {
      expect(() => call('library:remove', bad)).toThrow(/Invalid library item id/);
    }
    expect(fs.existsSync(path.join(outside, 'keep.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'library'))).toBe(true);
    expect(lib.isSafeLibraryItemId('3f2b1c9e-8a7d-4e6f-9b1a-2c3d4e5f6a7b')).toBe(true);
    expect(() => lib.itemDir('../x')).toThrow();
  });

  it('removes a real item', () => {
    const { item } = lib.importGeneratedArticle({ title: 'Gone', html: '<p>g</p>' });
    const id = item?.id ?? '';
    expect(fs.existsSync(lib.itemDir(id))).toBe(true);
    call('library:remove', id);
    expect(fs.existsSync(lib.itemDir(id))).toBe(false);
    expect(readFile().some((i) => i.id === id)).toBe(false);
  });
});
