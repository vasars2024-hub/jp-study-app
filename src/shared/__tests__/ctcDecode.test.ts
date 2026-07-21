import { describe, expect, it } from 'vitest';
import {
  buildCharset,
  ctcGreedyDecode,
  parseKeysFile,
  scoreRecognition,
} from '../ctcDecode';

/**
 * Build a [timeSteps x numClasses] probability matrix from a list of
 * (class, probability) pairs — one pair per slice.
 */
function matrix(steps: Array<[number, number]>, numClasses: number): Float32Array {
  const out = new Float32Array(steps.length * numClasses);
  steps.forEach(([cls, prob], t) => {
    const offset = t * numClasses;
    // Spread the remainder over the other classes so argmax is unambiguous.
    const rest = (1 - prob) / Math.max(1, numClasses - 1);
    for (let c = 0; c < numClasses; c++) out[offset + c] = rest;
    out[offset + cls] = prob;
  });
  return out;
}

describe('buildCharset / parseKeysFile', () => {
  it('reserves class 0 for blank and appends a space class', () => {
    const charset = buildCharset(['あ', 'い']);
    expect(charset[0]).toBe('');
    expect(charset[1]).toBe('あ');
    expect(charset[2]).toBe('い');
    expect(charset[3]).toBe(' ');
  });

  it('strips only the trailing newline from a keys file', () => {
    expect(parseKeysFile('あ\nい\nう\n')).toEqual(['あ', 'い', 'う']);
    // An interior blank line is a real class and must be preserved, or every
    // character after it shifts by one and the whole decode is garbled.
    expect(parseKeysFile('あ\n\nう\n')).toEqual(['あ', '', 'う']);
  });
});

describe('ctcGreedyDecode', () => {
  const charset = buildCharset(['あ', 'い', 'う']); // ['', あ, い, う, ' ']
  const numClasses = charset.length;

  it('collapses repeated classes and drops blanks', () => {
    // あ あ blank い  ->  "あい"
    const probs = matrix(
      [
        [1, 0.9],
        [1, 0.8],
        [0, 0.95],
        [2, 0.7],
      ],
      numClasses,
    );
    const out = ctcGreedyDecode(probs, 4, numClasses, charset);
    expect(out.text).toBe('あい');
    // Confidence averages only the two emitting slices: (0.9 + 0.7) / 2
    expect(out.confidence).toBeCloseTo(0.8, 5);
  });

  it('keeps a doubled character when a blank separates the two', () => {
    // あ blank あ  ->  "ああ" (this is exactly what the blank class is for)
    const probs = matrix(
      [
        [1, 0.9],
        [0, 0.9],
        [1, 0.9],
      ],
      numClasses,
    );
    expect(ctcGreedyDecode(probs, 3, numClasses, charset).text).toBe('ああ');
  });

  it('collapses a doubled character with no blank between', () => {
    const probs = matrix(
      [
        [1, 0.9],
        [1, 0.9],
      ],
      numClasses,
    );
    expect(ctcGreedyDecode(probs, 2, numClasses, charset).text).toBe('あ');
  });

  it('returns empty output for an all-blank sequence', () => {
    const probs = matrix(
      [
        [0, 0.99],
        [0, 0.99],
      ],
      numClasses,
    );
    const out = ctcGreedyDecode(probs, 2, numClasses, charset);
    expect(out.text).toBe('');
    expect(out.confidence).toBe(0);
  });

  it('guards against a malformed or truncated matrix', () => {
    expect(ctcGreedyDecode(new Float32Array(0), 0, numClasses, charset)).toEqual({
      text: '',
      confidence: 0,
    });
    expect(ctcGreedyDecode(new Float32Array(3), 10, numClasses, charset).text).toBe('');
  });

  it('decodes with a Cyrillic charset the same way', () => {
    const ru = buildCharset(['п', 'р', 'и']);
    const probs = matrix(
      [
        [1, 0.9],
        [0, 0.9],
        [2, 0.8],
        [3, 0.7],
      ],
      ru.length,
    );
    expect(ctcGreedyDecode(probs, 4, ru.length, ru).text).toBe('при');
  });
});

describe('scoreRecognition', () => {
  it('prefers a full confident line over a single cherry-picked glyph', () => {
    // The wrong-script failure mode: very high confidence, almost no output.
    const cherryPicked = scoreRecognition({ text: '和', confidence: 0.99 });
    const fullLine = scoreRecognition({ text: '世界記録が破られた', confidence: 0.72 });
    expect(fullLine).toBeGreaterThan(cherryPicked);
  });

  it('scores empty output as zero regardless of confidence', () => {
    expect(scoreRecognition({ text: '   ', confidence: 0.99 })).toBe(0);
    expect(scoreRecognition({ text: '', confidence: 1 })).toBe(0);
  });

  it('stops rewarding length past the saturation point', () => {
    const four = scoreRecognition({ text: 'あいうえ', confidence: 0.8 });
    const many = scoreRecognition({ text: 'あいうえおかきくけこ', confidence: 0.8 });
    expect(four).toBeCloseTo(many, 5);
  });
});
