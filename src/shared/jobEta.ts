/**
 * Shared "time remaining" estimate for long-running jobs.
 *
 * Every background job in the app (book OCR, the metadata sweep, transcription)
 * wants the same thing, and wants it to behave identically — so it is declared
 * once here and re-exported by each job's own wire-contract module rather than
 * copied into each of them.
 *
 * Pure: no clock of its own, the caller passes elapsed time in.
 */

/**
 * Below this many completed units, no estimate is offered at all. An ETA
 * extrapolated from one sample swings wildly between refreshes and reads as a
 * bug, so absent is better than wrong.
 */
export const MIN_SAMPLES_FOR_ETA = 3;

/** Milliseconds remaining from throughput so far, or undefined if not yet meaningful. */
export function estimateEtaMs(done: number, total: number, elapsedMs: number): number | undefined {
  if (done < MIN_SAMPLES_FOR_ETA || done >= total || elapsedMs <= 0) return undefined;
  return Math.round((elapsedMs / done) * (total - done));
}
