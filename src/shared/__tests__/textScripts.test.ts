import { describe, expect, it } from 'vitest';
import { containsScript, hasNoScript, parseTextScript, scriptsIn } from '../textScripts';

describe('containsScript', () => {
  it('answers containment, not a language verdict — a mixed sentence is every script it holds', () => {
    const mixed = 'このアプリはelectronで書かれた。';
    expect(scriptsIn(mixed)).toEqual(['latin', 'han', 'hiragana', 'katakana', 'kana']);
    expect(containsScript(mixed, 'latin')).toBe(true);
    expect(containsScript(mixed, 'cyrillic')).toBe(false);
  });

  it('keeps hiragana and katakana separate while `kana` is their union', () => {
    expect(scriptsIn('カタカナ')).toEqual(['katakana', 'kana']);
    expect(scriptsIn('ひらがな')).toEqual(['hiragana', 'kana']);
    expect(containsScript('カタカナ', 'hiragana')).toBe(false);
  });

  it('never lets one character answer yes to both a syllabary and han', () => {
    // `々ヶ〆` are kanji for reading purposes, which is what `furigana.ts` says,
    // so the katakana range deliberately skips ヵヶ.
    for (const ch of ['々', 'ヶ', 'ヵ', '〆']) {
      expect([ch, containsScript(ch, 'han')]).toEqual([ch, true]);
      expect([ch, containsScript(ch, 'katakana')]).toEqual([ch, false]);
    }
  });

  it('treats the length mark, digits and punctuation as no script at all', () => {
    expect(scriptsIn('ー')).toEqual([]);
    expect(hasNoScript('ー 123 — !? 「」')).toBe(true);
    // …but the same string with one kana in it is not letter-free.
    expect(hasNoScript('ー 123 の')).toBe(false);
  });

  it('reads full-width Latin as Latin and the multiplication sign as neither', () => {
    expect(containsScript('ＡＢＣ', 'latin')).toBe(true);
    // U+00D7 and U+00F7 sit inside the Latin-1 supplement block but are symbols.
    expect(hasNoScript('3 × 4 ÷ 2')).toBe(true);
  });

  it('separates Cyrillic, Greek and Hangul from Latin', () => {
    expect(scriptsIn('Привет')).toEqual(['cyrillic']);
    expect(scriptsIn('λόγος')).toEqual(['greek']);
    expect(scriptsIn('한국어')).toEqual(['hangul']);
    expect(containsScript('Привет', 'latin')).toBe(false);
  });

  it('an empty string contains nothing and is letter-free', () => {
    expect(containsScript('', 'latin')).toBe(false);
    expect(hasNoScript('')).toBe(true);
    expect(scriptsIn('')).toEqual([]);
  });
});

describe('parseTextScript', () => {
  it('is case-insensitive over the known names and null for anything else', () => {
    expect(parseTextScript('KANA')).toBe('kana');
    expect(parseTextScript('han')).toBe('han');
    // `none` is the caller's own absence mode, not a script — it must not parse
    // here, or `script:none` would silently become a containment test.
    expect(parseTextScript('none')).toBeNull();
    expect(parseTextScript('klingon')).toBeNull();
    expect(parseTextScript('')).toBeNull();
  });
});
