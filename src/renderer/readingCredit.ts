/**
 * What the reader credits to the reading statistics.
 *
 * Characters: only forward progress past the furthest point reached counts,
 * and a navigation (table of contents, bookmark, progress slider) re-anchors
 * that point instead of crediting everything it skipped. A single step larger
 * than any page or screen is treated as a jump for the same reason.
 *
 * Time: only while the reader is being used. A book left open on screen while
 * the learner walks away stops earning minutes after `READING_IDLE_MS` without
 * a scroll, page turn, click or key.
 */

/** No interaction for this long and the reading clock stops. */
export const READING_IDLE_MS = 5 * 60_000;

/** One progress step larger than this many characters is a jump, not reading. */
export const READING_JUMP_CHARS = 3_000;

/**
 * Credit a new global position (0..1). `max` holds the furthest position
 * reached; returns the characters to credit and moves `max` forward.
 */
export function creditReadingProgress(
  max: { current: number | null },
  g: number,
  totalChars: number,
  jump = false,
): number {
  if (!Number.isFinite(g)) return 0;
  if (max.current == null || jump) {
    max.current = g;
    return 0;
  }
  if (g <= max.current || totalChars <= 0) return 0;
  const chars = Math.round((g - max.current) * totalChars);
  max.current = g;
  return chars > READING_JUMP_CHARS ? 0 : chars;
}

/**
 * Seconds of active reading between `startMs` and `nowMs`: the span ends at
 * the last interaction plus the idle allowance. Never negative, and a span
 * over an hour (a suspended machine) earns nothing.
 */
export function activeReadingSeconds(
  startMs: number,
  nowMs: number,
  lastInteractionMs: number,
  idleMs = READING_IDLE_MS,
): number {
  const end = Math.min(nowMs, lastInteractionMs + idleMs);
  const secs = (end - startMs) / 1000;
  return secs > 0 && secs <= 3600 ? secs : 0;
}
