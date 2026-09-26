/**
 * One grade for a subtitle track, from what the app actually knows about it.
 *
 * The quality ratings the §8 catalogue declared (`createEmptySubtitleQualityRatings`)
 * were never filled: every track looked the same in the list. Three signals
 * exist and are now combined here — how well the release matched this file
 * (the matcher's 0–100), how cleanly its timing locked onto the audio (the
 * offset estimate's peak against its rival), and the learner's own 1–5 rating,
 * which outranks both when present.
 */
import type { SubtitleRecord } from './subtitleRecord';

export type SubtitleSyncGrade = 'A' | 'B' | 'C';
export type SubtitleTrackGrade = 'A' | 'B' | 'C' | 'D';

/**
 * Timing quality from the offset estimator: a confident peak well above its
 * rival is A, a confident one B, anything the estimator would not act on C.
 */
export function syncGradeFromEstimate(estimate: { score: number; rivalScore: number; confident: boolean }): SubtitleSyncGrade {
  if (!estimate.confident) return 'C';
  const rival = Math.max(estimate.rivalScore, 1e-6);
  return estimate.score / rival >= 2 ? 'A' : 'B';
}

const POINTS: Record<SubtitleSyncGrade, number> = { A: 100, B: 75, C: 40 };

/** The letter a track earns. `null` when nothing is known (an embedded stream, say). */
export function subtitleTrackGrade(
  record: Pick<SubtitleRecord, 'confidence' | 'syncGrade' | 'userRating' | 'source' | 'hashMatch'>,
): SubtitleTrackGrade | null {
  if (typeof record.userRating === 'number' && record.userRating >= 1) {
    return record.userRating >= 5 ? 'A' : record.userRating >= 4 ? 'B' : record.userRating >= 3 ? 'C' : 'D';
  }
  const parts: number[] = [];
  if (typeof record.confidence === 'number') parts.push(record.confidence);
  // A file hash match was made for this exact file: its timing is right by construction.
  if (record.hashMatch) parts.push(100);
  else if (record.syncGrade) parts.push(POINTS[record.syncGrade]);
  // Embedded and sidecar tracks ship with the file and are in sync with it.
  if (!parts.length && (record.source === 'embedded' || record.source === 'sidecar')) return 'A';
  if (!parts.length) return null;
  const score = parts.reduce((a, b) => a + b, 0) / parts.length;
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : 'D';
}

/** A 1–5 rating, or 0 to clear it. */
export function normalizeTrackRating(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 0;
}
