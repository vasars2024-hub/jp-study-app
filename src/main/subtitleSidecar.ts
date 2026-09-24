/**
 * A sidecar subtitle for one language, by the video's path.
 *
 * `media:subtitleForPath` answers "the study track" for a file; the player's
 * second line wants a *specific* language — English for a Japanese video — and
 * a file the library has never seen has no database row to find it through.
 * The renderer cannot read the disk itself, so this is the one door: every
 * `<stem>.<tag>.<ext>` beside the video whose tag names the language, in the
 * spellings releases actually use (`en`, `eng`, `en-US`, `English`), creator
 * tracks before auto-generated ones.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SubtitlePick } from '../shared/types';
import { SUBTITLE_EXT } from '../shared/mediaKind';

/** Tags a release names a language by, lower-cased. ISO 639-1 first, then 639-2 and the words. */
const LANGUAGE_TAGS: Record<string, readonly string[]> = {
  en: ['en', 'eng', 'english'],
  ja: ['ja', 'jp', 'jpn', 'japanese'],
  zh: ['zh', 'chi', 'zho', 'chs', 'cht', 'sc', 'tc', 'chinese'],
  ru: ['ru', 'rus', 'russian'],
  ko: ['ko', 'kor', 'korean'],
  es: ['es', 'spa', 'spanish'],
  fr: ['fr', 'fre', 'fra', 'french'],
  de: ['de', 'ger', 'deu', 'german'],
};

/** The tags a language may be written as. An unknown code matches itself only. */
export function sidecarTagsForLanguage(lang: string): readonly string[] {
  const code = lang.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return LANGUAGE_TAGS[code] ?? (code ? [code] : []);
}

/**
 * Whether a sidecar's middle part (`en`, `en.forced`, `eng.sdh`, `en-US`,
 * `a.en` for yt-dlp's auto captions) names the language. Every dot-separated
 * segment is tried, and a regional suffix (`en-US`, `zh-Hans`) is ignored.
 */
export function sidecarTagMatches(tag: string, lang: string): boolean {
  const wanted = new Set(sidecarTagsForLanguage(lang));
  if (!wanted.size) return false;
  return tag
    .toLowerCase()
    .split('.')
    .some((segment) => wanted.has(segment) || wanted.has(segment.split(/[-_]/)[0] ?? ''));
}

/** Auto-generated (yt-dlp `a.en`, `orig`, `auto`) sorts after a creator track. */
function autoPenalty(tag: string): number {
  return /(^|[.-])a\.[a-z-]+$|orig|auto/i.test(tag) ? 1 : 0;
}

/** Text formats the player parses best first; `.lrc` is lyrics, never a second line. */
const FORMAT_ORDER = ['srt', 'vtt', 'ass', 'ssa'];

/**
 * The sidecar for `lang` beside `mediaFile`, or null. Same-stem files only —
 * `Show - 02.en.srt` must never be offered for `Show - 01.mkv`.
 */
export function pickSidecarSubtitleForLanguage(mediaFile: string, lang: string): SubtitlePick | null {
  if (typeof mediaFile !== 'string' || !mediaFile.trim() || typeof lang !== 'string' || !lang.trim()) return null;
  const dir = path.dirname(mediaFile);
  const stem = path.basename(mediaFile, path.extname(mediaFile));
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const stemLower = `${stem.toLowerCase()}.`;
  const candidates = entries
    .map((name) => {
      const ext = path.extname(name).slice(1).toLowerCase();
      if (!FORMAT_ORDER.includes(ext) || !SUBTITLE_EXT.has(`.${ext}`)) return null;
      if (!name.toLowerCase().startsWith(stemLower)) return null;
      const tag = name.slice(stem.length + 1, -(ext.length + 1));
      if (!tag || !sidecarTagMatches(tag, lang)) return null;
      return { name, rank: autoPenalty(tag) * 10 + FORMAT_ORDER.indexOf(ext) };
    })
    .filter((entry): entry is { name: string; rank: number } => entry !== null)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  for (const candidate of candidates) {
    try {
      return { name: candidate.name, text: fs.readFileSync(path.join(dir, candidate.name), 'utf8') };
    } catch {
      /* unreadable: try the next one */
    }
  }
  return null;
}
