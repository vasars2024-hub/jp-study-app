// @vitest-environment node
/**
 * Backup archive round trip and restore atomicity (audit robust #1).
 *
 * The old "Full backup" left out the library and every main-process store; its
 * restore wiped first, ignored failed writes and reported success. Here:
 * - every JSON store found in userData is archived (no hand-kept list), plus
 *   the library, with book files optional; secrets and caches are not;
 * - restore stages + validates first, and a failure half-way through the swap
 *   leaves userData byte-for-byte as it was and names the failing path.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { Zip, ZipPassThrough } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  autoBackupDue,
  autoBackupName,
  commitStaged,
  createBackupArchive,
  expectedDataEntries,
  extractZipEntry,
  inventoryUserData,
  isRestorableRelPath,
  listAutoBackups,
  listZipEntries,
  openZipWriter,
  pruneAutoBackups,
  stageArchive,
  zipEndRecords,
  type CommitFs,
} from '../backup/backupArchive';

let root: string;
let source: string;
let dest: string;

function put(base: string, rel: string, content: string | Buffer): void {
  const p = path.join(base, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
const get = (base: string, rel: string): string => fs.readFileSync(path.join(base, ...rel.split('/')), 'utf8');

function seedUserData(base: string): void {
  put(base, 'library.json', JSON.stringify([{ id: 'book-1', title: '走れメロス' }]));
  put(base, 'config.json', '{"folders":["Novels"]}');
  put(base, 'reading-lists.json', '{"lists":[{"id":"l1"}]}');
  put(base, 'reading-lists-events.jsonl', '{"type":"a"}\n{"type":"b"}\n');
  put(base, 'watch-library.json', '{"titles":[]}');
  put(base, 'anki-draft-sessions.json', '[{"id":"s1"}]');
  put(base, 'immersion/sites.json', '[{"url":"https://example.jp"}]');
  put(base, 'library/book-1/book.epub', Buffer.alloc(300_000, 7));
  put(base, 'library/book-1/_ocr/0001.corrections.json', '{"fix":1}');
  // Must NOT be archived:
  put(base, 'mal-tokens.json', '{"access_token":"secret"}');
  put(base, 'mining/api-keys.json', '{"gemini":"secret"}');
  put(base, 'IndexedDB/app_bundle_0.indexeddb.leveldb/000003.log', 'chromium');
  put(base, 'mining/translation-cache.json', '{}');
  put(base, 'metadata-cache/abc.json', '{}');
  put(base, 'models/state.json', '{}');
  put(base, 'library.json.bak', '[]');
  put(base, 'library.json.123.tmp', '[');
}

const renderer = {
  app: 'jp-study-app',
  kind: 'renderer-snapshot',
  format: 1,
  localStorage: { 'jp-os-theme': 'dark' },
  indexedDb: { 'jp-study-db': { version: 1, stores: { kv: { keyPath: null, autoIncrement: false, entries: [['flashcard-deck', { cards: [1] }]] } } } },
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-backup-'));
  source = path.join(root, 'source');
  dest = path.join(root, 'dest');
  seedUserData(source);
  fs.mkdirSync(dest, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

describe('inventory', () => {
  it('finds every JSON store by walking userData, and skips secrets, caches and Chromium internals', () => {
    const inv = inventoryUserData(source);
    const stores = inv.stores.map((s) => s.rel);
    expect(stores).toEqual([
      'anki-draft-sessions.json',
      'config.json',
      'immersion/sites.json',
      'library.json',
      'reading-lists-events.jsonl',
      'reading-lists.json',
      'watch-library.json',
    ]);
    expect(inv.library.map((s) => s.rel)).toEqual(['library/book-1/_ocr/0001.corrections.json', 'library/book-1/book.epub']);
    expect(inv.bookBytes).toBe(300_000);
    expect(inv.skipped.join(' ')).toMatch(/mal-tokens\.json/);
  });
});

describe('round trip', () => {
  it('backs up and restores stores, library and the renderer snapshot', async () => {
    const zip = path.join(root, 'out', 'backup.zip');
    const created = await createBackupArchive({
      userData: source, target: zip, includeBookFiles: true, trigger: 'manual', appVersion: '1.0.1', origin: 'app://bundle', renderer,
    });
    expect(created.manifest.library.bookFilesIncluded).toBe(true);
    const names = listZipEntries(zip).map((e) => e.name);
    expect(names).toContain('userdata/library/book-1/book.epub');
    expect(names.some((n) => n.includes('mal-tokens') || n.includes('api-keys') || n.includes('IndexedDB'))).toBe(false);

    const staged = await stageArchive(zip, path.join(root, 'staging'));
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    expect(staged.staged.renderer).toEqual(renderer);
    const result = commitStaged(staged.staged, dest, path.join(root, 'previous'));
    expect(result.ok).toBe(true);
    for (const rel of ['library.json', 'config.json', 'reading-lists.json', 'reading-lists-events.jsonl', 'watch-library.json', 'anki-draft-sessions.json', 'immersion/sites.json', 'library/book-1/_ocr/0001.corrections.json']) {
      expect(get(dest, rel)).toBe(get(source, rel));
    }
    expect(fs.readFileSync(path.join(dest, 'library', 'book-1', 'book.epub')).equals(fs.readFileSync(path.join(source, 'library', 'book-1', 'book.epub')))).toBe(true);
  });

  it('stores a renderer snapshot sent as text verbatim, and never holds the thread for a large entry', async () => {
    // A 12 MB store and a 9 MB snapshot text: the sizes that froze main for seconds
    // when they were stringified and deflated in one synchronous call each.
    const big = JSON.stringify({ items: Array.from({ length: 60_000 }, (_, i) => ({ id: i, path: `C:/music/track-${i}.mp3`, title: `トラック ${i}` })) });
    put(source, 'media.json', big);
    const text = `{"app":"jp-study-app","kind":"renderer-snapshot","format":1,"createdAt":"2026-09-25T00:00:00.000Z","summary":{"localStorageKeys":1,"indexedDbDatabases":["jp-study-db"]},"localStorage":{"jp-flashcard-deck":${JSON.stringify('x'.repeat(9_000_000))}},"indexedDb":{"jp-study-db":{"version":1,"stores":{}}}}`;
    const zip = path.join(root, 'out', 'text.zip');
    let longest = 0;
    let last = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
    }, 1);
    const created = await createBackupArchive({
      userData: source, target: zip, includeBookFiles: false, trigger: 'auto', appVersion: '1.0.1', renderer: text,
    });
    clearInterval(ticker);
    expect(created.manifest.renderer).toEqual({ localStorageKeys: 1, indexedDbDatabases: ['jp-study-db'] });
    const staged = await stageArchive(zip, path.join(root, 'staging-text'));
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    expect(JSON.stringify(staged.staged.renderer)).toBe(text);
    const result = commitStaged(staged.staged, dest, path.join(root, 'previous-text'));
    expect(result.ok).toBe(true);
    expect(get(dest, 'media.json')).toBe(big);
    // Sliced deflate: no single synchronous stretch anywhere near the old seconds.
    expect(longest).toBeLessThan(400);
  });

  it('without book files, keeps the library JSON and says what was left out', async () => {
    const zip = path.join(root, 'nobooks.zip');
    const created = await createBackupArchive({ userData: source, target: zip, includeBookFiles: false, trigger: 'auto', appVersion: '1.0.1', renderer: null });
    const names = listZipEntries(zip).map((e) => e.name);
    expect(names).not.toContain('userdata/library/book-1/book.epub');
    expect(names).toContain('userdata/library/book-1/_ocr/0001.corrections.json');
    expect(created.manifest.library.bookFilesOmitted).toBe(1);
  });

  it('keeps the current files aside, and moves a stale .bak out of the way', async () => {
    put(dest, 'library.json', '[{"id":"newer-local"}]');
    put(dest, 'library.json.bak', '[{"id":"older"}]');
    const zip = path.join(root, 'b.zip');
    await createBackupArchive({ userData: source, target: zip, includeBookFiles: false, trigger: 'manual', appVersion: '1', renderer: null });
    const staged = await stageArchive(zip, path.join(root, 'staging'));
    if (!staged.ok) throw new Error(staged.errors.join());
    const previous = path.join(root, 'previous');
    expect(commitStaged(staged.staged, dest, previous).ok).toBe(true);
    expect(get(previous, 'userdata/library.json')).toBe('[{"id":"newer-local"}]');
    expect(fs.existsSync(path.join(dest, 'library.json.bak'))).toBe(false);
  });
});

describe('restore is all-or-nothing', () => {
  it('rolls back every swapped file when one write fails, and names it', async () => {
    put(dest, 'library.json', '[{"id":"current"}]');
    put(dest, 'config.json', '{"folders":["Current"]}');
    put(dest, 'watch-library.json', '{"titles":["current"]}');
    const before = { lib: get(dest, 'library.json'), cfg: get(dest, 'config.json'), watch: get(dest, 'watch-library.json') };

    const zip = path.join(root, 'c.zip');
    await createBackupArchive({ userData: source, target: zip, includeBookFiles: false, trigger: 'manual', appVersion: '1', renderer: null });
    const staged = await stageArchive(zip, path.join(root, 'staging'));
    if (!staged.ok) throw new Error(staged.errors.join());

    // A reader holds reading-lists.json open: Windows refuses the swap.
    const io: CommitFs = {
      rename: (from, to) => {
        if (to.endsWith(`${path.sep}reading-lists.json`) && from.includes('staging')) {
          throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
        }
        fs.renameSync(from, to);
      },
      exists: (p) => fs.existsSync(p),
      mkdirp: (d) => fs.mkdirSync(d, { recursive: true }),
      rm: (p) => fs.rmSync(p, { recursive: true, force: true }),
    };
    const result = commitStaged(staged.staged, dest, path.join(root, 'previous'), io);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toEqual([{ path: 'reading-lists.json', error: 'EPERM: operation not permitted' }]);
    expect(result.rollbackFailures).toEqual([]);
    // Exactly as before — including the files that had already been swapped.
    expect(get(dest, 'library.json')).toBe(before.lib);
    expect(get(dest, 'config.json')).toBe(before.cfg);
    expect(get(dest, 'watch-library.json')).toBe(before.watch);
    expect(fs.existsSync(path.join(dest, 'anki-draft-sessions.json'))).toBe(false);
  });

  it('refuses a damaged archive before touching anything', async () => {
    const zip = path.join(root, 'd.zip');
    await createBackupArchive({ userData: source, target: zip, includeBookFiles: false, trigger: 'manual', appVersion: '1', renderer: null });
    const bytes = fs.readFileSync(zip);
    // Flip a byte inside the first stored file's data.
    const entry = listZipEntries(zip).find((e) => e.name === 'userdata/library.json');
    if (!entry) throw new Error('entry missing');
    bytes[entry.localHeaderOffset + 30 + entry.name.length + 2] ^= 0xff;
    fs.writeFileSync(zip, bytes);
    const staged = await stageArchive(zip, path.join(root, 'staging'));
    expect(staged.ok).toBe(false);
    if (staged.ok) return;
    expect(staged.errors.join('\n')).toMatch(/library\.json/);
    expect(fs.existsSync(path.join(root, 'staging'))).toBe(false);
  });

  it('rejects entries that would escape userData or overwrite secrets/Chromium data', () => {
    for (const bad of ['../evil.json', '/abs.json', 'C:/x.json', 'a\\b.json', 'IndexedDB/x.json', 'mal-tokens.json', 'x.exe', 'lib/../../x.json']) {
      expect(isRestorableRelPath(bad)).toBe(false);
    }
    for (const good of ['library.json', 'immersion/sites.json', 'library/abc/book.epub', 'reading-lists-events.jsonl']) {
      expect(isRestorableRelPath(good)).toBe(true);
    }
  });
});

describe('more than 65,535 entries', () => {
  const MANY = 70_000;

  it('writes Zip64 end records, and the reader lists every entry', async () => {
    const zip = path.join(root, 'many.zip');
    const writer = openZipWriter(fs.createWriteStream(zip));
    const tiny = Buffer.from('x');
    for (let i = 0; i < MANY; i++) writer.addData(`userdata/library/b/_ocr/${i}.json`, tiny, false);
    await writer.end();

    const entries = listZipEntries(zip);
    expect(entries).toHaveLength(MANY);
    expect(entries[MANY - 1].name).toBe(`userdata/library/b/_ocr/${MANY - 1}.json`);
    const bytes = fs.readFileSync(zip);
    // Plain end record says "see Zip64"; the Zip64 record holds the real count.
    expect(bytes.readUInt16LE(bytes.length - 22 + 10)).toBe(0xffff);
    const record = bytes.length - 22 - 20 - 56;
    expect(bytes.readUInt32LE(record)).toBe(0x06064b50);
    expect(Number(bytes.readBigUInt64LE(record + 32))).toBe(MANY);
  }, 60_000);

  it('lists every entry of an archive written before the fix (count wrapped, directory complete)', async () => {
    const zip = path.join(root, 'old.zip');
    const out = fs.createWriteStream(zip);
    const legacy = new Zip((err, chunk, final) => {
      if (err) throw err;
      out.write(Buffer.from(chunk));
      if (final) out.end();
    });
    for (let i = 0; i < MANY; i++) {
      const f = new ZipPassThrough(`userdata/library/b/${i}.jpg`);
      legacy.add(f);
      f.push(new Uint8Array([1]), true);
    }
    legacy.end();
    await finished(out);
    const bytes = fs.readFileSync(zip);
    expect(bytes.readUInt16LE(bytes.length - 22 + 10)).toBe(MANY % 0x10000); // what the old reader trusted
    expect(listZipEntries(zip)).toHaveLength(MANY);
  }, 60_000);

  it('refuses a restore whose central directory disagrees with the manifest', async () => {
    const zip = path.join(root, 'short.zip');
    const created = await createBackupArchive({ userData: source, target: zip, includeBookFiles: true, trigger: 'manual', appVersion: '1', renderer: null });
    expect(created.manifest.entries).toBe(created.manifest.stores.length + created.manifest.library.files);
    expect((await stageArchive(zip, path.join(root, 'staging-ok'))).ok).toBe(true);

    // Same manifest, one library file missing from the archive.
    const short = path.join(root, 'short2.zip');
    const writer = openZipWriter(fs.createWriteStream(short));
    for (const entry of listZipEntries(zip)) {
      if (entry.name === 'userdata/library/book-1/book.epub') continue;
      const target = path.join(root, 'x', entry.name);
      await extractZipEntry(zip, entry, target);
      writer.addData(entry.name, fs.readFileSync(target), true);
    }
    await writer.end();
    const staged = await stageArchive(short, path.join(root, 'staging'));
    expect(staged.ok).toBe(false);
    if (staged.ok) return;
    expect(staged.errors.join('\n')).toMatch(/manifest lists/);
    expect(fs.existsSync(path.join(root, 'staging'))).toBe(false);
  });

  it('checks archives from before the entries field against stores + library files', () => {
    expect(expectedDataEntries({ stores: [{ path: 'a.json', bytes: 1 }], library: { files: 4, bytes: 0, bookFilesIncluded: true, bookFilesOmitted: 0 } } as never)).toBe(5);
    expect(expectedDataEntries({ entries: 9, stores: [], library: { files: 0 } } as never)).toBe(9);
  });

  it('keeps the plain end record below the limit', () => {
    const plain = zipEndRecords(3, 100, 2000);
    expect(plain).toHaveLength(22);
    expect(plain.readUInt16LE(10)).toBe(3);
  });
});

describe('automatic backups', () => {
  it('are due once per day and keep the newest seven', () => {
    const dir = path.join(root, 'backups');
    expect(autoBackupDue(dir)).toBe(true);
    for (let d = 1; d <= 9; d++) put(dir, autoBackupName(new Date(Date.UTC(2026, 8, d))), 'zip');
    expect(pruneAutoBackups(dir)).toHaveLength(2);
    const left = listAutoBackups(dir).map((b) => b.name);
    expect(left).toHaveLength(7);
    expect(left[0]).toContain('2026-09-09');
    expect(autoBackupDue(dir)).toBe(false);
    expect(autoBackupDue(dir, Date.now() + 25 * 60 * 60 * 1000)).toBe(true);
  });
});
