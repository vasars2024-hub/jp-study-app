import { app, ipcMain, dialog, shell, BrowserWindow, protocol, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';
import type { LibraryItem, Progress } from '../shared/types';
import { isGeneratedOcrEpub, type BookOcrView } from '../shared/bookOcrIpc';
import { INBOX_FOLDER } from '../shared/inboxMeta';
import { MANGA_FOLDER } from '../shared/libraryFolders';
import { extractReadableFromUrl } from './readabilityExtract';
import { fetchReadingContent, type FetchReadingOptions } from './readingFetch';
import { mt } from './i18n';
import { extractEpubTitleFromOpf } from './epubMeta';
import { observeReadingProgress } from './readingFinishWatcher';
import { broadcastReadingLists } from './readingListsIpc';
import { getReadingListsStore } from './readingListsStore';
import { readJsonDetailedSync, readJsonSync, registerJsonFlusher, writeJsonAtomicSync } from './atomicJson';
import { logDiagnostic } from './errorLog';

/** Token → absolute path for localfile:// wallpaper/image streaming. */
const localFileTokens = new Map<string, string>();

const LOCAL_IMG_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

function localFileTokenFor(absPath: string): string {
  const resolved = path.resolve(absPath);
  for (const [t, p] of localFileTokens) {
    if (p === resolved) return t;
  }
  const t = crypto.randomBytes(10).toString('hex');
  localFileTokens.set(t, resolved);
  if (localFileTokens.size > 240) {
    const first = localFileTokens.keys().next().value;
    if (first) localFileTokens.delete(first);
  }
  return t;
}

/**
 * Streaming URL for disk images (not multi‑MB base64).
 * Form: localfile://wall/<token>  — host is always "wall", token in path
 * (avoids hostname quirks with bare localfile://token).
 */
export function localFileUrl(absPath: string): string {
  return `localfile://wall/${localFileTokenFor(absPath)}`;
}

function tokenFromLocalFileRequest(requestUrl: string): string | null {
  try {
    const u = new URL(requestUrl);
    // localfile://wall/<token>  or  localfile://<token>/
    if (u.hostname === 'wall' || u.hostname === 'img') {
      const tok = u.pathname.replace(/^\/+/, '').split('/')[0];
      return tok || null;
    }
    if (u.hostname && u.hostname !== 'wall') return u.hostname;
    const pathTok = u.pathname.replace(/^\/+/, '').split('/')[0];
    return pathTok || null;
  } catch {
    return null;
  }
}

/** Register once after app ready (scheme privileged in main.ts). */
export function registerLocalFileProtocol(): void {
  protocol.handle('localfile', (request) => {
    try {
      const token = tokenFromLocalFileRequest(request.url);
      const file = token ? localFileTokens.get(token) : undefined;
      if (!file || !fs.existsSync(file)) {
        console.warn('[localfile] not found', request.url, token);
        return new Response('Not found', { status: 404 });
      }
      const ext = path.extname(file).toLowerCase();
      const type = LOCAL_IMG_MIME[ext] ?? 'application/octet-stream';
      const total = fs.statSync(file).size;
      const body = Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream;
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(total),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (err) {
      console.error('[localfile] serve failed', err);
      return new Response('Error', { status: 500 });
    }
  });
}

// Single copy in `shared/mediaKind.ts` — the drop router classifies against the
// same sets the importers accept, so the two cannot drift.
import { ARCHIVE_EXT, IMAGE_EXT, WALL_EXT } from '../shared/mediaKind';

interface Config {
  watchFolder?: string;
  /** User-created library folders (names). Assignments live on each item. */
  folders?: string[];
}

// ----- paths -------------------------------------------------------------

export function libraryRoot(): string {
  return path.join(app.getPath('userData'), 'library');
}
function dbPath(): string {
  return path.join(app.getPath('userData'), 'library.json');
}
function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}
/**
 * An item id is a single path segment the app generated (a UUID). Ids arrive
 * from the renderer (`library:remove`) and from `media://` URLs, and
 * `library:remove` deletes `itemDir(id)` recursively — so `..`, separators,
 * drive letters or an empty id must never reach `path.join` (audit robust #4).
 */
export function isSafeLibraryItemId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  if (!id || id.length > 200 || id.includes('..')) return false;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is being rejected
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(id)) return false;
  const root = path.resolve(libraryRoot());
  return path.dirname(path.resolve(root, id)) === root;
}

export function itemDir(id: string): string {
  if (!isSafeLibraryItemId(id)) throw new Error(`Invalid library item id: ${JSON.stringify(String(id).slice(0, 80))}`);
  return path.join(libraryRoot(), id);
}

export function ensureLibrary(): void {
  fs.mkdirSync(libraryRoot(), { recursive: true });
  if (!fs.existsSync(dbPath()) && !fs.existsSync(`${dbPath()}.bak`)) writeJsonAtomicSync(dbPath(), []);
}

// ----- tiny JSON "database" ---------------------------------------------

/**
 * Page-turn progress not yet on disk. Readers used to rewrite the whole of
 * library.json on every page turn (MangaReader, NovelReader); saves are now
 * coalesced and land within PROGRESS_FLUSH_MS, on quit, or with the next
 * structural write — whichever comes first. `readDb` overlays them so nothing
 * in this process ever sees a stale position.
 */
const pendingProgress = new Map<string, { progress: Progress; lastReadAt: number }>();
let progressTimer: ReturnType<typeof setTimeout> | null = null;
const PROGRESS_FLUSH_MS = 1500;

function overlayPendingProgress(items: LibraryItem[]): LibraryItem[] {
  if (!pendingProgress.size) return items;
  for (const it of items) {
    const pending = pendingProgress.get(it.id);
    if (pending) {
      it.progress = pending.progress;
      it.lastReadAt = pending.lastReadAt;
    }
  }
  return items;
}

function readDb(): LibraryItem[] {
  // A damaged library.json is moved aside and its last-good copy served —
  // never "parse failed → []" followed by the next import overwriting it.
  const result = readJsonDetailedSync<LibraryItem[]>(dbPath(), [], { validate: Array.isArray });
  if (result.source === 'backup' || result.source === 'fallback') {
    logDiagnostic(
      result.source === 'backup' ? 'warn' : 'error',
      'library',
      result.source === 'backup' ? 'library-restored-from-last-good' : 'library-unreadable',
      `${result.error ?? ''} (damaged copy kept at ${result.quarantinedTo ?? 'original path'})`,
    );
  }
  return overlayPendingProgress(result.value);
}

/** Write any coalesced progress now (timer, quit, or before a restore/backup). */
export function flushLibraryProgress(): void {
  if (progressTimer) {
    clearTimeout(progressTimer);
    progressTimer = null;
  }
  if (!pendingProgress.size) return;
  writeDb(readDb());
}
registerJsonFlusher(flushLibraryProgress);
/**
 * "An item entered the library", as one seam.
 *
 * Six importers write here through nineteen `writeDb` calls, and Reading Lists'
 * late binding (`READING_LISTS_PLAN.md` §3.1) has to see every one of them —
 * including importers that do not exist yet. Subscribing per importer would make
 * that a thing to remember; diffing the write makes it a thing that is true.
 *
 * Delivery is synchronous and the caller's failure is its own: a subscriber that
 * throws must not fail an import that already reached disk.
 */
type LibraryItemsAddedListener = (items: LibraryItem[]) => void;

const itemsAddedListeners: LibraryItemsAddedListener[] = [];
let knownItemIds: Set<string> | null = null;

export function onLibraryItemsAdded(listener: LibraryItemsAddedListener): void {
  itemsAddedListeners.push(listener);
}

/** Test seam. Production never calls this. */
export function resetLibraryItemsAddedListenersForTesting(): void {
  itemsAddedListeners.length = 0;
  knownItemIds = null;
}

function writeDb(items: LibraryItem[]): void {
  // Resolved on the first write of a session rather than at module load: the
  // userData path is only meaningful after Electron is ready.
  const known = knownItemIds ?? new Set(readDb().map((item) => item.id));
  const added = items.filter((item) => !known.has(item.id));
  writeJsonAtomicSync(dbPath(), overlayPendingProgress(items));
  pendingProgress.clear();
  if (progressTimer) {
    clearTimeout(progressTimer);
    progressTimer = null;
  }
  knownItemIds = new Set(items.map((item) => item.id));
  if (!added.length) return;
  for (const listener of itemsAddedListeners) {
    try {
      listener(added);
    } catch {
      // See above: the write is already committed.
    }
  }
}

/**
 * Reading Lists §4.3: one completion detector on the path every reader already
 * uses, rather than one per reader.
 *
 * Swallowing for the same reason `writeDb` above swallows its listeners — the
 * progress save is the user's actual data and has already been written; a
 * detector fault must not be able to turn "your place was saved" into an error.
 */
function noteReadingProgress(
  item: LibraryItem,
  previous: Progress | undefined,
  previousAt: number | undefined,
  next: Progress,
  at: number,
): void {
  try {
    observeReadingProgress(
      item.id,
      {
        kind: item.kind,
        ...(item.pageCount !== undefined ? { pageCount: item.pageCount } : {}),
        ...(previous !== undefined ? { previous } : {}),
        ...(previousAt !== undefined ? { previousAt } : {}),
        next,
        at,
      },
      { store: getReadingListsStore(), broadcast: broadcastReadingLists },
    );
  } catch {
    // See above.
  }
}

function readConfig(): Config {
  return readJsonSync<Config>(configPath(), {}, {
    validate: (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v),
  });
}
function writeConfig(cfg: Config): void {
  writeJsonAtomicSync(configPath(), cfg);
}

// ----- helpers -----------------------------------------------------------

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
function titleFromFile(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}
function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

/** Unzip every image entry of a .cbz/.zip into pagesDir, renamed in reading order. */
function extractMangaPages(archivePath: string, pagesDir: string): string[] {
  const zip = new AdmZip(archivePath);
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && IMAGE_EXT.has(path.extname(e.entryName).toLowerCase()))
    .sort((a, b) => naturalCompare(a.entryName, b.entryName));

  fs.mkdirSync(pagesDir, { recursive: true });
  const names: string[] = [];
  entries.forEach((e, i) => {
    const ext = path.extname(e.entryName).toLowerCase() || '.jpg';
    const outName = `${String(i + 1).padStart(4, '0')}${ext}`;
    fs.writeFileSync(path.join(pagesDir, outName), e.getData());
    names.push(outName);
  });
  return names;
}

/** Copy every image in a folder into pagesDir, renamed in reading order. */
function copyFolderImages(srcDir: string, pagesDir: string): string[] {
  const files = fs
    .readdirSync(srcDir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort(naturalCompare);

  fs.mkdirSync(pagesDir, { recursive: true });
  const names: string[] = [];
  files.forEach((f, i) => {
    const ext = path.extname(f).toLowerCase();
    const outName = `${String(i + 1).padStart(4, '0')}${ext}`;
    fs.copyFileSync(path.join(srcDir, f), path.join(pagesDir, outName));
    names.push(outName);
  });
  return names;
}

/** Colorfulness (RGB variance) minus a blank/near-monochrome penalty — higher is a better cover candidate. */
function scoreCoverCandidate(fullPath: string): number {
  try {
    const img = nativeImage.createFromPath(fullPath);
    if (img.isEmpty()) return -1;
    const small = img.resize({ width: 32, height: 32, quality: 'good' });
    const { width, height } = small.getSize();
    const n = width * height;
    if (!n) return -1;
    const bgra = small.toBitmap();
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let extreme = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const b = bgra[o];
      const g = bgra[o + 1];
      const r = bgra[o + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      const lum = (r + g + b) / 3;
      if (lum > 245 || lum < 12) extreme++;
    }
    const meanR = sumR / n;
    const meanG = sumG / n;
    const meanB = sumB / n;
    let variance = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const b = bgra[o];
      const g = bgra[o + 1];
      const r = bgra[o + 2];
      variance += (r - meanR) ** 2 + (g - meanG) ** 2 + (b - meanB) ** 2;
    }
    variance /= n;
    const blankPenalty = extreme / n; // 0 (no blank pixels) .. 1 (fully blank)
    return variance * (1 - blankPenalty);
  } catch {
    return -1;
  }
}

/**
 * Pick the most cover-like page among the first few extracted pages, instead
 * of blindly assuming page 1 (which is often a blank or legal-notice page in
 * scanlated/digital volumes). Only the first 8 pages are considered — cover
 * art is always near the front, and scanning the whole volume risks landing
 * on a random mid-volume splash page. Ties (page 1 scoring within 10% of the
 * best) resolve toward page 1, since it legitimately is the cover in the
 * common case and the heuristic shouldn't second-guess a clear cover.
 */
export function pickCoverPage(pagesDir: string, names: string[]): string {
  if (!names.length) return '';
  const candidateCount = Math.min(8, names.length);
  let best = names[0];
  let bestScore = scoreCoverCandidate(path.join(pagesDir, names[0]));
  const epsilon = Math.max(0, bestScore) * 0.1;
  for (let i = 1; i < candidateCount; i++) {
    const score = scoreCoverCandidate(path.join(pagesDir, names[i]));
    if (score > bestScore + epsilon) {
      bestScore = score;
      best = names[i];
    }
  }
  return best;
}

/** Locate and read an EPUB's OPF package document (title/manifest/spine metadata). */
function readEpubOpf(zip: AdmZip): { opf: string; opfDir: string } | undefined {
  try {
    const container = zip.getEntry('META-INF/container.xml');
    if (!container) return undefined;
    const opfPath = (container.getData().toString('utf-8').match(/full-path="([^"]+)"/i) ?? [])[1];
    if (!opfPath) return undefined;
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) return undefined;
    const opf = opfEntry.getData().toString('utf-8');
    const opfDir = path.posix.dirname(opfPath);
    return { opf, opfDir };
  } catch {
    return undefined;
  }
}

/** Read the book's real title from its OPF `<dc:title>`, if present. */
function extractEpubTitle(zip: AdmZip): string | undefined {
  const parsed = readEpubOpf(zip);
  return parsed ? extractEpubTitleFromOpf(parsed.opf) : undefined;
}

/** Find the cover image inside an EPUB and copy it into destDir. Returns its name. */
function extractEpubCover(zip: AdmZip, destDir: string): string | undefined {
  try {
    const parsed = readEpubOpf(zip);
    if (!parsed) return undefined;
    const { opf, opfDir } = parsed;

    const items = [...opf.matchAll(/<item\b[^>]*>/gi)].map((m) => {
      const tag = m[0];
      return {
        id: (tag.match(/\bid="([^"]+)"/i) ?? [])[1] ?? '',
        href: (tag.match(/\bhref="([^"]+)"/i) ?? [])[1] ?? '',
        props: (tag.match(/\bproperties="([^"]+)"/i) ?? [])[1] ?? '',
        type: (tag.match(/\bmedia-type="([^"]+)"/i) ?? [])[1] ?? '',
      };
    });

    let href = items.find((it) => /\bcover-image\b/.test(it.props))?.href;
    if (!href) {
      const metaId = (opf.match(/<meta[^>]*\bname="cover"[^>]*\bcontent="([^"]+)"/i) ??
        opf.match(/<meta[^>]*\bcontent="([^"]+)"[^>]*\bname="cover"/i) ??
        [])[1];
      if (metaId) href = items.find((it) => it.id === metaId)?.href;
    }
    if (!href) {
      href = items.find((it) => it.type.startsWith('image/') && /cover/i.test(it.id + ' ' + it.href))?.href;
    }
    if (!href) href = items.find((it) => it.type.startsWith('image/'))?.href;
    if (!href) return undefined;

    const zipPath = opfDir && opfDir !== '.' ? path.posix.join(opfDir, href) : href;
    const entry = zip.getEntry(zipPath) ?? zip.getEntry(decodeURIComponent(zipPath));
    if (!entry) return undefined;

    const ext = path.extname(href).toLowerCase() || '.jpg';
    const outName = `cover${ext}`;
    fs.writeFileSync(path.join(destDir, outName), entry.getData());
    return outName;
  } catch {
    return undefined;
  }
}

// ----- importers ---------------------------------------------------------

function importBook(filePath: string): LibraryItem {
  const id = crypto.randomUUID();
  const dir = itemDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(filePath, path.join(dir, 'original.epub'));
  let coverPath: string | undefined;
  let embeddedTitle: string | undefined;
  try {
    const zip = new AdmZip(path.join(dir, 'original.epub'));
    coverPath = extractEpubCover(zip, dir);
    embeddedTitle = extractEpubTitle(zip);
  } catch {
    /* ignore — falls back to a title gradient / the filename */
  }
  return {
    id,
    title: embeddedTitle || titleFromFile(filePath),
    kind: 'book',
    createdAt: Date.now(),
    sourcePath: filePath,
    epubFile: 'original.epub',
    coverPath,
  };
}

export function importEpubBufferToLibrary(input: {
  title: string;
  sourcePath?: string;
  buffer: Buffer;
}): LibraryItem {
  ensureLibrary();
  const items = readDb();
  if (input.sourcePath) {
    const existing = items.find((item) => item.sourcePath === input.sourcePath);
    if (existing) return existing;
  }

  const id = crypto.randomUUID();
  const dir = itemDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const epubPath = path.join(dir, 'original.epub');
  fs.writeFileSync(epubPath, input.buffer);
  let coverPath: string | undefined;
  let embeddedTitle: string | undefined;
  try {
    const zip = new AdmZip(epubPath);
    coverPath = extractEpubCover(zip, dir);
    embeddedTitle = extractEpubTitle(zip);
  } catch {
    /* ignore — falls back to a title gradient / the caller-provided title */
  }
  const item: LibraryItem = {
    id,
    title: input.title.trim() || embeddedTitle || 'Imported EPUB',
    kind: 'book',
    createdAt: Date.now(),
    sourcePath: input.sourcePath,
    epubFile: 'original.epub',
    coverPath,
  };
  items.unshift(item);
  writeDb(items);
  broadcastLibrary(items);
  return item;
}

// PDFs are stored as-is and opened by the reader's PDF loader (which extracts
// the text on the fly), so they behave like any other book — no separate
// conversion step or file.
function importPdf(filePath: string): LibraryItem {
  const id = crypto.randomUUID();
  const dir = itemDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(filePath, path.join(dir, 'original.pdf'));
  return {
    id,
    title: titleFromFile(filePath),
    kind: 'book',
    createdAt: Date.now(),
    sourcePath: filePath,
    epubFile: 'original.pdf',
  };
}

function importMangaArchive(filePath: string): LibraryItem {
  const id = crypto.randomUUID();
  const pagesDir = path.join(itemDir(id), 'pages');
  fs.mkdirSync(itemDir(id), { recursive: true });
  const names = extractMangaPages(filePath, pagesDir);
  const cover = names.length ? pickCoverPage(pagesDir, names) : '';
  return {
    id,
    title: titleFromFile(filePath),
    kind: 'manga',
    createdAt: Date.now(),
    sourcePath: filePath,
    pageCount: names.length,
    coverPath: cover ? `pages/${cover}` : undefined,
  };
}

function getMangaPages(id: string): string[] {
  const pagesDir = path.join(itemDir(id), 'pages');
  if (!fs.existsSync(pagesDir)) return [];
  return fs
    .readdirSync(pagesDir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort(naturalCompare)
    .map((f) => `media://${id}/pages/${f}`);
}

/** Exported for volume OCR jobs. */
export function listMangaPageUrls(id: string): string[] {
  return getMangaPages(id);
}

/** Read a book's epub bytes for the renderer (avoids cross-origin fetch on media://). */
function readBook(id: string): ArrayBuffer | null {
  const it = readDb().find((x) => x.id === id);
  const file = it?.epubFile ?? 'original.epub';
  const full = path.join(itemDir(id), file);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function stripHtmlToText(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\b[^>]*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve an EPUB zip entry with slash/case/encoding tolerance. */
function findEpubZipEntry(zip: AdmZip, zipPath: string): ReturnType<AdmZip['getEntry']> {
  const norm = zipPath.replace(/\\/g, '/').replace(/^\//, '');
  const direct =
    zip.getEntry(norm) ??
    zip.getEntry(decodeURIComponent(norm)) ??
    zip.getEntry(norm.replace(/^\.\//, ''));
  if (direct) return direct;
  const lower = norm.toLowerCase();
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (name === norm || name.toLowerCase() === lower) return entry;
    try {
      if (decodeURIComponent(name) === norm || decodeURIComponent(name).toLowerCase() === lower) {
        return entry;
      }
    } catch {
      /* ignore bad % sequences */
    }
  }
  return null;
}

/**
 * Lightweight plain-text sample from an EPUB for JLPT/HSK cover badges.
 * Stops once `maxChars` is reached so large books stay off the UI thread.
 */
function sampleBookText(id: string, maxChars = 40_000): string | null {
  const it = readDb().find((x) => x.id === id);
  if (!it || it.kind !== 'book') return null;
  const file = it.epubFile ?? 'original.epub';
  if (file.toLowerCase().endsWith('.pdf')) return null;
  const full = path.join(itemDir(id), file);
  if (!fs.existsSync(full)) return null;

  try {
    const zip = new AdmZip(full);
    const parsed = readEpubOpf(zip);
    const parts: string[] = [];
    let total = 0;

    const pushText = (html: string): boolean => {
      const text = stripHtmlToText(html);
      if (!text) return false;
      const room = maxChars - total;
      if (room <= 0) return true;
      const slice = text.length > room ? text.slice(0, room) : text;
      parts.push(slice);
      total += slice.length;
      return total >= maxChars;
    };

    if (parsed) {
      const { opf, opfDir } = parsed;
      const manifest = new Map<string, string>();
      for (const match of opf.matchAll(/<item\b[^>]*>/gi)) {
        const tag = match[0];
        const itemId = (tag.match(/\bid="([^"]+)"/i) ?? [])[1];
        const href = (tag.match(/\bhref="([^"]+)"/i) ?? [])[1];
        if (itemId && href) manifest.set(itemId, href);
      }
      const spineIds = [...opf.matchAll(/<itemref\b[^>]*>/gi)]
        .map((m) => (m[0].match(/\bidref="([^"]+)"/i) ?? [])[1])
        .filter((x): x is string => Boolean(x));

      for (const spineId of spineIds) {
        const href = manifest.get(spineId);
        if (!href) continue;
        const cleaned = href.replace(/\\/g, '/').replace(/^\//, '');
        const zipPath =
          cleaned.includes('/') || !opfDir || opfDir === '.'
            ? cleaned
            : path.posix.join(opfDir, cleaned);
        const entry = findEpubZipEntry(zip, zipPath);
        if (!entry) continue;
        if (pushText(entry.getData().toString('utf-8'))) break;
      }
    }

    if (total < maxChars) {
      for (const entry of zip.getEntries()) {
        if (total >= maxChars) break;
        const name = entry.entryName.replace(/\\/g, '/').toLowerCase();
        if (!/\.(xhtml|html|htm)$/.test(name)) continue;
        if (/(^|\/)nav\.xhtml$/.test(name) || name.includes('toc')) continue;
        if (pushText(entry.getData().toString('utf-8'))) break;
      }
    }

    const out = parts.join('\n').trim();
    return out || null;
  } catch {
    return null;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/**
 * Read a single manga page (given its media:// URL) as a base64 data URL.
 * The OCR engine in the renderer feeds on this directly, avoiding any
 * cross-origin / custom-protocol fetch from inside a Web Worker.
 */
function readMangaPage(mediaUrl: string): string | null {
  const m = /^media:\/\/([^/]+)\/(.+)$/.exec(mediaUrl);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  const rel = decodeURIComponent(m[2]);
  if (rel.includes('..')) return null; // no path traversal
  const full = path.join(itemDir(id), rel);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  const mime = MIME_BY_EXT[path.extname(full).toLowerCase()] ?? 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ----- auto-import (watch) folder ----------------------------------------

/** Recursively list importable archive/book files under a folder. */
function listImportable(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (depth < 5) walk(full, depth + 1);
      } else {
        const ext = path.extname(e.name).toLowerCase();
        if (ext === '.epub' || ext === '.pdf' || ARCHIVE_EXT.has(ext)) out.push(full);
      }
    }
  };
  walk(dir, 0);
  return out.sort(naturalCompare);
}

/** Import any new files from the watch folder. Returns the updated library. */
function syncWatchFolder(): LibraryItem[] {
  const cfg = readConfig();
  const items = readDb();
  if (!cfg.watchFolder || !fs.existsSync(cfg.watchFolder)) return items;

  const known = new Set(items.map((i) => i.sourcePath).filter(Boolean) as string[]);
  let changed = false;
  for (const fp of listImportable(cfg.watchFolder)) {
    if (known.has(fp)) continue;
    const ext = path.extname(fp).toLowerCase();
    try {
      if (ext === '.epub') items.unshift(importBook(fp));
      else if (ext === '.pdf') items.unshift(importPdf(fp));
      else items.unshift(importMangaArchive(fp));
      known.add(fp);
      changed = true;
    } catch (err) {
      console.error('Auto-import failed for', fp, err);
    }
  }
  if (changed) writeDb(items);
  return items;
}

let watcher: fs.FSWatcher | undefined;
let watchTimer: NodeJS.Timeout | undefined;

function broadcastLibrary(items: LibraryItem[]): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('library:changed', items);
}

export interface MangaPageBuffer {
  bytes: Buffer;
  contentType: string;
}

export interface ProviderMangaChapterImport {
  title: string;
  pages: MangaPageBuffer[];
  source: NonNullable<LibraryItem['readingSource']>;
}

export interface ProviderMangaChapterImportResult {
  item: LibraryItem;
  alreadyPresent: boolean;
}

function imageExtensionForContentType(contentType: string): string {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase();
  switch (normalized) {
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/bmp': return '.bmp';
    case 'image/avif': return '.avif';
    case 'image/jpeg':
    case 'image/jpg':
    default:
      return '.jpg';
  }
}

/**
 * Commits a fully fetched provider chapter as one normal local manga item.
 *
 * The caller downloads every page before entering this function. Files are
 * first written under a private staging directory and renamed only after all
 * writes succeed, so a failed download never leaves a half-readable library
 * item behind. Repeating the same provider/media/chapter request is idempotent.
 */
export function importProviderMangaChapter(
  input: ProviderMangaChapterImport,
): ProviderMangaChapterImportResult {
  const items = readDb();
  const existing = items.find((item) =>
    item.readingSource?.kind === 'seanime-manga-chapter'
    && item.readingSource.mediaId === input.source.mediaId
    && item.readingSource.providerId === input.source.providerId
    && item.readingSource.chapterId === input.source.chapterId);
  if (existing) return { item: existing, alreadyPresent: true };
  if (!input.pages.length) throw new Error('The provider chapter has no pages.');

  ensureMangaFolder();
  ensureLibrary();
  const id = crypto.randomUUID();
  const staging = path.join(libraryRoot(), `.provider-chapter-${id}.pending`);
  const finalDir = itemDir(id);
  const pagesDir = path.join(staging, 'pages');

  try {
    fs.mkdirSync(pagesDir, { recursive: true });
    const names = input.pages.map((page, index) => {
      if (!Buffer.isBuffer(page.bytes) || page.bytes.byteLength === 0) {
        throw new Error(`Provider page ${index + 1} is empty.`);
      }
      const name = `${String(index + 1).padStart(4, '0')}${imageExtensionForContentType(page.contentType)}`;
      fs.writeFileSync(path.join(pagesDir, name), page.bytes);
      return name;
    });

    const coverName = pickCoverPage(pagesDir, names) || names[0];
    let coverPath = `pages/${coverName}`;
    if (coverName) {
      const coverFile = `cover${path.extname(coverName) || '.jpg'}`;
      fs.copyFileSync(path.join(pagesDir, coverName), path.join(staging, coverFile));
      coverPath = coverFile;
    }

    fs.renameSync(staging, finalDir);
    const item: LibraryItem = {
      id,
      title: input.title.trim().slice(0, 160) || 'Downloaded manga chapter',
      kind: 'manga',
      createdAt: Date.now(),
      pageCount: names.length,
      coverPath,
      folder: MANGA_FOLDER,
      readingSource: { ...input.source },
    };
    items.unshift(item);
    writeDb(items);
    broadcastLibrary(items);
    return { item, alreadyPresent: false };
  } catch (error) {
    try {
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
      if (fs.existsSync(finalDir) && !items.some((item) => item.id === id)) {
        fs.rmSync(finalDir, { recursive: true, force: true });
      }
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}

function ensureInboxFolder(): void {
  const cfg = readConfig();
  const folders = cfg.folders ?? [];
  if (!folders.includes(INBOX_FOLDER)) {
    cfg.folders = [...folders, INBOX_FOLDER];
    writeConfig(cfg);
  }
}

function ensureMangaFolder(): void {
  const cfg = readConfig();
  const folders = cfg.folders ?? [];
  if (!folders.includes(MANGA_FOLDER)) {
    cfg.folders = [...folders, MANGA_FOLDER];
    writeConfig(cfg);
  }
}

const escXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildEpub(title: string, bodyHtml: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.addFile(
    'META-INF/container.xml',
    Buffer.from(
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
        '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
  );
  zip.addFile(
    'OEBPS/content.opf',
    Buffer.from(
      '<?xml version="1.0" encoding="utf-8"?>' +
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        `<dc:identifier id="uid">urn:uuid:${crypto.randomUUID()}</dc:identifier>` +
        `<dc:title>${escXml(title)}</dc:title><dc:language>ja</dc:language>` +
        '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>' +
        '</metadata>' +
        '<manifest><item id="ch" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>' +
        '<spine><itemref idref="ch"/></spine></package>',
    ),
  );
  zip.addFile(
    'OEBPS/chapter.xhtml',
    Buffer.from(
      '<?xml version="1.0" encoding="utf-8"?>' +
        `<html xmlns="http://www.w3.org/1999/xhtml" lang="ja"><head><title>${escXml(title)}</title></head>` +
        `<body><h1>${escXml(title)}</h1>${bodyHtml}</body></html>`,
    ),
  );
  return zip.toBuffer();
}

export interface ImportGeneratedResult {
  items: LibraryItem[];
  item: LibraryItem | null;
  duplicate: boolean;
}

/**
 * Import HTML as a minimal EPUB. Used by Immersion export and the extension Inbox.
 * Dedupes by source URL and/or content hash when inboxMeta is provided.
 */
export function importGeneratedArticle(payload: {
  title?: string;
  html?: string;
  source?: string;
  folder?: string;
  inboxMeta?: LibraryItem['inboxMeta'];
}): ImportGeneratedResult {
  const title = String(payload?.title ?? '').trim().slice(0, 120) || 'Imported text';
  const html = String(payload?.html ?? '');
  const items = readDb();
  if (!html.trim()) return { items, item: null, duplicate: false };

  const hash = payload.inboxMeta?.contentHash;
  const source = payload.source;
  const existing = items.find((i) => {
    if (source && i.sourcePath === source) return true;
    if (hash && i.inboxMeta?.contentHash === hash) return true;
    if (source && hash && i.inboxMeta?.sourceUrl === source && i.inboxMeta?.contentHash === hash) {
      return true;
    }
    return false;
  });
  if (existing) return { items, item: existing, duplicate: true };

  if (payload.folder === INBOX_FOLDER || payload.inboxMeta) ensureInboxFolder();

  const id = crypto.randomUUID();
  const dir = itemDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'original.epub'), buildEpub(title, html));
  const item: LibraryItem = {
    id,
    title,
    kind: 'book',
    createdAt: Date.now(),
    sourcePath: source,
    epubFile: 'original.epub',
  };
  if (payload.folder) item.folder = payload.folder;
  if (payload.inboxMeta) item.inboxMeta = payload.inboxMeta;
  items.unshift(item);
  writeDb(items);
  broadcastLibrary(items);
  return { items, item, duplicate: false };
}

const MANGA_URL_IMPORT_MAX_IMAGES = 500;
const MANGA_URL_IMPORT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MANGA_URL_IMPORT_MAX_TOTAL_BYTES = 400 * 1024 * 1024;
const MANGA_URL_IMPORT_CONCURRENCY = 6;

/** Reject URLs pointing at loopback/private-network hosts — these come from a web page the extension observed, not a trusted local source. */
function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function extFromImageContentType(ct: string): string {
  if (/jpeg|jpg/i.test(ct)) return '.jpg';
  if (/png/i.test(ct)) return '.png';
  if (/webp/i.test(ct)) return '.webp';
  if (/gif/i.test(ct)) return '.gif';
  if (/bmp/i.test(ct)) return '.bmp';
  if (/avif/i.test(ct)) return '.avif';
  return '.jpg';
}

function extFromImageUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const m = pathname.match(/\.(jpe?g|png|webp|gif|bmp|avif)(?:$|\?)/i);
    if (!m) return '';
    const ext = m[1].toLowerCase();
    if (ext === 'jpeg') return '.jpg';
    return `.${ext}`;
  } catch {
    return '';
  }
}

function isAcceptableImageContentType(ct: string): boolean {
  if (!ct) return true; // many CDNs omit CT
  if (/^image\//i.test(ct)) return true;
  // Signed CDN blobs often arrive as octet-stream / binary
  if (/^application\/octet-stream/i.test(ct)) return true;
  if (/^binary\//i.test(ct)) return true;
  return false;
}

/**
 * Import a manga chapter from a list of already-collected panel image URLs
 * (the browser extension's long-strip scan — see extensionServer.ts's
 * /v1/manga-import route). Each image is fetched in the main process
 * (bounded concurrency, size caps, SSRF guard), written into a fresh
 * library item's pages/ dir in the order given, and a cover is picked with
 * the same heuristic as CBZ/folder imports. Tolerates partial failure —
 * only hard-fails if every image fails to download.
 */
export async function importMangaFromImageUrls(payload: {
  title?: string;
  url: string;
  images: string[];
}): Promise<{ ok: boolean; id?: string; pageCount?: number; failed?: number; error?: string; coverPath?: string }> {
  const sourceUrl = String(payload.url ?? '').trim();
  const images = Array.isArray(payload.images) ? payload.images.slice(0, MANGA_URL_IMPORT_MAX_IMAGES) : [];
  if (!images.length) return { ok: false, error: 'No images provided.' };

  let referer = '';
  try {
    referer = new URL(sourceUrl).origin;
  } catch {
    /* no referer available */
  }

  const results: Array<{ buf: Buffer; ext: string } | null> = new Array(images.length).fill(null);
  let totalBytes = 0;
  let cursor = 0;
  let capReached = false;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= images.length || capReached) return;
      const raw = String(images[i] ?? '');

      // data: URLs come from blob: panel conversion in the extension scan.
      if (raw.startsWith('data:image/')) {
        try {
          const m = /^data:(image\/[a-z0-9.+-]+)(;base64)?,(.*)$/i.exec(raw);
          if (!m) continue;
          const ct = m[1];
          const buf = Buffer.from(m[3], m[2] ? 'base64' : 'utf8');
          if (buf.byteLength < 64 || buf.byteLength > MANGA_URL_IMPORT_MAX_IMAGE_BYTES) continue;
          if (totalBytes + buf.byteLength > MANGA_URL_IMPORT_MAX_TOTAL_BYTES) {
            capReached = true;
            continue;
          }
          totalBytes += buf.byteLength;
          results[i] = { buf, ext: extFromImageContentType(ct) };
        } catch {
          /* skip */
        }
        continue;
      }

      let target: URL;
      try {
        target = new URL(raw);
      } catch {
        continue;
      }
      if (target.protocol !== 'http:' && target.protocol !== 'https:') continue;
      if (isPrivateOrLoopbackHost(target.hostname)) continue;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 20000);
        const res = await fetch(target.toString(), {
          signal: ctl.signal,
          redirect: 'follow',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            ...(referer ? { Referer: referer } : {}),
          },
        });
        clearTimeout(t);
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') ?? '';
        if (!isAcceptableImageContentType(ct)) continue;
        const ab = await res.arrayBuffer();
        if (ab.byteLength === 0 || ab.byteLength > MANGA_URL_IMPORT_MAX_IMAGE_BYTES) continue;
        // Reject tiny non-image payloads that slipped past CT checks.
        if (ab.byteLength < 64) continue;
        if (totalBytes + ab.byteLength > MANGA_URL_IMPORT_MAX_TOTAL_BYTES) {
          capReached = true;
          continue;
        }
        totalBytes += ab.byteLength;
        const ext = extFromImageUrl(target.toString()) || extFromImageContentType(ct);
        results[i] = { buf: Buffer.from(ab), ext };
      } catch {
        /* skip this image, keep going */
      }
    }
  }

  await Promise.all(Array.from({ length: MANGA_URL_IMPORT_CONCURRENCY }, () => worker()));

  const ok = results.filter((r): r is { buf: Buffer; ext: string } => r != null);
  if (!ok.length) return { ok: false, error: 'All images failed to download.' };

  ensureMangaFolder();

  // Re-capturing the SAME url is the same chapter, so it updates the item it
  // already made instead of minting another one. Without this every capture of a
  // url added a whole new row: the user's library carried three copies of one
  // Cubari chapter (2026-07-17, ids 25e40727/7138778b/f303fe4c, identical
  // `sourcePath`), Continue reading listed the same chapter twice with 47% and
  // 29%, and its pages were downloaded and OCR'd three times over.
  // `importEpubBufferToLibrary` has always keyed on `sourcePath` this way (:443);
  // this path was the one that did not.
  const dbBefore = readDb();
  const existing = sourceUrl
    ? dbBefore.find((entry) => entry.kind === 'manga' && entry.sourcePath === sourceUrl)
    : undefined;

  const id = existing?.id ?? crypto.randomUUID();
  const dir = itemDir(id);
  const pagesDir = path.join(dir, 'pages');
  fs.mkdirSync(pagesDir, { recursive: true });
  const names: string[] = [];
  ok.forEach((r, seq) => {
    const outName = `${String(seq + 1).padStart(4, '0')}${r.ext}`;
    fs.writeFileSync(path.join(pagesDir, outName), r.buf);
    names.push(outName);
  });

  if (existing) {
    // The new pages are written BEFORE the old ones are swept, so a re-import can
    // never leave the item page-less. Only files this capture did not overwrite
    // go — a shorter chapter would otherwise keep the previous run's tail.
    try {
      for (const stale of fs.readdirSync(pagesDir)) {
        if (!names.includes(stale)) fs.rmSync(path.join(pagesDir, stale), { force: true });
      }
    } catch {
      /* a page that cannot be swept is stale, not fatal — pageCount governs reads */
    }
  }

  const coverName = pickCoverPage(pagesDir, names) || names[0];
  let coverPath: string | undefined;
  if (coverName) {
    // Dedicated cover file so Library thumbs stay stable even if page order changes.
    const coverExt = path.extname(coverName) || '.jpg';
    const coverFile = `cover${coverExt}`;
    try {
      fs.copyFileSync(path.join(pagesDir, coverName), path.join(dir, coverFile));
      coverPath = coverFile;
    } catch {
      coverPath = `pages/${coverName}`;
    }
  }

  const title =
    String(payload.title ?? '').trim().slice(0, 120) || titleFromFile(sourceUrl || 'Imported manga');
  const items = readDb();
  const prior = existing ? items.find((entry) => entry.id === id) : undefined;

  if (prior) {
    // Read BEFORE the assignment below overwrites it; the OCR check needs the old
    // count and must not depend on `existing` happening to be a different parse.
    const previousPageCount = prior.pageCount;
    // Everything the re-capture actually re-measured is replaced; everything that
    // is the USER's — where they filed it, how far they read, when — is kept.
    prior.title = title;
    prior.pageCount = names.length;
    prior.coverPath = coverPath;
    if (prior.progress) {
      // A shorter re-capture must not strand the bookmark past the last page.
      // The percent is recomputed on the same formula the reader writes with,
      // `idx / (pages.length - 1)` (MangaReader.tsx:973), so the two agree.
      const page = Math.min(Math.max(0, prior.progress.page ?? 0), Math.max(0, names.length - 1));
      prior.progress = {
        ...prior.progress,
        page,
        percent: names.length > 1 ? page / (names.length - 1) : 1,
      };
    }
    // The OCR was measured against the pages that were here before. If the page
    // count moved, those boxes no longer map and keeping them would draw someone
    // else's text over this capture; an unchanged count keeps the work.
    if (prior.ocrMeta && previousPageCount !== names.length) {
      prior.ocrMeta = undefined;
    }
  } else {
    const item: LibraryItem = {
      id,
      title,
      kind: 'manga',
      createdAt: Date.now(),
      sourcePath: sourceUrl || undefined,
      pageCount: names.length,
      coverPath,
      folder: MANGA_FOLDER,
    };
    items.unshift(item);
  }
  writeDb(items);
  broadcastLibrary(items);

  return {
    ok: true,
    id,
    pageCount: names.length,
    failed: images.length - ok.length,
    coverPath,
  };
}

/** One item by id, or undefined. */
export function getLibraryItem(id: string): LibraryItem | undefined {
  return readDb().find((x) => x.id === id);
}

/**
 * Every item, for a main-process caller that needs the whole shelf.
 *
 * Exported so this file stays the only module that knows where `library.json`
 * is: Reading Lists' reminder scheduler needs `progress` and `lastReadAt` across
 * the library, and a second reader of that path is a duplicate-storage defect
 * waiting for the two to disagree.
 */
export function listLibraryItems(): LibraryItem[] {
  return readDb();
}

/** Absolute paths of an item's page images, in reading order. */
export function listItemPagePaths(id: string): string[] {
  const pagesDir = path.join(itemDir(id), 'pages');
  if (!fs.existsSync(pagesDir)) return [];
  return fs
    .readdirSync(pagesDir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort(naturalCompare)
    .map((f) => path.join(pagesDir, f));
}

/**
 * Attach a generated EPUB to an existing item and file it as a readable book.
 *
 * Used by the book-OCR job, which turns a page-image item (an imported archive
 * or a rasterized PDF) into something the reader can paginate and mine. The page
 * images stay on disk so the original is never lost.
 */
export function attachGeneratedEpub(
  id: string,
  epub: Buffer,
  opts: { fileName?: string; title?: string } = {},
): LibraryItem | undefined {
  const items = readDb();
  const it = items.find((x) => x.id === id);
  if (!it) return undefined;
  const fileName = opts.fileName ?? 'ocr.epub';
  fs.writeFileSync(path.join(itemDir(id), fileName), epub);
  // Remember how the item was shelved before the FIRST conversion, so the
  // original stays reachable. A re-run keeps the record it already has — the
  // item's current kind may by then be the converted one.
  if (!it.ocrOriginal) {
    it.ocrOriginal = { kind: it.kind, ...(it.epubFile ? { epubFile: it.epubFile } : null) };
  }
  // Read before `ocrEpubFile` moves: a bilingual re-run writes a new file name,
  // and the view the reader is on must be judged against the old one.
  const from = currentOcrView(it);
  it.ocrEpubFile = fileName;
  applyOcrView(it, 'text', from);
  // Record that page images are still on disk. Without this the item looks like
  // an ordinary EPUB once converted, and the UI would stop offering a re-run —
  // which is the only way to add a bilingual build after a first pass.
  const pages = listItemPagePaths(id).length;
  if (pages > 0) it.pageCount = pages;
  if (opts.title) it.title = opts.title;
  writeDb(items);
  broadcastLibrary(items);
  return it;
}

/**
 * Point an OCR-converted item at one of its two shelves. Nothing is written or
 * deleted on disk: the page images, the original PDF and the generated EPUB
 * all stay, and this only decides which one the reader opens.
 */
function currentOcrView(it: LibraryItem): BookOcrView {
  return it.kind === 'book' && !!it.ocrEpubFile && it.epubFile === it.ocrEpubFile ? 'text' : 'original';
}

function applyOcrView(it: LibraryItem, view: BookOcrView, current = currentOcrView(it)): void {
  if (current !== view) {
    // Park the position under the view being left and restore the other's, so
    // neither reader is handed a locator in the other format.
    const kept = { ...(it.ocrViewProgress ?? {}) };
    if (it.progress) kept[current] = it.progress;
    else delete kept[current];
    const restored = kept[view];
    it.ocrViewProgress = kept;
    if (restored) it.progress = restored;
    else delete it.progress;
  }
  if (view === 'text') {
    it.kind = 'book';
    it.epubFile = it.ocrEpubFile;
    return;
  }
  const original = it.ocrOriginal;
  if (!original) return;
  it.kind = original.kind;
  if (original.epubFile) it.epubFile = original.epubFile;
  else delete it.epubFile;
}

/**
 * Switch a converted item between its original pages and its OCR text. Refuses
 * (returns undefined) for an item that was never converted, or whose generated
 * EPUB is no longer on disk.
 */
export function setLibraryOcrView(id: string, view: BookOcrView): LibraryItem | undefined {
  const items = readDb();
  const it = items.find((x) => x.id === id);
  if (!it) return undefined;
  if (view !== 'original' && view !== 'text') return undefined;
  // Converted before conversion was reversible: the original was never
  // recorded, but it is recoverable — a PDF import keeps `original.pdf`, and
  // anything else came in as page images.
  if (!it.ocrOriginal && isGeneratedOcrEpub(it.epubFile)) {
    const pdf = fs.existsSync(path.join(itemDir(id), 'original.pdf'));
    it.ocrOriginal = pdf ? { kind: 'book', epubFile: 'original.pdf' } : { kind: 'manga' };
    it.ocrEpubFile = it.epubFile;
  }
  if (!it.ocrOriginal || !it.ocrEpubFile) return undefined;
  if (view === 'text' && !fs.existsSync(path.join(itemDir(id), it.ocrEpubFile))) return undefined;
  applyOcrView(it, view);
  writeDb(items);
  broadcastLibrary(items);
  return it;
}

export function updateLibraryInboxMeta(
  id: string,
  patch: Partial<NonNullable<LibraryItem['inboxMeta']>>,
): LibraryItem[] {
  const items = readDb();
  const it = items.find((x) => x.id === id);
  if (it?.inboxMeta) {
    it.inboxMeta = { ...it.inboxMeta, ...patch };
    writeDb(items);
    broadcastLibrary(items);
  }
  return items;
}

/** Persist known-ratio L-level for file-imported books (no inboxMeta). */
export function updateLibraryLevelMeta(
  id: string,
  patch: NonNullable<LibraryItem['levelMeta']>,
  opts?: { broadcast?: boolean },
): LibraryItem[] {
  const items = readDb();
  const it = items.find((x) => x.id === id);
  if (!it || it.kind !== 'book') return items;
  it.levelMeta = {
    lang: patch.lang,
    knownRatio: typeof patch.knownRatio === 'number' ? patch.knownRatio : 0,
    levelEstimate: patch.levelEstimate ?? null,
  };
  writeDb(items);
  if (opts?.broadcast !== false) broadcastLibrary(items);
  return items;
}

/** Persist manga OCR/translate volume status for library cover badges. */
export function updateLibraryOcrMeta(
  id: string,
  patch: NonNullable<LibraryItem['ocrMeta']>,
  opts?: { broadcast?: boolean },
): LibraryItem[] {
  const items = readDb();
  const it = items.find((x) => x.id === id);
  if (!it || it.kind !== 'manga') return items;
  const next: NonNullable<LibraryItem['ocrMeta']> = {
    ocrPages: Math.max(0, Math.floor(patch.ocrPages)),
    translatedPages: Math.max(0, Math.floor(patch.translatedPages)),
    updatedAt: typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.now(),
  };
  if (typeof patch.targetLang === 'string' && patch.targetLang) next.targetLang = patch.targetLang;
  if (typeof patch.completedAt === 'number') next.completedAt = patch.completedAt;
  it.ocrMeta = next;
  writeDb(items);
  if (opts?.broadcast !== false) broadcastLibrary(items);
  return items;
}

function startWatching(): void {
  stopWatching();
  const cfg = readConfig();
  if (!cfg.watchFolder || !fs.existsSync(cfg.watchFolder)) return;
  try {
    watcher = fs.watch(cfg.watchFolder, { recursive: true }, () => {
      clearTimeout(watchTimer);
      // Debounce: large files are still being written when the event first fires.
      watchTimer = setTimeout(() => {
        const before = readDb().length;
        const items = syncWatchFolder();
        if (items.length !== before) broadcastLibrary(items);
      }, 1000);
    });
  } catch (err) {
    console.error('Could not watch folder', err);
  }
}

function stopWatching(): void {
  watcher?.close();
  watcher = undefined;
}

// ----- IPC registration --------------------------------------------------

export function registerLibraryIpc(): void {
  ensureLibrary();

  ipcMain.handle('library:list', () => readDb());

  ipcMain.handle('library:importFiles', async () => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: mt('dialog.importBooks.title'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: mt('dialog.filter.booksManga'), extensions: ['epub', 'pdf', 'cbz', 'zip'] },
        { name: mt('dialog.filter.books'), extensions: ['epub', 'pdf'] },
        { name: mt('dialog.filter.mangaArchive'), extensions: ['cbz', 'zip'] },
      ],
    });
    if (res.canceled) return readDb();

    const items = readDb();
    for (const fp of res.filePaths) {
      const ext = path.extname(fp).toLowerCase();
      try {
        if (ext === '.epub') items.unshift(importBook(fp));
        else if (ext === '.pdf') items.unshift(importPdf(fp));
        else if (ext === '.cbz' || ext === '.zip') items.unshift(importMangaArchive(fp));
      } catch (err) {
        console.error('Failed to import', fp, err);
      }
    }
    writeDb(items);
    return items;
  });

  /**
   * Import an archive the caller already knows the path of.
   *
   * `library:importFiles` can only ever import what a human picked out of a
   * file dialog, which is the wrong shape for anything that *finished on its
   * own* — a completed download knows exactly where it landed and has nobody to
   * ask. Same import, no dialog, and it answers with the item so the caller can
   * open the reader on it rather than making the user go hunting.
   *
   * Refuses anything outside the archive types the picker itself offers, and
   * anything that is not a real file, so a bad path fails here rather than
   * halfway through unzipping.
   */
  ipcMain.handle('library:importArchivePath', async (_event, rawPath: unknown) => {
    const filePath = String(rawPath ?? '').trim();
    if (!filePath) return { ok: false, error: 'No path given.' };
    const ext = path.extname(filePath).toLowerCase();
    if (!ARCHIVE_EXT.has(ext)) {
      return { ok: false, error: `${ext || 'That file'} is not a manga archive.` };
    }
    try {
      if (!fs.statSync(filePath).isFile()) return { ok: false, error: 'Not a file.' };
    } catch {
      return { ok: false, error: 'That file no longer exists.' };
    }

    const items = readDb();
    // Re-importing the same archive would duplicate the shelf entry and the
    // extracted pages; handing back what is already there is what the caller
    // actually wants, which is something to open.
    const existing = items.find((item) => item.sourcePath === filePath);
    if (existing) return { ok: true, item: existing, alreadyPresent: true };

    try {
      const item = importMangaArchive(filePath);
      if (!item.pageCount) return { ok: false, error: 'That archive holds no images.' };
      items.unshift(item);
      writeDb(items);
      return { ok: true, item, alreadyPresent: false };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('library:importFolder', async () => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: mt('dialog.importMangaFolder.title'),
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return readDb();

    const src = res.filePaths[0];
    const id = crypto.randomUUID();
    const pagesDir = path.join(itemDir(id), 'pages');
    fs.mkdirSync(itemDir(id), { recursive: true });
    const names = copyFolderImages(src, pagesDir);

    const items = readDb();
    if (names.length === 0) {
      fs.rmSync(itemDir(id), { recursive: true, force: true });
      return items;
    }
    items.unshift({
      id,
      title: path.basename(src),
      kind: 'manga',
      createdAt: Date.now(),
      sourcePath: src,
      pageCount: names.length,
      coverPath: `pages/${pickCoverPage(pagesDir, names)}`,
    });
    writeDb(items);
    return items;
  });

  ipcMain.handle('library:remove', (_e, id: unknown) => {
    // Validated BEFORE anything is deleted: an id from the renderer is joined
    // onto the library root and removed recursively.
    if (!isSafeLibraryItemId(id)) throw new Error('Invalid library item id');
    fs.rmSync(itemDir(id), { recursive: true, force: true });
    pendingProgress.delete(id);
    const items = readDb().filter((it) => it.id !== id);
    writeDb(items);
    return items;
  });

  ipcMain.handle('library:setProgress', (_e, id: string, progress: Progress) => {
    const items = readDb();
    const it = items.find((x) => x.id === id);
    if (it) {
      // Captured BEFORE the overwrite. This pair is the whole of §4.1's two-save
      // dwell — the position that is being replaced and when it was written — so
      // the completion detector needs no state of its own and keeps working
      // across a restart.
      const previous = it.progress;
      const previousAt = it.lastReadAt;
      const at = Date.now();
      // Coalesced: see `pendingProgress`. Atomic when it lands.
      pendingProgress.set(it.id, { progress, lastReadAt: at });
      if (!progressTimer) progressTimer = setTimeout(flushLibraryProgress, PROGRESS_FLUSH_MS);
      noteReadingProgress(it, previous, previousAt, progress, at);
    }
  });

  // ----- user library folders -----

  ipcMain.handle('library:getFolders', () => readConfig().folders ?? []);

  ipcMain.handle('library:setFolders', (_e, folders: string[]) => {
    const cfg = readConfig();
    const clean = [...new Set((folders ?? []).map((f) => String(f).trim()).filter(Boolean))];
    cfg.folders = clean;
    writeConfig(cfg);
    // Items filed under a folder that no longer exists become unfiled.
    const items = readDb();
    let changed = false;
    for (const it of items) {
      if (it.folder && !clean.includes(it.folder)) {
        delete it.folder;
        changed = true;
      }
    }
    if (changed) writeDb(items);
    return { folders: clean, items };
  });

  // ----- desktop wallpaper (custom image stored in userData) -----

  // WALL_EXT hoisted to `shared/mediaKind.ts` — it was function-local here, so
  // nothing outside could tell which images the wallpaper pipeline accepts.
  const wallpaperFile = (): string | null => {
    for (const ext of WALL_EXT) {
      const p = path.join(app.getPath('userData'), `wallpaper${ext}`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  };
  const wallpaperLocalUrl = (): string | null => {
    const p = wallpaperFile();
    if (!p) return null;
    try {
      return localFileUrl(p);
    } catch {
      return null;
    }
  };
  const clearWallpaperFiles = (): void => {
    for (const ext of WALL_EXT) {
      const p = path.join(app.getPath('userData'), `wallpaper${ext}`);
      try {
        if (fs.existsSync(p)) fs.rmSync(p);
      } catch {
        /* locked file — ignore */
      }
    }
  };

  ipcMain.handle('desktop:getWallpaper', () => wallpaperLocalUrl());

  const wallLibDir = (): string => {
    const dir = path.join(app.getPath('userData'), 'wallpapers');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
    return dir;
  };

  /** Import image into library + set as active shell wallpaper. */
  ipcMain.handle(
    'desktop:pickWallpaper',
    async (): Promise<{
      id: string;
      path: string;
      url: string;
      kind: 'image';
      label: string;
    } | null> => {
      const res = await dialog.showOpenDialog(focusedWindow()!, {
        title: mt('dialog.chooseWallpaperImage.title'),
        properties: ['openFile'],
        filters: [{ name: mt('dialog.filter.images'), extensions: WALL_EXT.map((e) => e.slice(1)) }],
      });
      const src = res.filePaths[0];
      if (res.canceled || !src) return null;
      try {
        clearWallpaperFiles();
        const ext = path.extname(src).toLowerCase() || '.jpg';
        const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const label = path.basename(src, path.extname(src)) || 'Image';
        // Active single-file wallpaper (legacy getWallpaper)
        const activePath = path.join(app.getPath('userData'), `wallpaper${ext}`);
        fs.copyFileSync(src, activePath);
        // Durable library copy so it can be re-selected from the grid
        const libPath = path.join(wallLibDir(), `${id}${ext}`);
        fs.copyFileSync(src, libPath);
        return { id, path: libPath, url: localFileUrl(libPath), kind: 'image', label };
      } catch (err) {
        console.error('Wallpaper copy failed', err);
        return null;
      }
    },
  );

  /** Set active shell wallpaper from an existing library/image path. */
  ipcMain.handle('desktop:setWallpaperFromPath', (_e, filePath: unknown): string | null => {
    if (typeof filePath !== 'string' || !filePath || !fs.existsSync(filePath)) return null;
    try {
      const ext = path.extname(filePath).toLowerCase();
      if (!WALL_EXT.includes(ext)) return null;
      clearWallpaperFiles();
      const dest = path.join(app.getPath('userData'), `wallpaper${ext}`);
      fs.copyFileSync(filePath, dest);
      return localFileUrl(dest);
    } catch (err) {
      console.error('setWallpaperFromPath failed', err);
      return null;
    }
  });

  ipcMain.handle('desktop:clearWallpaper', () => {
    clearWallpaperFiles();
    return null;
  });

  /** Pick an image for environment playlists without overwriting the shell wallpaper file. */
  ipcMain.handle('desktop:pickEnvImage', async (): Promise<string | null> => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: mt('dialog.addWallpaperPlaylistImage.title'),
      properties: ['openFile'],
      filters: [{ name: mt('dialog.filter.images'), extensions: WALL_EXT.map((e) => e.slice(1)) }],
    });
    const src = res.filePaths[0];
    if (res.canceled || !src) return null;
    return src;
  });

  const listImagesInFolder = (folder: string): string[] => {
    try {
      if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return [];
      const names = fs.readdirSync(folder);
      return names
        .filter((n) => WALL_EXT.includes(path.extname(n).toLowerCase()))
        .map((n) => path.join(folder, n))
        .filter((p) => {
          try {
            return fs.statSync(p).isFile();
          } catch {
            return false;
          }
        })
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
    } catch {
      return [];
    }
  };

  /** Windows-style slideshow: pick a folder of images. */
  ipcMain.handle(
    'desktop:pickWallpaperFolder',
    async (): Promise<{ folder: string; images: string[] } | null> => {
      const res = await dialog.showOpenDialog(focusedWindow()!, {
        title: mt('dialog.chooseWallpaperFolder.title'),
        properties: ['openDirectory'],
      });
      const folder = res.filePaths[0];
      if (res.canceled || !folder) return null;
      const images = listImagesInFolder(folder);
      if (!images.length) return { folder, images: [] };
      return { folder, images };
    },
  );

  /** Re-scan a slideshow folder (images may have been added/removed). */
  ipcMain.handle('desktop:listWallpaperFolder', (_e, folder: unknown): string[] => {
    if (typeof folder !== 'string') return [];
    return listImagesInFolder(folder);
  });

  /** Resolve an absolute image path to a streaming localfile:// URL (not base64). */
  ipcMain.handle('desktop:imageFileUrl', (_e, filePath: unknown): string | null => {
    if (typeof filePath !== 'string' || !filePath) return null;
    try {
      if (!fs.existsSync(filePath)) return null;
      const ext = path.extname(filePath).toLowerCase();
      if (!WALL_EXT.includes(ext)) return null;
      return localFileUrl(filePath);
    } catch {
      return null;
    }
  });

  // ----- custom app shortcuts on the desktop -----

  // Pick any program/file and return what the desktop needs for its icon.
  ipcMain.handle('desktop:pickShortcut', async () => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: mt('dialog.chooseDesktopProgram.title'),
      properties: ['openFile'],
      filters: [
        { name: mt('dialog.filter.programsShortcuts'), extensions: ['exe', 'lnk', 'bat', 'cmd'] },
        { name: mt('dialog.filter.allFiles'), extensions: ['*'] },
      ],
    });
    const target = res.filePaths[0];
    if (res.canceled || !target) return null;
    let icon = '';
    try {
      const img = await app.getFileIcon(target, { size: 'large' });
      icon = img.toDataURL();
    } catch {
      /* no extractable icon — the renderer falls back to an emoji */
    }
    const name = path.basename(target, path.extname(target));
    return { target, name, icon };
  });

  // Launch a shortcut: a URL opens in the browser, a file/program via Windows.
  // `target` always originates from desktop:pickShortcut (an OS file-dialog
  // result) or the Blanc Toolbox file-search results — both are paths the
  // user already selected via native OS UI, never renderer-typed text. The
  // checks below (PHASE_6_5_AUDIT.md §3 chained-High finding) don't change
  // that legitimate flow; they narrow what a *compromised* renderer could
  // achieve by calling this channel directly with a crafted string.
  ipcMain.handle('desktop:launch', async (_e, target: string) => {
    if (typeof target !== 'string' || !target || target.includes('\0')) return 'Invalid target.';
    if (/^https?:\/\//i.test(target)) {
      await shell.openExternal(target);
      return null;
    }
    if (!path.isAbsolute(target)) return 'Invalid target.';
    const resolved = path.resolve(target);
    if (resolved !== target) return 'Invalid target.';
    if (!fs.existsSync(resolved)) return 'That file no longer exists.';
    const err = await shell.openPath(resolved);
    return err || null;
  });

  // ----- web / clipboard import (LingQ-style) -----

  // Fetch + extract a readable article in the main process (no CORS / DOM issues).
  ipcMain.handle('net:extractReadableArticle', async (_e, url: string) => {
    return extractReadableFromUrl(String(url ?? '').trim());
  });

  // Reading Finder: fetch a candidate's full readable content, following the
  // same-text "next page" chain, and return plain text for comprehensibility
  // scoring plus HTML for the reader. (Renderer would hit CORS.)
  ipcMain.handle('reading:fetchContent', async (_e, url: string, opts?: FetchReadingOptions) => {
    return fetchReadingContent(String(url ?? '').trim(), opts ?? {});
  });

  // Fetch a page's HTML in the main process (the renderer would hit CORS).
  ipcMain.handle('net:fetchPage', async (_e, url: string) => {
    try {
      const u = String(url ?? '').trim();
      if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'Enter a full http(s):// address.' };
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(u, {
        signal: ctl.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,*/*',
        },
      });
      clearTimeout(t);
      if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
      const ct = res.headers.get('content-type') ?? '';
      if (ct && !/html|xml|text/i.test(ct)) {
        return { ok: false, error: `Not a web page (${ct.split(';')[0]}).` };
      }
      const html = (await res.text()).slice(0, 3_000_000);
      return { ok: true, html, url: res.url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: /abort/i.test(msg) ? 'The page took too long to load.' : msg };
    }
  });

  // Fetch JSON from allowlisted APIs (the renderer would hit CORS, and
  // net:fetchPage rejects application/json responses).
  const JSON_HOSTS = [/^https:\/\/ja\.wikipedia\.org\//i, /^https:\/\/lrclib\.net\//i];
  ipcMain.handle('net:fetchJson', async (_e, url: string) => {
    try {
      const u = String(url ?? '').trim();
      if (!JSON_HOSTS.some((re) => re.test(u))) {
        return { ok: false, error: 'That address is not allowed.' };
      }
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(u, {
        signal: ctl.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          Accept: 'application/json',
        },
      });
      clearTimeout(t);
      if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: /abort/i.test(msg) ? 'Wikipedia took too long to respond.' : msg };
    }
  });

  // Wrap extracted article/pasted text into a minimal valid EPUB so imported
  // web content behaves exactly like any other book (reader, progress, stats).
  ipcMain.handle(
    'library:importGenerated',
    (_e, payload: { title?: string; html?: string; source?: string }) => {
      return importGeneratedArticle(payload).items;
    },
  );

  ipcMain.handle(
    'library:updateInboxMeta',
    (_e, id: string, patch: Partial<NonNullable<LibraryItem['inboxMeta']>>) => {
      if (typeof id !== 'string') return readDb();
      return updateLibraryInboxMeta(id, patch ?? {});
    },
  );

  ipcMain.handle(
    'library:updateLevelMeta',
    (
      _e,
      id: string,
      patch: NonNullable<LibraryItem['levelMeta']>,
      opts?: { broadcast?: boolean },
    ) => {
      if (typeof id !== 'string' || !patch || typeof patch !== 'object') return readDb();
      return updateLibraryLevelMeta(id, patch, opts);
    },
  );

  // No `library:updateOcrMeta` channel: OCR metadata is only ever written from the
  // main process itself (mangaOcr.ts calls `updateLibraryOcrMeta` directly), so the
  // handler that used to sit here was never invoked from a renderer.

  // Import files dropped onto the app window (no dialog).
  ipcMain.handle('library:importPaths', (_e, paths: string[]) => {
    const items = readDb();
    const known = new Set(items.map((i) => i.sourcePath).filter(Boolean) as string[]);
    let changed = false;
    for (const fp of Array.isArray(paths) ? paths : []) {
      if (typeof fp !== 'string') continue;
      try {
        if (!fs.existsSync(fp) || known.has(fp)) continue;
        const ext = path.extname(fp).toLowerCase();
        if (ext === '.epub') items.unshift(importBook(fp));
        else if (ext === '.pdf') items.unshift(importPdf(fp));
        else if (ARCHIVE_EXT.has(ext)) items.unshift(importMangaArchive(fp));
        else continue;
        known.add(fp);
        changed = true;
      } catch (err) {
        console.error('Drop import failed for', fp, err);
      }
    }
    if (changed) {
      writeDb(items);
      broadcastLibrary(items);
    }
    return items;
  });

  ipcMain.handle('library:setItemFolder', (_e, id: string, folder: string | null) => {
    const items = readDb();
    const it = items.find((x) => x.id === id);
    if (it) {
      if (folder) it.folder = folder;
      else delete it.folder;
      writeDb(items);
    }
    return items;
  });

  // Book OCR is reversible: switch a converted item back to its page images (or
  // PDF) and forward again. Returns the updated item, or null when refused.
  ipcMain.handle('library:setOcrView', (_e, id: unknown, view: unknown) => {
    if (typeof id !== 'string' || (view !== 'original' && view !== 'text')) return null;
    return setLibraryOcrView(id, view) ?? null;
  });

  ipcMain.handle('library:setCover', (_e, id: string, pageRelPath: string) => {
    const items = readDb();
    const it = items.find((x) => x.id === id);
    if (!it) return items;
    if (typeof pageRelPath !== 'string' || !pageRelPath.startsWith('pages/') || pageRelPath.includes('..')) {
      return items;
    }
    const full = path.join(itemDir(id), pageRelPath);
    if (!fs.existsSync(full)) return items;
    it.coverPath = pageRelPath;
    writeDb(items);
    broadcastLibrary(items);
    return items;
  });

  ipcMain.handle('manga:getPages', (_e, id: string) => getMangaPages(id));

  ipcMain.handle('manga:readPage', (_e, mediaUrl: string) => readMangaPage(mediaUrl));

  ipcMain.handle('library:readBook', (_e, id: string) => readBook(id));

  ipcMain.handle('library:sampleBookText', (_e, id: string, maxChars?: number) =>
    sampleBookText(id, typeof maxChars === 'number' && maxChars > 0 ? maxChars : 40_000),
  );

  ipcMain.handle('config:getWatchFolder', () => readConfig().watchFolder ?? null);

  ipcMain.handle('config:setWatchFolder', async () => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: mt('dialog.autoImportBooksFolder.title'),
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) {
      return { folder: readConfig().watchFolder ?? null, items: readDb() };
    }
    const cfg = readConfig();
    cfg.watchFolder = res.filePaths[0];
    writeConfig(cfg);
    const items = syncWatchFolder();
    startWatching();
    return { folder: cfg.watchFolder, items };
  });

  ipcMain.handle('config:clearWatchFolder', () => {
    const cfg = readConfig();
    delete cfg.watchFolder;
    writeConfig(cfg);
    stopWatching();
    return null;
  });

  ipcMain.handle('library:sync', () => syncWatchFolder());

  // Catch up on anything dropped into the watch folder while the app was closed.
  syncWatchFolder();
  startWatching();
}
