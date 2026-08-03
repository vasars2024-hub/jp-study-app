import { describe, expect, it } from 'vitest';
import { resolveSourceHandoff } from '../components/scraper/data/sourceHandoff';

describe('scraper source-manager handoff', () => {
  const available = ['streamsb', 'vidplay', 'nyaa'];

  it('preserves a known source id', () => {
    expect(resolveSourceHandoff('vidplay', available)).toBe('vidplay');
    expect(resolveSourceHandoff(' nyaa ', available)).toBe('nyaa');
  });

  it('rejects missing and stale source ids', () => {
    expect(resolveSourceHandoff(null, available)).toBeNull();
    expect(resolveSourceHandoff('', available)).toBeNull();
    expect(resolveSourceHandoff('removed-provider', available)).toBeNull();
  });
});
