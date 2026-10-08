/**
 * When a video counts as finished — one rule for every surface that asks.
 *
 * Before this module the app answered the question five ways: the library's watched tick
 * and the Up next shelf said 92%, the tracking library (episode progress, MAL/AniList
 * status) said 90%, Continue Watching said "within 30 s of the end", and the resume store
 * plus its reader said "within 5 s of the end". So an episode stopped at 91% was counted
 * as watched by the tracker, shown unticked in the library, offered on the Continue
 * Watching row, and resumed into its credits by the player. Every pair of those surfaces
 * disagreed on some band of the timeline.
 *
 * The rule is the Trakt/Plex convention the tracking library already used, because that is
 * the one whose answer is persisted elsewhere (episode progress and list status): **at or
 * past 90% of a measured duration**. The last tenth of an episode is credits and the next
 * episode preview; of a film, credits. Without a duration nothing can be claimed, so the
 * answer is `false` — every caller treats an unmeasured file as unfinished.
 *
 * The `ended` event is a separate, stronger statement that the caller already holds; it
 * does not need this module.
 */

/** Fraction of a measured duration at or past which a video counts as finished. */
export const WATCH_FINISHED_FRACTION = 0.9;

/** `positionSec / durationSec`, clamped to 0-1, or `null` when either is unusable. */
export function watchFinishedProgress(
  positionSec: number | null | undefined,
  durationSec: number | null | undefined,
): number | null {
  if (typeof positionSec !== 'number' || !Number.isFinite(positionSec)) return null;
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) {
    return null;
  }
  return Math.min(1, Math.max(0, positionSec / durationSec));
}

/** Whether a position counts as having finished the video. `false` without a duration. */
export function isWatchFinished(
  positionSec: number | null | undefined,
  durationSec: number | null | undefined,
): boolean {
  const progress = watchFinishedProgress(positionSec, durationSec);
  return progress !== null && progress >= WATCH_FINISHED_FRACTION;
}
