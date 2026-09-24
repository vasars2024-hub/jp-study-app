/**
 * Backup archive core — electron-free so the round trip is testable.
 *
 * Audit robust #1: the only restore point used to be a manual JSON export of
 * localStorage + IndexedDB + four host settings, which the UI called a "Full
 * backup" while leaving out library.json, the book files, reading lists, the
 * watch library, Anki draft sessions and immersion data. Its restore wiped
 * everything first, ignored failed writes and reported success.
 *
 * ## What an archive holds (format 3, a plain .zip any tool can open)
 *
 *   manifest.json          what is inside, when, which build, which origin
 *   renderer.json          localStorage + every IndexedDB database, as JSON
 *                          (see renderer/storage/backupSnapshot.ts)
 *   userdata/<rel path>    every JSON store in userData, found by walking the
 *                          folder — NOT a hand-kept list, so a store added next
 *                          month is backed up without anyone remembering to
 *                          add it here — plus userData/library (book files
 *                          optional; the library's own JSON always goes in).
 *
 * Deliberately NOT included (listed in the manifest): Chromium's own profile
 * folders (the renderer data is in renderer.json instead), caches, downloaded
 * models and dictionaries (re-downloadable, and large), logs, earlier backups,
 * and secrets — passwords, API keys and sign-in tokens do not belong in a file
 * the user may copy anywhere, and safeStorage ciphertext would not decrypt on
 * another PC anyway.
 *
 * ## Origin independence
 *
 * Dev builds load the renderer from http://localhost:5173 and packaged builds
 * from app://bundle. Chromium keys localStorage and IndexedDB by origin, so the
 * two builds keep SEPARATE renderer data in the same userData folder (folders
 * `http_localhost_5173.*` vs `app_bundle_0.*` under `Local Storage`/`IndexedDB`).
 * renderer.json is plain key/value data with no origin in it, so a backup made
 * by one build restores into the other; the origin is recorded for information.
 *
 * ## Restore
 *
 * `stageArchive` extracts everything into a staging folder and validates it
 * (manifest, CRC of every entry, every JSON file parses, every path stays inside
 * userData and outside excluded areas). `commitStaged` then moves each current
 * file aside and the staged one into place; if ANY step fails, every step done
 * so far is undone and the exact failures are returned. The moved-aside files
 * are kept as `backups/pre-restore-<ts>` — the state before the restore.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';

export const BACKUP_APP = 'jp-study-app';
export const BACKUP_KIND = 'gum-backup';
export const BACKUP_FORMAT = 3;
export const USERDATA_PREFIX = 'userdata/';
export const AUTO_BACKUP_KEEP = 7;
/** Plain ZIP (no Zip64) tops out at 4 GiB; stay clear of it. */
export const ZIP32_LIMIT_BYTES = 3.9 * 1024 * 1024 * 1024;
/** A single JSON "store" larger than this outside the library is dictionary/cache data, not a store. */
const MAX_STORE_BYTES = 64 * 1024 * 1024;

/** Top-level userData folders that are Chromium/Electron internals, caches, or regenerable data. */
const EXCLUDED_TOP_DIRS = new Set(
  [
    // Chromium profile — renderer data travels as renderer.json instead.
    'IndexedDB', 'Local Storage', 'Session Storage', 'WebStorage', 'databases', 'blob_storage',
    'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
    'GrShaderCache', 'ShaderCache', 'Service Worker', 'Network', 'Crashpad', 'Shared Dictionary',
    'SharedStorage', 'VideoDecodeStats', 'Partitions', 'Local Extension Settings', 'Extension State',
    'Extension Rules', 'Extension Scripts', 'Sessions', 'Dictionaries', 'shared_proto_db', 'optimization_guide_model_store',
    // App data that is regenerable, re-downloadable, third-party, or ours.
    'backups', 'recovery', 'logs', 'models', 'dictionary', 'yomitan', 'tatoeba', 'seanime',
    'chrome-extension', 'metadata-cache', 'media-cache', 'artwork', 'covers',
  ].map((s) => s.toLowerCase()),
);

/** Secrets never go into a backup file. userData-relative, posix separators. */
const EXCLUDED_SECRET_FILES = new Set(
  [
    'credentials.dat',
    'mal-tokens.json',
    'mining/api-keys.json',
    'subtitle-keys.json',
    'scraper/credentials.json',
    'extension-bridge.json',
  ].map((s) => s.toLowerCase()),
);

const STORE_EXTENSIONS = new Set(['.json', '.jsonl', '.ndjson']);

export interface BackupSource {
  /** Archive-relative path under userdata/, posix separators. */
  rel: string;
  abs: string;
  bytes: number;
  /** Part of the library folder and not JSON — the "book files" option. */
  bookFile: boolean;
}

export interface BackupInventory {
  stores: BackupSource[];
  library: BackupSource[];
  storeBytes: number;
  libraryJsonBytes: number;
  bookBytes: number;
  bookFiles: number;
  skipped: string[];
}

const toPosix = (p: string): string => p.split(path.sep).join('/');

function isTransientName(name: string): boolean {
  return name.endsWith('.tmp') || name.endsWith('.bak') || name.includes('.corrupt-') || name.endsWith('.partial');
}

/** Walk userData and classify what a backup would contain. */
export function inventoryUserData(userData: string): BackupInventory {
  const inv: BackupInventory = { stores: [], library: [], storeBytes: 0, libraryJsonBytes: 0, bookBytes: 0, bookFiles: 0, skipped: [] };
  const walk = (dir: string, relDir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      const top = rel.split('/')[0].toLowerCase();
      const inLibrary = top === 'library';
      if (e.isDirectory()) {
        if (depth === 0 && EXCLUDED_TOP_DIRS.has(e.name.toLowerCase())) continue;
        if (!inLibrary && /cache/i.test(e.name)) continue;
        if (e.name.startsWith('.')) continue;
        if (depth < 12) walk(abs, rel, depth + 1);
        continue;
      }
      if (!e.isFile() || isTransientName(e.name)) continue;
      const ext = path.extname(e.name).toLowerCase();
      const isStore = STORE_EXTENSIONS.has(ext);
      if (EXCLUDED_SECRET_FILES.has(rel.toLowerCase())) {
        inv.skipped.push(`${rel} (secret)`);
        continue;
      }
      let bytes = 0;
      try {
        bytes = fs.statSync(abs).size;
      } catch {
        continue;
      }
      if (inLibrary) {
        const src: BackupSource = { rel, abs, bytes, bookFile: !isStore };
        inv.library.push(src);
        if (isStore) inv.libraryJsonBytes += bytes;
        else {
          inv.bookBytes += bytes;
          inv.bookFiles += 1;
        }
        continue;
      }
      if (!isStore) continue;
      if (/cache/i.test(e.name)) continue;
      if (bytes > MAX_STORE_BYTES) {
        inv.skipped.push(`${rel} (${bytes} bytes — too large for a settings store)`);
        continue;
      }
      inv.stores.push({ rel, abs, bytes, bookFile: false });
      inv.storeBytes += bytes;
    }
  };
  walk(userData, '', 0);
  inv.stores.sort((a, b) => a.rel.localeCompare(b.rel));
  inv.library.sort((a, b) => a.rel.localeCompare(b.rel));
  return inv;
}

export interface BackupManifest {
  app: typeof BACKUP_APP;
  kind: typeof BACKUP_KIND;
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  appVersion: string;
  /** `pre-restore`: the state a restore replaced, kept in backups/pre-restore-<ts>. */
  trigger: 'manual' | 'auto' | 'pre-restore';
  /** Renderer origin the snapshot came from — information only; restore ignores it. */
  origin: string | null;
  includesBookFiles: boolean;
  stores: Array<{ path: string; bytes: number }>;
  library: { files: number; bytes: number; bookFilesIncluded: boolean; bookFilesOmitted: number };
  renderer: { localStorageKeys: number; indexedDbDatabases: string[] } | null;
  excluded: string[];
  /**
   * How many `userdata/` entries the archive holds (stores + library files).
   * Restore refuses an archive whose central directory lists a different
   * number. Absent in archives written before it existed.
   */
  entries?: number;
}

export interface CreateBackupOptions {
  userData: string;
  target: string;
  includeBookFiles: boolean;
  trigger: 'manual' | 'auto';
  appVersion: string;
  origin?: string | null;
  /** renderer.json contents (already validated by the caller). */
  renderer: unknown | null;
}

export interface CreateBackupResult {
  path: string;
  bytes: number;
  manifest: BackupManifest;
}

function rendererSummary(renderer: unknown): BackupManifest['renderer'] {
  if (!renderer || typeof renderer !== 'object') return null;
  const r = renderer as { localStorage?: Record<string, unknown>; indexedDb?: Record<string, unknown> };
  return {
    localStorageKeys: r.localStorage && typeof r.localStorage === 'object' ? Object.keys(r.localStorage).length : 0,
    indexedDbDatabases: r.indexedDb && typeof r.indexedDb === 'object' ? Object.keys(r.indexedDb) : [],
  };
}

export class BackupTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`Backup would be ${bytes} bytes, over the 3.9 GB limit of a single archive`);
    this.name = 'BackupTooLargeError';
  }
}

/** Write a backup archive to `target` (via a temp file + rename, so a failure leaves no half archive). */
export async function createBackupArchive(options: CreateBackupOptions): Promise<CreateBackupResult> {
  const inv = inventoryUserData(options.userData);
  const library = options.includeBookFiles ? inv.library : inv.library.filter((s) => !s.bookFile);
  const rendererText = options.renderer == null ? null : JSON.stringify(options.renderer);
  const total = inv.storeBytes + library.reduce((n, s) => n + s.bytes, 0) + (rendererText?.length ?? 0);
  if (total > ZIP32_LIMIT_BYTES) throw new BackupTooLargeError(total);

  const manifest: BackupManifest = {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    format: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    appVersion: options.appVersion,
    trigger: options.trigger,
    origin: options.origin ?? null,
    includesBookFiles: options.includeBookFiles,
    stores: inv.stores.map((s) => ({ path: s.rel, bytes: s.bytes })),
    library: {
      files: library.length,
      bytes: library.reduce((n, s) => n + s.bytes, 0),
      bookFilesIncluded: options.includeBookFiles,
      bookFilesOmitted: options.includeBookFiles ? 0 : inv.bookFiles,
    },
    renderer: rendererSummary(options.renderer),
    excluded: inv.skipped,
  };

  fs.mkdirSync(path.dirname(options.target), { recursive: true });
  const tmp = `${options.target}.${process.pid}.${Date.now().toString(36)}.tmp`;
  const out = fs.createWriteStream(tmp);
  const writer = openZipWriter(out);

  try {
    if (rendererText != null) writer.addData('renderer.json', Buffer.from(rendererText), true);
    const writtenStores: BackupManifest['stores'] = [];
    for (const s of inv.stores) {
      let data: Buffer;
      try {
        data = fs.readFileSync(s.abs);
      } catch {
        manifest.excluded.push(`${s.rel} (vanished during backup)`);
        continue;
      }
      writer.addData(`${USERDATA_PREFIX}${s.rel}`, data, true);
      writtenStores.push({ path: s.rel, bytes: data.length });
    }
    let libraryFiles = 0;
    let libraryBytes = 0;
    for (const s of library) {
      if (!fs.existsSync(s.abs)) {
        manifest.excluded.push(`${s.rel} (vanished during backup)`);
        continue;
      }
      // Book files are already compressed (epub/cbz/pdf/jpg) — store them.
      await writer.addFile(`${USERDATA_PREFIX}${s.rel}`, s.abs, !s.bookFile);
      libraryFiles += 1;
      libraryBytes += s.bytes;
    }
    // The manifest goes in last so it describes what was actually written;
    // restore compares `entries` with the central directory.
    manifest.stores = writtenStores;
    manifest.library.files = libraryFiles;
    manifest.library.bytes = libraryBytes;
    manifest.entries = writtenStores.length + libraryFiles;
    writer.addData('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)), true);
    await writer.end();
    fs.renameSync(tmp, options.target);
  } catch (err) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return { path: options.target, bytes: fs.statSync(options.target).size, manifest };
}

/** Plain ZIP counts entries in 16 bits; past this the Zip64 end records are written. */
export const ZIP16_MAX_ENTRIES = 0xffff;

/**
 * End-of-central-directory records for `count` entries.
 *
 * fflate writes only the plain 22-byte record, whose entry counts are 16-bit
 * and wrap past 65,535: a library with many manga page images or OCR files got
 * an archive whose reader saw a few thousand entries and restored only those.
 * Above the limit this writes the Zip64 end record and its locator and sets the
 * plain record's counts to 0xFFFF ("see Zip64"), as the spec asks. Sizes and
 * offsets stay 32-bit: archives are capped below 4 GiB.
 */
export function zipEndRecords(count: number, cdSize: number, cdOffset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  const zip64 = count > ZIP16_MAX_ENTRIES;
  end.writeUInt16LE(zip64 ? 0xffff : count, 8);
  end.writeUInt16LE(zip64 ? 0xffff : count, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdOffset, 16);
  if (!zip64) return end;
  const record = Buffer.alloc(56);
  record.writeUInt32LE(0x06064b50, 0);
  record.writeBigUInt64LE(44n, 4);
  record.writeUInt16LE(45, 12);
  record.writeUInt16LE(45, 14);
  record.writeBigUInt64LE(BigInt(count), 24);
  record.writeBigUInt64LE(BigInt(count), 32);
  record.writeBigUInt64LE(BigInt(cdSize), 40);
  record.writeBigUInt64LE(BigInt(cdOffset), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
  locator.writeUInt32LE(1, 16);
  return Buffer.concat([record, locator, end]);
}

export interface ZipWriter {
  addData(name: string, data: Uint8Array, compress: boolean): void;
  addFile(name: string, abs: string, compress: boolean): Promise<void>;
  /** Finish the archive and wait until `out` has flushed. */
  end(): Promise<void>;
}

/** fflate streaming ZIP into `out`, with correct end records for any entry count. */
export function openZipWriter(out: fs.WriteStream): ZipWriter {
  let zipError: Error | null = null;
  let written = 0;
  let count = 0;
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      zipError = err;
      return;
    }
    if (!final) {
      written += chunk.byteLength;
      out.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      return;
    }
    // The final chunk is the central directory followed by fflate's 22-byte
    // end record (no comment). Keep the directory; write our own end records.
    const cdSize = chunk.byteLength - 22;
    out.write(Buffer.from(chunk.buffer, chunk.byteOffset, cdSize));
    out.write(zipEndRecords(count, cdSize, written));
    out.end();
  });
  return {
    addData(name, data, compress) {
      const f = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
      zip.add(f);
      count += 1;
      f.push(data, true);
    },
    async addFile(name, abs, compress) {
      const f = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
      zip.add(f);
      count += 1;
      for await (const chunk of fs.createReadStream(abs, { highWaterMark: 1 << 20 })) {
        const buf = chunk as Buffer;
        f.push(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        if (out.writableNeedDrain) await once(out, 'drain');
      }
      f.push(new Uint8Array(0), true);
    },
    async end() {
      zip.end();
      await finished(out);
      if (zipError) throw zipError;
    },
  };
}

// ── reading archives ─────────────────────────────────────────────────────────

export interface ZipEntry {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const n = fs.readSync(fd, buf, read, length - read, position + read);
    if (n <= 0) break;
    read += n;
  }
  return buf.subarray(0, read);
}

/**
 * Parse the central directory (random access; never loads the whole archive).
 *
 * Entries are read until the directory's byte size is used up, never by the
 * stored count: the plain end record holds only 16 bits, and archives written
 * before the Zip64 fix carry a count wrapped modulo 65,536 over a complete
 * directory. Zip64 end records are honoured when present.
 */
export function listZipEntries(zipPath: string): ZipEntry[] {
  const fd = fs.openSync(zipPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tailStart = size - tailLen;
    const tail = readAt(fd, tailStart, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Not a ZIP archive (no end-of-directory record)');
    const stated = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (stated === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      const locatorAt = tailStart + eocd - 20;
      const locator = locatorAt >= 0 ? readAt(fd, locatorAt, 20) : Buffer.alloc(0);
      if (locator.length === 20 && locator.readUInt32LE(0) === 0x07064b50) {
        const record = readAt(fd, Number(locator.readBigUInt64LE(8)), 56);
        if (record.length < 56 || record.readUInt32LE(0) !== 0x06064b50) throw new Error('Damaged ZIP64 end-of-directory record');
        cdSize = Number(record.readBigUInt64LE(40));
        cdOffset = Number(record.readBigUInt64LE(48));
      }
    }
    const cd = readAt(fd, cdOffset, cdSize);
    if (cd.length !== cdSize) throw new Error('Damaged ZIP central directory (truncated)');
    const entries: ZipEntry[] = [];
    let p = 0;
    while (p < cd.length) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged ZIP central directory');
      const method = cd.readUInt16LE(p + 10);
      const crc = cd.readUInt32LE(p + 16);
      const compressedSize = cd.readUInt32LE(p + 20);
      const uncompressed = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localHeaderOffset = cd.readUInt32LE(p + 42);
      if (p + 46 + nameLen > cd.length) throw new Error('Damaged ZIP central directory');
      const name = cd.subarray(p + 46, p + 46 + nameLen).toString('utf8');
      entries.push({ name, method, crc, compressedSize, size: uncompressed, localHeaderOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * How many `userdata/` entries the manifest says the archive holds, or null
 * when it does not say. Archives written before `entries` existed listed every
 * store and library file they wrote in `stores` / `library.files`.
 */
export function expectedDataEntries(manifest: BackupManifest): number | null {
  if (typeof manifest.entries === 'number' && Number.isFinite(manifest.entries)) return manifest.entries;
  if (!Array.isArray(manifest.stores) || !manifest.library || typeof manifest.library.files !== 'number') return null;
  return manifest.stores.length + manifest.library.files;
}

function dataStart(zipPath: string, entry: ZipEntry): number {
  const fd = fs.openSync(zipPath, 'r');
  try {
    const h = readAt(fd, entry.localHeaderOffset, 30);
    if (h.length < 30 || h.readUInt32LE(0) !== 0x04034b50) throw new Error(`Damaged ZIP entry ${entry.name}`);
    return entry.localHeaderOffset + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  } finally {
    fs.closeSync(fd);
  }
}

const crc32 = (data: Uint8Array, prev = 0): number =>
  (zlib as unknown as { crc32: (d: Uint8Array, v?: number) => number }).crc32(data, prev);

/** Extract one entry to `target`, verifying size and CRC. */
export async function extractZipEntry(zipPath: string, entry: ZipEntry, target: string): Promise<void> {
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`Unsupported compression in ${entry.name}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const start = dataStart(zipPath, entry);
  const out = fs.createWriteStream(target);
  let crc = 0;
  let size = 0;
  try {
    if (entry.compressedSize > 0) {
      const raw = fs.createReadStream(zipPath, { start, end: start + entry.compressedSize - 1, highWaterMark: 1 << 20 });
      const source = entry.method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
      for await (const chunk of source) {
        const buf = chunk as Buffer;
        crc = crc32(buf, crc);
        size += buf.length;
        if (!out.write(buf)) await once(out, 'drain');
      }
    }
    out.end();
    await finished(out);
  } catch (err) {
    out.destroy();
    throw err;
  }
  if (size !== entry.size || (crc >>> 0) !== (entry.crc >>> 0)) {
    throw new Error(`${entry.name} is damaged (size or checksum mismatch)`);
  }
}

export async function readZipText(zipPath: string, entry: ZipEntry): Promise<string> {
  const start = dataStart(zipPath, entry);
  const chunks: Buffer[] = [];
  if (entry.compressedSize > 0) {
    const raw = fs.createReadStream(zipPath, { start, end: start + entry.compressedSize - 1 });
    const source = entry.method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
    for await (const chunk of source) chunks.push(chunk as Buffer);
  }
  const buf = Buffer.concat(chunks);
  if (buf.length !== entry.size || (crc32(buf) >>> 0) !== (entry.crc >>> 0)) {
    throw new Error(`${entry.name} is damaged (size or checksum mismatch)`);
  }
  return buf.toString('utf8');
}

// ── validation + staging ─────────────────────────────────────────────────────

/** Is `rel` (under userdata/) somewhere a restore may write? */
export function isRestorableRelPath(rel: string): boolean {
  if (!rel || rel.includes('\\') || rel.includes('\0') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return false;
  const parts = rel.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..')) return false;
  const lower = rel.toLowerCase();
  if (EXCLUDED_SECRET_FILES.has(lower)) return false;
  if (parts.length > 1 && EXCLUDED_TOP_DIRS.has(parts[0].toLowerCase())) return false;
  if (isTransientName(parts[parts.length - 1])) return false;
  if (parts[0].toLowerCase() === 'library') return true;
  return STORE_EXTENSIONS.has(path.extname(lower));
}

export function isBackupManifest(value: unknown): value is BackupManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Partial<BackupManifest>;
  return m.app === BACKUP_APP && m.kind === BACKUP_KIND && typeof m.format === 'number' && typeof m.createdAt === 'string';
}

export interface StagedRestore {
  stagingDir: string;
  /** userData-relative posix paths, staged under `<stagingDir>/userdata/`. */
  files: string[];
  manifest: BackupManifest;
  renderer: unknown | null;
}

export type StageResult = { ok: true; staged: StagedRestore } | { ok: false; errors: string[] };

/** Extract and validate everything. Nothing in userData is touched. */
export async function stageArchive(zipPath: string, stagingDir: string): Promise<StageResult> {
  const errors: string[] = [];
  let entries: ZipEntry[];
  try {
    entries = listZipEntries(zipPath);
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
  const manifestEntry = entries.find((e) => e.name === 'manifest.json');
  if (!manifestEntry) return { ok: false, errors: ['manifest.json missing — not a Gum backup'] };
  let manifest: BackupManifest;
  try {
    const parsed: unknown = JSON.parse(await readZipText(zipPath, manifestEntry));
    if (!isBackupManifest(parsed)) return { ok: false, errors: ['manifest.json is not a Gum backup manifest'] };
    if (parsed.format > BACKUP_FORMAT) {
      return { ok: false, errors: [`Backup format ${parsed.format} is newer than this app understands (${BACKUP_FORMAT})`] };
    }
    manifest = parsed;
  } catch (err) {
    return { ok: false, errors: [`manifest.json: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const dataEntries = entries.filter((e) => e.name.startsWith(USERDATA_PREFIX) && !e.name.endsWith('/')).length;
  const expected = expectedDataEntries(manifest);
  if (expected !== null && dataEntries !== expected) {
    return {
      ok: false,
      errors: [`The archive holds ${dataEntries} files but its manifest lists ${expected}; it is incomplete or damaged, so nothing was restored`],
    };
  }

  let renderer: unknown | null = null;
  const rendererEntry = entries.find((e) => e.name === 'renderer.json');
  if (rendererEntry) {
    try {
      renderer = JSON.parse(await readZipText(zipPath, rendererEntry));
      const r = renderer as { localStorage?: unknown; indexedDb?: unknown } | null;
      if (!r || typeof r !== 'object' || typeof r.localStorage !== 'object' || typeof r.indexedDb !== 'object') {
        errors.push('renderer.json: unexpected shape');
      }
    } catch (err) {
      errors.push(`renderer.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'manifest.json' || entry.name === 'renderer.json' || entry.name.endsWith('/')) continue;
    if (!entry.name.startsWith(USERDATA_PREFIX)) {
      errors.push(`${entry.name}: unexpected entry`);
      continue;
    }
    const rel = entry.name.slice(USERDATA_PREFIX.length);
    if (!isRestorableRelPath(rel)) {
      errors.push(`${rel}: not a location a restore may write`);
      continue;
    }
    const target = path.join(stagingDir, 'userdata', ...rel.split('/'));
    try {
      await extractZipEntry(zipPath, entry, target);
      if (STORE_EXTENSIONS.has(path.extname(rel).toLowerCase()) && path.extname(rel).toLowerCase() === '.json') {
        JSON.parse(fs.readFileSync(target, 'utf8'));
      }
      files.push(rel);
    } catch (err) {
      errors.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (errors.length) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return { ok: false, errors };
  }
  return { ok: true, staged: { stagingDir, files, manifest, renderer } };
}

// ── commit / rollback ────────────────────────────────────────────────────────

/** The filesystem calls `commitStaged` makes — injectable so tests can fail one. */
export interface CommitFs {
  rename(from: string, to: string): void;
  exists(p: string): boolean;
  mkdirp(dir: string): void;
  rm(p: string): void;
}

const realFs: CommitFs = {
  rename: (from, to) => fs.renameSync(from, to),
  exists: (p) => fs.existsSync(p),
  mkdirp: (dir) => fs.mkdirSync(dir, { recursive: true }),
  rm: (p) => fs.rmSync(p, { recursive: true, force: true }),
};

export type CommitResult =
  | { ok: true; previousDir: string; restored: number }
  | { ok: false; failures: Array<{ path: string; error: string }>; rollbackFailures: Array<{ path: string; error: string }> };

/**
 * Swap every staged file into userData, or none. Current files (and their
 * `.bak`, which would otherwise resurrect pre-restore data) are moved into
 * `previousDir/userdata/`, the same layout as an archive, so the folder can be
 * restored itself. `extras` are current files the archive does not contain
 * (see `currentFilesMissingFromArchive`): they are moved aside too, so the
 * result is the backup's state rather than a mix. On any failure every move is
 * undone in reverse.
 */
export function commitStaged(
  staged: StagedRestore,
  userData: string,
  previousDir: string,
  io: CommitFs = realFs,
  extras: string[] = [],
): CommitResult {
  const moved: Array<{ from: string; to: string }> = [];
  const placed: Array<{ from: string; to: string }> = [];
  const failures: Array<{ path: string; error: string }> = [];
  const moveAside = (target: string): void => {
    for (const current of [target, `${target}.bak`]) {
      if (!io.exists(current)) continue;
      const aside = path.join(previousDir, 'userdata', path.relative(userData, current));
      io.mkdirp(path.dirname(aside));
      io.rename(current, aside);
      moved.push({ from: current, to: aside });
    }
  };
  for (const rel of staged.files) {
    const segments = rel.split('/');
    const target = path.join(userData, ...segments);
    const source = path.join(staged.stagingDir, 'userdata', ...segments);
    try {
      io.mkdirp(path.dirname(target));
      moveAside(target);
      io.rename(source, target);
      placed.push({ from: source, to: target });
    } catch (err) {
      failures.push({ path: rel, error: err instanceof Error ? err.message : String(err) });
      break;
    }
  }
  if (!failures.length) {
    for (const rel of extras) {
      try {
        moveAside(path.join(userData, ...rel.split('/')));
      } catch (err) {
        failures.push({ path: rel, error: err instanceof Error ? err.message : String(err) });
        break;
      }
    }
  }
  if (!failures.length) return { ok: true, previousDir, restored: placed.length };

  const rollbackFailures: Array<{ path: string; error: string }> = [];
  for (const step of placed.reverse()) {
    try {
      io.rename(step.to, step.from);
    } catch (err) {
      rollbackFailures.push({ path: path.relative(userData, step.to), error: err instanceof Error ? err.message : String(err) });
    }
  }
  for (const step of moved.reverse()) {
    try {
      io.rename(step.to, step.from);
    } catch (err) {
      rollbackFailures.push({ path: path.relative(userData, step.from), error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { ok: false, failures, rollbackFailures };
}

/**
 * Current files a restore of `staged` would otherwise leave behind: every
 * store and library file in userData's inventory that the archive does not
 * contain. Secrets, caches and Chromium data are not in the inventory; files
 * the archive's manifest lists as excluded, and book files when the archive
 * was made without them, stay where they are.
 */
export function currentFilesMissingFromArchive(staged: StagedRestore, userData: string): string[] {
  const inv = inventoryUserData(userData);
  const inArchive = new Set(staged.files.map((rel) => rel.toLowerCase()));
  const excluded = new Set(
    (Array.isArray(staged.manifest.excluded) ? staged.manifest.excluded : [])
      .map((entry) => String(entry).replace(/ \(.*\)$/, '').toLowerCase()),
  );
  const withBooks = staged.manifest.includesBookFiles === true;
  const out: string[] = [];
  for (const source of [...inv.stores, ...inv.library]) {
    if (source.bookFile && !withBooks) continue;
    const lower = source.rel.toLowerCase();
    if (inArchive.has(lower) || excluded.has(lower) || !isRestorableRelPath(source.rel)) continue;
    out.push(source.rel);
  }
  return out;
}

function walkFiles(root: string, rel = '', out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rel ? path.join(root, ...rel.split('/')) : root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walkFiles(root, child, out);
    else if (e.isFile()) out.push(child);
  }
  return out;
}

const baseName = (rel: string): string => rel.slice(rel.lastIndexOf('/') + 1);

/**
 * Make a pre-restore folder restorable: write a manifest describing the files
 * that were moved into `previousDir/userdata/` (the `.bak` copies riding along
 * are not counted; a restore skips them).
 */
export function writePreRestoreManifest(
  previousDir: string,
  info: { appVersion: string; includesBookFiles: boolean; renderer: unknown | null },
): BackupManifest {
  const files = walkFiles(path.join(previousDir, 'userdata')).filter((rel) => !isTransientName(baseName(rel)));
  const stores: BackupManifest['stores'] = [];
  let libraryFiles = 0;
  let libraryBytes = 0;
  for (const rel of files) {
    let bytes = 0;
    try {
      bytes = fs.statSync(path.join(previousDir, 'userdata', ...rel.split('/'))).size;
    } catch {
      /* counted anyway */
    }
    if (rel.split('/')[0].toLowerCase() === 'library') {
      libraryFiles += 1;
      libraryBytes += bytes;
    } else {
      stores.push({ path: rel, bytes });
    }
  }
  const manifest: BackupManifest = {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    format: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    appVersion: info.appVersion,
    trigger: 'pre-restore',
    origin: null,
    includesBookFiles: info.includesBookFiles,
    stores,
    library: { files: libraryFiles, bytes: libraryBytes, bookFilesIncluded: info.includesBookFiles, bookFilesOmitted: 0 },
    renderer: rendererSummary(info.renderer),
    excluded: [],
    entries: files.length,
  };
  fs.writeFileSync(path.join(previousDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * `stageArchive` for an unpacked backup folder — what a restore leaves in
 * `backups/pre-restore-<ts>` (manifest.json, renderer.json, userdata/...).
 * Files are copied, so the folder stays intact until the swap succeeds.
 */
export async function stageDirectory(dir: string, stagingDir: string): Promise<StageResult> {
  let manifest: BackupManifest;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (!isBackupManifest(parsed)) return { ok: false, errors: ['manifest.json is not a Gum backup manifest'] };
    if (parsed.format > BACKUP_FORMAT) {
      return { ok: false, errors: [`Backup format ${parsed.format} is newer than this app understands (${BACKUP_FORMAT})`] };
    }
    manifest = parsed;
  } catch (err) {
    return { ok: false, errors: [`manifest.json: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const errors: string[] = [];
  let renderer: unknown | null = null;
  if (fs.existsSync(path.join(dir, 'renderer.json'))) {
    try {
      renderer = JSON.parse(fs.readFileSync(path.join(dir, 'renderer.json'), 'utf8'));
      const r = renderer as { localStorage?: unknown; indexedDb?: unknown } | null;
      if (!r || typeof r !== 'object' || typeof r.localStorage !== 'object' || typeof r.indexedDb !== 'object') {
        errors.push('renderer.json: unexpected shape');
      }
    } catch (err) {
      errors.push(`renderer.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const sourceRoot = path.join(dir, 'userdata');
  const rels = walkFiles(sourceRoot).filter((rel) => !isTransientName(baseName(rel)));
  const expected = expectedDataEntries(manifest);
  if (expected !== null && rels.length !== expected) {
    return {
      ok: false,
      errors: [`The folder holds ${rels.length} files but its manifest lists ${expected}; it is incomplete or damaged, so nothing was restored`],
    };
  }
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  const files: string[] = [];
  for (const rel of rels) {
    if (!isRestorableRelPath(rel)) {
      errors.push(`${rel}: not a location a restore may write`);
      continue;
    }
    const target = path.join(stagingDir, 'userdata', ...rel.split('/'));
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(sourceRoot, ...rel.split('/')), target);
      if (path.extname(rel).toLowerCase() === '.json') JSON.parse(fs.readFileSync(target, 'utf8'));
      files.push(rel);
    } catch (err) {
      errors.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (errors.length) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return { ok: false, errors };
  }
  return { ok: true, staged: { stagingDir, files, manifest, renderer } };
}

// ── housekeeping ─────────────────────────────────────────────────────────────

export const AUTO_PREFIX = 'auto-';

export function autoBackupName(date = new Date()): string {
  return `${AUTO_PREFIX}${date.toISOString().replace(/[:.]/g, '-')}.zip`;
}

export function listAutoBackups(dir: string): Array<{ path: string; name: string; bytes: number; mtimeMs: number }> {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.startsWith(AUTO_PREFIX) && n.endsWith('.zip'));
  } catch {
    return [];
  }
  return names
    .sort()
    .reverse()
    .map((name) => {
      const p = path.join(dir, name);
      try {
        const st = fs.statSync(p);
        return { path: p, name, bytes: st.size, mtimeMs: st.mtimeMs };
      } catch {
        return { path: p, name, bytes: 0, mtimeMs: 0 };
      }
    });
}

/** Keep the newest `keep` automatic backups. */
export function pruneAutoBackups(dir: string, keep = AUTO_BACKUP_KEEP): string[] {
  const removed: string[] = [];
  for (const old of listAutoBackups(dir).slice(keep)) {
    try {
      fs.rmSync(old.path, { force: true });
      removed.push(old.name);
    } catch {
      /* next run tries again */
    }
  }
  return removed;
}

/** At most once per day. */
export function autoBackupDue(dir: string, now = Date.now(), intervalMs = 24 * 60 * 60 * 1000): boolean {
  const newest = listAutoBackups(dir)[0];
  return !newest || now - newest.mtimeMs >= intervalMs;
}
