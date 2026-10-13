/**
 * The second (translation) line for a study line, chosen by overlap with THAT line rather
 * than by what happens to be on screen at this instant.
 *
 * A Japanese track and an English track are rarely cut the same way: the English line often
 * spans two Japanese lines, or one Japanese line is translated as two English ones, and the
 * two tracks start and end at different moments. Showing "whatever English cue is active
 * now" therefore drifts off the line being read:
 *
 * - paused at the end of a Japanese line (auto-pause), the active English cue is often the
 *   NEXT line's translation, or nothing;
 * - a Japanese line translated as two English lines shows only one of them at a time;
 * - mining a line seeded the card's translation with whichever English cue was active when
 *   the key was pressed — after the line, frequently the wrong one.
 *
 * Language Reactor aligns the translation to the line; this is that rule. A secondary cue
 * belongs to the line when most of it lies inside the line, or when it covers most of the
 * line. When nothing overlaps enough, the single best-overlapping cue is used if it overlaps
 * at all, else nothing (the caller then falls back to the time-active second line).
 */
import type { VideoCoreStudyCue } from '../shared/videoCoreStudy';

/** A secondary cue counts when at least this share of it, or of the line, is shared. */
export const SECONDARY_ALIGN_MIN_SHARE = 0.5;

function overlapMs(a: VideoCoreStudyCue, b: VideoCoreStudyCue): number {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
}

/**
 * The secondary cues that translate `line`, in time order. Both tracks are on the same
 * clock (the overlay shifts them by the same delay), so the comparison is in track time.
 */
export function alignedSecondaryCues<T extends VideoCoreStudyCue>(
  line: VideoCoreStudyCue | null | undefined,
  secondary: readonly T[],
): T[] {
  if (!line || !secondary.length) return [];
  const lineMs = Math.max(1, line.endMs - line.startMs);
  const matches: T[] = [];
  let best: T | null = null;
  let bestOverlap = 0;
  for (const cue of secondary) {
    if (cue.endMs <= line.startMs || cue.startMs >= line.endMs) continue;
    const shared = overlapMs(line, cue);
    if (shared <= 0) continue;
    const cueMs = Math.max(1, cue.endMs - cue.startMs);
    if (shared / cueMs >= SECONDARY_ALIGN_MIN_SHARE || shared / lineMs >= SECONDARY_ALIGN_MIN_SHARE) {
      matches.push(cue);
    }
    if (shared > bestOverlap) {
      bestOverlap = shared;
      best = cue;
    }
  }
  const chosen = matches.length ? matches : best ? [best] : [];
  return [...chosen].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}
