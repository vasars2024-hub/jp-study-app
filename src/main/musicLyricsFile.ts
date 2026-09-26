/**
 * `music:localLyrics` — lyrics stored with a library audio file: a sidecar `.lrc`
 * next to it, else lyrics embedded in its tags (read with the bundled ffmpeg, the
 * same tag reader `media.ts` uses for cover art). See `shared/musicLocalLyrics.ts`
 * for the formats and why.
 *
 * The renderer passes a media id, never a path: the path is looked up in the media
 * library store here, so this channel cannot be pointed at an arbitrary file.
 */
import { app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { readJsonSync } from './atomicJson';
import { MEDIA_LIBRARY_STORE_FILE, mediaItemsFromStoredDocument } from '../shared/mediaLibraryEntries';
import {
  LOCAL_LYRICS_MAX_CHARS,
  normaliseLyricsText,
  parseFfmetadata,
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

/** Keyed by path + mtime, so editing the .lrc or re-tagging the file is picked up. */
const cache = new Map<string, LocalLyrics | null>();

export async function localLyricsForPath(audioPath: string): Promise<LocalLyrics | null> {
  let stamp = '';
  try {
    const dir = path.dirname(audioPath);
    stamp = `${fs.statSync(audioPath).mtimeMs}:${fs.statSync(dir).mtimeMs}`;
  } catch {
    return null;
  }
  const key = `${audioPath}\u0000${stamp}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const sidecar = readSidecarLrc(audioPath);
  const result: LocalLyrics | null = sidecar
    ? { text: sidecar, source: 'sidecar' }
    : await readEmbeddedLyrics(audioPath).then((text) => (text ? { text, source: 'embedded' as const } : null));
  if (cache.size > 500) cache.clear();
  cache.set(key, result);
  return result;
}

function pathForMediaId(id: string): string | null {
  const file = path.join(app.getPath('userData'), MEDIA_LIBRARY_STORE_FILE);
  const doc = readJsonSync<unknown>(file, null, { validate: (v) => v !== null && typeof v === 'object' });
  if (!doc) return null;
  const item = mediaItemsFromStoredDocument(doc as Parameters<typeof mediaItemsFromStoredDocument>[0]).find((i) => i.id === id);
  return item?.path ?? null;
}

export function registerMusicLyricsIpc(): void {
  ipcMain.handle('music:localLyrics', async (_e, id: unknown): Promise<LocalLyrics | null> => {
    if (typeof id !== 'string' || !id) return null;
    const audioPath = pathForMediaId(id);
    if (!audioPath) return null;
    try {
      return await localLyricsForPath(audioPath);
    } catch {
      return null;
    }
  });
}
