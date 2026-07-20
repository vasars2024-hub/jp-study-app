import { describe, expect, it } from 'vitest';
import {
  normalizeToolboxExtensions,
  sanitizeToolboxFileSearchRequest,
} from '../toolboxFileSearch';

describe('toolbox file search helpers', () => {
  it('normalizes extension filters', () => {
    expect(normalizeToolboxExtensions(['.EPUB', ' srt ', 'bad/name', 'epub'])).toEqual([
      'epub',
      'srt',
    ]);
  });

  it('sanitizes search limits and query text', () => {
    const req = sanitizeToolboxFileSearchRequest({
      root: 'C:/Books',
      query: `  ${'a'.repeat(200)}  `,
      extensions: ['txt'],
      maxResults: 9999,
      maxScanned: 1_000_000,
    });

    expect(req.root).toBe('C:/Books');
    expect(req.query).toHaveLength(120);
    expect(req.maxResults).toBe(500);
    expect(req.maxScanned).toBe(100_000);
  });
});
