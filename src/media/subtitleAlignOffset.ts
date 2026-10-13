/**
 * "This line starts NOW": the subtitle delay that puts a chosen line's start at the
 * current playback position — asbplayer's "adjust offset to previous / next subtitle".
 *
 * Nudging ±0.1 s at a time is the right tool for a track that is a little off, and a slow
 * one for a track from another release that is four seconds off. With this, the learner
 * waits for a line to be spoken and presses once:
 *
 * - **next** — the line being heard has not appeared yet (subtitles late): the next line
 *   on the track is pulled to now;
 * - **previous** — the subtitle on screen is already AHEAD of the voice (subtitles early):
 *   the line before it is pushed to now. With nothing on screen (a gap), the line just
 *   shown is the one meant.
 *
 * Only spoken lines count (no signs, no empty events). The result is rounded to the
 * centisecond and kept inside the manual control's ±10 s, so the two controls never
 * disagree about what a valid delay is.
 */
import {
  isTypesettingCueText,
  stripAssCueText,
  type VideoCoreStudyCue,
} from '../shared/videoCoreStudy';

export const ALIGN_DELAY_LIMIT_SEC = 10;
/** A line starting within this of now is "now", not "next". */
const NOW_EPSILON_SEC = 0.05;

export type AlignTarget = 'previous' | 'next';

function spoken(cue: VideoCoreStudyCue): boolean {
  return cue.endMs > cue.startMs && !!stripAssCueText(cue.text) && !isTypesettingCueText(cue.text);
}

/**
 * The delay that makes the `which` line start at `currentSec`, or `null` when there is no
 * such line. `cues` in any order; `delaySec` is the delay in force now.
 */
export function delayToAlignLine(
  cues: readonly VideoCoreStudyCue[],
  currentSec: number,
  delaySec: number,
  which: AlignTarget,
): number | null {
  if (!Number.isFinite(currentSec)) return null;
  const delay = Number.isFinite(delaySec) ? delaySec : 0;
  const lines = cues.filter(spoken).slice().sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  if (!lines.length) return null;
  const startOf = (cue: VideoCoreStudyCue): number => cue.startMs / 1000 + delay;
  const endOf = (cue: VideoCoreStudyCue): number => cue.endMs / 1000 + delay;
  let target: VideoCoreStudyCue | undefined;
  if (which === 'next') {
    target = lines.find((cue) => startOf(cue) > currentSec + NOW_EPSILON_SEC);
  } else {
    const started = lines.filter((cue) => startOf(cue) <= currentSec + NOW_EPSILON_SEC);
    const active = started.filter((cue) => endOf(cue) > currentSec);
    if (active.length) {
      // On screen now: the line before the earliest one showing.
      const firstActiveStart = Math.min(...active.map((cue) => cue.startMs));
      target = [...started].reverse().find((cue) => cue.startMs < firstActiveStart);
    } else {
      target = started[started.length - 1];
    }
  }
  if (!target) return null;
  const next = currentSec - target.startMs / 1000;
  const clamped = Math.max(-ALIGN_DELAY_LIMIT_SEC, Math.min(ALIGN_DELAY_LIMIT_SEC, next));
  return Math.round(clamped * 100) / 100;
}
