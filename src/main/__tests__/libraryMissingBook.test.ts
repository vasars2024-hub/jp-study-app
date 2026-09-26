// @vitest-environment node
/**
 * Resilience audit #16: a stored EPUB/PDF deleted or moved behind the app
 * reached the reader as English-only text built in the renderer, with no
 * way back short of a re-import (which loses progress and highlights).
 * `readBook` answers null for a missing file, and `relinkBook` puts a chosen
 * file back under the SAME library item, staged then swapped.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'library-missing-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: { handle: () => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));
vi.mock('../readabilityExtract', () => ({ extractReadableFromUrl: () => Promise.resolve(null) }));
vi.mock('../readingFetch', () => ({ fetchReadingContent: () => Promise.resolve(null) }));
vi.mock('../i18n', () => ({ mt: (k: string) => k }));
vi.mock('../epubMeta', () => ({ extractEpubTitleFromOpf: () => undefined }));

const ID = 'book-missing-1';
fs.writeFileSync(path.join(tmpRoot, 'library.json'), JSON.stringify([{
  id: ID,
  kind: 'book',
  title: 'Kokoro',
  addedAt: 1,
  epubFile: 'original.epub',
  progress: { location: 'p:3:0.5000', percent: 0.4 },
}]));

const { readBook, relinkBook } = await import('../library');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a book whose stored file is missing', () => {
  it('reads as null (typed missing), not a throw', () => {
    expect(readBook(ID)).toBeNull();
  });

  it('is relinked to a chosen file under the same item, and then reads', async () => {
    const chosen = path.join(tmpRoot, 'Kokoro.epub');
    fs.writeFileSync(chosen, 'PK-epub-bytes');
    await expect(relinkBook(ID, chosen)).resolves.toEqual({ ok: true });
    const bytes = readBook(ID);
    expect(bytes && Buffer.from(bytes).toString()).toBe('PK-epub-bytes');
    // Same item: its progress is untouched.
    const db = JSON.parse(fs.readFileSync(path.join(tmpRoot, 'library.json'), 'utf-8')) as Array<{ id: string; progress?: { percent?: number } }>;
    expect(db.find((entry) => entry.id === ID)?.progress?.percent).toBe(0.4);
  });

  it('reports a full disk without leaving a half-copied file', async () => {
    const chosen = path.join(tmpRoot, 'Kokoro2.epub');
    fs.writeFileSync(chosen, 'new-bytes');
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
    });
    await expect(relinkBook(ID, chosen)).resolves.toEqual({ ok: false, errorCode: 'storage-full' });
    const bytes = readBook(ID);
    expect(bytes && Buffer.from(bytes).toString()).toBe('PK-epub-bytes');
  });

  it('a cancelled picker changes nothing', async () => {
    await expect(relinkBook(ID)).resolves.toEqual({ ok: false, canceled: true });
  });
});
