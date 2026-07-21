import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  normalizeVersion,
  parseExtensionVersionFromBody,
  parseReleaseHighlights,
} from '../release';

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

  it('parses chrome extension versions from release notes', () => {
    expect(parseExtensionVersionFromBody('extension: 3.2.0\n\n- Fix OCR')).toBe('3.2.0');
    expect(parseExtensionVersionFromBody('- Chrome extension v3.1.1')).toBe('3.1.1');
    expect(parseExtensionVersionFromBody('Reader Companion 3.0.0')).toBe('3.0.0');
    expect(parseExtensionVersionFromBody('No extension line here')).toBeNull();
  });
});
