import { describe, expect, it } from 'vitest';
import { resolveResultSeriesHandoff } from '../components/scraper/data/resultHandoff';

describe('scraper result-series handoff', () => {
  const available = ['one-piece', 'frieren', 'jujutsu-kaisen'];

  it('preserves a known dashboard series id', () => {
    expect(resolveResultSeriesHandoff('frieren', available)).toBe('frieren');
    expect(resolveResultSeriesHandoff('  one-piece  ', available)).toBe('one-piece');
  });

  it('rejects missing, empty, and stale series ids', () => {
    expect(resolveResultSeriesHandoff(null, available)).toBeNull();
    expect(resolveResultSeriesHandoff(' ', available)).toBeNull();
    expect(resolveResultSeriesHandoff('removed-series', available)).toBeNull();
  });
});
