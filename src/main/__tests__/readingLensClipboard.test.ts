// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createReadingLensClipboardCapture } from '../readingLensClipboard';

describe('Reading Lens clipboard capture', () => {
  it('normalizes explicit clipboard text into a text-only capture', () => {
    const capture = createReadingLensClipboardCapture('  ＡＢＣ\r\n猫  ', 123);

    expect(capture).toMatchObject({
      source: 'clipboard',
      sourceLabel: 'clipboard',
      capturedAt: 123,
      language: 'ja',
      engine: 'none',
      text: 'ABC\n猫',
      lines: [],
    });
    expect(capture?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(capture?.captureId).toBe('reading-lens:clipboard:' + capture?.hash);
    expect(capture?.screenshotDataUrl).toBeUndefined();
  });

  it('uses normalized text for a stable history identity', () => {
    const first = createReadingLensClipboardCapture('ＡＢＣ\r\n猫', 100);
    const second = createReadingLensClipboardCapture('ABC\n猫', 200);

    expect(second?.hash).toBe(first?.hash);
    expect(second?.captureId).toBe(first?.captureId);
    expect(second?.capturedAt).toBe(200);
  });

  it('rejects empty and non-text clipboard values', () => {
    expect(createReadingLensClipboardCapture('   ', 100)).toBeNull();
    expect(createReadingLensClipboardCapture(null, 100)).toBeNull();
  });
});
