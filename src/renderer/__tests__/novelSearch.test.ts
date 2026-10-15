// @vitest-environment jsdom
/**
 * In-book search (novelSearch.ts): CJK substring matching with no word
 * boundaries, the kana/width fold, hits named by the same character index the
 * reader anchors on (so ruby readings and inserted translations never shift
 * them), and the live range a hit maps back to.
 */
import { describe, expect, it } from 'vitest';
import { foldChar, foldQuery, partTextOf, rangeOfHit, searchParts, type PartText } from '../novelSearch';
import { anchorChars } from '../novelTextAnchor';

const on = { ignoreWidth: true };
const off = { ignoreWidth: false };

function parts(...html: string[]): PartText[] {
  return html.map((h) => partTextOf(h));
}

describe('novelSearch', () => {
  it('finds a substring inside running Japanese text (no word boundaries)', () => {
    const book = parts('<p>吾輩は猫である。名前はまだ無い。</p>', '<p>猫の手も借りたい。</p>');
    const { hits } = searchParts(book, '猫', off);
    expect(hits.map((h) => [h.part, h.index])).toEqual([
      [0, 3],
      [1, 0],
    ]);
    expect(hits[0]).toMatchObject({ match: '猫', before: '吾輩は', length: 1 });
    expect(hits[0].after.startsWith('である')).toBe(true);
  });

  it('skips ruby readings and translation blocks, so indexes match the reader anchors', () => {
    const html = '<p><ruby>吾輩<rt>わがはい</rt></ruby>は猫</p><div class="novel-translation-block">I am a cat</div><p>猫</p>';
    const book = parts(html);
    expect(searchParts(book, 'わがはい', off).hits).toHaveLength(0);
    expect(searchParts(book, 'cat', off).hits).toHaveLength(0);
    const { hits } = searchParts(book, '猫', off);
    expect(hits.map((h) => h.index)).toEqual([3, 4]);
    // The same index names the same character in the rendered part.
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    const chars = anchorChars(root);
    expect(chars.length).toBe(book[0].chars.length);
    expect(hits[1].frac).toBeCloseTo(4 / chars.length, 10);
    expect(rangeOfHit(root, hits[0].index, hits[0].length)?.toString()).toBe('猫');
  });

  it('matches across element boundaries and ignores spaces in the query', () => {
    const book = parts('<p>名前は<b>まだ</b>無い</p>');
    const { hits } = searchParts(book, 'はま だ', off);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ index: 2, length: 3, match: 'はまだ' });
  });

  it('folds katakana onto hiragana and full-width onto half-width only when asked', () => {
    const book = parts('<p>カタカナとＡＢＣ１２３とｶﾀｶﾅ</p>');
    expect(searchParts(book, 'かたかな', off).hits).toHaveLength(0);
    expect(searchParts(book, 'かたかな', on).hits.map((h) => h.index)).toEqual([0, 12]);
    expect(searchParts(book, 'abc123', on).hits).toHaveLength(1);
    expect(searchParts(book, 'abc', off).hits).toHaveLength(0);
    expect(foldChar('ア', on)).toBe('あ');
    expect(foldChar('Ａ', on)).toBe('a');
    expect(foldQuery(' カ　タ ', on)).toBe('かた');
  });

  it('is case-insensitive for Latin text and caps the hit list', () => {
    const book = parts(`<p>${'Cat cat CAT '.repeat(10)}</p>`);
    expect(searchParts(book, 'cat', off).hits).toHaveLength(30);
    const capped = searchParts(book, 'cat', off, 5);
    expect(capped.hits).toHaveLength(5);
    expect(capped.capped).toBe(true);
  });

  it('an empty query finds nothing', () => {
    expect(searchParts(parts('<p>猫</p>'), '  ', on).hits).toEqual([]);
  });
});
