/**
 * Lyrics that travel with the audio file itself, ahead of any network lookup.
 *
 * Two places, both common in a real music folder and both ignored before: the Music
 * app only knew LRCLIB and a manually picked .lrc.
 *  1. A sidecar `.lrc` with the same base name next to the audio file
 *     (`Song.mp3` + `Song.lrc`) — what every lyrics tagger and karaoke tool writes.
 *  2. Lyrics embedded in the file's tags — ID3v2 `USLT`, Vorbis/FLAC `LYRICS` /
 *     `UNSYNCEDLYRICS`, MP4 `©lyr`. Read with ffmpeg, the tag reader the app already
 *     ships for cover art; its `ffmetadata` dump names them `lyrics`, `lyrics-eng`,
 *     `LYRICS`, `UNSYNCEDLYRICS` and so on.
 *
 * Either may hold LRC text with timestamps (then the Music app shows synced karaoke
 * lyrics) or plain lines. This module is pure — the file access is in
 * `main/musicLyricsFile.ts`.
 */

/** `folder`: a .lrc matched by name or [ti:] tag in a Lyrics folder or the user's lyrics folder. */
export type LocalLyricsSource = 'sidecar' | 'embedded' | 'folder';

export interface LocalLyrics {
  text: string;
  source: LocalLyricsSource;
}

/** Largest lyrics text accepted (a whole album's worth of LRC is well under this). */
export const LOCAL_LYRICS_MAX_CHARS = 200_000;

/** Candidate sidecar file names for an audio file name, most specific first. */
export function sidecarLrcNames(audioFileName: string): string[] {
  const dot = audioFileName.lastIndexOf('.');
  const base = dot > 0 ? audioFileName.slice(0, dot) : audioFileName;
  // `Song.mp3.lrc` is what a few taggers write; `Song.lrc` is the convention.
  return [`${base}.lrc`, `${audioFileName}.lrc`];
}

/** Strip a UTF-8 BOM and normalise newlines. */
export function normaliseLyricsText(raw: string): string {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return text.replace(/\r\n?/g, '\n').trim();
}

/**
 * Parse ffmpeg's `-f ffmetadata` output into key/value pairs.
 *
 * The format: a `;FFMETADATA1` header, `key=value` lines, `[SECTION]` headers for
 * streams/chapters (whose keys are ignored — only global tags carry lyrics), and
 * backslash escapes for `=`, `;`, `#`, `\` and newline. A value that contains a
 * newline therefore continues on the next physical line after a trailing backslash,
 * which is exactly how multi-line lyrics arrive.
 */
export function parseFfmetadata(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let inGlobal = true;
  let i = 0;
  while (i < lines.length) {
    let line = lines[i++];
    if (line.startsWith(';') || line.startsWith('#')) continue;
    if (/^\[[^\]]*\]\s*$/.test(line)) {
      inGlobal = false;
      continue;
    }
    // Join continuation lines: an odd number of trailing backslashes escapes the newline.
    while (/(^|[^\\])(\\\\)*\\$/.test(line) && i < lines.length) {
      line = `${line.slice(0, -1)}\n${lines[i++]}`;
    }
    if (!inGlobal) continue;
    // The key ends at the first unescaped '='.
    let eq = -1;
    for (let k = 0; k < line.length; k++) {
      if (line[k] === '\\') {
        k++;
        continue;
      }
      if (line[k] === '=') {
        eq = k;
        break;
      }
    }
    if (eq <= 0) continue;
    const unescape = (s: string) => s.replace(/\\(.)/gs, '$1');
    out[unescape(line.slice(0, eq))] = unescape(line.slice(eq + 1));
  }
  return out;
}

/** Tag names that hold lyrics, compared case-insensitively. */
const LYRICS_KEY = /^(lyrics|unsyncedlyrics|unsynced lyrics|uslt|syncedlyrics|©lyr)([-_:].*)?$/i;

/**
 * The embedded lyrics among parsed tags, or null. Timestamped (LRC) text wins over
 * plain text when a file carries both, because it is strictly more useful.
 */
export function pickLyricsTag(tags: Record<string, string>): string | null {
  const values = Object.entries(tags)
    .filter(([k, v]) => LYRICS_KEY.test(k.trim()) && v.trim().length > 0)
    .map(([, v]) => normaliseLyricsText(v));
  if (values.length === 0) return null;
  const synced = values.find((v) => /\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(v));
  return (synced ?? values[0]).slice(0, LOCAL_LYRICS_MAX_CHARS);
}

// ----- offline .lrc folder matching ------------------------------------------

/**
 * A comparable key for a song or .lrc name: NFKC (full-width → half-width), lower
 * case, without the extension, bracketed tags (`(Official Video)`, `[abc123]`,
 * `【MV】`), a leading track number (`01 - `, `01. `, `1-03 `) and every space and
 * punctuation mark. Japanese text survives intact.
 */
export function lyricMatchKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.(lrc|txt|mp3|m4a|aac|flac|wav|ogg|opus|wma|alac)$/i, '')
    .replace(/[[(（【〔][^\])）】〕]*[\])）】〕]/g, ' ')
    .replace(/^\s*(?:\d{1,2}[-.])?\d{1,3}(?:\s*[-._)]\s*|\s+)/, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** The `[ti:]` and `[ar:]` tags at the top of an LRC file, when present. */
export function readLrcHeader(text: string): { title?: string; artist?: string } {
  const out: { title?: string; artist?: string } = {};
  const head = text.slice(0, 4096);
  const ti = /^\s*\[ti:\s*([^\]\n]*?)\s*\]\s*$/im.exec(head);
  const ar = /^\s*\[ar:\s*([^\]\n]*?)\s*\]\s*$/im.exec(head);
  if (ti?.[1]) out.title = ti[1];
  if (ar?.[1]) out.artist = ar[1];
  return out;
}

export interface LrcCandidate {
  /** A path or name the caller can open again; returned as-is on a match. */
  file: string;
  /** The file's base name, with or without `.lrc`. */
  name: string;
  /** From the file's `[ti:]` / `[ar:]` tags. */
  title?: string;
  artist?: string;
}

export interface LyricSongHint {
  /** The audio file's name, e.g. `03 - 夜に駆ける.flac`. */
  fileName: string;
  title?: string;
  artist?: string;
}

/** `Artist - Title` → [`Artist`, `Title`]; a name with no separator is all title. */
function splitArtistTitle(name: string): { artist: string; title: string } {
  const base = name.replace(/\.[a-z0-9]{2,4}$/i, '');
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0], title: parts[parts.length - 1] };
  // `アーティスト「曲名」` — the usual Japanese layout of a release name.
  const jp = /^(.+?)\s*[「『]([^」』]+)[」』]/.exec(base);
  if (jp) return { artist: jp[1], title: jp[2] };
  return { artist: '', title: base };
}

/**
 * Which .lrc in a folder belongs to a song, or null. In order:
 *  1. the same name, compared by `lyricMatchKey` (`01 - Song.flac` ↔ `Song.lrc`);
 *  2. artist AND title agree (from the names or the `[ti:]`/`[ar:]` tags);
 *  3. the title alone, but only when exactly one file has it — two songs called
 *     "Intro" must not share lyrics, so an ambiguous title matches nothing.
 */
export function pickLrcCandidate(song: LyricSongHint, candidates: readonly LrcCandidate[]): LrcCandidate | null {
  if (candidates.length === 0) return null;
  const nameKey = lyricMatchKey(song.fileName);
  if (nameKey) {
    const same = candidates.find((c) => lyricMatchKey(c.name) === nameKey);
    if (same) return same;
  }
  const fromName = splitArtistTitle(song.fileName);
  const titleKeys = new Set([lyricMatchKey(fromName.title), lyricMatchKey(song.title ?? '')].filter(Boolean));
  // A tag title like "Artist - Title" (MediaItem.title for such files) contributes its title half too.
  if (song.title) titleKeys.add(lyricMatchKey(splitArtistTitle(song.title).title));
  titleKeys.delete('');
  const artistKeys = new Set([lyricMatchKey(fromName.artist), lyricMatchKey(song.artist ?? '')].filter(Boolean));
  if (titleKeys.size === 0) return null;

  const described = candidates.map((c) => {
    const parts = splitArtistTitle(c.name);
    const titles = new Set([lyricMatchKey(parts.title), lyricMatchKey(c.title ?? '')].filter(Boolean));
    const artists = new Set([lyricMatchKey(parts.artist), lyricMatchKey(c.artist ?? '')].filter(Boolean));
    return { c, titles, artists };
  });
  const titleHit = (d: (typeof described)[number]) => [...d.titles].some((k) => titleKeys.has(k));
  const artistHit = (d: (typeof described)[number]) => [...d.artists].some((k) => artistKeys.has(k));

  const both = described.filter((d) => titleHit(d) && artistHit(d));
  if (both.length >= 1) return both[0].c;
  const titleOnly = described.filter(titleHit);
  // A file naming a DIFFERENT artist is someone else's song with the same title.
  const compatible = titleOnly.filter((d) => d.artists.size === 0 || artistKeys.size === 0);
  if (compatible.length === 1) return compatible[0].c;
  return null;
}
