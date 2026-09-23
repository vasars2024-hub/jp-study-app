/**
 * The two subtitle sources that need no network: streams inside the container,
 * and files already sitting next to the video.
 *
 * These run before any provider is asked, for three reasons that all point the
 * same way — they are instant, they are free, and they are guaranteed to be timed
 * against the exact file the user has. A downloaded subtitle is a guess about
 * which release you own; an embedded one is not a guess.
 *
 * ffprobe would be the natural tool for enumerating streams, but it is not a
 * dependency and adding one would mean touching root config (CLAUDE.md scope
 * rule). `ffmpeg -i <file>` with no output prints the same stream summary to
 * stderr and exits non-zero by design, so the exit code is ignored and the banner
 * is parsed.
 */

import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import type { SubtitleRecordFormat } from '../shared/subtitleRecord';

const ffmpegPath = ffmpegStatic as unknown as string;

/**
 * Every subtitle container this app can read as text. Exported because the drop
 * importer's attach route has to answer the same question and a second copy of
 * this list is the "second opinion" defect the file router exists to remove.
 */
export const READABLE_EXTENSIONS: SubtitleRecordFormat[] = ['srt', 'ass', 'ssa', 'vtt', 'lrc'];

/** Subtitle codecs worth extracting. Bitmap formats are deliberately excluded. */
const TEXT_SUBTITLE_CODECS = /^(subrip|srt|ass|ssa|mov_text|webvtt|text)$/i;

export interface EmbeddedSubtitleStream {
  /** Index within the file's subtitle streams, for `-map 0:s:<n>`. */
  subtitleIndex: number;
  /** Absolute stream index as ffmpeg reports it, for diagnostics. */
  streamIndex: number;
  /** Three-letter or two-letter tag as tagged in the container, lowercased. */
  language: string | null;
  codec: string;
  title: string | null;
  forced: boolean;
  hearingImpaired: boolean;
}

function runFfmpeg(args: string[], timeoutMs = 30_000): Promise<{ code: number | null; stderr: string; stdout: Buffer }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    const out: Buffer[] = [];
    let stderr = '';
    let settled = false;
    const done = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stderr, stdout: Buffer.concat(out) });
    };
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
      done(null);
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      // A text subtitle track for a 24-minute episode is tens of kilobytes; the
      // cap is generous but stops a malformed stream exhausting memory.
      if (out.reduce((n, c) => n + c.length, 0) < 32_000_000) out.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 256_000) stderr += chunk.toString();
    });
    proc.on('error', () => done(null));
    proc.on('close', done);
  });
}

/**
 * ffmpeg's stream lines look like:
 *   Stream #0:2(jpn): Subtitle: subrip (default)
 *   Stream #0:3: Subtitle: ass, 0 kb/s (forced)
 * The language tag is optional, and the disposition flags trail in parentheses.
 */
const STREAM_LINE = /Stream #(\d+):(\d+)(?:\[[^\]]*\])?(?:\(([^)]*)\))?:\s*Subtitle:\s*([a-z0-9_]+)([^\n]*)/gi;
/** `      title           : English (signs)` under a stream's metadata block. */
const TITLE_LINE = /^\s+title\s*:\s*(.+)$/im;

/** Parses ffmpeg's banner into the text subtitle streams it lists. */
export function parseSubtitleStreams(stderr: string): EmbeddedSubtitleStream[] {
  const streams: EmbeddedSubtitleStream[] = [];
  let subtitleIndex = 0;

  for (const match of stderr.matchAll(STREAM_LINE)) {
    const streamIndex = Number(match[2]);
    const language = match[3]?.trim().toLowerCase() || null;
    const codec = match[4].toLowerCase();
    const trailer = match[5] ?? '';

    // Every subtitle stream advances the `-map 0:s:<n>` counter, including ones
    // we decline to extract — skipping it here would map the wrong track.
    const index = subtitleIndex;
    subtitleIndex += 1;
    if (!TEXT_SUBTITLE_CODECS.test(codec)) continue;

    // The metadata block belonging to this stream: everything up to the next
    // section header. `Chapter #` has to end it too — a chaptered BD rip lists
    // "title : Opening / Main / Ending" under its chapters, and reading one of
    // those as a subtitle track's name would mislabel the track.
    const tail = stderr.slice((match.index ?? 0) + match[0].length);
    const block = tail.split(/Stream #|Chapter #|^\s*(?:Input|Output) #/m)[0] ?? '';
    const title = TITLE_LINE.exec(block)?.[1]?.trim() ?? null;

    streams.push({
      subtitleIndex: index,
      streamIndex,
      language,
      codec,
      title,
      forced: /\bforced\b/i.test(trailer) || /\bforced\b/i.test(title ?? ''),
      hearingImpaired: /\bhearing_impaired\b/i.test(trailer) || /\b(sdh|cc)\b/i.test(title ?? ''),
    });
  }
  return streams;
}

/** `Stream #0:1(jpn): Audio: flac, 48000 Hz, stereo` — the language tag is optional. */
const AUDIO_STREAM_LINE = /Stream #\d+:\d+(?:\[[^\]]*\])?(?:\(([^)]*)\))?:\s*Audio:/gi;

/**
 * The language tag of every audio stream, in container order; `null` for an
 * untagged stream. Read from the same ffmpeg banner as the subtitle streams.
 */
export function parseAudioStreamLanguages(stderr: string): (string | null)[] {
  const out: (string | null)[] = [];
  for (const match of stderr.matchAll(AUDIO_STREAM_LINE)) {
    out.push(normalizeStreamLanguage(match[1]));
  }
  return out;
}

/** Audio stream languages for a file; empty when it cannot be probed. */
export async function listAudioStreamLanguages(file: string): Promise<(string | null)[]> {
  if (!file || !fs.existsSync(file)) return [];
  const { stderr } = await runFfmpeg(['-hide_banner', '-i', file]);
  return parseAudioStreamLanguages(stderr);
}

/** Enumerates the text subtitle streams inside a media container. */
export async function listEmbeddedSubtitleStreams(file: string): Promise<EmbeddedSubtitleStream[]> {
  if (!file || !fs.existsSync(file)) return [];
  // Exits non-zero ("At least one output file must be specified") by design.
  const { stderr } = await runFfmpeg(['-hide_banner', '-i', file]);
  return parseSubtitleStreams(stderr);
}

/**
 * Extracts one embedded stream as SRT text.
 *
 * Converted to SRT rather than kept as ASS on purpose: the renderer's parser reads
 * both, but ASS carries positioning and karaoke tags that the study overlay would
 * have to strip anyway, and SRT is what every downstream consumer here expects.
 * Styling is a fair trade for one predictable format.
 */
export async function extractEmbeddedSubtitle(file: string, subtitleIndex: number): Promise<string | null> {
  const { code, stdout } = await runFfmpeg([
    '-hide_banner', '-loglevel', 'error',
    '-i', file,
    '-map', `0:s:${subtitleIndex}`,
    '-c:s', 'srt', '-f', 'srt', 'pipe:1',
  ], 60_000);
  if (code !== 0 || stdout.length === 0) return null;
  const text = stdout.toString('utf-8').trim();
  // A track that yields no cues is a track that is not worth a record.
  return text.length > 0 && /\d+:\d{2}:\d{2}/.test(text) ? text : null;
}

/** Normalizes container language tags (`jpn`, `ja-JP`) to the app's short form. */
export function normalizeStreamLanguage(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'und' || value === 'unknown') return null;
  const three: Record<string, string> = {
    jpn: 'ja', eng: 'en', chi: 'zh', zho: 'zh', kor: 'ko', rus: 'ru',
    spa: 'es', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de', por: 'pt', ita: 'it',
  };
  if (three[value]) return three[value];
  // `ja-JP` / `ja_jp` collapse to `ja`; `zh-hans` is kept, being a real distinction.
  const [base, region] = value.split(/[-_]/);
  if (base === 'zh' && (region === 'hans' || region === 'hant')) return `zh-${region}`;
  return base.length === 2 ? base : base.slice(0, 2) || null;
}

export interface SidecarSubtitle {
  /** Absolute path; sidecar files are read in place, never copied. */
  path: string;
  fileName: string;
  format: SubtitleRecordFormat;
  language: string | null;
  forced: boolean;
  hearingImpaired: boolean;
}

/**
 * Language guessed from a sidecar file name.
 *
 * Conventions in the wild: `Episode.ja.srt`, `Episode.jpn.ass`,
 * `Episode.Japanese.srt`, `Episode_ja_JP.vtt`. Only the segments *after* the
 * media stem are considered, so a show called "English Teacher" is not read as
 * an English subtitle.
 */
export function guessSidecarLanguage(fileName: string, mediaStem: string): string | null {
  const base = fileName.slice(0, fileName.lastIndexOf('.'));
  const suffix = base.toLowerCase().startsWith(mediaStem.toLowerCase())
    ? base.slice(mediaStem.length)
    : base;
  const words: Record<string, string> = {
    japanese: 'ja', nihongo: 'ja', english: 'en', chinese: 'zh', korean: 'ko',
    russian: 'ru', spanish: 'es', french: 'fr', german: 'de',
  };
  for (const [word, tag] of Object.entries(words)) {
    if (new RegExp(`(^|[._\\-\\s])${word}([._\\-\\s]|$)`, 'i').test(suffix)) return tag;
  }
  for (const segment of suffix.split(/[._\-\s]+/).filter(Boolean)) {
    const normalized = normalizeStreamLanguage(segment);
    // Only trust a token that looks like a language tag, not any two letters.
    if (normalized && /^([a-z]{2,3})([-_][a-z]{2,4})?$/i.test(segment)) return normalized;
  }
  return null;
}

/** Subtitle files sitting beside the media file that share its stem. */
export function findSidecarSubtitles(mediaFile: string): SidecarSubtitle[] {
  const dir = path.dirname(mediaFile);
  const stem = path.basename(mediaFile, path.extname(mediaFile));
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const out: SidecarSubtitle[] = [];
  for (const name of entries) {
    const extension = path.extname(name).slice(1).toLowerCase() as SubtitleRecordFormat;
    if (!READABLE_EXTENSIONS.includes(extension)) continue;
    // Same stem only. A directory of many episodes must not attach episode 1's
    // subtitle to every one of them.
    if (!name.toLowerCase().startsWith(stem.toLowerCase())) continue;
    const lower = name.toLowerCase();
    out.push({
      path: path.join(dir, name),
      fileName: name,
      format: extension,
      language: guessSidecarLanguage(name, stem),
      forced: /\bforced\b/.test(lower),
      hearingImpaired: /\b(sdh|cc|hi)\b/.test(lower),
    });
  }
  return out;
}
