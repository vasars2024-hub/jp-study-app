/**
 * Which picture a mined card gets: the frame on screen, or a frame cut from the file.
 *
 * The one-key mine used to take the frame on screen whenever playback sat anywhere from
 * half a second before the line to TWO seconds after it. Mining right after a line — the
 * moment a learner reaches for the key — therefore regularly captured the next line's shot
 * (a cut to another speaker, another scene), and the manual Screenshot button took the
 * frame on screen whatever line the card was for.
 *
 * The rule now: the frame on screen only while playback is inside the line (or stopped at
 * its end, which is where auto-pause leaves it); otherwise a frame from inside the line,
 * cut from the file by ffmpeg — an exact seek, not the nearest keyframe. A stream has no
 * file to cut, so it keeps the old, looser on-screen window as its best effort.
 */

export type CueFramePlan =
  | { kind: 'element' }
  | { kind: 'file'; atSec: number }
  | { kind: 'none' };

/** Past the line's end, the frame on screen still belongs to it (auto-pause lands ≤15 ms early). */
export const FRAME_AFTER_END_SEC = 0.25;
/** A stream's best effort: the on-screen frame this close to the line. */
const STREAM_BEFORE_SEC = 0.5;
const STREAM_AFTER_SEC = 2;

export function planCueFrame(input: {
  /** The element's clock, or null when there is no element. */
  currentSec: number | null;
  /** The element has a decoded frame (`videoWidth > 0`). */
  frameReady: boolean;
  /** The line, in playback seconds. */
  startSec: number;
  endSec: number;
  /** A local file ffmpeg can cut from. */
  hasFile: boolean;
}): CueFramePlan {
  const { currentSec, frameReady, startSec, endSec, hasFile } = input;
  const live = currentSec != null && Number.isFinite(currentSec) && frameReady;
  if (live && currentSec >= startSec - 0.05 && currentSec <= endSec + FRAME_AFTER_END_SEC) {
    return { kind: 'element' };
  }
  if (hasFile) return { kind: 'file', atSec: cueFrameSec(startSec, endSec) };
  if (live && currentSec >= startSec - STREAM_BEFORE_SEC && currentSec <= endSec + STREAM_AFTER_SEC) {
    return { kind: 'element' };
  }
  return { kind: 'none' };
}

/**
 * The moment inside a line a cut frame is taken at: its middle, which is past the cut that
 * often opens a line and before the one that often closes it.
 */
export function cueFrameSec(startSec: number, endSec: number): number {
  const start = Math.max(0, Number.isFinite(startSec) ? startSec : 0);
  const end = Math.max(start, Number.isFinite(endSec) ? endSec : start);
  return Math.round(((start + end) / 2) * 1000) / 1000;
}
