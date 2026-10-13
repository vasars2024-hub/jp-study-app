// @vitest-environment node
/**
 * Contracts of the headless e2e flows (tools/e2e/flows/) and the media they generate
 * (tools/e2e/fixtures.cjs), checked without launching the app:
 *
 *  - a flow that looks a word up waits for the built-in dictionary itself
 *    (`ensureDictionaryReady`): the epub flow's "the lookup popup shows 台所" used to pass
 *    only when the `dictionary` flow had run first and paid that wait;
 *  - the library flow's collection is what its checks assume: 30 files, every book and
 *    archive distinct bytes but one deliberate duplicate, one archive with no pages, and
 *    pages that are valid PNGs.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(__filename);
const FLOWS = path.resolve(__dirname, '../../../tools/e2e/flows');
const AdmZip = require('adm-zip') as new (file?: string) => {
  getEntries(): Array<{ entryName: string; getData(): Buffer }>;
  readAsText(name: string): string;
};

interface Collection {
  root: string;
  shelf: Array<{ title: string; file: string }>;
  collectionDir: string;
  files: string[];
  books: Array<{ title: string; file: string }>;
  manga: Array<{ title: string; file: string }>;
  duplicate: string;
  broken: string;
  expected: { total: number; imported: number; duplicates: number; failed: number };
}
const fixtures = require('../../../tools/e2e/fixtures.cjs') as {
  libraryCollection(dir: string, opts?: { pageWidth?: number; pageHeight?: number }): Collection;
};

const flowFiles = fs.readdirSync(FLOWS).filter((f) => f.endsWith('.cjs') && !f.startsWith('_'));
const source = (f: string): string => fs.readFileSync(path.join(FLOWS, f), 'utf8');

describe('e2e flows', () => {
  it('have unique ids', () => {
    const ids = flowFiles.map((f) => (require(path.join(FLOWS, f)) as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // What needs the built-in dictionary loaded: the lookup pop-up, the Dictionary page's
  // search, the dictionary's own lookup calls.
  const LOOKS_UP = /\.dict-popup|form\.dict-search|lookupTerm(Offline)?\(|dictScanLongest\(/;
  const lookups = flowFiles.filter((f) => LOOKS_UP.test(source(f)));

  it('include flows that look words up (the audit below is not vacuous)', () => {
    expect(lookups).toEqual(expect.arrayContaining(['20-dictionary.cjs', '30-epub.cjs', '45-anki.cjs']));
  });

  it.each(lookups)('%s waits for the built-in dictionary itself (no hidden dependency on another flow)', (f) => {
    const text = source(f);
    expect(text).toMatch(/require\('\.\/_lib\.cjs'\)/);
    expect(text).toMatch(/await ensureDictionaryReady\(ctx\b/);
  });
});

describe('the library flow collection (fixtures.libraryCollection)', () => {
  let dir = '';
  let media: Collection;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-libfix-'));
    // Small pages: the shape is under test here, not the import's pace.
    media = fixtures.libraryCollection(dir, { pageWidth: 24, pageHeight: 16 });
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const sha = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

  it('is 30 files: 18 books, 10 archives, one duplicate and one broken archive', () => {
    expect(media.files).toHaveLength(30);
    expect(media.books).toHaveLength(18);
    expect(media.manga).toHaveLength(10);
    expect(media.expected).toEqual({ total: 30, imported: 28, duplicates: 1, failed: 1 });
    expect(fs.readdirSync(media.collectionDir).sort()).toEqual(media.files.map((f) => path.basename(f)).sort());
  });

  it('every file is distinct bytes except the duplicate, which copies the first book', () => {
    const hashes = media.files.filter((f) => f !== media.duplicate).map(sha);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(sha(media.duplicate)).toBe(sha(media.books[0].file));
    // The import meets the original first (natural order by name).
    const order = [...media.files].map((f) => path.basename(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    expect(order.indexOf(path.basename(media.books[0].file))).toBeLessThan(order.indexOf(path.basename(media.duplicate)));
  });

  it('the shelf books are distinct from the collection and carry their titles in the OPF', () => {
    const collection = new Set(media.files.map(sha));
    for (const book of media.shelf) {
      expect(collection.has(sha(book.file))).toBe(false);
      expect(new AdmZip(book.file).readAsText('OEBPS/content.opf')).toContain(`<dc:title>${book.title}</dc:title>`);
    }
  });

  it('archives hold valid PNG pages; the broken one holds none', () => {
    const isImage = (name: string): boolean => /\.(png|jpe?g|webp|gif)$/i.test(name);
    for (const m of media.manga) {
      const pages = new AdmZip(m.file).getEntries().filter((e) => isImage(e.entryName));
      expect(pages).toHaveLength(2);
      for (const page of pages) {
        const png = page.getData();
        expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        // IHDR: its CRC is right and it says 24x16 RGB.
        const ihdr = png.subarray(12, 12 + 4 + 13);
        expect(png.readUInt32BE(12 + 4 + 13)).toBe(zlib.crc32(ihdr));
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([24, 16]);
        // IDAT inflates to exactly one filter byte + RGB row per line.
        const idatLen = png.readUInt32BE(33);
        expect(png.subarray(37, 41).toString('ascii')).toBe('IDAT');
        expect(zlib.inflateSync(png.subarray(41, 41 + idatLen)).length).toBe((24 * 3 + 1) * 16);
      }
    }
    expect(new AdmZip(media.broken).getEntries().filter((e) => isImage(e.entryName))).toHaveLength(0);
  });
});
