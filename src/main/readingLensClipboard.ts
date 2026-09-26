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
  // The study language, not a fixed 'ja': a Chinese or Russian learner's
  // clipboard passage was stamped Japanese and tokenized as such.
  language = 'ja',
  // A picture on the clipboard, already OCR'd: which engine read it, and the
  // bounded picture itself (the card a word is mined into can carry it).
  image?: { engine?: string; screenshotDataUrl?: string },
): ReadingLensCapture | null {
  const capture = normalizeReadingLensCapture(
    {
      source: 'clipboard',
      sourceLabel: 'clipboard',
      capturedAt: now,
      language,
      engine: image?.engine || 'none',
      text: value,
      ...(image?.screenshotDataUrl ? { screenshotDataUrl: image.screenshotDataUrl } : {}),
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
