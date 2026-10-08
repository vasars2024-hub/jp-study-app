// @vitest-environment jsdom
/**
 * Reading statistics credit only what was read: no characters for a jump, no
 * furigana counted twice, and no minutes for a book left open while idle.
 */
import { describe, expect, it } from 'vitest';
import { activeReadingSeconds, creditReadingProgress, READING_IDLE_MS } from '../readingCredit';
import { readableCharCount } from '../epubLoader';

describe('character credit', () => {
  it('credits forward progress past the furthest point only', () => {
    const max = { current: null as number | null };
    expect(creditReadingProgress(max, 0.1, 100_000)).toBe(0); // first fix: anchor
    expect(creditReadingProgress(max, 0.11, 100_000)).toBe(1_000);
    expect(creditReadingProgress(max, 0.105, 100_000)).toBe(0); // back
    expect(creditReadingProgress(max, 0.11, 100_000)).toBe(0); // re-read
    expect(creditReadingProgress(max, 0.115, 100_000)).toBe(500);
  });

  it('a navigation re-anchors instead of crediting the skipped text', () => {
    const max = { current: 0.1 as number | null };
    expect(creditReadingProgress(max, 0.9, 100_000, true)).toBe(0);
    expect(max.current).toBe(0.9);
    expect(creditReadingProgress(max, 0.905, 100_000)).toBe(500);
  });

  it('a step larger than any page counts as a jump', () => {
    const max = { current: 0 as number | null };
    expect(creditReadingProgress(max, 0.5, 100_000)).toBe(0);
    expect(max.current).toBe(0.5);
  });
});

describe('idle detection', () => {
  it('counts the whole span while the reader is in use', () => {
    expect(activeReadingSeconds(0, 20_000, 19_000)).toBe(20);
  });

  it('stops the clock READING_IDLE_MS after the last interaction', () => {
    const start = 0;
    const last = 60_000;
    expect(activeReadingSeconds(start, last + READING_IDLE_MS + 600_000, last)).toBe((last + READING_IDLE_MS) / 1000);
    // A later interval with no interaction at all earns nothing.
    const later = last + READING_IDLE_MS + 60_000;
    expect(activeReadingSeconds(later, later + 20_000, last)).toBe(0);
  });
});

describe('readable characters', () => {
  it('excludes furigana and whitespace', () => {
    const p = document.createElement('p');
    p.innerHTML = '<ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>を 読む';
    expect(readableCharCount(p)).toBe('漢字を読む'.length);
  });
});
