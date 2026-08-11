import { describe, expect, it } from 'vitest';
import {
  readingLensConfidenceLevel,
  summarizeReadingLensConfidence,
} from '../readingLensConfidence';

describe('ReadingLens confidence presentation', () => {
  it('uses stable reliable, review and low bands', () => {
    expect(readingLensConfidenceLevel(0.85)).toBe('high');
    expect(readingLensConfidenceLevel(0.849)).toBe('review');
    expect(readingLensConfidenceLevel(0.65)).toBe('review');
    expect(readingLensConfidenceLevel(0.649)).toBe('low');
  });

  it('bounds malformed engine values before presenting them', () => {
    expect(readingLensConfidenceLevel(Number.NaN)).toBe('low');
    expect(summarizeReadingLensConfidence([{ confidence: -2 }, { confidence: 4 }])).toMatchObject({
      confidence: 0.5,
      percent: 50,
      level: 'low',
      reviewLineCount: 1,
    });
  });

  it('reports an overall mean while retaining the uncertain-line count', () => {
    expect(
      summarizeReadingLensConfidence([
        { confidence: 0.98 },
        { confidence: 0.92 },
        { confidence: 0.7 },
      ]),
    ).toMatchObject({
      percent: 87,
      level: 'high',
      reviewLineCount: 1,
    });
  });

  it('has an honest empty state', () => {
    expect(summarizeReadingLensConfidence([])).toEqual({
      confidence: 0,
      percent: 0,
      level: 'low',
      reviewLineCount: 0,
    });
  });
});
