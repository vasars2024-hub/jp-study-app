// @vitest-environment node
/**
 * The Library row's management work, through the real IPC handlers on real
 * files: OPF metadata on import, duplicate detection (same path or same bytes,
 * including items imported before hashes existed), no half-imported folders,
 * folder imports, Remove → trash → Restore, details editing, missing-file
 * detection and manga relink, and the crash-recovery of an import queue.
 */
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../../shared/types';
import type { LibraryImportStatus, LibraryRestoreResult, LibraryTrashSummary } from '../../shared/libraryManage';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'library-manage-'));
const userData = path.join(tmpRoot, 'userData');
const sources = path.join(tmpRoot, 'sources');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(sources, { recursive: true });

const handlers = vi.hoisted(() => new Map<string, (e: unknown, ...args: unknown[]) => unknown>());
const recycled = vi.hoisted(() => [] as string[]);

vi.mock('electron', () => ({
  app: { getPath: () => userData, getName: () => 'test' },
  ipcMain: { handle: (ch: string, fn: (e: unknown, ...args: unknown[]) => unknown) => handlers.set(ch, fn) },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: {
    trashItem: async (target: string) => {
      recycled.push(target);
    },
  },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));
vi.mock('../readabilityExtract', () => ({ extractReadableFromUrl: () => Promise.resolve(null) }));
vi.mock('../readingFetch', () => ({ fetchReadingContent: () => Promise.resolve(null) }));
vi.mock('../i18n', () => ({ mt: (k: string) => k }));
vi.mock('../readingFinishWatcher', () => ({ observeReadingProgress: () => undefined }));

const lib = await import('../library');
const { __resetAtomicJsonForTests } = await import('../atomicJson');

const call = <T = unknown>(ch: string, ...args: unknown[]): T => {
  const fn = handlers.get(ch);
  if (!fn) throw new Error(`no handler ${ch}`);
  return fn({}, ...args) as T;
};
const dbFile = path.join(userData, 'library.json');
const readDbFile = (): LibraryItem[] => JSON.parse(fs.readFileSync(dbFile, 'utf8')) as LibraryItem[];

function epubBytes(metadata: string, marker = ''): Buffer {
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.addFile(
    'META-INF/container.xml',
    Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'),
  );
  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(
      `<package version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${metadata}</metadata>` +
        '<manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>',
    ),
  );
  zip.addFile('OEBPS/c.xhtml', Buffer.from(`<html><body><p>本文${marker}</p></body></html>`));
  return zip.toBuffer();
}

function writeEpub(name: string, metadata: string, marker = ''): string {
  const file = path.join(sources, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, epubBytes(metadata, marker));
  return file;
}

function writeCbz(name: string, pages: number): string {
  const file = path.join(sources, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const zip = new AdmZip();
  for (let i = 1; i <= pages; i++) zip.addFile(`p${i}.png`, Buffer.alloc(64, i));
  if (!pages) zip.addFile('readme.txt', Buffer.from('no pages'));
  zip.writeZip(file);
  return file;
}

beforeEach(() => {
  __resetAtomicJsonForTests();
  for (const dir of [userData, sources]) {
    for (const name of fs.readdirSync(dir)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
  recycled.length = 0;
  lib.resetLibraryItemsAddedListenersForTesting();
  lib.resetLibrarySnapshotForTests();
  lib.ensureLibrary();
  if (!handlers.size) lib.registerLibraryIpc();
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('import keeps the book’s own metadata', () => {
  it('decoded title, authors, series with its number, tags, and a content hash', async () => {
    const file = writeEpub(
      'nekobook.epub',
      '<dc:title>猫 &amp; 犬</dc:title><dc:creator>夏目漱石</dc:creator>' +
        '<meta name="calibre:series" content="動物記"/><meta name="calibre:series_index" content="2"/>' +
        '<dc:subject>小説</dc:subject><dc:subject>古典</dc:subject>',
    );
    const items = await call<Promise<LibraryItem[]>>('library:importPaths', [file]);
    const book = items.find((i) => i.sourcePath === file);
    expect(book).toMatchObject({
      title: '猫 & 犬',
      author: '夏目漱石',
      series: '動物記',
      seriesIndex: 2,
      tags: ['小説', '古典'],
      kind: 'book',
    });
    expect(book?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('duplicates', () => {
  it('the same bytes under another name are not imported twice', async () => {
    const a = writeEpub('a/original name.epub', '<dc:title>Same</dc:title>');
    const b = path.join(sources, 'b', 'renamed copy.epub');
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.copyFileSync(a, b);
    await call('library:importPaths', [a]);
    const after = await call<Promise<LibraryItem[]>>('library:importPaths', [b]);
    expect(after.filter((i) => i.title === 'Same')).toHaveLength(1);
    const status = await call<LibraryImportStatus>('library:importStatus');
    expect(status.progress).toMatchObject({ state: 'done', imported: 0, duplicates: 1 });
  });

  it('an item imported before hashes existed is matched by its stored copy, and gets the hash', async () => {
    const legacyBytes = epubBytes('<dc:title>Legacy</dc:title>', 'legacy');
    const id = '0f0e0d0c-0000-4000-8000-000000000001';
    fs.mkdirSync(path.join(userData, 'library', id), { recursive: true });
    fs.writeFileSync(path.join(userData, 'library', id, 'original.epub'), legacyBytes);
    fs.writeFileSync(dbFile, JSON.stringify([{ id, title: 'Legacy', kind: 'book', createdAt: 1, epubFile: 'original.epub', sourcePath: 'D:\\gone\\legacy.epub' }]));
    lib.resetLibrarySnapshotForTests();
    const again = path.join(sources, 'moved', 'legacy.epub');
    fs.mkdirSync(path.dirname(again), { recursive: true });
    fs.writeFileSync(again, legacyBytes);
    // A different book of a different size must not be hashed against it.
    const other = writeEpub('other.epub', '<dc:title>Other</dc:title>', 'a much longer marker so the size differs');
    const items = await call<Promise<LibraryItem[]>>('library:importPaths', [again, other]);
    expect(items.filter((i) => i.title === 'Legacy')).toHaveLength(1);
    expect(items.some((i) => i.title === 'Other')).toBe(true);
    // The duplicate check hashed the stored copy once and kept the answer.
    expect(readDbFile().find((i) => i.id === id)?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the same path twice is one item (case-insensitively on Windows)', async () => {
    const file = writeEpub('Once.epub', '<dc:title>Once</dc:title>');
    await call('library:importPaths', [file]);
    const spelled = process.platform === 'win32' ? file.toUpperCase() : file;
    const items = await call<Promise<LibraryItem[]>>('library:importPaths', [spelled]);
    expect(items.filter((i) => i.title === 'Once')).toHaveLength(1);
  });
});

describe('no half-imported folders', () => {
  it('an archive with no images is refused and leaves nothing behind', async () => {
    const empty = writeCbz('empty.cbz', 0);
    const before = fs.readdirSync(path.join(userData, 'library')).length;
    const items = await call<Promise<LibraryItem[]>>('library:importPaths', [empty]);
    expect(items.some((i) => i.sourcePath === empty)).toBe(false);
    expect(fs.readdirSync(path.join(userData, 'library'))).toHaveLength(before);
    const status = await call<LibraryImportStatus>('library:importStatus');
    expect(status.progress?.failures).toEqual([{ name: 'empty.cbz', errorCode: 'no-pages' }]);
  });

  it('importArchivePath says so too, with nothing on the shelf', async () => {
    const empty = writeCbz('empty2.cbz', 0);
    await expect(call('library:importArchivePath', empty)).resolves.toEqual({ ok: false, error: 'That archive holds no images.' });
    expect(readDbFile().some((i) => i.sourcePath === empty)).toBe(false);
  });

  it('importArchivePath hands back the existing item for the same bytes', async () => {
    const first = writeCbz('vol1.cbz', 3);
    const res1 = await call<Promise<{ ok: boolean; item?: LibraryItem; alreadyPresent?: boolean }>>('library:importArchivePath', first);
    expect(res1).toMatchObject({ ok: true, alreadyPresent: false, item: { pageCount: 3 } });
    const copy = path.join(sources, 'copy of vol1.cbz');
    fs.copyFileSync(first, copy);
    const res2 = await call<Promise<{ ok: boolean; item?: LibraryItem; alreadyPresent?: boolean }>>('library:importArchivePath', copy);
    expect(res2).toMatchObject({ ok: true, alreadyPresent: true, item: { id: res1.item?.id } });
  });
});

describe('folders', () => {
  it('a dropped folder imports every book and archive under it', async () => {
    writeEpub('shelf/a.epub', '<dc:title>A</dc:title>');
    writeEpub('shelf/deeper/b.epub', '<dc:title>B</dc:title>', 'b');
    writeCbz('shelf/deeper/c.cbz', 2);
    fs.writeFileSync(path.join(sources, 'shelf', 'notes.txt'), 'ignored');
    const items = await call<Promise<LibraryItem[]>>('library:importPaths', [path.join(sources, 'shelf')]);
    expect(items.map((i) => i.title).sort()).toEqual(expect.arrayContaining(['A', 'B', 'c']));
    expect(items).toHaveLength(3);
  });
});

describe('remove is recoverable', () => {
  it('moves the item to the trash, lists it, and restores it with its progress under the same id', async () => {
    const file = writeEpub('keep.epub', '<dc:title>Keep me</dc:title>');
    const [book] = await call<Promise<LibraryItem[]>>('library:importPaths', [file]);
    call('library:setProgress', book.id, { location: 'p:3:0.5', percent: 0.42 });
    const after = call<LibraryItem[]>('library:remove', book.id);
    expect(after.some((i) => i.id === book.id)).toBe(false);
    expect(fs.existsSync(path.join(userData, 'library', book.id))).toBe(false);
    expect(fs.existsSync(path.join(userData, 'library-trash', book.id, 'original.epub'))).toBe(true);
    expect(call<LibraryTrashSummary[]>('library:listTrash').map((e) => e.id)).toEqual([book.id]);

    const restored = call<LibraryRestoreResult>('library:restore', book.id);
    expect(restored).toMatchObject({ ok: true, item: { id: book.id, progress: { percent: 0.42 } } });
    expect(fs.existsSync(path.join(userData, 'library', book.id, 'original.epub'))).toBe(true);
    expect(readDbFile().some((i) => i.id === book.id)).toBe(true);
    expect(call('library:listTrash')).toEqual([]);
    // A second Undo (another window) finds it already back.
    expect(call('library:restore', book.id)).toEqual({ ok: false, errorCode: 'conflict' });
  });

  it('a removal the OS refuses throws and changes nothing', async () => {
    const file = writeEpub('locked.epub', '<dc:title>Locked</dc:title>');
    const [book] = await call<Promise<LibraryItem[]>>('library:importPaths', [file]);
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    });
    try {
      expect(() => call('library:remove', book.id)).toThrow(/library-remove-busy/);
    } finally {
      spy.mockRestore();
    }
    expect(readDbFile().some((i) => i.id === book.id)).toBe(true);
    expect(fs.existsSync(path.join(userData, 'library', book.id, 'original.epub'))).toBe(true);
  });

  it('restoring into a deleted folder files it as unfiled', async () => {
    const file = writeEpub('filed.epub', '<dc:title>Filed</dc:title>');
    const [book] = await call<Promise<LibraryItem[]>>('library:importPaths', [file]);
    call('library:setFolders', ['Shelf A']);
    call('library:setItemFolder', book.id, 'Shelf A');
    call('library:remove', book.id);
    call('library:setFolders', []);
    const restored = call<LibraryRestoreResult>('library:restore', book.id);
    expect(restored.ok && restored.item.folder).toBeUndefined();
  });

  it('"Move all to the Recycle Bin" goes through shell.trashItem, never unlink', async () => {
    const file = writeEpub('bin.epub', '<dc:title>Bin</dc:title>');
    const [book] = await call<Promise<LibraryItem[]>>('library:importPaths', [file]);
    call('library:remove', book.id);
    await expect(call('library:releaseTrash')).resolves.toEqual({ released: 1, remaining: 0 });
    expect(recycled).toEqual([path.join(userData, 'library-trash', book.id)]);
  });
});

describe('details editing', () => {
  it('saves cleaned details and marks the item edited', async () => {
    const file = writeEpub('edit.epub', '<dc:title>Edit me</dc:title>');
    const [book] = await call<Promise<LibraryItem[]>>('library:importPaths', [file]);
    const res = call<{ ok: boolean; item?: LibraryItem }>('library:updateMeta', book.id, {
      title: '  New   title ',
      author: 'A & B',
      series: 'Saga',
      seriesIndex: '3',
      tags: 'one, Two, one, ',
    });
    expect(res).toMatchObject({ ok: true, item: { title: 'New title', author: 'A & B', series: 'Saga', seriesIndex: 3, tags: ['one', 'Two'] } });
    expect(readDbFile().find((i) => i.id === book.id)).toMatchObject({ title: 'New title', seriesIndex: 3 });
    expect(readDbFile().find((i) => i.id === book.id)?.metaEditedAt).toEqual(expect.any(Number));
    // Clearing series clears its number too.
    const cleared = call<{ ok: boolean; item?: LibraryItem }>('library:updateMeta', book.id, { series: '' });
    expect(cleared.item?.series).toBeUndefined();
    expect(cleared.item?.seriesIndex).toBeUndefined();
  });

  it('refuses a blank title, a bad number, and an unknown or unsafe id', async () => {
    const file = writeEpub('strict.epub', '<dc:title>Strict</dc:title>');
    const [book] = await call<Promise<LibraryItem[]>>('library:importPaths', [file]);
    expect(call('library:updateMeta', book.id, { title: '   ' })).toEqual({ ok: false, errorKey: 'libManage.meta.error.titleRequired' });
    expect(call('library:updateMeta', book.id, { seriesIndex: 'x' })).toEqual({ ok: false, errorKey: 'libManage.meta.error.seriesIndex' });
    expect(call('library:updateMeta', '../etc', { title: 'x' })).toEqual({ ok: false, errorKey: 'libManage.meta.error.invalid' });
    expect(call('library:updateMeta', 'not-an-item', { title: 'x' })).toEqual({ ok: false, errorKey: 'libManage.meta.error.notFound' });
  });
});

describe('missing files', () => {
  it('flags a book whose copy is gone and a manga with no pages, and relinks the manga in place', async () => {
    const epub = writeEpub('vanish.epub', '<dc:title>Vanish</dc:title>');
    const cbz = writeCbz('vanish.cbz', 2);
    const items = await call<Promise<LibraryItem[]>>('library:importPaths', [epub, cbz]);
    const book = items.find((i) => i.kind === 'book') as LibraryItem;
    const manga = items.find((i) => i.kind === 'manga') as LibraryItem;
    expect(call('library:checkMissing')).toEqual([]);
    fs.rmSync(path.join(userData, 'library', book.id, 'original.epub'));
    fs.rmSync(path.join(userData, 'library', manga.id, 'pages'), { recursive: true });
    expect((call('library:checkMissing') as string[]).sort()).toEqual([book.id, manga.id].sort());

    const res = await lib.relinkManga(manga.id, cbz);
    expect(res).toEqual({ ok: true, pageCount: 2 });
    expect(fs.readdirSync(path.join(userData, 'library', manga.id, 'pages'))).toEqual(['0001.png', '0002.png']);
    expect(call('library:checkMissing')).toEqual([book.id]);
    // An archive without images is refused and the item is left as it was.
    expect(await lib.relinkManga(manga.id, writeCbz('nothing.cbz', 0))).toEqual({ ok: false, errorCode: 'no-pages' });
    expect(fs.readdirSync(path.join(userData, 'library', manga.id, 'pages'))).toHaveLength(2);
  });
});

describe('an import interrupted by a quit or crash', () => {
  it('removes folders that never got a row, keeps those that did, and offers the rest for Resume', async () => {
    const committed = writeEpub('committed.epub', '<dc:title>Committed</dc:title>');
    const [kept] = await call<Promise<LibraryItem[]>>('library:importPaths', [committed]);
    const orphanId = '0f0e0d0c-0000-4000-8000-0000000000aa';
    fs.mkdirSync(path.join(userData, 'library', orphanId, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(userData, 'library', orphanId, 'pages', '0001.png'), 'partial');
    const left = writeEpub('left.epub', '<dc:title>Left</dc:title>');
    fs.writeFileSync(
      path.join(userData, 'library-import-queue.json'),
      JSON.stringify({ remaining: [left], inflight: [orphanId, kept.id], startedAt: 1 }),
    );
    lib.recoverLibraryImportQueue();
    expect(fs.existsSync(path.join(userData, 'library', orphanId))).toBe(false);
    expect(fs.existsSync(path.join(userData, 'library', kept.id, 'original.epub'))).toBe(true);
    expect((call('library:importStatus') as LibraryImportStatus).resumable).toBe(1);

    const resumed = call<{ started: boolean; remaining: number }>('library:importResume');
    expect(resumed).toEqual({ started: true, remaining: 1 });
    await vi.waitFor(() => expect(readDbFile().some((i) => i.title === 'Left')).toBe(true));
    await vi.waitFor(() => expect((call('library:importStatus') as LibraryImportStatus).resumable).toBe(0));
  });
});

describe('EPUB buffers (extension / generated imports)', () => {
  it('the same bytes twice give back the first item', () => {
    const buffer = epubBytes('<dc:title>Buffered</dc:title>', 'buf');
    const first = lib.importEpubBufferToLibrary({ title: '', buffer });
    const second = lib.importEpubBufferToLibrary({ title: 'Other name', buffer });
    expect(second.id).toBe(first.id);
    expect(first.title).toBe('Buffered');
  });
});
