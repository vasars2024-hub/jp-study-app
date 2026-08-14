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
