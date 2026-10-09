import { describe, expect, it } from 'vitest';
import { immersionHostOf, immersionTotalsByHost, sanitizeSite } from '../immersion';

const row = (url: string, totalSeconds: number, totalChars: number, totalLookups?: number, lastVisited = 1) => ({
  url,
  totalSeconds,
  totalChars,
  totalLookups,
  lastVisited,
});

describe('immersionTotalsByHost', () => {
  it('adds every page of a site together, www or not, most time first', () => {
    const totals = immersionTotalsByHost([
      row('https://www3.nhk.or.jp/news/a', 120, 800, 2, 10),
      row('https://note.com/x', 600, 100, undefined, 5),
      row('https://www3.nhk.or.jp/news/b', 60, 400, 1, 20),
      row('https://www.note.com/y', 0, 50),
    ]);
    expect(totals).toEqual([
      { host: 'note.com', seconds: 600, chars: 150, lookups: 0, pages: 2, lastVisited: 5 },
      { host: 'www3.nhk.or.jp', seconds: 180, chars: 1200, lookups: 3, pages: 2, lastVisited: 20 },
    ]);
  });

  it('skips sites with nothing read and honours the limit', () => {
    const totals = immersionTotalsByHost([
      row('https://a.example/', 0, 0),
      row('https://b.example/', 10, 0),
      row('https://c.example/', 20, 0),
    ], 1);
    expect(totals.map((t) => t.host)).toEqual(['c.example']);
  });

  it('immersionHostOf survives a bad URL', () => {
    expect(immersionHostOf('not a url')).toBe('');
    expect(immersionHostOf('https://WWW.Example.org/a')).toBe('example.org');
  });
});

describe('sanitizeSite lookups', () => {
  const base = { id: 's', url: 'https://example.org/' };
  it('keeps a positive lookup count and omits the field otherwise', () => {
    expect(sanitizeSite({ ...base, totalLookups: 4.7 })?.totalLookups).toBe(4);
    expect(sanitizeSite({ ...base, totalLookups: -1 })).not.toHaveProperty('totalLookups');
    expect(sanitizeSite(base)).not.toHaveProperty('totalLookups');
  });
});
