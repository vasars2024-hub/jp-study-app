/**
 * The Reading Captures surface's 32px POINTER floor.
 *
 * Rubric category 1, driven live through the debug bridge against the real
 * `Reading Finder` window at 820x580 on 42 real captures:
 *
 *   belowFloorByHit   3 -> 0        stolen 0 -> 0     occluded 0 -> 0
 *   verdict           FAIL -> PASS 10/10 (targets32 was the only failed bar)
 *
 * The three were two `.reading-captures-list-toggle` instances in
 * `.reading-captures-reader-head` and one `.reading-captures-refresh` in
 * `.lq-reading-tool-head`. Both rules hardcoded `26px`, measured 26.99x26.99 by
 * pointer, and the hit walk named the surrounding header as the blocker. The
 * window chrome's 24px `.fwin-b` buttons sit below the floor by RECT and pass by
 * POINTER at 32.02 — they are shared chrome and are not this surface's to fix.
 *
 * Source-level assertions for the reason `agentHitFloorAccentText.test.ts`
 * gives: a CSS geometry contract is not observable in jsdom.
 *
 * The token rather than a second literal. `--lq-hit-target` is 32px and has 96
 * call sites; `.lq-reading-tool-close`, sitting in the same header as the
 * refresh button, already took it and already passed. A hardcoded number is how
 * the first one survived, so pinning `32px` here would preserve the defect's
 * shape while fixing its value.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(
  resolve(__dirname, '../views/readingCaptures.css'),
  'utf8',
);

/** The declaration block of one top-level rule, by exact selector. */
function block(css: string, selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('reading captures hit floor', () => {
  it('floors both icon buttons on the shared token, not a literal', () => {
    for (const selector of ['.reading-captures-list-toggle', '.reading-captures-refresh']) {
      const rule = block(CSS, selector);
      expect(rule).toMatch(/min-width:\s*var\(--lq-hit-target\);/);
      expect(rule).toMatch(/min-height:\s*var\(--lq-hit-target\);/);
    }
  });

  it('leaves no hardcoded sub-floor box anywhere in the sheet', () => {
    // The defect was a number, so the guard is against the number. 26px was the
    // measured value; anything under the 32px floor declared as a literal
    // min-width/min-height re-opens the same cell.
    const literals = Array.from(
      CSS.matchAll(/min-(?:width|height):\s*(\d+)px/g),
      (m) => Number(m[1]),
    );
    expect(literals.filter((n) => n < 32)).toEqual([]);
  });
});
