import { app, ipcMain, dialog, shell, BrowserWindow, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import AdmZip from 'adm-zip';
import type { LibraryItem, Progress } from '../shared/types';
import { extractReadableFromUrl } from './readabilityExtract';
import { mt } from './i18n';

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

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp']);
const ARCHIVE_EXT = new Set(['.cbz', '.zip']);

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
function itemDir(id: string): string {
  return path.join(libraryRoot(), id);
}

export function ensureLibrary(): void {
  fs.mkdirSync(libraryRoot(), { recursive: true });
  if (!fs.existsSync(dbPath())) fs.writeFileSync(dbPath(), '[]', 'utf-8');
}

// ----- tiny JSON "database" ---------------------------------------------

function readDb(): LibraryItem[] {
  try {
    return JSON.parse(fs.readFileSync(dbPath(), 'utf-8')) as LibraryItem[];
  } catch {
    return [];
  }
}
function writeDb(items: LibraryItem[]): void {
  fs.writeFileSync(dbPath(), JSON.stringify(items, null, 2), 'utf-8');
}

function readConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf-8')) as Config;
  } catch {
    return {};
  }
}
function writeConfig(cfg: Config): void {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
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

/** Find the cover image inside an EPUB and copy it into destDir. Returns its name. */
function extractEpubCover(zip: AdmZip, destDir: string): string | undefined {
  try {
    const container = zip.getEntry('META-INF/container.xml');
    if (!container) return undefined;
    const opfPath = (container.getData().toString('utf-8').match(/full-path="([^"]+)"/i) ?? [])[1];
    if (!opfPath) return undefined;
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) return undefined;
    const opf = opfEntry.getData().toString('utf-8');
    const opfDir = path.posix.dirname(opfPath);

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
  try {
    coverPath = extractEpubCover(new AdmZip(path.join(dir, 'original.epub')), dir);
  } catch {
    /* ignore — falls back to a title gradient */
  }
  return {
    id,
    title: titleFromFile(filePath),
    kind: 'book',
    createdAt: Date.now(),
    sourcePath: filePath,
    epubFile: 'original.epub',
    coverPath,
  };
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
  fs.mkdirSync(itemDir(id), { recursive: true });
  const names = extractMangaPages(filePath, path.join(itemDir(id), 'pages'));
  return {
    id,
    title: titleFromFile(filePath),
    kind: 'manga',
    createdAt: Date.now(),
    sourcePath: filePath,
    pageCount: names.length,
    coverPath: names[0] ? `pages/${names[0]}` : undefined,
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

/** Read a book's epub bytes for the renderer (avoids cross-origin fetch on media://). */
function readBook(id: string): ArrayBuffer | null {
  const it = readDb().find((x) => x.id === id);
  const file = it?.epubFile ?? 'original.epub';
  const full = path.join(itemDir(id), file);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
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

  ipcMain.handle('library:importFolder', async () => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: mt('dialog.importMangaFolder.title'),
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return readDb();

    const src = res.filePaths[0];
    const id = crypto.randomUUID();
    fs.mkdirSync(itemDir(id), { recursive: true });
    const names = copyFolderImages(src, path.join(itemDir(id), 'pages'));

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
      coverPath: `pages/${names[0]}`,
    });
    writeDb(items);
    return items;
  });

  ipcMain.handle('library:remove', (_e, id: string) => {
    fs.rmSync(itemDir(id), { recursive: true, force: true });
    const items = readDb().filter((it) => it.id !== id);
    writeDb(items);
    return items;
  });

  ipcMain.handle('library:setProgress', (_e, id: string, progress: Progress) => {
    const items = readDb();
    const it = items.find((x) => x.id === id);
    if (it) {
      it.progress = progress;
      it.lastReadAt = Date.now();
      writeDb(items);
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

  const WALL_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
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
  ipcMain.handle('desktop:launch', async (_e, target: string) => {
    if (typeof target !== 'string' || !target) return 'Invalid target.';
    if (/^https?:\/\//i.test(target)) {
      await shell.openExternal(target);
      return null;
    }
    if (!fs.existsSync(target)) return 'That file no longer exists.';
    const err = await shell.openPath(target);
    return err || null;
  });

  // ----- web / clipboard import (LingQ-style) -----

  // Fetch + extract a readable article in the main process (no CORS / DOM issues).
  ipcMain.handle('net:extractReadableArticle', async (_e, url: string) => {
    return extractReadableFromUrl(String(url ?? '').trim());
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
  const escXml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const buildEpub = (title: string, bodyHtml: string): Buffer => {
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
  };

  ipcMain.handle(
    'library:importGenerated',
    (_e, payload: { title?: string; html?: string; source?: string }) => {
      const title = String(payload?.title ?? '').trim().slice(0, 120) || 'Imported text';
      const html = String(payload?.html ?? '');
      const items = readDb();
      if (!html.trim()) return items;
      if (payload?.source && items.some((i) => i.sourcePath === payload.source)) return items;
      const id = crypto.randomUUID();
      const dir = itemDir(id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'original.epub'), buildEpub(title, html));
      items.unshift({
        id,
        title,
        kind: 'book',
        createdAt: Date.now(),
        sourcePath: payload?.source,
        epubFile: 'original.epub',
      });
      writeDb(items);
      broadcastLibrary(items);
      return items;
    },
  );

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

  ipcMain.handle('manga:getPages', (_e, id: string) => getMangaPages(id));

  ipcMain.handle('manga:readPage', (_e, mediaUrl: string) => readMangaPage(mediaUrl));

  ipcMain.handle('library:readBook', (_e, id: string) => readBook(id));

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
