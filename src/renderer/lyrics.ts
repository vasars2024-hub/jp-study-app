// Auto-pairing lyrics with songs: guess artist/title/album from the file name
// and folder path, ask LRCLIB (a free lyrics database) for synced (.lrc)
// lyrics, and cache the result per media item in localStorage.

import type { MediaItem } from '../shared/types';
import { loadLyricsSettings } from './lyricsSettings';

export interface SongMeta {
  artist: string;
  title: string;
  album: string;
}

export interface LyricsResult {
  /** Timed LRC text (karaoke). */
  lrc?: string;
  /** Untimed lyrics when no synced version exists. */
  plain?: string;
  source: 'lrclib' | 'file';
}

const CACHE_PREFIX = 'jp-lyrics-';
const MISS_CACHE_VERSION = 2;

function splitPath(p: string): string[] {
  return p.split(/[\\/]/).filter(Boolean);
}

function cleanTag(s: string): string {
  return s
    .replace(/[[(（【][^\])）】]*[\])）】]/g, ' ')
    .replace(/^\s*\d{1,3}[.\-_ ]+/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// ----- cache ---------------------------------------------------------------

export function cachedLyrics(mediaId: string): LyricsResult | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + mediaId);
    if (!raw) return null;
    const v = JSON.parse(raw) as LyricsResult | { none: true };
    return 'none' in v ? null : v;
  } catch {
    return null;
  }
}

export function saveLyrics(mediaId: string, res: LyricsResult): void {
  try {
    localStorage.setItem(CACHE_PREFIX + mediaId, JSON.stringify(res));
  } catch {
    /* quota — lyrics just won't be cached */
  }
}

/** Remember that nothing was found, so we don't re-query every playback. */
export function markNoLyrics(mediaId: string): void {
  try {
    localStorage.setItem(CACHE_PREFIX + mediaId, JSON.stringify({ none: true, version: MISS_CACHE_VERSION }));
  } catch {
    /* ignore */
  }
}

export function hasFreshNoLyrics(mediaId: string): boolean {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + mediaId);
    if (!raw) return false;
    const v = JSON.parse(raw) as { none?: true; version?: number };
    return v.none === true && v.version === MISS_CACHE_VERSION;
  } catch {
    return false;
  }
}

export function clearLyrics(mediaId: string): void {
  try {
    localStorage.removeItem(CACHE_PREFIX + mediaId);
  } catch {
    /* ignore */
  }
}

export function clearAllLyrics(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

// ----- metadata guessing ----------------------------------------------------

/**
 * Derive artist / album / title from the file name and its folder path.
 * Handles "Artist - Title.mp3", "Artist - Album - Title.mp3", and
 * folder layouts like ".../Artist/Album/01 - Title.flac".
 */
function guessSongMetaWithAlbum(item: MediaItem): SongMeta {
  const dirs = splitPath(item.path).slice(0, -1);
  const base = cleanTag(item.fileName.replace(/\.[a-z0-9]+$/i, ''));

  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 3) {
    return {
      artist: parts[0].trim(),
      album: parts[1].trim(),
      title: parts.slice(2).join(' - ').trim(),
    };
  }
  if (parts.length === 2) {
    const artist = parts[0].trim();
    const title = parts[1].trim();
    const parent = dirs.length ? cleanTag(dirs[dirs.length - 1]) : '';
    const album =
      parent && !sameName(parent, artist) && !sameName(parent, title) ? parent : '';
    return { artist, album, title };
  }

  if (dirs.length >= 2) {
    return {
      artist: cleanTag(dirs[dirs.length - 2]),
      album: cleanTag(dirs[dirs.length - 1]),
      title: base || item.title,
    };
  }
  if (dirs.length === 1) {
    return { artist: cleanTag(dirs[0]), album: '', title: base || item.title };
  }

  return { artist: '', album: '', title: base || item.title };
}

/** File-name only — ignores folder paths and album segments from directories. */
function guessSongMetaFileOnly(item: MediaItem): SongMeta {
  const rawBase = item.fileName.replace(/\.[a-z0-9]+$/i, '');
  const parts = rawBase.split(/\s+[-–—]\s+/).map(cleanTag).filter(Boolean);
  if (parts.length >= 2) {
    if (/^\d{1,3}$/.test(parts[0])) {
      return { artist: '', album: '', title: parts.slice(1).join(' - ').trim() };
    }
    return { artist: parts[0].trim(), album: '', title: parts.slice(1).join(' - ').trim() };
  }
  const base = cleanTag(rawBase);
  return { artist: '', album: '', title: base || item.title };
}

export function guessSongMeta(item: MediaItem, useAlbumInSearch?: boolean): SongMeta {
  const useAlbum = useAlbumInSearch ?? loadLyricsSettings().useAlbumInSearch;
  return useAlbum ? guessSongMetaWithAlbum(item) : guessSongMetaFileOnly(item);
}

// ----- LRCLIB ---------------------------------------------------------------

interface LrclibHit {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await window.api.fetchJson(url);
  if (!res.ok) {
    if (/^404\b/.test(res.error ?? '')) return null;
    throw new Error(res.error ?? 'Lyrics service did not respond.');
  }
  return (res.data ?? null) as T | null;
}

function toResult(hit: LrclibHit | null): LyricsResult | null {
  if (!hit || hit.instrumental) return null;
  if (hit.syncedLyrics) return { lrc: hit.syncedLyrics, source: 'lrclib' };
  if (hit.plainLyrics) return { plain: hit.plainLyrics, source: 'lrclib' };
  return null;
}

function albumScore(want: string, hit?: string): number {
  if (!want || !hit) return 0;
  const a = want.toLowerCase();
  const b = hit.toLowerCase();
  if (a === b) return 4;
  if (b.includes(a) || a.includes(b)) return 2;
  return 0;
}

function textScore(want: string, hit?: string): number {
  if (!want || !hit) return 0;
  const a = want.toLowerCase();
  const b = hit.toLowerCase();
  if (a === b) return 10;
  if (b.includes(a) || a.includes(b)) return 5;
  return 0;
}

function normalizeSearchTerm(s: string): string {
  return s
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\bfeat\.?\b|\bft\.?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueQueries(meta: SongMeta): string[] {
  const artist = normalizeSearchTerm(meta.artist);
  const album = normalizeSearchTerm(meta.album);
  const title = normalizeSearchTerm(meta.title);
  const variants = [
    [artist, title].filter(Boolean).join(' '),
    [title, artist].filter(Boolean).join(' '),
    title,
    [artist, album, title].filter(Boolean).join(' '),
  ];
  return [...new Set(variants.map((q) => q.trim()).filter(Boolean))];
}

function scoreHit(meta: SongMeta, hit: LrclibHit, durationSec: number): number {
  const durationDelta = durationSec > 0 && hit.duration ? Math.abs(hit.duration - durationSec) : 0;
  const durationScore = durationSec <= 0 || !hit.duration ? 0 : Math.max(0, 8 - durationDelta);
  return (
    Number(!!hit.syncedLyrics) * 30 +
    textScore(meta.title, hit.trackName) * 3 +
    textScore(meta.artist, hit.artistName) * 2 +
    albumScore(meta.album, hit.albumName) +
    durationScore
  );
}

/**
 * Look up lyrics on LRCLIB. Tries an exact match (artist + album + title +
 * duration) first, then a fuzzy search preferring album and duration matches.
 */
export async function fetchLyrics(meta: SongMeta, durationSec: number): Promise<LyricsResult | null> {
  const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

  if (meta.artist && meta.title) {
    const exactParams: Record<string, string>[] = [
      {
        artist_name: meta.artist,
        track_name: meta.title,
        duration: String(Math.round(durationSec)),
        ...(meta.album ? { album_name: meta.album } : {}),
      },
      {
        artist_name: meta.artist,
        track_name: meta.title,
        duration: String(Math.round(durationSec)),
      },
    ];
    for (const params of exactParams) {
      const exact = await getJson<LrclibHit>(`https://lrclib.net/api/get?${q(params)}`);
      const r = toResult(exact);
      if (r) return r;
    }
  }

  const hits: LrclibHit[] = [];
  for (const query of uniqueQueries(meta)) {
    const batch = (await getJson<LrclibHit[]>(`https://lrclib.net/api/search?${q({ q: query })}`)) ?? [];
    hits.push(...batch);
    if (batch.some((h) => h.syncedLyrics || h.plainLyrics)) break;
  }
  const byId = new Map<string, LrclibHit>();
  for (const hit of hits) {
    const key = [hit.trackName, hit.artistName, hit.albumName, hit.duration].join('\u0000');
    if (!byId.has(key)) byId.set(key, hit);
  }
  const scored = [...byId.values()]
    .filter((h) => h.syncedLyrics || h.plainLyrics)
    .sort((a, b) => {
      return scoreHit(meta, b, durationSec) - scoreHit(meta, a, durationSec);
    });
  const tol = meta.album ? 8 : 5;
  const best = scored.find((h) => durationSec <= 0 || Math.abs((h.duration ?? 0) - durationSec) <= tol) ?? scored[0];
  return toResult(best ?? null);
}
