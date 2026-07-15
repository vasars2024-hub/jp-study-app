import { describe, expect, it } from 'vitest';
import { compareVersions, normalizeVersion, parseReleaseHighlights } from '../release';

describe('release helpers', () => {
  it('normalizes tag prefixes', () => {
    expect(normalizeVersion('v1.0.0')).toBe('1.0.0');
  });

  it('compares semver tuples', () => {
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
  });

  it('summarizes markdown bullets', () => {
    const body = '## Title\n\n- Reader improvements\n- New widgets\n';
    expect(parseReleaseHighlights(body)).toContain('Reader improvements');
  });
});
