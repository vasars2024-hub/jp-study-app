/** Shared subtitle export helpers (Phase 5b). */

export interface ExportCue {
  start: number;
  end: number;
  text: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/** Format seconds as SRT timestamp `HH:MM:SS,mmm`. */
export function formatSrtTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const whole = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(whole)},${pad3(ms)}`;
}

/** Format seconds as VTT timestamp `HH:MM:SS.mmm`. */
export function formatVttTime(sec: number): string {
  return formatSrtTime(sec).replace(',', '.');
}

export function cuesToSrt(cues: ExportCue[]): string {
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text.trim()}\n`,
    )
    .join('\n');
}

export function cuesToVtt(cues: ExportCue[]): string {
  const body = cues
    .map((c) => `${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${c.text.trim()}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}
