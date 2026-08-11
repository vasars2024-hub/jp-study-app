/**
 * Pure correction policy for Reading Lens OCR lines.
 *
 * Corrections keep the original capture identity, geometry and screenshot: the
 * user is repairing OCR text, not claiming a different source image. Rebuilding
 * the passage here keeps every downstream consumer on the same corrected text
 * instead of letting the overlay and Agent/Reading handoffs drift apart.
 */

import {
  joinReadingLensLines,
  normalizeReadingLensCapture,
  type ReadingLensCapture,
} from './readingLens';

export type ReadingLensCorrectionResult =
  | { ok: true; capture: ReadingLensCapture }
  | { ok: false; reason: 'line-not-found' | 'empty' };

/** Replace one OCR line and rebuild the capture's canonical passage. */
export function correctReadingLensLine(
  capture: ReadingLensCapture,
  lineIndex: number,
  nextText: string,
): ReadingLensCorrectionResult {
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= capture.lines.length) {
    return { ok: false, reason: 'line-not-found' };
  }

  const normalizedText = typeof nextText === 'string'
    ? nextText.replace(/\r\n?/g, '\n').normalize('NFKC').trim()
    : '';
  if (!normalizedText) return { ok: false, reason: 'empty' };

  const lines = capture.lines.map((line, index) =>
    index === lineIndex ? { ...line, text: normalizedText } : line,
  );
  const corrected = normalizeReadingLensCapture(
    {
      ...capture,
      text: joinReadingLensLines(lines),
      lines,
    },
    capture.capturedAt,
  );

  // The existing capture is already normalized, and the non-empty replacement
  // keeps it valid. Retain a defensive fallback so this boundary never throws.
  return corrected ? { ok: true, capture: corrected } : { ok: false, reason: 'empty' };
}
