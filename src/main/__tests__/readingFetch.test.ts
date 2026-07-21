import { describe, expect, it } from 'vitest';
import { findNextPageUrl } from '../readingFetch';
import { htmlToText } from '../readabilityExtract';

const BASE = 'https://example.com/read/123';
const wrap = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`;

describe('findNextPageUrl — trusted signals', () => {
  it('follows a <link rel="next"> in the head', () => {
    const html = `<!doctype html><html><head><link rel="next" href="/read/123?page=2"></head><body>x</body></html>`;
    expect(findNextPageUrl(html, BASE)).toBe('https://example.com/read/123?page=2');
  });

  it('follows an <a rel="next">', () => {
    const html = wrap('<a rel="next" href="/read/123/2">go</a>');
    expect(findNextPageUrl(html, BASE)).toBe('https://example.com/read/123/2');
  });

  it('follows an anchor that names the next page explicitly', () => {
    const html = wrap('<a href="/read/123?page=2">次のページ</a>');
    expect(findNextPageUrl(html, BASE)).toBe('https://example.com/read/123?page=2');
  });

  it('resolves a relative href against the base', () => {
    const html = wrap('<a href="p2.html">続きを読む</a>');
    expect(findNextPageUrl(html, BASE)).toBe('https://example.com/read/p2.html');
  });
});

describe('findNextPageUrl — the Narou episode-merge guard', () => {
  it('does NOT follow 次の話 (next episode), only next *page*', () => {
    const html = wrap('<a href="/read/124">次の話</a>');
    expect(findNextPageUrl(html, BASE)).toBeNull();
  });

  it('does NOT follow a bare 次へ (ambiguous)', () => {
    const html = wrap('<a href="/read/124">次へ &raquo;</a>');
    expect(findNextPageUrl(html, BASE)).toBeNull();
  });

  it('never leaves the origin', () => {
    const html = wrap('<a rel="next" href="https://evil.example.org/read/123?page=2">次のページ</a>');
    expect(findNextPageUrl(html, BASE)).toBeNull();
  });

  it('ignores a next link that loops back to the current page', () => {
    const html = wrap('<a rel="next" href="/read/123">次のページ</a>');
    expect(findNextPageUrl(html, BASE)).toBeNull();
  });

  it('returns null when there is no next link', () => {
    expect(findNextPageUrl(wrap('<p>just text</p>'), BASE)).toBeNull();
  });
});

describe('htmlToText', () => {
  it('strips tags and decodes the entities that matter for scoring', () => {
    const out = htmlToText('<p>猫が&amp;犬</p><p>寝る</p>');
    expect(out).toContain('猫が&犬');
    expect(out).toContain('寝る');
    expect(out).not.toMatch(/<[^>]+>/);
  });

  it('drops script/style content entirely', () => {
    const out = htmlToText('<style>.x{color:red}</style><p>本文</p><script>alert(1)</script>');
    expect(out).toBe('本文');
  });

  it('turns block boundaries into newlines', () => {
    expect(htmlToText('<p>あ</p><p>い</p>')).toBe('あ\nい');
  });
});
