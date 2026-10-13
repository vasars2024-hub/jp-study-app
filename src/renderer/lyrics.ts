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
 * Words a download or rip appends after the title that no lyrics database files the
 * song under: `Song Official Music Video`, `Song MV`, `Song (TV size)` (the brackets
 * are already gone by now), `Song full ver`.
 */
const TRAILING_NOISE =
  /\s+(?:official\s+(?:music\s+)?(?:video|audio|mv|lyric\s+video)|music\s+video|lyrics?\s+video|lyrics?|audio|video|mv|pv|hd|hq|4k|full\s+ver(?:sion|\.)?|tv\s*size|short\s+ver(?:sion|\.)?|remaster(?:ed)?)\s*$/i;

function stripNoise(title: string): string {
  let out = title.trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(TRAILING_NOISE, '').trim();
    if (next === out || !next) break;
    out = next;
  }
  return out;
}

/** `アーティスト「曲名」…` / `アーティスト『曲名』…` → artist + title, the usual Japanese release name. */
function splitJapaneseQuoted(raw: string): { artist: string; title: string } | null {
  const m = /^(.+?)\s*[「『]([^」』]+)[」』]/.exec(raw);
  if (!m) return null;
  const artist = cleanTag(m[1]);
  const title = cleanTag(m[2]);
  return artist && title ? { artist, title } : null;
}

/** Tags the library knows (Media Hub edits) beat a guess from the path. */
function withLibraryTags(meta: SongMeta, item: MediaItem, useAlbum: boolean): SongMeta {
  const artist = item.artist?.trim() || meta.artist;
  const album = useAlbum ? item.album?.trim() || meta.album : '';
  return { artist, album, title: stripNoise(meta.title) || meta.title };
}

/**
 * Derive artist / album / title from the file name and its folder path.
 * Handles "Artist - Title.mp3", "Artist - Album - Title.mp3", "Artist「Title」.mp3",
 * and folder layouts like ".../Artist/Album/01 - Title.flac".
 */
function guessSongMetaWithAlbum(item: MediaItem): SongMeta {
  const dirs = splitPath(item.path).slice(0, -1);
  const rawBase = item.fileName.replace(/\.[a-z0-9]+$/i, '');
  const base = cleanTag(rawBase);

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
  const quoted = splitJapaneseQuoted(rawBase);
  if (quoted) {
    const parent = dirs.length ? cleanTag(dirs[dirs.length - 1]) : '';
    const album = parent && !sameName(parent, quoted.artist) && !sameName(parent, quoted.title) ? parent : '';
    return { ...quoted, album };
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
  const quoted = splitJapaneseQuoted(rawBase);
  if (quoted) return { ...quoted, album: '' };
  const base = cleanTag(rawBase);
  return { artist: '', album: '', title: base || item.title };
}

export function guessSongMeta(item: MediaItem, useAlbumInSearch?: boolean): SongMeta {
  const useAlbum = useAlbumInSearch ?? loadLyricsSettings().useAlbumInSearch;
  const guessed = useAlbum ? guessSongMetaWithAlbum(item) : guessSongMetaFileOnly(item);
  return withLibraryTags(guessed, item, useAlbum);
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

/**
 * A comparable form of a title or name: NFKC (full-width Ｌｉｓａ → Lisa, half-width
 * ｶﾀｶﾅ → カタカナ), lower case, brackets and "feat." credits out, and no spaces or
 * punctuation — `夜に駆ける`, `夜に駆ける (YOASOBI)` and `夜に駆ける！` are one key.
 */
export function lyricsMatchKey(s: string | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[[(（【〔][^\])）】〕]*[\])）】〕]/g, ' ')
    .replace(/\s(?:feat|ft)\.?\s.*$/i, ' ')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function keyScore(want: string, hit: string | undefined, exact: number, partial: number): number {
  const a = lyricsMatchKey(want);
  const b = lyricsMatchKey(hit);
  if (!a || !b) return 0;
  if (a === b) return exact;
  // A short key inside a long one ("ai" in "aikotoba") is chance, not a match.
  const shorter = Math.min(a.length, b.length);
  if (shorter >= 2 && (b.includes(a) || a.includes(b)) && shorter * 2 >= Math.max(a.length, b.length)) return partial;
  return 0;
}

const albumScore = (want: string, hit?: string): number => keyScore(want, hit, 4, 2);
const textScore = (want: string, hit?: string): number => keyScore(want, hit, 10, 5);

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

/** Seconds a hit's length may differ from the file and still be the same recording. */
const DURATION_TOLERANCE_SEC = 8;
/** With the artist confirmed, a radio edit or a live cut may run this much longer or shorter. */
const DURATION_TOLERANCE_ARTIST_SEC = 20;

/**
 * Whether a fuzzy search hit is this song, rather than the best of a bad batch.
 *
 * It used to be "the best scored hit, else any hit at all", so a search by title
 * alone would happily return another artist's song of the same name, or a remix
 * twice as long: wrong lyrics are worse than none, because the learner studies them.
 * Now the title must agree, and so must the length (or, failing that, the artist).
 */
export function acceptLyricsHit(meta: SongMeta, hit: LrclibHit, durationSec: number): boolean {
  if (!hit.syncedLyrics && !hit.plainLyrics) return false;
  if (textScore(meta.title, hit.trackName) === 0) return false;
  const artistOk = !!meta.artist && textScore(meta.artist, hit.artistName) > 0;
  const artistContradicts = !!meta.artist && !!hit.artistName && !artistOk;
  const known = durationSec > 0 && !!hit.duration;
  const delta = known ? Math.abs((hit.duration ?? 0) - durationSec) : 0;
  if (known && delta > (artistOk ? DURATION_TOLERANCE_ARTIST_SEC : DURATION_TOLERANCE_SEC)) return false;
  // A different artist is only believable when the length agrees closely (a cover
  // tagged under the original's name, a romanised artist name we cannot match).
  if (artistContradicts && (!known || delta > 2)) return false;
  return true;
}

/**
 * Look up lyrics on LRCLIB. Tries an exact match (artist + album + title +
 * duration) first, then a structured search (track + artist), then free-text
 * searches, and accepts only a hit that is plausibly this song (`acceptLyricsHit`).
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

  const searches: string[] = [];
  const title = normalizeSearchTerm(meta.title);
  const artist = normalizeSearchTerm(meta.artist);
  if (title) {
    searches.push(q(artist ? { track_name: title, artist_name: artist } : { track_name: title }));
  }
  for (const query of uniqueQueries(meta)) searches.push(q({ q: query }));

  const seen = new Set<string>();
  const accepted: LrclibHit[] = [];
  for (const params of [...new Set(searches)]) {
    const batch = (await getJson<LrclibHit[]>(`https://lrclib.net/api/search?${params}`)) ?? [];
    for (const hit of Array.isArray(batch) ? batch : []) {
      const key = [hit.trackName, hit.artistName, hit.albumName, hit.duration].join('\u0000');
      if (seen.has(key)) continue;
      seen.add(key);
      if (acceptLyricsHit(meta, hit, durationSec)) accepted.push(hit);
    }
    // A synced, plausible hit ends the search; a plain one keeps looking for a synced one.
    if (accepted.some((h) => h.syncedLyrics)) break;
  }
  accepted.sort((a, b) => scoreHit(meta, b, durationSec) - scoreHit(meta, a, durationSec));
  return toResult(accepted[0] ?? null);
}
