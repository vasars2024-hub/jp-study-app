/**
 * Shifts every timestamp in a subtitle FILE's text by a fixed offset.
 *
 * `shared/subtitleSync.ts` estimates how far a downloaded track is off and
 * `shiftCues` moves parsed cues; this moves the file itself, so the correction is
 * stored once and every reader — the player, the transcript, the lexicon search,
 * mining, and a machine translation built from the track — gets the same timing.
 *
 * Text-level rather than parse-and-rewrite on purpose. An `.ass` file carries
 * styles, positioning and, on dual-language releases, the per-style script split
 * that `parseStudySubtitles` depends on; round-tripping it through cues would
 * throw all of that away. Only the time fields are touched.
 *
 * Pure, no I/O.
 */

import type { SubtitleRecordFormat } from './subtitleRecord';

const SRT_STAMP = /(\d{1,2}:)?(\d{1,2}):(\d{2})([,.])(\d{1,3})/g;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function shiftedSeconds(seconds: number, offsetSec: number): number {
  return Math.max(0, seconds + offsetSec);
}

/** `00:01:02,345` / `01:02.345` → shifted, keeping the separator and the hour field's presence. */
function shiftSrtStamp(
  hours: string | undefined,
  minutes: string,
  secs: string,
  sep: string,
  frac: string,
  offsetSec: number,
): string {
  const fraction = Number(frac.padEnd(3, '0').slice(0, 3)) / 1000;
  const total = (hours ? Number(hours.slice(0, -1)) : 0) * 3600 + Number(minutes) * 60 + Number(secs) + fraction;
  const next = shiftedSeconds(total, offsetSec);
  const millis = Math.round(next * 1000);
  const h = Math.floor(millis / 3_600_000);
  const m = Math.floor((millis % 3_600_000) / 60_000);
  const s = Math.floor((millis % 60_000) / 1000);
  const ms = millis % 1000;
  // A VTT stamp may omit the hour; keep omitting it while it fits.
  const hourPart = hours || h > 0 ? `${pad(h, 2)}:` : '';
  return `${hourPart}${pad(m, 2)}:${pad(s, 2)}${sep}${pad(ms, 3)}`;
}

function shiftSrtLike(raw: string, offsetSec: number): string {
  return raw
    .split('\n')
    .map((line) => (line.includes('-->')
      ? line.replace(
        SRT_STAMP,
        (_match: string, hours: string | undefined, minutes: string, secs: string, sep: string, frac: string) =>
          shiftSrtStamp(hours, minutes, secs, sep, frac, offsetSec),
      )
      : line))
    .join('\n');
}

/** `0:01:02.34` → shifted ASS time (hours unpadded, centiseconds). */
function shiftAssTime(value: string, offsetSec: number): string {
  const m = /^\s*(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*$/.exec(value);
  if (!m) return value;
  const fraction = m[4] ? Number(m[4].padEnd(2, '0').slice(0, 2)) / 100 : 0;
  const total = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + fraction;
  const centis = Math.round(shiftedSeconds(total, offsetSec) * 100);
  const h = Math.floor(centis / 360_000);
  const min = Math.floor((centis % 360_000) / 6000);
  const s = Math.floor((centis % 6000) / 100);
  const cs = centis % 100;
  return `${h}:${pad(min, 2)}:${pad(s, 2)}.${pad(cs, 2)}`;
}

const ASS_DEFAULT_COLUMNS = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];

function shiftAss(raw: string, offsetSec: number): string {
  let columns = ASS_DEFAULT_COLUMNS;
  let inEvents = false;
  return raw
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('[')) {
        inEvents = /^\[events\]$/i.test(trimmed);
        return line;
      }
      if (inEvents && /^format\s*:/i.test(trimmed)) {
        const declared = trimmed.slice(trimmed.indexOf(':') + 1).split(',').map((c) => c.trim().toLowerCase());
        if (declared.includes('start') && declared.includes('end')) columns = declared;
        return line;
      }
      const event = /^(\s*(?:Dialogue|Comment)\s*:\s*)(.*)$/i.exec(line);
      if (!event) return line;
      const startIndex = columns.indexOf('start');
      const endIndex = columns.indexOf('end');
      // Text is last and may contain commas, so split no further than the columns before it.
      const fields = event[2].split(',');
      const head = fields.slice(0, columns.length - 1);
      const tail = fields.slice(columns.length - 1).join(',');
      if (startIndex < head.length) head[startIndex] = shiftAssTime(head[startIndex], offsetSec);
      if (endIndex < head.length) head[endIndex] = shiftAssTime(head[endIndex], offsetSec);
      return `${event[1]}${[...head, tail].join(',')}`;
    })
    .join('\n');
}

/**
 * The file's text with every cue moved by `offsetSec` (positive = later).
 * Times clamp at zero. `lrc` is returned untouched: it is a lyrics container this
 * path never downloads.
 */
export function shiftSubtitleText(raw: string, format: SubtitleRecordFormat, offsetSec: number): string {
  if (!Number.isFinite(offsetSec) || offsetSec === 0) return raw;
  const crlf = raw.includes('\r\n');
  const text = crlf ? raw.replace(/\r\n/g, '\n') : raw;
  let out: string;
  if (format === 'ass' || format === 'ssa' || /^\s*(?:\[Script Info\]|Dialogue:)/m.test(text)) out = shiftAss(text, offsetSec);
  else if (format === 'lrc') out = text;
  else out = shiftSrtLike(text, offsetSec);
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

/**
 * Whether an estimated offset is worth writing into the file. Below a quarter
 * second nobody can see the difference, and rewriting a file for noise just
 * churns it.
 */
export function worthShifting(estimate: { offsetSec: number; confident: boolean }): boolean {
  return estimate.confident && Number.isFinite(estimate.offsetSec) && Math.abs(estimate.offsetSec) >= 0.25;
}
