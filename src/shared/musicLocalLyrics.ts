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

export type LocalLyricsSource = 'sidecar' | 'embedded';

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
