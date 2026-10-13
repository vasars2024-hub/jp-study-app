/**
 * `music:localLyrics` — lyrics stored with a library audio file: a sidecar `.lrc`
 * next to it, else lyrics embedded in its tags (read with the bundled ffmpeg, the
 * same tag reader `media.ts` uses for cover art), else a `.lrc` matched by name or
 * `[ti:]`/`[ar:]` tags in an offline lyrics folder: a `Lyrics`/`LRC` folder beside
 * the song or its album, or the folder the user picked (`music:lyricsFolder`).
 * See `shared/musicLocalLyrics.ts` for the formats and the matching rules.
 *
 * The renderer passes a media id, never a path: the path is looked up in the media
 * library store here, so this channel cannot be pointed at an arbitrary file. The
 * lyrics folder is only ever set through a folder dialog the user answers.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { mt } from './i18n';
import { MEDIA_LIBRARY_STORE_FILE, mediaItemsFromStoredDocument } from '../shared/mediaLibraryEntries';
import {
  LOCAL_LYRICS_MAX_CHARS,
  normaliseLyricsText,
  parseFfmetadata,
  pickLrcCandidate,
  readLrcHeader,
  type LrcCandidate,
  type LyricSongHint,
  pickLyricsTag,
  sidecarLrcNames,
  type LocalLyrics,
} from '../shared/musicLocalLyrics';

const ffmpegPath = ffmpegStatic as unknown as string;
const FFMPEG_TIMEOUT_MS = 8000;

/** Sidecar .lrc for an audio path, case-insensitively, or null. */
export function readSidecarLrc(audioPath: string, fsImpl: Pick<typeof fs, 'readdirSync' | 'readFileSync'> = fs): string | null {
  const dir = path.dirname(audioPath);
  let names: string[];
  try {
    names = fsImpl.readdirSync(dir) as unknown as string[];
  } catch {
    return null;
  }
  const byLower = new Map(names.map((n) => [n.toLowerCase(), n]));
  for (const candidate of sidecarLrcNames(path.basename(audioPath))) {
    const actual = byLower.get(candidate.toLowerCase());
    if (!actual) continue;
    try {
      const text = normaliseLyricsText(String(fsImpl.readFileSync(path.join(dir, actual), 'utf8')));
      if (text) return text.slice(0, LOCAL_LYRICS_MAX_CHARS);
    } catch {
      /* unreadable: try the next candidate */
    }
  }
  return null;
}

/** Embedded lyrics via `ffmpeg -f ffmetadata`, or null. */
export function readEmbeddedLyrics(audioPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (v: string | null): void => {
      if (done) return;
      done = true;
      resolve(v);
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', audioPath, '-f', 'ffmetadata', '-']);
    } catch {
      finish(null);
      return;
    }
    const timer = setTimeout(() => {
      proc.kill();
      finish(null);
    }, FFMPEG_TIMEOUT_MS);
    proc.stdout?.on('data', (d: Buffer) => {
      if (out.length < LOCAL_LYRICS_MAX_CHARS * 2) out += d.toString('utf8');
    });
    proc.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    proc.on('close', () => {
      clearTimeout(timer);
      finish(pickLyricsTag(parseFfmetadata(out)));
    });
  });
}

// ----- offline lyrics folders --------------------------------------------------

type DirFs = Pick<typeof fs, 'readdirSync' | 'readFileSync' | 'statSync'>;

/** Folder names, beside a song or its album, that lyric tools write `.lrc` files into. */
const LYRICS_DIR_NAMES = new Set(['lyrics', 'lrc', '歌詞']);
/** A lyrics folder bigger than this is not indexed past it (a whole-disk pick, say). */
const MAX_LRC_FILES = 5000;
const MAX_DEPTH = 3;
/** Header bytes read per .lrc — `[ti:]`/`[ar:]` sit on the first lines. */
const HEADER_BYTES = 2048;
/** A folder index is re-read after this long, or when the folder's own mtime moves. */
const INDEX_TTL_MS = 30_000;

/** Every `.lrc` under `dir` (to `depth` levels), with its `[ti:]`/`[ar:]` tags. */
export function listLrcCandidates(dir: string, depth = 0, fsImpl: DirFs = fs): LrcCandidate[] {
  const out: LrcCandidate[] = [];
  const walk = (folder: string, level: number): void => {
    if (out.length >= MAX_LRC_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fsImpl.readdirSync(folder, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_LRC_FILES) return;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (level < depth) walk(full, level + 1);
        continue;
      }
      if (!/\.lrc$/i.test(entry.name)) continue;
      let header: { title?: string; artist?: string } = {};
      try {
        const head = String(fsImpl.readFileSync(full, 'utf8')).slice(0, HEADER_BYTES);
        header = readLrcHeader(normaliseLyricsText(head));
      } catch {
        /* unreadable: still matchable by its name */
      }
      out.push({ file: full, name: entry.name, ...header });
    }
  };
  walk(dir, 0);
  return out;
}

const folderIndex = new Map<string, { stamp: string; at: number; list: LrcCandidate[] }>();

function indexedCandidates(dir: string, depth: number, fsImpl: DirFs): LrcCandidate[] {
  let stamp: string;
  try {
    stamp = String(fsImpl.statSync(dir).mtimeMs);
  } catch {
    return [];
  }
  const key = `${dir}\u0000${depth}`;
  const hit = folderIndex.get(key);
  if (hit && hit.stamp === stamp && Date.now() - hit.at < INDEX_TTL_MS) return hit.list;
  const list = listLrcCandidates(dir, depth, fsImpl);
  if (folderIndex.size > 200) folderIndex.clear();
  folderIndex.set(key, { stamp, at: Date.now(), list });
  return list;
}

/** `Lyrics`/`LRC`/`歌詞` subfolders of `dir`, matched case-insensitively. */
function lyricsSubdirs(dir: string, fsImpl: DirFs): string[] {
  try {
    return (fsImpl.readdirSync(dir, { withFileTypes: true }) as unknown as fs.Dirent[])
      .filter((e) => e.isDirectory() && LYRICS_DIR_NAMES.has(e.name.toLowerCase()))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/**
 * A `.lrc` for a song that is not a same-name sidecar: a near-name in its own folder
 * (`01 - Song.flac` ↔ `Song.lrc`), else a match in a lyrics folder beside the song
 * or its album, else in the user's lyrics folder (searched three levels deep, so an
 * `Artist/Album/Song.lrc` tree works).
 */
export function findFolderLrc(
  audioPath: string,
  hint: Omit<LyricSongHint, 'fileName'>,
  userFolder: string | null,
  fsImpl: DirFs = fs,
): LocalLyrics | null {
  const dir = path.dirname(audioPath);
  const song: LyricSongHint = { fileName: path.basename(audioPath), ...hint };
  const places: Array<{ dir: string; depth: number; source: LocalLyrics['source'] }> = [
    { dir, depth: 0, source: 'sidecar' },
    ...lyricsSubdirs(dir, fsImpl).map((d) => ({ dir: d, depth: 1, source: 'folder' as const })),
    ...lyricsSubdirs(path.dirname(dir), fsImpl).map((d) => ({ dir: d, depth: 2, source: 'folder' as const })),
    ...(userFolder ? [{ dir: userFolder, depth: MAX_DEPTH, source: 'folder' as const }] : []),
  ];
  const seen = new Set<string>();
  for (const place of places) {
    if (seen.has(place.dir)) continue;
    seen.add(place.dir);
    const match = pickLrcCandidate(song, indexedCandidates(place.dir, place.depth, fsImpl));
    if (!match) continue;
    try {
      const text = normaliseLyricsText(String(fsImpl.readFileSync(match.file, 'utf8')));
      if (text) return { text: text.slice(0, LOCAL_LYRICS_MAX_CHARS), source: place.source };
    } catch {
      /* vanished since it was indexed: keep looking */
    }
  }
  return null;
}

/** Keyed by path + mtimes + the lyrics folder, so editing a .lrc or re-tagging is picked up. */
const cache = new Map<string, LocalLyrics | null>();

// ----- the user's lyrics folder ----------------------------------------------

const LYRICS_FOLDER_FILE = 'music-lyrics-folder.json';

function lyricsFolderFile(): string {
  return path.join(app.getPath('userData'), LYRICS_FOLDER_FILE);
}

export function readLyricsFolder(): string | null {
  const doc = readJsonSync<{ folder?: unknown } | null>(lyricsFolderFile(), null, {
    validate: (v) => v === null || typeof v === 'object',
  });
  const folder = doc && typeof doc.folder === 'string' ? doc.folder : '';
  return folder && path.isAbsolute(folder) ? folder : null;
}

function writeLyricsFolder(folder: string | null): void {
  writeJsonAtomicSync(lyricsFolderFile(), { folder: folder ?? '' });
  cache.clear();
}

// ----- lookup -------------------------------------------------------------------

export async function localLyricsForPath(
  audioPath: string,
  hint: Omit<LyricSongHint, 'fileName'> = {},
  userFolder: string | null = null,
): Promise<LocalLyrics | null> {
  let stamp = '';
  try {
    const dir = path.dirname(audioPath);
    stamp = `${fs.statSync(audioPath).mtimeMs}:${fs.statSync(dir).mtimeMs}`;
    if (userFolder) stamp += `:${fs.statSync(userFolder).mtimeMs}`;
  } catch {
    if (!stamp) return null;
  }
  const key = `${audioPath}\u0000${stamp}\u0000${userFolder ?? ''}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const sidecar = readSidecarLrc(audioPath);
  let result: LocalLyrics | null = sidecar ? { text: sidecar, source: 'sidecar' } : null;
  if (!result) {
    const embedded = await readEmbeddedLyrics(audioPath);
    result = embedded ? { text: embedded, source: 'embedded' } : null;
  }
  // Embedded PLAIN text loses to a synced .lrc found in a lyrics folder.
  const timed = (text: string): boolean => /\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(text);
  if (!result || !timed(result.text)) {
    const fromFolder = findFolderLrc(audioPath, hint, userFolder);
    if (fromFolder && (!result || timed(fromFolder.text))) result = fromFolder;
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, result);
  return result;
}

function itemForMediaId(id: string): { path: string; title?: string; artist?: string } | null {
  const file = path.join(app.getPath('userData'), MEDIA_LIBRARY_STORE_FILE);
  const doc = readJsonSync<unknown>(file, null, { validate: (v) => v !== null && typeof v === 'object' });
  if (!doc) return null;
  const item = mediaItemsFromStoredDocument(doc as Parameters<typeof mediaItemsFromStoredDocument>[0]).find((i) => i.id === id);
  return item?.path ? { path: item.path, title: item.title, artist: item.artist } : null;
}

export function registerMusicLyricsIpc(): void {
  ipcMain.handle('music:localLyrics', async (_e, id: unknown): Promise<LocalLyrics | null> => {
    if (typeof id !== 'string' || !id) return null;
    const item = itemForMediaId(id);
    if (!item) return null;
    try {
      return await localLyricsForPath(item.path, { title: item.title, artist: item.artist }, readLyricsFolder());
    } catch {
      return null;
    }
  });
  // The offline lyrics folder: read it, pick it (a folder dialog the user answers), or forget it.
  ipcMain.handle('music:lyricsFolder', async (e, action: unknown): Promise<string | null> => {
    if (action === 'clear') {
      writeLyricsFolder(null);
      return null;
    }
    if (action === 'pick') {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
      const options: Electron.OpenDialogOptions = {
        title: mt('musicLyrics2.folder.dialogTitle'),
        properties: ['openDirectory'],
        ...(readLyricsFolder() ? { defaultPath: readLyricsFolder() ?? undefined } : {}),
      };
      const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      if (!res.canceled && res.filePaths[0]) writeLyricsFolder(res.filePaths[0]);
    }
    return readLyricsFolder();
  });
}
