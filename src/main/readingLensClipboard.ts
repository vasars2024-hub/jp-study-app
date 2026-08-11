import { createHash } from 'node:crypto';
import {
  normalizeReadingLensCapture,
  type ReadingLensCapture,
} from '../shared/readingLens';

/**
 * Turn an explicit clipboard read into the same bounded envelope used by OCR.
 *
 * Clipboard text is normalized before it is hashed, so width/newline variants
 * collapse to one history identity. No image or raw clipboard payload is kept:
 * the returned value contains only normalized text and ordinary source
 * metadata, and the existing Reading Lens history retention policy owns it.
 */
export function createReadingLensClipboardCapture(
  value: unknown,
  now = Date.now(),
): ReadingLensCapture | null {
  const capture = normalizeReadingLensCapture(
    {
      source: 'clipboard',
      sourceLabel: 'clipboard',
      capturedAt: now,
      language: 'ja',
      engine: 'none',
      text: value,
    },
    now,
  );
  if (!capture) return null;

  const hash = createHash('sha256').update(capture.text, 'utf8').digest('hex');
  return normalizeReadingLensCapture(
    {
      ...capture,
      captureId: 'reading-lens:clipboard:' + hash,
      hash,
    },
    now,
  );
}
