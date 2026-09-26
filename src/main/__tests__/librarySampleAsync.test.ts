// @vitest-environment node
/**
 * The Library's book text sample is read without blocking the main process,
 * and is prose rather than a title page; file keys and batched level writes
 * back the renderer's once-per-file scoring.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'library-sample-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: { handle: () => undefined },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));
vi.mock('../readabilityExtract', () => ({ extractReadableFromUrl: () => Promise.resolve(null) }));
vi.mock('../readingFetch', () => ({ fetchReadingContent: () => Promise.resolve(null) }));
vi.mock('../i18n', () => ({ mt: (k: string) => k }));

const {
  importEpubBufferToLibrary,
  sampleBookText,
  bookFileKeys,
  updateLibraryLevelMetaMany,
  getLibraryItem,
} = await import('../library');

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const PROSE = '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。'.repeat(20);

function epub(): Buffer {
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.addFile(
    'META-INF/container.xml',
    Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'),
  );
  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(`<package><manifest>
      <item id="cover" href="cover.xhtml"/>
      <item id="c1" href="ch1.xhtml"/>
    </manifest><spine><itemref idref="cover"/><itemref idref="c1"/></spine></package>`),
  );
  zip.addFile('OEBPS/cover.xhtml', Buffer.from('<html><body><h1>吾輩は猫である</h1><p>夏目漱石</p></body></html>'));
  zip.addFile('OEBPS/ch1.xhtml', Buffer.from(`<html><body><p>${PROSE}</p></body></html>`));
  return zip.toBuffer();
}

describe('the Library book sample', () => {
  const item = importEpubBufferToLibrary({ title: 'neko', buffer: epub() });

  it('reads the book asynchronously and starts at the prose, capped', async () => {
    const readSync = vi.spyOn(fs, 'readFileSync');
    const sample = await sampleBookText(item.id, 2_000);
    const epubReads = readSync.mock.calls.filter(([p]) => String(p).endsWith('.epub'));
    readSync.mockRestore();
    expect(epubReads).toEqual([]);
    expect(sample).not.toBeNull();
    expect(sample!.startsWith('吾輩は猫である。名前はまだ無い。')).toBe(true);
    expect(sample!.length).toBeLessThanOrEqual(2_000);
  });

  it('keeps short documents when they are all the book has', async () => {
    const zip = new AdmZip(epub());
    zip.deleteFile('OEBPS/ch1.xhtml');
    const short = importEpubBufferToLibrary({ title: 'short', buffer: zip.toBuffer() });
    expect(await sampleBookText(short.id, 2_000)).toContain('夏目漱石');
  });

  it('keys each book by its file size and mtime', async () => {
    const keys = await bookFileKeys([item.id, 'no-such-book']);
    const st = fs.statSync(path.join(tmpRoot, 'library', item.id, 'original.epub'));
    expect(keys[item.id]).toBe(`${st.size}:${Math.round(st.mtimeMs)}`);
    expect(keys['no-such-book']).toBeNull();
  });

  it('writes many books’ level stats in one library write', () => {
    updateLibraryLevelMetaMany(
      [
        { id: item.id, levelMeta: { lang: 'ja', knownRatio: 0.8, levelEstimate: 2 } },
        { id: 'no-such-book', levelMeta: { lang: 'ja', knownRatio: 0.1, levelEstimate: 7 } },
      ],
      { broadcast: false },
    );
    expect(getLibraryItem(item.id)?.levelMeta).toEqual({ lang: 'ja', knownRatio: 0.8, levelEstimate: 2 });
  });
});
