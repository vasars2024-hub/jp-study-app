import { app, ipcMain, dialog, protocol, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import type { MediaItem, MediaOpen, SubtitlePick } from '../shared/types';

const ffmpegPath = ffmpegStatic as unknown as string;

// token -> absolute path, for files the player is allowed to stream. The
// renderer only ever sees opaque tokens, never real disk paths.
const mediaTokens = new Map<string, string>();

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.ogv', '.ts', '.flv', '.wmv']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus']);
const MEDIA_EXT = new Set([...VIDEO_EXT, ...AUDIO_EXT]);
const SUBTITLE_EXT = ['srt', 'vtt', 'ass', 'ssa', 'lrc'];

const MEDIA_MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.ogv': 'video/ogg', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.ts': 'video/mp2t',
  '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
};

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}
function tokenFor(file: string): string {
  for (const [t, f] of mediaTokens) if (f === file) return t;
  const t = crypto.randomUUID();
  mediaTokens.set(t, file);
  return t;
}
function pathForUrl(url: string): string | undefined {
  try {
    return mediaTokens.get(new URL(url).host);
  } catch {
    return undefined;
  }
}

// ----- media library (a small JSON db; files are referenced, never copied) -----

interface MediaDb {
  items: MediaItem[];
  watchFolder?: string;
}
function dbPath(): string {
  return path.join(app.getPath('userData'), 'media.json');
}
function readDb(): MediaDb {
  try {
    const db = JSON.parse(fs.readFileSync(dbPath(), 'utf-8')) as MediaDb;
    return { items: Array.isArray(db.items) ? db.items : [], watchFolder: db.watchFolder };
  } catch {
    return { items: [] };
  }
}
function writeDb(db: MediaDb): void {
  fs.writeFileSync(dbPath(), JSON.stringify(db, null, 2), 'utf-8');
}

// Turn "AnimePahe_Re_Zero_kara_Hajimeru_Isekai_Seikatsu__74_1080p.mp4" into a
// readable title we can also feed to a MyAnimeList search.
function cleanTitle(file: string): string {
  let t = path.basename(file, path.extname(file));
  t = t.replace(/\[[^\]]*\]|\([^)]*\)/g, ' '); // [group] (info)
  t = t.replace(/[._]+/g, ' ');
  t = t.replace(
    /\b(1080p|720p|480p|2160p|4k|x264|x265|hevc|h\.?264|h\.?265|aac|flac|opus|bluray|blu-ray|bd(rip)?|web[- ]?dl|webrip|hdrip|dvdrip|dual[- ]?audio|multi[- ]?subs?|eng(lish)?[- ]?subs?|uncensored|repack|remux|10bit|8bit|hi10p|yuv420p|amzn|crunchyroll)\b/gi,
    ' ',
  );
  t = t.replace(/\s+/g, ' ').trim();
  return t || path.basename(file);
}

function addOrGetItem(absPath: string, touch = true): MediaItem {
  const db = readDb();
  let item = db.items.find((i) => i.path === absPath);
  if (!item) {
    item = {
      id: crypto.randomUUID(),
      title: cleanTitle(absPath),
      path: absPath,
      fileName: path.basename(absPath),
      addedAt: Date.now(),
    };
    db.items.unshift(item);
  }
  if (touch) item.lastPlayedAt = Date.now();
  writeDb(db);
  return item;
}

function broadcastMedia(): void {
  const items = readDb().items;
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('media:changed', items);
}

function userDataSubdir(name: string): string {
  return path.join(app.getPath('userData'), name);
}

/** Drop cached cover art for the given media ids (all files when ids is empty). */
function removeCoverFiles(ids: Set<string>): void {
  const dir = userDataSubdir('covers');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const id = f.replace(/\.jpg$/i, '');
    if (ids.size === 0 || ids.has(id)) {
      try {
        fs.rmSync(path.join(dir, f), { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/** Delete converted MP4 cache entries that no longer match a library item. */
function pruneOrphanCache(): void {
  const db = readDb();
  const valid = new Set(db.items.map((i) => crypto.createHash('md5').update(i.path).digest('hex')));
  const cacheDir = userDataSubdir('media-cache');
  if (!fs.existsSync(cacheDir)) return;
  for (const f of fs.readdirSync(cacheDir)) {
    const hash = f.replace(/\.mp4$/i, '');
    if (!valid.has(hash)) {
      try {
        fs.rmSync(path.join(cacheDir, f), { force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

function wipeCacheDirs(): void {
  for (const sub of ['covers', 'media-cache', 'youtube']) {
    try {
      fs.rmSync(userDataSubdir(sub), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function pruneMissingItems(): { removed: number; items: MediaItem[] } {
  const db = readDb();
  const before = db.items.length;
  const kept: MediaItem[] = [];
  const removedIds = new Set<string>();
  for (const item of db.items) {
    if (fs.existsSync(item.path)) kept.push(item);
    else removedIds.add(item.id);
  }
  db.items = kept;
  writeDb(db);
  if (removedIds.size > 0) removeCoverFiles(removedIds);
  pruneOrphanCache();
  mediaTokens.clear();
  broadcastMedia();
  return { removed: before - kept.length, items: kept };
}

function clearAllMedia(): MediaItem[] {
  stopWatching();
  const db = readDb();
  db.items = [];
  delete db.watchFolder;
  writeDb(db);
  wipeCacheDirs();
  mediaTokens.clear();
  broadcastMedia();
  return [];
}

// ----- ffmpeg helpers -----

/** Decode a file's audio to mono 16 kHz 32-bit-float PCM (what Whisper wants). */
function extractAudioPcm(file: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const args = ['-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le',
      '-hide_banner', '-loglevel', 'error', 'pipe:1'];
    const proc = spawn(ffmpegPath, args);
    const chunks: Buffer[] = [];
    let err = '';
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && chunks.length) {
        const buf = Buffer.concat(chunks);
        resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      } else {
        reject(new Error(err.trim() || `ffmpeg exited with code ${code}`));
      }
    });
  });
}

/**
 * Extract the embedded album art of an audio file as a JPEG, disk-cached per
 * media id. Returns null (and caches the miss as a 0-byte file) when the file
 * has no artwork.
 */
async function extractCoverArt(id: string, file: string): Promise<string | null> {
  const dir = path.join(app.getPath('userData'), 'covers');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${id}.jpg`);
  if (fs.existsSync(out)) {
    const size = fs.statSync(out).size;
    if (size === 0) return null; // known artless
    return `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`;
  }
  const ok = await new Promise<boolean>((resolve) => {
    const args = ['-i', file, '-an', '-frames:v', '1', '-f', 'image2', '-y',
      '-hide_banner', '-loglevel', 'error', out];
    const proc = spawn(ffmpegPath, args);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
  if (!ok || !fs.existsSync(out) || fs.statSync(out).size === 0) {
    try {
      fs.writeFileSync(out, ''); // negative cache
    } catch {
      /* ignore */
    }
    return null;
  }
  return `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`;
}

/** Remux/transcode any video into a browser-playable MP4 (cached by source path). */
function convertToMp4(file: string): Promise<string> {
  const cacheDir = path.join(app.getPath('userData'), 'media-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const out = path.join(cacheDir, crypto.createHash('md5').update(file).digest('hex') + '.mp4');
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return Promise.resolve(out);

  const run = (videoArgs: string[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const args = ['-i', file, ...videoArgs, '-c:a', 'aac', '-movflags', '+faststart', '-y',
        '-hide_banner', '-loglevel', 'error', out];
      const proc = spawn(ffmpegPath, args);
      let err = '';
      proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg exited ${code}`))));
    });

  // Try a fast stream-copy of the video first (works for H.264/H.265); if the
  // codec isn't MP4-compatible, fall back to a (slower) re-encode.
  return run(['-c:v', 'copy'])
    .catch(() => run(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']))
    .then(() => out);
}

// ----- Remote media download (yt-dlp — YouTube, Vimeo, and 1000+ sites) -----

function isRemoteMediaLink(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Locate the user's yt-dlp on PATH (they install it themselves). */
function findYtDlp(): Promise<string | null> {
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const w = spawn(finder, ['yt-dlp']);
    let out = '';
    w.stdout.on('data', (d: Buffer) => (out += d.toString()));
    w.on('error', () => resolve(null));
    w.on('close', (code) => {
      const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      resolve(code === 0 && first ? first : null);
    });
  });
}

// ----- watch folder -----

let watcher: fs.FSWatcher | undefined;
let watchTimer: NodeJS.Timeout | undefined;

function scanWatchFolder(): MediaItem[] {
  const db = readDb();
  if (!db.watchFolder || !fs.existsSync(db.watchFolder)) return db.items;
  const known = new Set(db.items.map((i) => i.path));
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 4) walk(full, depth + 1);
      } else if (MEDIA_EXT.has(path.extname(e.name).toLowerCase()) && !known.has(full)) {
        found.push(full);
      }
    }
  };
  walk(db.watchFolder, 0);
  if (found.length === 0) return db.items;
  found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const f of found) {
    db.items.push({
      id: crypto.randomUUID(),
      title: cleanTitle(f),
      path: f,
      fileName: path.basename(f),
      addedAt: Date.now(),
    });
  }
  writeDb(db);
  return db.items;
}

function startWatching(): void {
  stopWatching();
  const db = readDb();
  if (!db.watchFolder || !fs.existsSync(db.watchFolder)) return;
  try {
    watcher = fs.watch(db.watchFolder, { recursive: true }, () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        const before = readDb().items.length;
        const items = scanWatchFolder();
        if (items.length !== before) broadcastMedia();
      }, 1200);
    });
  } catch {
    /* some folders can't be watched recursively — the manual rescan still works */
  }
}
function stopWatching(): void {
  watcher?.close();
  watcher = undefined;
}

// ----- IPC -----

export function registerMediaIpc(): void {
  // Stream a token's file, honouring HTTP Range so the <video> can seek.
  protocol.handle('playfile', (request) => {
    try {
      const file = mediaTokens.get(new URL(request.url).host);
      if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
      const total = fs.statSync(file).size;
      const type = MEDIA_MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
      const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('Range') ?? '');
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : total - 1;
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= total) end = total - 1;
        if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
        const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as unknown as ReadableStream;
        return new Response(body, {
          status: 206,
          headers: {
            'Content-Type': type,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            // CORS: without this, audio routed through the Web Audio analyser
            // (Music app visualizer) is silenced as cross-origin.
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      const body = Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream;
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });

  ipcMain.handle('media:list', () => readDb().items);

  ipcMain.handle('media:coverArt', async (_e, id: string): Promise<string | null> => {
    const item = readDb().items.find((i) => i.id === id);
    if (!item || !fs.existsSync(item.path)) return null;
    try {
      return await extractCoverArt(id, item.path);
    } catch {
      return null;
    }
  });

  ipcMain.handle('media:pick', async (): Promise<MediaOpen | null> => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: 'Open a video or audio file',
      properties: ['openFile'],
      filters: [
        { name: 'Video & audio', extensions: [...MEDIA_EXT].map((e) => e.slice(1)) },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const item = addOrGetItem(res.filePaths[0]);
    broadcastMedia();
    return { item, url: `playfile://${tokenFor(item.path)}` };
  });

  // Resolve a saved absolute media path back to a playable URL (used by the
  // desktop's video wallpaper on startup).
  ipcMain.handle('media:fileUrl', (_e, p: string) => {
    if (typeof p !== 'string' || !fs.existsSync(p)) return null;
    if (!MEDIA_EXT.has(path.extname(p).toLowerCase())) return null;
    return `playfile://${tokenFor(p)}`;
  });

  // Pick a looping video to use as the desktop wallpaper.
  ipcMain.handle(
    'desktop:pickWallpaperVideo',
    async (): Promise<{
      id: string;
      path: string;
      url: string;
      kind: 'video';
      label: string;
    } | null> => {
      const res = await dialog.showOpenDialog(focusedWindow()!, {
        title: 'Choose a video for the animated wallpaper',
        properties: ['openFile'],
        filters: [{ name: 'Video', extensions: [...VIDEO_EXT].map((e) => e.slice(1)) }],
      });
      const p = res.filePaths[0];
      if (res.canceled || !p) return null;
      const id = `vid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const label = path.basename(p, path.extname(p)) || 'Video';
      // Prefer a durable copy under userData so library entries survive path moves.
      let stored = p;
      try {
        const dir = path.join(app.getPath('userData'), 'wallpapers');
        fs.mkdirSync(dir, { recursive: true });
        const ext = path.extname(p).toLowerCase() || '.mp4';
        const dest = path.join(dir, `${id}${ext}`);
        fs.copyFileSync(p, dest);
        stored = dest;
      } catch {
        stored = p;
      }
      return {
        id,
        path: stored,
        url: `playfile://${tokenFor(stored)}`,
        kind: 'video',
        label,
      };
    },
  );

  // Add media files dropped onto the app window (no dialog).
  ipcMain.handle('media:addPaths', (_e, paths: string[]) => {
    let added = false;
    for (const fp of Array.isArray(paths) ? paths : []) {
      if (typeof fp !== 'string') continue;
      try {
        if (fs.existsSync(fp) && MEDIA_EXT.has(path.extname(fp).toLowerCase())) {
          addOrGetItem(fp, false);
          added = true;
        }
      } catch {
        /* unreadable file — skip it */
      }
    }
    if (added) broadcastMedia();
    return readDb().items;
  });

  ipcMain.handle('media:open', (_e, id: string): MediaOpen | null => {
    const db = readDb();
    const item = db.items.find((i) => i.id === id);
    if (!item || !fs.existsSync(item.path)) return null;
    item.lastPlayedAt = Date.now();
    writeDb(db);
    return { item, url: `playfile://${tokenFor(item.path)}` };
  });

  ipcMain.handle('media:remove', (_e, id: string) => {
    const db = readDb();
    const removed = db.items.find((i) => i.id === id);
    db.items = db.items.filter((i) => i.id !== id);
    writeDb(db);
    if (removed) removeCoverFiles(new Set([removed.id]));
    pruneOrphanCache();
    broadcastMedia();
    return db.items;
  });

  ipcMain.handle('media:pruneMissing', () => pruneMissingItems());

  ipcMain.handle('media:clearAll', () => clearAllMedia());

  ipcMain.handle('media:setPosition', (_e, id: string, sec: number) => {
    const db = readDb();
    const item = db.items.find((i) => i.id === id);
    if (item) {
      item.positionSec = sec;
      writeDb(db);
    }
  });

  ipcMain.handle('media:extractAudio', async (_e, url: string): Promise<ArrayBuffer> => {
    const file = pathForUrl(url);
    if (!file) throw new Error('Unknown media.');
    return extractAudioPcm(file);
  });

  ipcMain.handle('media:convert', async (_e, url: string): Promise<MediaOpen | null> => {
    const file = pathForUrl(url);
    if (!file) return null;
    const mp4 = await convertToMp4(file);
    const db = readDb();
    const item = db.items.find((i) => i.path === file) ?? addOrGetItem(file, false);
    return { item, url: `playfile://${tokenFor(mp4)}` };
  });

  ipcMain.handle('media:youtube', async (e, url: string, audioOnly?: boolean): Promise<MediaOpen | { error: string }> => {
    const link = typeof url === 'string' ? url.trim() : '';
    if (!isRemoteMediaLink(link)) return { error: 'Please paste a valid video or media link.' };
    const bin = await findYtDlp();
    if (!bin) {
      return { error: 'yt-dlp was not found on your PATH. Install it (e.g. `pip install -U yt-dlp`) and reopen the app.' };
    }
    const outDir = path.join(app.getPath('userData'), 'downloads');
    fs.mkdirSync(outDir, { recursive: true });
    const pathFile = path.join(outDir, `.out_${crypto.randomUUID()}.txt`);
    const sender = e.sender;
    // audioOnly (Music app): best audio stream as .m4a, no video download.
    const format = audioOnly
      ? ['-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'm4a']
      : ['-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4'];
    const args = [
      link,
      ...format,
      '--ffmpeg-location', ffmpegPath,
      '--referer', link,
      '--no-playlist',
      '--newline',
      '--no-part',
      '-o', path.join(outDir, '%(title).150B [%(id)s].%(ext)s'),
      '--print-to-file', 'after_move:filepath', pathFile,
    ];
    return new Promise((resolve) => {
      const proc = spawn(bin, args);
      let err = '';
      const onData = (buf: Buffer): void => {
        const s = buf.toString();
        const m = /\[download\]\s+([\d.]+)%/.exec(s);
        if (m) sender.send('media:youtubeProgress', { stage: 'downloading', percent: parseFloat(m[1]) });
        else if (/\[Merger\]|Merging formats/.test(s)) sender.send('media:youtubeProgress', { stage: 'merging', percent: 100 });
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', (d: Buffer) => {
        err += d.toString();
        onData(d);
      });
      proc.on('error', (e2) => resolve({ error: `Could not run yt-dlp: ${e2.message}` }));
      proc.on('close', (code) => {
        let file = '';
        try {
          file = (fs.readFileSync(pathFile, 'utf-8').trim().split(/\r?\n/).pop() ?? '').trim();
        } catch {
          /* no path file */
        }
        try {
          fs.rmSync(pathFile, { force: true });
        } catch {
          /* ignore */
        }
        if (code !== 0 || !file || !fs.existsSync(file)) {
          const lastLine = err.trim().split('\n').pop()?.trim();
          resolve({ error: `Download failed${lastLine ? `: ${lastLine}` : '.'}` });
          return;
        }
        const item = addOrGetItem(file);
        broadcastMedia();
        resolve({ item, url: `playfile://${tokenFor(item.path)}` });
      });
    });
  });

  ipcMain.handle('media:pickSubtitle', async (): Promise<SubtitlePick | null> => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: 'Open a subtitle file',
      properties: ['openFile'],
      filters: [
        { name: 'Subtitles', extensions: SUBTITLE_EXT },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    try {
      return { name: path.basename(res.filePaths[0]), text: fs.readFileSync(res.filePaths[0], 'utf-8') };
    } catch {
      return null;
    }
  });

  // Watch folder
  ipcMain.handle('media:getWatchFolder', () => readDb().watchFolder ?? null);
  ipcMain.handle('media:setWatchFolder', async () => {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: 'Choose a folder to auto-add videos from',
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return { folder: readDb().watchFolder ?? null, items: readDb().items };
    const db = readDb();
    db.watchFolder = res.filePaths[0];
    writeDb(db);
    const items = scanWatchFolder();
    startWatching();
    return { folder: db.watchFolder, items };
  });
  ipcMain.handle('media:clearWatchFolder', () => {
    const db = readDb();
    delete db.watchFolder;
    writeDb(db);
    stopWatching();
    broadcastMedia();
    return null;
  });

  // Catch up on the watch folder at launch.
  scanWatchFolder();
  startWatching();
}
