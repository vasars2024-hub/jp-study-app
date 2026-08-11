import { describe, expect, it } from 'vitest';
import { normalizeReadingLensCapture } from '../readingLens';
import { correctReadingLensLine } from '../readingLensCorrection';

function capture() {
  const value = normalizeReadingLensCapture({
    captureId: 'reading-lens:ocr-source',
    source: 'screen',
    capturedAt: 1_700_000_000_000,
    language: 'ja',
    engine: 'web',
    hash: 'ocr-source',
    text: '吾輩は猫である',
    screenshotDataUrl: 'data:image/jpeg;base64,YQ==',
    lines: [
      { text: '吾輩は', box: [4, 8, 80, 20], vertical: false, confidence: 0.91 },
      { text: '猫てある', box: [4, 32, 92, 20], vertical: false, confidence: 0.48 },
    ],
  });
  if (!value) throw new Error('fixture did not normalize');
  return value;
}

describe('Reading Lens line correction', () => {
  it('repairs the line and canonical passage without losing source evidence', () => {
    const original = capture();
    const result = correctReadingLensLine(original, 1, ' 猫である ');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capture.text).toBe('吾輩は猫である');
    expect(result.capture.lines.map((line) => line.text)).toEqual(['吾輩は', '猫である']);
    expect(result.capture.captureId).toBe(original.captureId);
    expect(result.capture.hash).toBe(original.hash);
    expect(result.capture.capturedAt).toBe(original.capturedAt);
    expect(result.capture.screenshotDataUrl).toBe(original.screenshotDataUrl);
    expect(result.capture.lines[1]?.box).toEqual(original.lines[1]?.box);
    expect(result.capture.lines[1]?.confidence).toBe(0.48);
  });

  it('normalizes width and line endings before the correction becomes reusable', () => {
    const result = correctReadingLensLine(capture(), 1, ' ＡＢＣ\r\nです ');
    expect(result.ok && result.capture.lines[1]?.text).toBe('ABC\nです');
    expect(result.ok && result.capture.text).toBe('吾輩はABC\nです');
  });

  it('rejects empty text and unknown lines without mutating the capture', () => {
    const original = capture();
    expect(correctReadingLensLine(original, 1, '   ')).toEqual({ ok: false, reason: 'empty' });
    expect(correctReadingLensLine(original, 8, '猫である')).toEqual({
      ok: false,
      reason: 'line-not-found',
    });
    expect(original.lines[1]?.text).toBe('猫てある');
  });
});
