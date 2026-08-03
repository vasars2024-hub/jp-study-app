// @vitest-environment jsdom
//
// Uses a real DOMParser rather than a hand-rolled fake: the whole value of a
// site rule is that it runs against markup as a browser sees it, and a stub
// that "implements querySelector" would pass selectors this module would fail
// on in practice.

import { describe, expect, it } from 'vitest';
import {
  extractWithRule,
  readEpisodeNumber,
  resolveLink,
  ruleForUrl,
  validateSiteRule,
  type ScraperSiteRule,
} from '../scraperSiteRules';

function rule(over: Partial<ScraperSiteRule> = {}): ScraperSiteRule {
  return {
    id: 'r1',
    host: 'example.com',
    sampleUrl: 'https://example.com/anime/one-piece',
    episodeSelector: '.ep',
    titleSelector: '.title',
    linkSelector: 'a',
    linkAttribute: '',
    numberSelector: '',
    numberPattern: '',
    enabled: true,
    lastValidatedAt: null,
    lastMatchCount: 0,
    ...over,
  };
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const CLEAN = `
  <ul class="ep-list">
    <li class="ep"><span class="num">1</span><span class="title">Romance Dawn</span><a href="/ep-1">watch</a></li>
    <li class="ep"><span class="num">2</span><span class="title">Enter the Swordsman</span><a href="/ep-2">watch</a></li>
    <li class="ep"><span class="num">3</span><span class="title">Morgan vs. Luffy</span><a href="/ep-3">watch</a></li>
  </ul>
`;

describe('readEpisodeNumber', () => {
  it('takes the first integer by default', () => {
    expect(readEpisodeNumber('Episode 12 — Sanji', '')).toBe(12);
  });

  it('reads a decimal episode number', () => {
    expect(readEpisodeNumber('Episode 12.5 special', '')).toBe(12.5);
  });

  it('returns null when there is no number', () => {
    expect(readEpisodeNumber('Finale', '')).toBeNull();
  });

  it('prefers the first capture group of a supplied pattern', () => {
    expect(readEpisodeNumber('S02E07 — Alabasta', 'E(\\d+)')).toBe(7);
  });

  it('falls back to the whole match when the pattern has no group', () => {
    expect(readEpisodeNumber('S02E07', '\\d+$')).toBe(7);
  });

  it('returns null rather than throwing on a broken pattern', () => {
    expect(readEpisodeNumber('Episode 3', '([')).toBeNull();
  });

  it('returns null when a valid pattern does not match', () => {
    expect(readEpisodeNumber('Episode 3', 'Season (\\d+)')).toBeNull();
  });
});

describe('resolveLink', () => {
  it('resolves a root-relative path', () => {
    expect(resolveLink('/ep-1', 'https://example.com/anime/one-piece')).toBe('https://example.com/ep-1');
  });

  it('resolves a document-relative path', () => {
    expect(resolveLink('ep-1', 'https://example.com/anime/')).toBe('https://example.com/anime/ep-1');
  });

  it('leaves an absolute URL alone', () => {
    expect(resolveLink('https://cdn.example.org/x', 'https://example.com/')).toBe('https://cdn.example.org/x');
  });

  it('returns the input when the base is unusable', () => {
    expect(resolveLink('/ep-1', 'not a url')).toBe('/ep-1');
  });

  it('maps an empty link to an empty string', () => {
    expect(resolveLink('', 'https://example.com/')).toBe('');
  });
});

describe('validateSiteRule', () => {
  it('accepts a complete rule', () => {
    expect(validateSiteRule(rule())).toEqual([]);
  });

  it('requires a host', () => {
    expect(validateSiteRule(rule({ host: '  ' }))).toContainEqual({
      field: 'host',
      message: 'A host is required.',
    });
  });

  it('rejects a host written as a URL', () => {
    expect(validateSiteRule(rule({ host: 'https://example.com/x' }))).toContainEqual({
      field: 'host',
      message: 'Use a bare hostname, with no scheme or path.',
    });
  });

  it('requires an http(s) sample URL', () => {
    expect(validateSiteRule(rule({ sampleUrl: 'example.com' }))).toContainEqual({
      field: 'sampleUrl',
      message: 'The sample URL must start with http:// or https://.',
    });
  });

  it('requires an episode selector', () => {
    expect(validateSiteRule(rule({ episodeSelector: '' }))).toContainEqual({
      field: 'episodeSelector',
      message: 'An episode row selector is required.',
    });
  });

  it('reports a broken number pattern', () => {
    const problems = validateSiteRule(rule({ numberPattern: '([' }));
    expect(problems.map((p) => p.field)).toContain('numberPattern');
  });
});

describe('extractWithRule', () => {
  it('extracts numbered, titled, linked rows', () => {
    const out = extractWithRule(parse(CLEAN), rule());
    expect(out.error).toBe('');
    expect(out.rows).toEqual([
      { index: 1, number: 1, title: 'Romance Dawn', link: 'https://example.com/ep-1', rawLink: '/ep-1' },
      { index: 2, number: 2, title: 'Enter the Swordsman', link: 'https://example.com/ep-2', rawLink: '/ep-2' },
      { index: 3, number: 3, title: 'Morgan vs. Luffy', link: 'https://example.com/ep-3', rawLink: '/ep-3' },
    ]);
    expect(out.ok).toBe(true);
  });

  it('collapses whitespace in titles', () => {
    const html = '<div class="ep"><b class="title">  Romance\n   Dawn </b><a href="/1">go</a></div>';
    const out = extractWithRule(parse(html), rule());
    expect(out.rows[0]?.title).toBe('Romance Dawn');
  });

  it('uses the row itself when no title selector is set', () => {
    const html = '<div class="ep"><a href="/1">Episode 1 Romance Dawn</a></div>';
    const out = extractWithRule(parse(html), rule({ titleSelector: '' }));
    expect(out.rows[0]?.title).toBe('Episode 1 Romance Dawn');
  });

  it('reads a non-href link attribute', () => {
    const html = '<div class="ep"><span class="title">Ep</span><a data-src="/v/1">go</a></div>';
    const out = extractWithRule(parse(html), rule({ linkAttribute: 'data-src' }));
    expect(out.rows[0]?.rawLink).toBe('/v/1');
    expect(out.rows[0]?.link).toBe('https://example.com/v/1');
  });

  it('reports an empty extraction when nothing matches', () => {
    const out = extractWithRule(parse('<p>nothing here</p>'), rule());
    expect(out.rows).toEqual([]);
    expect(out.ok).toBe(false);
    expect(out.checks.find((c) => c.id === 'rows-found')?.ok).toBe(false);
  });

  it('refuses to run without an episode selector', () => {
    const out = extractWithRule(parse(CLEAN), rule({ episodeSelector: '' }));
    expect(out.error).toBe('No episode row selector is set.');
    expect(out.rows).toEqual([]);
  });

  it('reports an invalid selector as an error rather than throwing', () => {
    const out = extractWithRule(parse(CLEAN), rule({ episodeSelector: 'div[' }));
    expect(out.error).not.toBe('');
    expect(out.rows).toEqual([]);
  });

  it('reports an invalid title selector as an error', () => {
    const out = extractWithRule(parse(CLEAN), rule({ titleSelector: ':::' }));
    expect(out.error).not.toBe('');
  });

  it('flags rows that produced no title', () => {
    const html = `
      <div class="ep"><span class="title">One</span><a href="/1">x</a></div>
      <div class="ep"><a href="/2">x</a></div>
    `;
    const out = extractWithRule(parse(html), rule());
    const titles = out.checks.find((c) => c.id === 'titles-present');
    expect(titles?.ok).toBe(false);
    expect(titles?.detail).toBe('1/2');
    expect(out.ok).toBe(false);
  });

  it('flags rows that produced no link', () => {
    const html = `
      <div class="ep"><span class="title">One</span><a href="/1">x</a></div>
      <div class="ep"><span class="title">Two</span></div>
    `;
    const out = extractWithRule(parse(html), rule());
    expect(out.checks.find((c) => c.id === 'links-present')?.detail).toBe('1/2 via [href]');
  });

  it('flags duplicate episode numbers', () => {
    const html = `
      <div class="ep"><span class="title">1 One</span><a href="/1">x</a></div>
      <div class="ep"><span class="title">1 Again</span><a href="/2">x</a></div>
    `;
    const out = extractWithRule(parse(html), rule({ titleSelector: '' }));
    const unique = out.checks.find((c) => c.id === 'numbers-unique');
    expect(unique?.ok).toBe(false);
    expect(unique?.detail).toBe('1 duplicate(s)');
  });

  it('flags out-of-order episode numbers', () => {
    const html = `
      <div class="ep"><a href="/3">Episode 3</a></div>
      <div class="ep"><a href="/1">Episode 1</a></div>
    `;
    const out = extractWithRule(parse(html), rule({ titleSelector: '' }));
    const order = out.checks.find((c) => c.id === 'numbers-sequential');
    expect(order?.ok).toBe(false);
    expect(order?.detail).toContain('out of order');
  });

  it('flags links that could not be made absolute', () => {
    const out = extractWithRule(parse(CLEAN), rule({ sampleUrl: '' }), '');
    expect(out.checks.find((c) => c.id === 'links-absolute')?.ok).toBe(false);
    expect(out.rows[0]?.link).toBe('/ep-1');
  });

  it('applies a custom number pattern', () => {
    const html = `
      <div class="ep"><span class="title">S01E04 Winter</span><a href="/4">x</a></div>
    `;
    const out = extractWithRule(parse(html), rule({ numberPattern: 'E(\\d+)' }));
    expect(out.rows[0]?.number).toBe(4);
  });

  // Regression: a real Wikipedia episode table puts the overall number and the
  // season number in adjacent cells, so reading the row's whole text yields
  // "11" for episode 1. The number needs its own cell.
  describe('with a number cell', () => {
    const TWO_NUMBER_ROWS = `
      <table><tbody>
        <tr class="ep"><th class="no">1</th><td class="season">1</td><td class="title">Romance Dawn</td><td><a href="/1">x</a></td></tr>
        <tr class="ep"><th class="no">2</th><td class="season">2</td><td class="title">Enter</td><td><a href="/2">x</a></td></tr>
      </tbody></table>
    `;

    it('reads 11 from the row text without a number cell', () => {
      const out = extractWithRule(parse(TWO_NUMBER_ROWS), rule());
      expect(out.rows.map((row) => row.number)).toEqual([11, 22]);
    });

    it('reads the right number once a cell is named', () => {
      const out = extractWithRule(parse(TWO_NUMBER_ROWS), rule({ numberSelector: 'th.no' }));
      expect(out.rows.map((row) => row.number)).toEqual([1, 2]);
      expect(out.checks.find((c) => c.id === 'numbers-unique')?.ok).toBe(true);
      expect(out.checks.find((c) => c.id === 'numbers-sequential')?.ok).toBe(true);
    });

    it('yields no number when the named cell is missing', () => {
      const out = extractWithRule(parse(TWO_NUMBER_ROWS), rule({ numberSelector: '.nope' }));
      expect(out.rows.map((row) => row.number)).toEqual([null, null]);
      expect(out.checks.find((c) => c.id === 'numbers-parsed')?.ok).toBe(false);
    });

    it('reports an invalid number selector as an error', () => {
      const out = extractWithRule(parse(TWO_NUMBER_ROWS), rule({ numberSelector: 'th[' }));
      expect(out.error).not.toBe('');
    });

    it('combines a number cell with a pattern', () => {
      const html = '<div class="ep"><span class="no">Ep. 07</span><span class="title">T</span><a href="/7">x</a></div>';
      const out = extractWithRule(
        parse(html),
        rule({ numberSelector: '.no', numberPattern: 'Ep\\.\\s*(\\d+)' }),
      );
      expect(out.rows[0]?.number).toBe(7);
    });
  });
});

describe('ruleForUrl', () => {
  const rules = [
    rule({ id: 'base', host: 'example.com' }),
    rule({ id: 'sub', host: 'watch.example.com' }),
    rule({ id: 'off', host: 'other.com', enabled: false }),
  ];

  it('matches the exact host', () => {
    expect(ruleForUrl(rules, 'https://example.com/a')?.id).toBe('base');
  });

  it('prefers the most specific host', () => {
    expect(ruleForUrl(rules, 'https://watch.example.com/a')?.id).toBe('sub');
  });

  it('covers subdomains of a bare host', () => {
    expect(ruleForUrl(rules, 'https://www.example.com/a')?.id).toBe('base');
  });

  it('ignores disabled rules', () => {
    expect(ruleForUrl(rules, 'https://other.com/a')).toBeNull();
  });

  it('does not match a host that merely ends with the same text', () => {
    expect(ruleForUrl(rules, 'https://notexample.com/a')).toBeNull();
  });

  it('returns null for an unparseable URL', () => {
    expect(ruleForUrl(rules, 'not a url')).toBeNull();
  });
});
