// @vitest-environment node
/**
 * The library trash: Remove is a rename into `library-trash/`, Restore renames
 * back under the same id, expiry goes to the Recycle Bin (never unlink), and
 * an exit between any two steps is finished or undone at the next start.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../../shared/types';
import {
  LIBRARY_TRASH_RETENTION_MS,
  forgetLibraryTrashEntry,
  moveLibraryItemOutOfTrash,
  moveLibraryItemToTrash,
  readLibraryTrash,
  reconcileLibraryTrash,
  releaseLibraryTrash,
  summarizeLibraryTrash,
  type LibraryTrashPaths,
} from '../libraryTrash';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'library-trash-'));
const paths: LibraryTrashPaths = {
  libraryRoot: path.join(tmpRoot, 'library'),
  trashRoot: path.join(tmpRoot, 'library-trash'),
  indexFile: path.join(tmpRoot, 'library-trash.json'),
};

function item(id: string, extra: Partial<LibraryItem> = {}): LibraryItem {
  return { id, title: `Book ${id}`, kind: 'book', createdAt: 1, epubFile: 'original.epub', ...extra };
}

function makeItemDir(id: string, bytes = 'epub-bytes'): string {
  const dir = path.join(paths.libraryRoot, id);
  fs.mkdirSync(path.join(dir, 'pages'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'original.epub'), bytes);
  return dir;
}

beforeEach(() => {
  for (const name of fs.readdirSync(tmpRoot)) fs.rmSync(path.join(tmpRoot, name), { recursive: true, force: true });
  fs.mkdirSync(paths.libraryRoot, { recursive: true });
});
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe('remove and restore', () => {
  it('moves the folder aside (bytes intact) and back under the same id', () => {
    const live = makeItemDir('a1');
    const moved = moveLibraryItemToTrash(paths, item('a1', { progress: { percent: 0.4 } as LibraryItem['progress'] }), 1000);
    expect(moved.ok).toBe(true);
    expect(fs.existsSync(live)).toBe(false);
    expect(fs.readFileSync(path.join(paths.trashRoot, 'a1', 'original.epub'), 'utf8')).toBe('epub-bytes');
    expect(readLibraryTrash(paths).map((e) => e.item.id)).toEqual(['a1']);

    const back = moveLibraryItemOutOfTrash(paths, 'a1');
    expect(back).toMatchObject({ ok: true, item: { id: 'a1', progress: { percent: 0.4 } } });
    expect(fs.readFileSync(path.join(live, 'original.epub'), 'utf8')).toBe('epub-bytes');
    forgetLibraryTrashEntry(paths, 'a1');
    expect(readLibraryTrash(paths)).toEqual([]);
  });

  it('an item without a folder is still recorded and restorable', () => {
    expect(moveLibraryItemToTrash(paths, item('nofolder'), 5)).toMatchObject({ ok: true, entry: { dirName: null } });
    expect(moveLibraryItemOutOfTrash(paths, 'nofolder')).toMatchObject({ ok: true });
  });

  it('a folder the OS will not move leaves everything as it was', () => {
    makeItemDir('busy');
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    });
    try {
      expect(moveLibraryItemToTrash(paths, item('busy'), 1)).toEqual({ ok: false, errorCode: 'busy' });
    } finally {
      spy.mockRestore();
    }
    expect(fs.existsSync(path.join(paths.libraryRoot, 'busy', 'original.epub'))).toBe(true);
    expect(readLibraryTrash(paths)).toEqual([]);
  });

  it('never restores over a folder that is live again', () => {
    makeItemDir('dup');
    moveLibraryItemToTrash(paths, item('dup'), 1);
    makeItemDir('dup', 'other');
    expect(moveLibraryItemOutOfTrash(paths, 'dup')).toEqual({ ok: false, errorCode: 'conflict' });
    expect(fs.readFileSync(path.join(paths.libraryRoot, 'dup', 'original.epub'), 'utf8')).toBe('other');
  });

  it('a second removal of the same id does not collide with a leftover trash folder', () => {
    fs.mkdirSync(path.join(paths.trashRoot, 'again'), { recursive: true });
    makeItemDir('again');
    const moved = moveLibraryItemToTrash(paths, item('again'), 77);
    expect(moved.ok && moved.entry.dirName).toBe('again~77');
    expect(moveLibraryItemOutOfTrash(paths, 'again')).toMatchObject({ ok: true });
    expect(fs.existsSync(path.join(paths.libraryRoot, 'again', 'original.epub'))).toBe(true);
  });

  it('unknown ids are a named refusal', () => {
    expect(moveLibraryItemOutOfTrash(paths, 'nope')).toEqual({ ok: false, errorCode: 'not-found' });
  });

  it('summaries are newest first, carry the expiry, and no paths', () => {
    moveLibraryItemToTrash(paths, item('old'), 10);
    moveLibraryItemToTrash(paths, item('new'), 20);
    const list = summarizeLibraryTrash(readLibraryTrash(paths));
    expect(list.map((e) => e.id)).toEqual(['new', 'old']);
    expect(list[0]).toEqual({ id: 'new', title: 'Book new', kind: 'book', removedAt: 20, expiresAt: 20 + LIBRARY_TRASH_RETENTION_MS });
  });
});

describe('an exit between steps is settled at the next start', () => {
  it('remove interrupted after the rename (row still in the library): the folder goes back', () => {
    makeItemDir('r1');
    moveLibraryItemToTrash(paths, item('r1'), 1);
    const { reinsert } = reconcileLibraryTrash(paths, new Set(['r1']));
    expect(reinsert).toEqual([]);
    expect(fs.existsSync(path.join(paths.libraryRoot, 'r1', 'original.epub'))).toBe(true);
    expect(readLibraryTrash(paths)).toEqual([]);
  });

  it('restore interrupted after the rename (no row yet): the row is handed back', () => {
    makeItemDir('r2');
    moveLibraryItemToTrash(paths, item('r2'), 1);
    expect(moveLibraryItemOutOfTrash(paths, 'r2').ok).toBe(true);
    const { reinsert } = reconcileLibraryTrash(paths, new Set());
    expect(reinsert.map((i) => i.id)).toEqual(['r2']);
    expect(readLibraryTrash(paths)).toEqual([]);
  });

  it('a settled removal is left alone', () => {
    makeItemDir('r3');
    moveLibraryItemToTrash(paths, item('r3'), 1);
    expect(reconcileLibraryTrash(paths, new Set()).reinsert).toEqual([]);
    expect(readLibraryTrash(paths).map((e) => e.item.id)).toEqual(['r3']);
    expect(fs.existsSync(path.join(paths.trashRoot, 'r3'))).toBe(true);
  });
});

describe('release goes to the Recycle Bin, never unlink', () => {
  it('only entries past retention, unless everything is asked for', async () => {
    makeItemDir('expired');
    makeItemDir('fresh');
    moveLibraryItemToTrash(paths, item('expired'), 0);
    moveLibraryItemToTrash(paths, item('fresh'), LIBRARY_TRASH_RETENTION_MS);
    const trashItem = vi.fn(async (target: string) => {
      // What the E2E harness and the OS do: the folder leaves the trash root.
      fs.renameSync(target, `${target}.recycled`);
    });
    const rm = vi.spyOn(fs, 'rmSync');
    const released = await releaseLibraryTrash(paths, { now: LIBRARY_TRASH_RETENTION_MS + 1, trashItem });
    expect(released).toBe(1);
    expect(trashItem).toHaveBeenCalledWith(path.join(paths.trashRoot, 'expired'));
    // (The index write may tidy its own temp file; nothing under the trash is unlinked.)
    expect(rm.mock.calls.some(([target]) => String(target).startsWith(paths.trashRoot + path.sep))).toBe(false);
    rm.mockRestore();
    expect(readLibraryTrash(paths).map((e) => e.item.id)).toEqual(['fresh']);

    await releaseLibraryTrash(paths, { now: 0, everything: true, trashItem });
    expect(readLibraryTrash(paths)).toEqual([]);
  });

  it('an entry the Recycle Bin refused stays listed for next time', async () => {
    makeItemDir('stuck');
    moveLibraryItemToTrash(paths, item('stuck'), 0);
    const released = await releaseLibraryTrash(paths, {
      now: LIBRARY_TRASH_RETENTION_MS * 2,
      trashItem: async () => {
        throw new Error('in use');
      },
    });
    expect(released).toBe(0);
    expect(readLibraryTrash(paths).map((e) => e.item.id)).toEqual(['stuck']);
    expect(fs.existsSync(path.join(paths.trashRoot, 'stuck', 'original.epub'))).toBe(true);
  });
});
