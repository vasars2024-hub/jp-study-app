import type { ReadingLensLine } from './readingLens';

export const READING_LENS_CONFIDENCE_RELIABLE = 0.85;
export const READING_LENS_CONFIDENCE_REVIEW = 0.65;

export type ReadingLensConfidenceLevel = 'high' | 'review' | 'low';

export interface ReadingLensConfidenceSummary {
  confidence: number;
  percent: number;
  level: ReadingLensConfidenceLevel;
  reviewLineCount: number;
}

function boundedConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Turn an engine confidence into the small, stable vocabulary the Lens UI
 * presents. The reliable threshold matches the OCR retry boundary; the review
 * band keeps uncertainty visible without labelling every imperfect read as bad.
 */
export function readingLensConfidenceLevel(confidence: number): ReadingLensConfidenceLevel {
  const bounded = boundedConfidence(confidence);
  if (bounded >= READING_LENS_CONFIDENCE_RELIABLE) return 'high';
  if (bounded >= READING_LENS_CONFIDENCE_REVIEW) return 'review';
  return 'low';
}

/**
 * Summarize a capture without letting a long line hide a short uncertain one.
 * The headline is the mean of the engine's line confidences, while the review
 * count independently exposes every line below the reliable boundary.
 */
export function summarizeReadingLensConfidence(
  lines: readonly Pick<ReadingLensLine, 'confidence'>[],
): ReadingLensConfidenceSummary {
  if (!lines.length) {
    return { confidence: 0, percent: 0, level: 'low', reviewLineCount: 0 };
  }

  const confidences = lines.map((line) => boundedConfidence(line.confidence));
  const confidence = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  return {
    confidence,
    percent: Math.round(confidence * 100),
    level: readingLensConfidenceLevel(confidence),
    reviewLineCount: confidences.filter((value) => value < READING_LENS_CONFIDENCE_RELIABLE).length,
  };
}
