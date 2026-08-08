import { describe, expect, it } from 'vitest';
import {
  joinReadingLensLines,
  normalizeReadingLensCapture,
  recommendedReadingLensDepth,
  resolveReadingLensWorkflow,
} from '../readingLens';

describe('ReadingLens capture contract', () => {
  it('normalizes OCR lines into a reusable CJK-safe passage', () => {
    const capture = normalizeReadingLensCapture(
      {
        source: 'screen',
        lang: 'ja',
        engine: 'web',
        hash: 'abc123',
        lines: [
          { text: '今日は', box: [10, 20, 80, 24], vertical: false, confidence: 0.9 },
          { text: '良い天気です。', box: [10, 50, 160, 24], vertical: false, confidence: 1.2 },
        ],
      },
      100,
    );

    expect(capture).toMatchObject({
      schemaVersion: 1,
      captureId: 'reading-lens:abc123',
      source: 'screen',
      language: 'ja',
      engine: 'web',
      text: '今日は良い天気です。',
    });
    expect(capture?.lines[1]).toMatchObject({ confidence: 1, box: [10, 50, 160, 24] });
  });

  it('fails closed for empty text and removes malformed or unsafe evidence', () => {
    expect(normalizeReadingLensCapture({ source: 'clipboard', text: '   ' }, 100)).toBeNull();

    const capture = normalizeReadingLensCapture(
      {
        source: 'image',
        text: '猫',
        lines: [
          { text: '猫', box: [0, 0, 10, 10], confidence: -1 },
          { text: 'bad', box: [0, 0, Number.NaN, 10] },
        ],
        screenshotDataUrl: 'file:///secret.png',
      },
      100,
    );

    expect(capture).toMatchObject({ source: 'image', engine: 'import', text: '猫' });
    expect(capture?.lines).toHaveLength(1);
    expect(capture?.lines[0]?.confidence).toBe(0);
    expect(capture?.screenshotDataUrl).toBeUndefined();
  });

  it('keeps source metadata and accepts bounded data-url screenshots', () => {
    const capture = normalizeReadingLensCapture(
      {
        source: 'text',
        sourceLabel: 'Imported note',
        sourceRef: 'note-7',
        text: 'First line.\r\nSecond line.',
        screenshotDataUrl: 'data:image/jpeg;base64,AAAA',
      },
      123,
    );

    expect(capture).toMatchObject({
      source: 'text',
      sourceLabel: 'Imported note',
      sourceRef: 'note-7',
      capturedAt: 123,
      text: 'First line.\nSecond line.',
      screenshotDataUrl: 'data:image/jpeg;base64,AAAA',
    });
  });

  it('drops oversized, malformed, and active-content image evidence', () => {
    const oversized = `data:image/jpeg;base64,${'A'.repeat(1_250_000)}`;
    for (const screenshotDataUrl of [
      oversized,
      'data:image/jpeg;base64,not base64',
      'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=',
    ]) {
      expect(normalizeReadingLensCapture({ text: '猫', screenshotDataUrl }, 100)?.screenshotDataUrl)
        .toBeUndefined();
    }
  });
});

describe('ReadingLens depth routing', () => {
  it('joins Latin lines with a space but keeps CJK lines tight', () => {
    expect(joinReadingLensLines([{ text: 'First' }, { text: 'sentence.' }])).toBe('First sentence.');
    expect(joinReadingLensLines([{ text: '今日は' }, { text: '良い天気。' }])).toBe('今日は良い天気。');
  });

  it('recommends compact Lexicon for lexical units and sentences', () => {
    expect(recommendedReadingLensDepth('猫')).toBe('compact');
    expect(recommendedReadingLensDepth('今日は良い天気ですね。')).toBe('compact');
  });

  it('recommends the full Reading workspace for longer passages', () => {
    const capture = normalizeReadingLensCapture(
      { source: 'clipboard', text: 'First sentence. Second sentence.\n\nThird paragraph.' },
      100,
    );
    if (!capture) throw new Error('expected a normalized capture');
    const workflow = resolveReadingLensWorkflow(capture);

    expect(workflow).toMatchObject({ depth: 'workspace', target: 'reading', input: { kind: 'paragraph' } });
    expect(workflow.capture.source).toBe('clipboard');
  });

  it('allows an explicit quick capture or compact handoff', () => {
    const capture = normalizeReadingLensCapture({ source: 'screen', text: '猫' }, 100);
    if (!capture) throw new Error('expected a normalized capture');

    expect(resolveReadingLensWorkflow(capture, 'quick')).toMatchObject({
      depth: 'quick',
      target: 'capture',
    });
    expect(resolveReadingLensWorkflow(capture, 'compact')).toMatchObject({
      depth: 'compact',
      target: 'lexicon',
      input: { kind: 'character', lens: 'lookup' },
    });
  });
});
