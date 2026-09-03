/**
 * L7 bullet 997 — the grading row keeps its position while the review task advances.
 *
 * Measured live on 2026-09-03, one build, one session, 10 cards driven through the review
 * strip and revealed with a real click at the Show-answer button's own centre: BEFORE,
 * `.flash-actions` moved on **6 of 10** cards, max **88 px**, because the card grew
 * 360 -> 448 px (and, on two cards whose prompt outran their answer, shrank 849/1011 -> 501/554).
 * AFTER, **0 of 10** moved and the max shift is **0 px**. Negative control, same instrument,
 * same session: re-declaring the card `flex: 0 0 auto; overflow-y: visible` through an injected
 * sheet put it back to **4 of 6 moved, max 88 px**, and removing that sheet returned 0 of 6.
 *
 * The property is not "the card is 360px" — it is that the card's used height contains no term
 * for its own content, which is what a zero flex-basis buys. The model below computes the
 * grading row's offset for two very different answer heights and requires them equal, so a
 * refactor that keeps the class names and quietly restores a content-sized card fails here.
 *
 * TRAP this file is written around: `.flash-review-shell .flash-card` also appears inside a
 * PROSE COMMENT in styles.css, and a raw `indexOf` finds the comment first. Every lookup here
 * runs on a comment-stripped copy. (Same failure this repo has already banked twice — a CSS
 * comment failing a CSS test, and a source ratchet counting a comment as a call site.)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAW = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the LAST rule with this exact selector, as a property->value map. */
function ruleOf(selector: string): Record<string, string> {
  const needle = `\n${selector} {`;
  const at = CSS.lastIndexOf(needle);
  expect(at, `${selector} is not declared`).toBeGreaterThan(-1);
  const open = at + needle.length;
  const close = CSS.indexOf('}', open);
  const out: Record<string, string> = {};
  for (const decl of CSS.slice(open, close).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

const REVIEW_VIEW = ruleOf('.flash-view.review');
const SHELL = ruleOf('.flash-review-shell');
const CARD = ruleOf('.flash-review-shell .flash-card');
const ACTIONS = ruleOf('.flash-review-shell .flash-actions');

/** `flex: <grow> <shrink> <basis>` — the basis is the whole point. */
function flexBasisOf(rule: Record<string, string>, selector: string): string {
  const parts = (rule.flex ?? '').split(/\s+/).filter(Boolean);
  expect(parts.length, `${selector} declares no three-part flex shorthand`).toBe(3);
  return parts[2];
}

/**
 * Used height of a flex-column item, reduced to the only question that matters: does the
 * result depend on `contentPx`? A zero basis means the item's hypothetical main size is 0,
 * so content never enters — it is the leftover space, floored by min-height.
 */
function cardUsedHeight(contentPx: number, leftoverPx: number): number {
  const basis = flexBasisOf(CARD, '.flash-review-shell .flash-card');
  const grow = Number((CARD.flex ?? '').split(/\s+/)[0]);
  const floor = Number.parseFloat(CARD['min-height'] ?? '0');
  const hypothetical = basis === '0' || basis === '0px' ? 0 : contentPx;
  return Math.max(floor, grow > 0 ? Math.max(hypothetical, leftoverPx) : hypothetical);
}

describe('flashcards: the grading row does not move when the answer is revealed', () => {
  it('sizes the review card from the window, not from the answer', () => {
    // The two live extremes actually measured on this surface, plus the floor case.
    const leftover = 146; // 545px window body, minus the shell's fixed chrome
    const shortAnswer = cardUsedHeight(360, leftover);
    const longAnswer = cardUsedHeight(1011, leftover);
    expect(longAnswer).toBe(shortAnswer);
    // ...and in a tall window, where there IS space to claim, it still ignores the content.
    const roomy = 900;
    expect(cardUsedHeight(1011, roomy)).toBe(cardUsedHeight(360, roomy));
    expect(cardUsedHeight(360, roomy)).toBe(roomy);
  });

  it('pins the mechanism: a zero flex-basis under a bounded column', () => {
    expect(flexBasisOf(CARD, '.flash-review-shell .flash-card')).toBe('0');
    expect(SHELL.display).toBe('flex');
    expect(SHELL['flex-direction']).toBe('column');
    // The column needs a definite height to have leftover space to hand out. Against an
    // indefinite host this resolves to `auto` and the min-height floor carries the property.
    expect(REVIEW_VIEW.height).toBe('100%');
    expect(REVIEW_VIEW['align-items']).toBe('stretch');
    // The row must not absorb the card's overflow by shrinking; that would move it again.
    expect(ACTIONS.flex).toBe('0 0 auto');
  });

  it('keeps a long answer readable instead of clipping it', () => {
    // Capping the card is only honest if the overflow is still reachable. Live, 6 of 10
    // sampled answers overflowed (max 194px); all 6 scrolled, none was clipped at the top,
    // and the last line of each was fully visible and hit-testable after scrolling.
    expect(CARD['overflow-y']).toBe('auto');
    // A plain `center` in a scroll container puts the overflow ABOVE the scrollport, where
    // no scroll can reach it. `safe` degrades to flex-start exactly then.
    expect(CARD['justify-content']).toBe('safe center');
  });
});
