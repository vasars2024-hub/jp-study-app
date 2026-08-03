import { describe, expect, it } from 'vitest';
import { emptyCollectedToolsStore, normalizeToolTarget, normalizeToolUrl } from '../collectedTools';

describe('normalizeToolUrl', () => {
  it('treats www / trailing slash / hash as the same tool', () => {
    const a = normalizeToolUrl('https://www.example.com/tool/');
    const b = normalizeToolUrl('https://example.com/tool');
    const c = normalizeToolUrl('https://example.com/tool#section');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('keeps the query string (distinct tools)', () => {
    expect(normalizeToolUrl('https://x.com/a?id=1')).not.toBe(normalizeToolUrl('https://x.com/a?id=2'));
  });

  it('lowercases the host', () => {
    expect(normalizeToolUrl('https://Example.COM/Path')).toBe('example.com/path');
  });

  it('rejects non-http(s) and garbage', () => {
    expect(normalizeToolUrl('file:///etc/passwd')).toBe('');
    expect(normalizeToolUrl('javascript:alert(1)')).toBe('');
    expect(normalizeToolUrl('not a url')).toBe('');
  });
});

describe('emptyCollectedToolsStore', () => {
  it('is a versioned empty store', () => {
    expect(emptyCollectedToolsStore()).toEqual({ version: 1, tools: [], folders: [] });
  });
});

describe('normalizeToolTarget', () => {
  it('delegates to normalizeToolUrl for link kind', () => {
    expect(normalizeToolTarget('link', 'https://www.example.com/tool/')).toBe(
      normalizeToolUrl('https://example.com/tool'),
    );
  });

  it('lowercases app/file paths for case-insensitive dedup', () => {
    expect(normalizeToolTarget('app', 'C:\\Program Files\\Foo\\Foo.EXE')).toBe(
      'c:\\program files\\foo\\foo.exe',
    );
    expect(normalizeToolTarget('file', '  /Users/x/Doc.PDF  ')).toBe('/users/x/doc.pdf');
  });

  it('keeps tool ids verbatim (case matters for BlancToolId)', () => {
    expect(normalizeToolTarget('tool', ' furigana ')).toBe('furigana');
  });
});
