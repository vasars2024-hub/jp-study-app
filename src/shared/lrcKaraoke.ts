/**
 * Karaoke timing on top of `parseLrc`: which line is being sung, which word of it,
 * and which lines are a translation riding along with another.
 *
 * `parseLrc` (subtitleCues.ts) turns an LRC sheet into cues and strips the
 * enhanced-LRC word times (`<mm:ss.xx>`) from the text, because every subtitle
 * consumer wants plain text. The Music pane wants those times back to light a
 * line word by word, so this module reads them again from the same raw text,
 * with the same `[offset:]` rule, and lines them up with the parsed cues by
 * start time. Pure: no DOM, no React, no storage.
 */
import { cleanLine, decodeSubtitleEntities, type Cue } from './subtitleCues';
import { shiftCues } from './subtitleSync';

export interface LyricWord {
  text: string;
  /** Seconds, after the sheet's `[offset:]` and before any per-song nudge. */
  start: number;
  end: number;
}

/** Index of the line being sung, and the anchor the view stays on between lines. */
export interface LyricPosition {
  /** The line sung right now (`start <= t < end`), or -1 in a break / before the first line. */
  sung: number;
  /** The last line that has started (the first of its group), or -1 before the first line. */
  anchor: number;
}

const LRC_TIME = String.raw`(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?`;
const LEADING = new RegExp(String.raw`^\s*((?:\[${LRC_TIME}\]\s*)+)`);
const WORD_TAG = new RegExp(String.raw`<${LRC_TIME}>|\[${LRC_TIME}\]`, 'g');
const OFFSET = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/i;
/** Two starts this close are the same instant (float noise from different paths). */
const SAME_START = 0.0005;

function secs(min: string, sec: string, frac: string | undefined): number {
  return parseInt(min, 10) * 60 + parseInt(sec, 10) + (frac ? parseInt(frac.padEnd(3, '0'), 10) / 1000 : 0);
}

/** One word segment's visible text: markup and entities out, one boundary space kept. */
function wordText(segment: string): string {
  const core = cleanLine(segment);
  if (!core) return '';
  const lead = /^\s/.test(decodeSubtitleEntities(segment)) ? ' ' : '';
  const tail = /\s$/.test(segment) ? ' ' : '';
  return `${lead}${core}${tail}`;
}

interface WordLine {
  start: number;
  text: string;
  words: Array<{ text: string; start: number }>;
  closing: number | null;
}

/**
 * Every timed line of an LRC sheet that carries word times, at its (offset) start.
 * A line repeated under several leading tags yields one entry per tag.
 */
export function parseLrcWordLines(raw: string): WordLine[] {
  const out: WordLine[] = [];
  let offsetSec = 0;
  const text = raw.split('﻿').join('').replace(/\r\n?/g, '\n');
  const pending: Array<Omit<WordLine, 'start'> & { times: number[] }> = [];
  for (const line of text.split('\n')) {
    const offset = OFFSET.exec(line);
    if (offset) {
      offsetSec = parseInt(offset[1], 10) / 1000;
      continue;
    }
    const lead = LEADING.exec(line);
    if (!lead) continue;
    const times = [...lead[1].matchAll(new RegExp(LRC_TIME, 'g'))].map((m) => secs(m[1], m[2], m[3]));
    const body = line.slice(lead[0].length);
    const tags = [...body.matchAll(WORD_TAG)];
    if (tags.length === 0) continue;
    const first = Math.min(...times);
    const words: Array<{ text: string; start: number }> = [];
    let closing: number | null = null;
    // Text before the first word time is sung from the line's own start.
    const before = wordText(body.slice(0, tags[0].index ?? 0));
    if (before) words.push({ text: before, start: first });
    tags.forEach((m, i) => {
      const at = m[1] !== undefined ? secs(m[1], m[2], m[3]) : secs(m[4], m[5], m[6]);
      const from = (m.index ?? 0) + m[0].length;
      const to = i + 1 < tags.length ? tags[i + 1].index ?? body.length : body.length;
      const seg = wordText(body.slice(from, to));
      if (seg) words.push({ text: seg, start: at });
      else if (i === tags.length - 1) closing = at;
    });
    if (words.length === 0) continue;
    const joined = cleanLine(body.replace(WORD_TAG, ''));
    pending.push({ times, text: joined, words, closing });
  }
  for (const p of pending) {
    const first = Math.min(...p.times);
    for (const t of p.times) {
      // A repeated line (`[00:10][01:40]`) shifts its word times with it.
      const shift = t - first - offsetSec;
      out.push({
        start: Math.max(0, t - offsetSec),
        text: p.text,
        words: p.words.map((w) => ({ text: w.text, start: Math.max(0, w.start + shift) })),
        closing: p.closing === null ? null : Math.max(0, p.closing + shift),
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Word timings for each parsed cue, or null where the line has none (or its words
 * do not spell the cue's text, which would light the wrong characters).
 *
 * Cues and word lines are matched by start time; several lines at one instant (an
 * original and its translation) match in file order, which is the order both
 * parsers keep. Only lines with at least two words count as word-timed: a single
 * segment is just a line.
 */
export function attachLrcWords(cues: readonly Cue[], raw: string): Array<LyricWord[] | null> {
  const lines = parseLrcWordLines(raw);
  if (lines.length === 0) return cues.map(() => null);
  const used = new Set<number>();
  return cues.map((cue) => {
    const at = lines.findIndex((l, i) => !used.has(i) && Math.abs(l.start - cue.start) < SAME_START && l.text === cue.text);
    if (at < 0) return null;
    used.add(at);
    const line = lines[at];
    if (line.words.length < 2) return null;
    const spelled = line.words.map((w) => w.text).join('').replace(/\s+/g, ' ').trim();
    if (spelled !== cue.text.replace(/\s+/g, ' ').trim()) return null;
    return line.words.map((w, i) => {
      const next = line.words[i + 1]?.start;
      const last = line.closing ?? cue.end;
      const end = Math.min(cue.end, next ?? last);
      return { text: w.text, start: Math.min(w.start, cue.end), end: Math.max(Math.min(w.start, cue.end), end) };
    });
  });
}

const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/;

/**
 * Bilingual sheets put a line and its translation under the same time tag. For each
 * cue, the index of the line it translates, or -1 when it is a line of its own.
 *
 * The primary of a group is its first line with CJK text (the one being studied),
 * else its first line. Everything else in the group is a companion.
 */
export function lyricCompanions(cues: readonly Cue[]): number[] {
  const owner = cues.map(() => -1);
  let i = 0;
  while (i < cues.length) {
    let j = i + 1;
    while (j < cues.length && Math.abs(cues[j].start - cues[i].start) < SAME_START) j++;
    if (j - i > 1) {
      let primary = i;
      for (let k = i; k < j; k++) {
        if (CJK.test(cues[k].text)) {
          primary = k;
          break;
        }
      }
      for (let k = i; k < j; k++) if (k !== primary) owner[k] = primary;
    }
    i = j;
  }
  return owner;
}

/**
 * Which line is lit at `time`. A line is sung from its start until its END — the
 * next tag, a blank stamp or its closing word time — so an instrumental break
 * lights nothing (`sung` -1) while `anchor` stays on the line just finished, for
 * the view to hold still on. Companions (translations) are never the index: the
 * group's primary is.
 */
export function lyricPositionAt(cues: readonly Cue[], time: number, companions?: readonly number[]): LyricPosition {
  let anchor = -1;
  let sung = -1;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.start > time) break;
    const own = companions && companions[i] >= 0 ? companions[i] : i;
    anchor = own;
    if (time < c.end) sung = own;
  }
  return { sung, anchor };
}

/** The word being sung at `time`, -1 before the first or after the last word ends. */
export function lyricWordAt(words: readonly LyricWord[] | null | undefined, time: number): number {
  if (!words || words.length === 0) return -1;
  let at = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= time) at = i;
    else break;
  }
  if (at >= 0 && time >= words[at].end && at === words.length - 1) return -1;
  return at;
}

/** Shift every word time by `sec` (positive: later), clamped at zero: `shiftCues`, per line. */
export function shiftWords(words: ReadonlyArray<LyricWord[] | null>, sec: number): Array<LyricWord[] | null> {
  if (!sec) return words.slice();
  return words.map((line) => (line ? shiftCues(line, sec) : null));
}
