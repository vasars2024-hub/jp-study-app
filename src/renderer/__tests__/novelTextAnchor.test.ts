// @vitest-environment jsdom
/**
 * The novel reader stores a CHARACTER fraction, so the same text comes back
 * after the font, margins or window change (scorecard: the old geometric
 * fraction drifted when the font changed). Geometry is faked: each layout is a
 * function from character index to distance, as a real reflow would produce.
 */
import { describe, expect, it } from 'vitest';
import {
  ANCHOR_SLACK_PX,
  anchorChars,
  charFractionAt,
  distanceOfCharFraction,
  firstCharAtOrAfter,
  pageOfDistance,
  readingStartPadPx,
  type CharDistance,
  type CharPos,
} from '../novelTextAnchor';

function part(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

/** A layout with `perLine` characters per line and `advance` px between lines. */
function lineLayout(root: Element, perLine: number, advance: number): CharDistance {
  const chars = anchorChars(root);
  const index = new Map<CharPos['node'], Map<number, number>>();
  chars.forEach((c, i) => {
    if (!index.has(c.node)) index.set(c.node, new Map());
    index.get(c.node)!.set(c.offset, i);
  });
  return (pos) => {
    const i = index.get(pos.node)?.get(pos.offset);
    return i === undefined ? null : Math.floor(i / perLine) * advance;
  };
}

describe('anchorChars', () => {
  it('counts running text only: no whitespace, furigana or inserted translation', () => {
    const root = part(
      '<p>  <ruby>猫<rp>(</rp><rt>ねこ</rt><rp>)</rp></ruby>が\n 好き</p>' +
        '<p class="novel-translation-block">I like cats</p><p>𠮷野</p>',
    );
    const text = anchorChars(root)
      .map((c) => c.node.data.slice(c.offset, c.offset + c.length))
      .join('');
    expect(text).toBe('猫が好き𠮷野');
    // A surrogate pair is one character spanning two code units.
    expect(anchorChars(root).find((c) => c.length === 2)?.node.data).toBe('𠮷野');
  });

  it('is unchanged when furigana are hidden or a translation is shown', () => {
    const plain = part('<p><ruby>窓<rt>まど</rt></ruby>辺の猫</p>');
    const translated = part(
      '<p><ruby>窓<rt>まど</rt></ruby>辺の猫</p><div class="novel-translation-block">The cat</div>',
    );
    expect(anchorChars(plain).length).toBe(anchorChars(translated).length);
  });
});

describe('firstCharAtOrAfter', () => {
  it('finds the first character on or after the reading start', () => {
    const root = part(`<p>${'あ'.repeat(100)}</p>`);
    const chars = anchorChars(root);
    const d = lineLayout(root, 10, 30); // 10 lines of 10 chars, 30 px apart
    expect(firstCharAtOrAfter(chars, d, 0)).toBe(0);
    expect(firstCharAtOrAfter(chars, d, 60)).toBe(20);
    expect(firstCharAtOrAfter(chars, d, 61)).toBe(30);
    expect(firstCharAtOrAfter(chars, d, 10_000)).toBe(100);
  });

  it('skips characters that have no box', () => {
    const root = part(`<p>${'い'.repeat(40)}</p>`);
    const chars = anchorChars(root);
    const base = lineLayout(root, 10, 30);
    // Every character of the third line is unmeasurable except its last one.
    const holes: CharDistance = (pos) => {
      const i = chars.findIndex((c) => c.node === pos.node && c.offset === pos.offset);
      return i >= 20 && i < 29 ? null : base(pos);
    };
    expect(firstCharAtOrAfter(chars, holes, 60)).toBe(20);
    expect(firstCharAtOrAfter(chars, holes, 90)).toBe(30);
  });
});

describe('a saved position survives a reflow', () => {
  const text = `<p>${'吾輩は猫である。'.repeat(150)}</p>`; // 1,200 characters

  it('scroll mode: the same character is at the reading start at any font size', () => {
    const root = part(text);
    const small = lineLayout(root, 40, 28); // small font: 40 chars a line
    const large = lineLayout(root, 16, 50); // large font: 16 chars a line
    // Reading at line 12 in the small layout (char 480).
    const frac = charFractionAt(root, small, 12 * 28 - ANCHOR_SLACK_PX)!;
    expect(frac).toBeCloseTo(480 / 1200, 6);
    // After the font change the stored character is on line 30 (480 / 16).
    expect(distanceOfCharFraction(root, large, frac)).toBe(30 * 50);
  });

  it('paged mode: the page holding the character, not the old page fraction', () => {
    // A heading-like first line (2 chars) then full lines: page fractions and
    // character fractions disagree.
    const root = part(`<h2>序章</h2><p>${'あ'.repeat(998)}</p>`);
    const chars = anchorChars(root);
    const layout =
      (perLine: number, advance: number): CharDistance =>
      (pos) => {
        const i = chars.findIndex((c) => c.node === pos.node && c.offset === pos.offset);
        if (i < 0) return null;
        const line = i < 2 ? 0 : 1 + Math.floor((i - 2) / perLine);
        return line * advance;
      };
    const small = layout(20, 30); // 51 lines, 10 lines a page (step 300)
    const large = layout(10, 60); // 101 lines, 5 lines a page (step 300)
    // Page 3 of the small layout starts at line 30 → char 2 + 29*20 = 582.
    const frac = charFractionAt(root, small, 3 * 300 - ANCHOR_SLACK_PX)!;
    expect(Math.round(frac * chars.length)).toBe(582);
    const d = distanceOfCharFraction(root, large, frac)!;
    // char 582 is on large line 1 + 58 = 59 → page 11 (lines 55–59).
    expect(pageOfDistance(d, 300, 21)).toBe(11);
  });

  it('saving straight after a restore picks the same line (no drift per round-trip)', () => {
    const root = part(text);
    const layout = lineLayout(root, 20, 36);
    const frac = charFractionAt(root, layout, 10 * 36)!;
    // Restore places the character half an em inside the reading start…
    const pad = readingStartPadPx(20);
    const scrolledTo = distanceOfCharFraction(root, layout, frac)! - pad;
    // …and saving from there finds the same line again.
    const again = charFractionAt(root, layout, scrolledTo - ANCHOR_SLACK_PX)!;
    expect(again).toBe(frac);
  });

  it('a part without text has no character anchor (caller falls back)', () => {
    const root = part('<p><img alt=""></p>');
    expect(charFractionAt(root, () => 0, 0)).toBeNull();
    expect(distanceOfCharFraction(root, () => 0, 0.5)).toBeNull();
  });

  it('text without layout (no boxes) gives no anchor rather than "the start"', () => {
    const root = part('<p>本文がある</p>');
    expect(charFractionAt(root, () => null, 100)).toBeNull();
    expect(distanceOfCharFraction(root, () => null, 0.5)).toBeNull();
  });
});

describe('pageOfDistance', () => {
  it('clamps into the page grid and tolerates sub-pixel lines', () => {
    expect(pageOfDistance(0, 300, 5)).toBe(0);
    expect(pageOfDistance(299, 300, 5)).toBe(1); // a hair before the boundary
    expect(pageOfDistance(290, 300, 5)).toBe(0);
    expect(pageOfDistance(5000, 300, 5)).toBe(4);
    expect(pageOfDistance(100, 0, 5)).toBe(0);
    expect(pageOfDistance(100, 300, 1)).toBe(0);
  });
});
