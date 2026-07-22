import { describe, expect, it } from 'vitest';
import { sequenceConfidence, tokenProbability, TRUNCATED_CEILING } from '../ocrConfidence';

describe('tokenProbability', () => {
  it('returns a proper softmax probability', () => {
    // Two equal logits share the mass evenly.
    expect(tokenProbability([2, 2], 0, 2, 0)).toBeCloseTo(0.5);
    expect(tokenProbability([2, 2], 0, 2, 1)).toBeCloseTo(0.5);
  });

  it('gives a dominant logit almost all the mass', () => {
    expect(tokenProbability([10, 0, 0], 0, 3, 0)).toBeGreaterThan(0.99);
    expect(tokenProbability([10, 0, 0], 0, 3, 1)).toBeLessThan(0.01);
  });

  it('sums to one across the vocabulary', () => {
    const row = [1.5, -2, 0.3, 4, -0.7];
    const total = row.reduce((s, _v, i) => s + tokenProbability(row, 0, row.length, i), 0);
    expect(total).toBeCloseTo(1);
  });

  it('survives logits large enough to overflow a naive softmax', () => {
    // Math.exp(800) is Infinity; without log-sum-exp this returns NaN.
    const p = tokenProbability([800, 799, 100], 0, 3, 0);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('reads the correct row when given an offset into a flat buffer', () => {
    // Two stacked rows; only the second should be considered.
    const flat = new Float32Array([10, 0, 0, 0]);
    expect(tokenProbability(flat, 2, 2, 0)).toBeCloseTo(0.5);
  });

  it('returns zero for an out-of-range index rather than NaN', () => {
    expect(tokenProbability([1, 2], 0, 2, 5)).toBe(0);
    expect(tokenProbability([1, 2], 0, 0, 0)).toBe(0);
  });
});

describe('sequenceConfidence', () => {
  it('is zero for an empty decode', () => {
    expect(sequenceConfidence([])).toBe(0);
  });

  it('returns the shared value when every token agrees', () => {
    expect(sequenceConfidence([0.9, 0.9, 0.9])).toBeCloseTo(0.9);
  });

  it('is length normalised, so a long confident read is not penalised', () => {
    const short = sequenceConfidence([0.95, 0.95]);
    const long = sequenceConfidence(new Array<number>(40).fill(0.95));
    expect(long).toBeCloseTo(short, 5);
  });

  it('lets one bad token drag the whole read down', () => {
    // Arithmetic mean would be a comfortable 0.8; the geometric mean must not be.
    const withBadToken = sequenceConfidence([0.99, 0.99, 0.99, 0.001]);
    expect(withBadToken).toBeLessThan(0.25);
  });

  it('floors a zero-probability token instead of returning NaN', () => {
    const score = sequenceConfidence([0.9, 0]);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeLessThan(0.1);
  });

  it('caps an unterminated decode, which is a repetition loop not a good read', () => {
    // A loop repeats *confidently*, so the raw score would be near 1.
    const looping = new Array<number>(300).fill(0.999);
    expect(sequenceConfidence(looping)).toBeGreaterThan(0.9);
    expect(sequenceConfidence(looping, { truncated: true })).toBeLessThanOrEqual(TRUNCATED_CEILING);
  });

  it('does not raise a genuinely poor truncated read', () => {
    expect(sequenceConfidence([0.05, 0.05], { truncated: true })).toBeCloseTo(0.05);
  });
});
