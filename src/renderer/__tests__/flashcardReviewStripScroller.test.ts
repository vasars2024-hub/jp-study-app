/**
 * L7 bullet 997 — the review navigator must not bury the surface it navigates.
 *
 * `.flash-view .flash-strip` turns the strip into a reflowing grid, justified in its own comment on
 * "the recent-card preview is content, not navigation". `.flash-review-strip` is the navigation and
 * it lists the WHOLE session, so it was caught by a rule that was never about it.
 *
 * Measured live 2026-09-03 on a real 3,235-card session:
 *
 *   strip height       96,806px  ->  86px
 *   window scroller    98,000px  ->  1,280px   (179.8 screens -> 2.3, viewport 545px)
 *   review card top    97,068px  ->  348px     (98.9% down the scroller -> above the fold)
 *   grading row top    97,937px  ->  1,217px
 *
 * The two-step is deliberate: restoring the flex row alone gave 326px, because in a flex row every
 * chip stretches to the tallest, and one comprehension card's `word` IS a 266-character sentence.
 * Clamping the chip label took it to 86px.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(resolve(__dirname, '../components/flashcards/FlashcardsContent.css'), 'utf8');
const TSX = readFileSync(resolve(__dirname, '../components/flashcards/FlashcardsContent.tsx'), 'utf8');

/** (ids, classes+attrs+pseudo-classes, elements) for the simple selectors used in this sheet. */
function specificity(sel: string): [number, number, number] {
  return [
    (sel.match(/#[\w-]+/g) || []).length,
    (sel.match(/\.[\w-]+/g) || []).length + (sel.match(/\[[^\]]+\]/g) || []).length,
    (sel.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length,
  ];
}
function gt(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
function blockOf(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `${selector} is not declared`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

describe('flashcards: the review strip stays a scroller, not a 96,806px wall', () => {
  it('overrides the preview grid on SPECIFICITY, not on source order', () => {
    const preview = '.flash-view .flash-strip';
    const review = '.flash-view .flash-strip.flash-review-strip';
    expect(blockOf(preview)).toContain('display: grid');
    expect(blockOf(review)).toContain('display: flex');
    // The whole point: a reorder of this sheet must not silently revert the review strip.
    expect(gt(specificity(review), specificity(preview))).toBe(true);
  });

  it('gives the review strip back its horizontal axis and no vertical one', () => {
    const block = blockOf('.flash-view .flash-strip.flash-review-strip');
    expect(block).toContain('overflow-x: auto');
    expect(block).toContain('overflow-y: hidden');
    // The grid rule sets grid-template-columns; leaving it set on a flex box is inert but
    // misleading, and it is what a later reader would blame first.
    expect(block).toContain('grid-template-columns: none');
  });

  it('clamps the chip label only where the full string is recoverable', () => {
    const block = blockOf('.flash-view .flash-review-strip .flash-strip-word');
    expect(block).toContain('-webkit-line-clamp: 2');
    expect(block).toContain('overflow: hidden');
    // A clamp is only honest if the full string has another route. The chip's own `title` is it,
    // and it must carry the SAME field the label renders (`card.word`), not a summary of it.
    // Since J10 a chip does not show its word before its card is revealed: a hidden chip's
    // title and label both name its position; a revealed chip's title and label are both the word.
    expect(TSX).toContain("title={t('flash.review.hiddenCardTitle', { position: i + 1 })}");
    expect(TSX).toContain("t('flash.review.hiddenCard', { position: i + 1 })");
    expect(TSX).toMatch(/title=\{card\.word\}\s*>\s*<span className="flash-strip-word"[^>]*>\s*\{card\.word\}/);
  });

  it('leaves the preview strips reflowing, which is what that rule was for', () => {
    // Scoped to `.flash-review-strip`, so the deck browser's recent-card previews are untouched.
    expect(CSS).toContain('.flash-view .flash-strip {');
    const review = CSS.slice(CSS.indexOf('.flash-view .flash-strip.flash-review-strip'));
    expect(review).not.toContain('.flash-strip-section');
  });
});
