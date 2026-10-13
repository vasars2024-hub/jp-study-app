/**
 * Cutting long audio into Whisper-sized windows without losing words at the cuts.
 *
 * ## What was wrong
 *
 * The worker transcribed fixed 25 s windows back to back, and the transcription queue
 * fixed 30 s slices back to back. A word that straddled a cut was split between two
 * windows that each heard half of it, and Transformers.js reports the segment that
 * runs into the end of a window with no end time (`timestamp: [start, null]`). The
 * worker turned that missing end into `0 + offset` — earlier than the start — and every
 * consumer then dropped the cue as invalid, so the last sentence before every cut never
 * reached the SRT (scorecard bug 30).
 *
 * ## What this does
 *
 * - **No cue is dropped for a missing end.** It ends where the next segment starts, or
 *   at the window's edge ({@link whisperChunkCues}).
 * - **The worker re-reads a cut segment.** A segment that runs into the window's edge is
 *   held back, and the next window starts just before it, so it is transcribed whole
 *   ({@link commitWhisperWindow}). A window always advances by at least half its length,
 *   so a pathological file costs at most twice the work, never a loop.
 * - **The queue's slices overlap.** Each slice carries a few seconds past its nominal end;
 *   a line that starts before the end is kept whole, one that starts after it belongs to
 *   the next slice ({@link acceptSliceCues}).
 * - **Overlap never doubles a line.** A cue whose midpoint falls inside what is already
 *   committed is the same speech heard twice and is dropped.
 *
 * Pure: no worker, no Electron. Times are seconds.
 */

export interface WhisperTimedCue {
  start: number;
  end: number;
  text: string;
}

/** A cue inside one window, and whether it ran into the window's edge (possibly cut). */
export interface WhisperWindowCue extends WhisperTimedCue {
  open: boolean;
}

/** Seconds of audio the worker hands Whisper per step. */
export const WHISPER_WINDOW_SEC = 25;
/** Re-read this much before the edge when no segment was cut there (Whisper can drop a trailing half-word). */
export const WHISPER_WINDOW_OVERLAP_SEC = 3;
/** Run-up kept before a cut segment that the next window re-reads. */
export const WHISPER_CUT_LEAD_SEC = 0.3;
/** A segment ending this close to the window's edge may have been cut there. */
export const WHISPER_EDGE_SEC = 0.25;
/** The shortest cue written when Whisper gives a start and nothing usable after it. */
export const WHISPER_MIN_CUE_SEC = 0.3;
/** Seconds of audio past its nominal end that a queue slice carries. */
export const WHISPER_SLICE_TAIL_SEC = 5;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function timestampPair(chunk: unknown): [unknown, unknown] {
  const timestamp = chunk && typeof chunk === 'object'
    ? (chunk as { timestamp?: unknown }).timestamp
    : undefined;
  return Array.isArray(timestamp) ? [timestamp[0], timestamp[1]] : [undefined, undefined];
}

/**
 * Transformers.js `chunks` for one window as cues relative to that window.
 *
 * A missing start takes the previous cue's end; a missing (or backwards) end takes the next
 * cue's start, else the window's edge. Such a cue is `open`: it ran into the edge and may
 * have been cut there, which is what {@link commitWhisperWindow} acts on.
 */
export function whisperChunkCues(raw: readonly unknown[], windowSec: number): WhisperWindowCue[] {
  const edge = Math.max(0, finite(windowSec) ? windowSec : 0);
  const parsed: Array<{ start: number | null; end: number | null; text: string }> = [];
  for (const chunk of raw) {
    const text = String((chunk as { text?: unknown } | null)?.text ?? '').trim();
    if (!text) continue;
    const [start, end] = timestampPair(chunk);
    parsed.push({
      start: finite(start) ? Math.max(0, start) : null,
      end: finite(end) ? Math.max(0, end) : null,
      text,
    });
  }
  const cues: WhisperWindowCue[] = [];
  let previousEnd = 0;
  parsed.forEach((entry, index) => {
    const start = Math.min(entry.start ?? previousEnd, edge);
    let end = entry.end;
    let open = false;
    if (end == null || end <= start) {
      open = true;
      const nextStart = parsed.slice(index + 1).find((next) => next.start != null && next.start > start)?.start;
      end = nextStart ?? edge;
      // A next segment that starts right away means this one did end; only the edge is a cut.
      if (nextStart != null) open = false;
    }
    end = Math.min(end, edge);
    if (end <= start) end = start + WHISPER_MIN_CUE_SEC;
    if (end >= edge - WHISPER_EDGE_SEC) open = true;
    cues.push({ start, end, text: entry.text, open });
    previousEnd = end;
  });
  return cues;
}

/**
 * Cues whose start is usable and whose end is missing or backwards get an end: the next
 * cue's start, else `start + fallbackSec`. Used where cues arrive from a producer this
 * module does not control, so a missing end can never again cost the line.
 */
export function repairCueEnds<T extends { start?: number; end?: number; text?: string }>(
  cues: readonly T[],
  fallbackSec = 2,
): WhisperTimedCue[] {
  const out: WhisperTimedCue[] = [];
  cues.forEach((cue, index) => {
    const text = String(cue?.text ?? '').trim();
    if (!text || !finite(cue.start)) return;
    const start = Math.max(0, cue.start);
    let end = finite(cue.end) ? cue.end : NaN;
    if (!(end > start)) {
      const next = cues.slice(index + 1).find((entry) => finite(entry?.start) && (entry.start as number) > start);
      end = next ? next.start as number : start + fallbackSec;
    }
    out.push({ start, end, text });
  });
  return out;
}

function midpoint(cue: WhisperTimedCue): number {
  return (cue.start + cue.end) / 2;
}

export interface WhisperWindowStep {
  /** Cues to publish, in absolute seconds. */
  kept: WhisperTimedCue[];
  /** Where the next window starts (absolute). Equal to `audioEndSec` once done. */
  nextStartSec: number;
  /** End of the last cue published so far (absolute). */
  committedUntilSec: number;
}

/**
 * Decide what one worker window publishes and where the next one starts.
 *
 * - A cue that is mostly inside what was already published is a re-read of it: dropped.
 * - The last window publishes everything.
 * - Otherwise a cue cut at the edge is held back and the next window starts just before
 *   it, unless that would advance less than `minAdvanceSec` (a segment longer than half a
 *   window): then it is published as heard and the next window starts at the edge.
 * - With nothing cut, the next window still re-reads the last `overlapSec`, because Whisper
 *   can leave a trailing half-word out rather than report it open.
 */
export function commitWhisperWindow(input: {
  cues: readonly WhisperWindowCue[];
  windowStartSec: number;
  windowSec: number;
  audioEndSec: number;
  committedUntilSec: number;
  overlapSec?: number;
  minAdvanceSec?: number;
}): WhisperWindowStep {
  const { windowStartSec, windowSec, audioEndSec } = input;
  const overlap = Math.max(0, input.overlapSec ?? WHISPER_WINDOW_OVERLAP_SEC);
  const minAdvance = Math.max(0.5, Math.min(windowSec, input.minAdvanceSec ?? windowSec / 2));
  const windowEnd = windowStartSec + windowSec;
  const fresh = input.cues
    .map((cue) => ({ ...cue, start: cue.start + windowStartSec, end: cue.end + windowStartSec }))
    .filter((cue) => midpoint(cue) >= input.committedUntilSec - 1e-6);
  const isLast = windowEnd >= audioEndSec - 1e-6;
  let kept: WhisperWindowCue[];
  let nextStartSec: number;
  if (isLast) {
    kept = fresh;
    nextStartSec = audioEndSec;
  } else {
    const cutIndex = fresh.findIndex((cue) => cue.open);
    const cut = cutIndex >= 0 ? fresh[cutIndex] : undefined;
    if (cut && cut.start - windowStartSec >= minAdvance) {
      kept = fresh.slice(0, cutIndex);
      const keptEnd = kept.length ? kept[kept.length - 1].end : windowStartSec;
      nextStartSec = Math.max(windowStartSec + minAdvance, keptEnd, cut.start - WHISPER_CUT_LEAD_SEC);
    } else if (cut) {
      // One segment longer than half a window: nothing better is coming from a re-read.
      kept = fresh;
      nextStartSec = windowEnd;
    } else {
      kept = fresh;
      nextStartSec = Math.max(windowStartSec + minAdvance, windowEnd - overlap);
    }
  }
  const plain = kept.map(({ start, end, text }) => ({ start, end, text }));
  const committedUntilSec = plain.reduce((max, cue) => Math.max(max, cue.end), input.committedUntilSec);
  return { kept: plain, nextStartSec: Math.min(audioEndSec, nextStartSec), committedUntilSec };
}

/**
 * The queue's half: which cues of one overlapping slice to keep, in absolute seconds.
 *
 * A slice is transcribed with {@link WHISPER_SLICE_TAIL_SEC} past its nominal end. A cue
 * that starts before that end is this slice's (and was heard whole, tail included); one
 * that starts after it is the next slice's, which hears it with its run-up. A cue mostly
 * inside what is already committed is the tail of a line the previous slice kept.
 */
export function acceptSliceCues(
  cues: readonly WhisperTimedCue[],
  options: { nominalEndSec: number; isLast: boolean; committedUntilSec: number },
): { kept: WhisperTimedCue[]; committedUntilSec: number } {
  const kept = cues
    .filter((cue) => cue.text.trim() && finite(cue.start) && finite(cue.end) && cue.end > cue.start)
    .filter((cue) => midpoint(cue) >= options.committedUntilSec - 1e-6)
    .filter((cue) => options.isLast || cue.start < options.nominalEndSec);
  const committedUntilSec = kept.reduce((max, cue) => Math.max(max, cue.end), options.committedUntilSec);
  return { kept, committedUntilSec };
}
