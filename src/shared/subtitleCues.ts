// Shared subtitle/lyrics parsing (.srt / .vtt / .ass / .lrc), used by the
// Media player and the Music app.
//
// This lived at `renderer/subtitles.ts` until the EN→JA fusion job needed it: the
// fusion pipeline runs in the main process (it owns the persistent transcription
// queue and ffmpeg), and `main` may not import from `renderer` — the architecture
// audit calls that a layer violation, correctly. The module imports nothing and
// touches no DOM, so it was only ever in `renderer/` by accident of where it was
// first extracted from. `renderer/subtitles.ts` now re-exports this file, so every
// existing importer keeps its path.

export interface Cue {
  start: number;
  end: number;
  text: string;
  /**
   * ASS style name, when the cue came from an ASS/SSA file.
   *
   * Kept because it is the only reliable way to tell a spoken line from a sign,
   * a title card or a karaoke lyric: `cleanLine` strips the `{\pos(...)}`
   * override blocks that would otherwise reveal a sign, so by the time the text
   * is readable that evidence is gone. Optional and ignored by every existing
   * consumer; `subtitleFusionCore.ts` is what reads it.
   */
  style?: string;
}

export function toSeconds(stamp: string): number {
  const m = stamp.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return (m[1] ? parseInt(m[1], 10) : 0) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
}
export function cleanLine(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').trim();
}
export function parseAss(raw: string): Cue[] {
  const cues: Cue[] = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('Dialogue:')) continue;
    const f = line.slice('Dialogue:'.length).split(',');
    if (f.length < 10) continue;
    const text = cleanLine(f.slice(9).join(','));
    // Field 3 is the style name in the standard `Format:` order that every ASS
    // file in the wild uses. Trimmed and dropped when blank so consumers can
    // treat "no style" and "empty style" as the same thing.
    const style = f[3]?.trim();
    if (text) cues.push({ start: toSeconds(f[1]), end: toSeconds(f[2]), text, ...(style ? { style } : {}) });
  }
  return cues;
}
/** Kana — the script no Chinese line carries and almost every Japanese one does. */
const KANA = /[぀-ゟ゠-ヿ]/;

/**
 * A style is Japanese-bearing when most of its own lines carry kana.
 *
 * Majority rather than "any", and the margin is measured rather than guessed:
 * natural Japanese dialogue reaches for a particle nearly every line, so the
 * Japanese track of the release below runs at 98.9%, while its Chinese track and
 * its romaji karaoke both sit at 0.3%. Anything between those is not a case this
 * has to decide well.
 */
const JAPANESE_STYLE_SHARE = 0.5;

export interface StyleScriptSplit {
  cues: Cue[];
  /** How many cues were dropped, so a caller can report the number rather than a word. */
  dropped: number;
  /** Which styles went, in descending size — the evidence for the number. */
  styles: string[];
}

/**
 * Keep only the cues whose ASS style actually carries Japanese.
 *
 * A dual-language `.ass` is one file with two full subtitle tracks in it, and
 * nothing above this level can see that: the file passes a name check, it passes
 * `looksJapaneseSubtitle`, and it parses cleanly. Measured on the Route B release
 * this pipeline acquired on 2026-08-18 — 39 episodes of JoJo Part 5, tagged
 * `简繁外挂字幕` — the 667,437 parsed cues break down as **348,994 Chinese OP
 * karaoke with zero kana, 274,628 romaji karaoke with 826, 11,602 Chinese
 * dialogue with 38, and 11,168 Japanese dialogue with 11,049**. Mining the whole
 * file puts the Chinese half and 620k karaoke syllable-fragments into a Japanese
 * frequency table, and every count downstream reads as a success.
 *
 * The rule is the per-file `looksJapaneseSubtitle` policy at one finer grain:
 * judge a track by the script its own text uses, never by its name. `textjp` and
 * `textch` are a lucky pair; `JOJO5-op1-ch-2` and `JOJO5-op1-jp-2` are the same
 * lucky pair; a release that names its styles `Style1`/`Style2` is not, and that
 * is the case a name rule silently fails.
 *
 * Deliberately inert in three cases, because dropping everything is worse than
 * keeping too much: cues with no style at all (every `.srt`, `.vtt` and `.lrc`),
 * a file whose styles are all Japanese-bearing, and a file where none of them is
 * — the last is a file this function has no opinion about, not an empty one.
 */
export function keepJapaneseStyleCues(cues: Cue[]): StyleScriptSplit {
  const stats = new Map<string, { total: number; kana: number }>();
  for (const cue of cues) {
    if (!cue.style) continue;
    const row = stats.get(cue.style) ?? { total: 0, kana: 0 };
    row.total += 1;
    if (KANA.test(cue.text)) row.kana += 1;
    stats.set(cue.style, row);
  }
  if (!stats.size) return { cues, dropped: 0, styles: [] };

  const drop = new Set<string>();
  for (const [style, row] of stats) {
    if (row.kana / row.total < JAPANESE_STYLE_SHARE) drop.add(style);
  }
  // Every style failed, so the file is uniform in something that is not kana —
  // a Japanese track written mostly in kanji, or a release we misjudged. Either
  // way this function is the wrong place to refuse it, and `looksJapaneseSubtitle`
  // has already had its say on the file as a whole.
  if (drop.size === stats.size) return { cues, dropped: 0, styles: [] };
  if (!drop.size) return { cues, dropped: 0, styles: [] };

  const kept = cues.filter((cue) => !cue.style || !drop.has(cue.style));
  return {
    cues: kept,
    dropped: cues.length - kept.length,
    styles: [...drop].sort((a, b) => (stats.get(b)?.total ?? 0) - (stats.get(a)?.total ?? 0)),
  };
}

export function parseSrtVtt(raw: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of raw.split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i === -1) continue;
    const [a, b] = lines[i].split('-->');
    const text = cleanLine(lines.slice(i + 1).join('\n'));
    if (text) cues.push({ start: toSeconds(a), end: toSeconds(b), text });
  }
  return cues;
}
// LRC lyric files: `[mm:ss.xx] lyric line` (a line may carry several time tags).
// Each lyric shows until the next one starts — synced karaoke-style.
export function parseLrc(raw: string): Cue[] {
  const stamps: { t: number; text: string }[] = [];
  for (const line of raw.split('\n')) {
    const tags = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = cleanLine(line.replace(/\[[^\]]*\]/g, ''));
    if (!text) continue;
    for (const m of tags) {
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) / 1000 : 0;
      stamps.push({ t: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + frac, text });
    }
  }
  stamps.sort((a, b) => a.t - b.t);
  return stamps.map((s, i) => ({
    start: s.t,
    end: stamps[i + 1] ? stamps[i + 1].t : s.t + 10,
    text: s.text,
  }));
}

/**
 * Parse a track that is about to be *studied*, not merely displayed.
 *
 * The composition is `parseSubtitles` + `keepJapaneseStyleCues`, in one place,
 * because a second copy is how the player and the miner start disagreeing about
 * what a file contains. The harvest panel does the same two steps per file for
 * the same release; this is that pair named once for callers that hold a whole
 * file's text at once.
 *
 * Deliberately NOT the default parse. A translation track is loaded on purpose
 * and must arrive whole — `MediaContent`'s secondary-subtitle slot is exactly
 * that, and it stays on `parseSubtitles`. The split is by role: the primary
 * track is the Japanese one the study tools read, the secondary is the one the
 * user asked to see in another language.
 */
export function parseStudySubtitles(raw: string): StyleScriptSplit {
  return keepJapaneseStyleCues(parseSubtitles(raw));
}

export function parseSubtitles(raw: string): Cue[] {
  // eslint-disable-next-line no-irregular-whitespace -- U+FEFF is the BOM this line exists to strip from subtitle files.
  const clean = raw.replace(/^﻿/, '').replace(/\r/g, '');
  let cues: Cue[];
  if (/^\s*(?:\[Script Info\]|Dialogue:)/m.test(clean)) cues = parseAss(clean);
  else if (/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/.test(clean) && !clean.includes('-->')) {
    cues = parseLrc(clean);
  } else cues = parseSrtVtt(clean);
  return cues.sort((x, y) => x.start - y.start);
}
