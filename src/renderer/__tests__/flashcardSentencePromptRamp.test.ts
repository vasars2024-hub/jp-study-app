/**
 * L7 bullet 997 — a comprehension prompt is a SENTENCE and must not ride the single-word type ramp.
 *
 * Measured live on 2026-09-03 before the fix, one card, one build, one session, with the class
 * toggled off and back on: at `clamp(42px, 8vw, 64px)` a 266-character sentence rendered **1,870px**
 * tall inside a **545px** viewport — a card of **2,017px**, or **3.70 screens**, with the grading
 * row pushed off the end of all of them. With the sentence ramp it is **702px / 849px / 1.56
 * screens**, and the toggle restored byte-identically.
 *
 * This asserts the NUMBER, not the spelling. A rename still fails the markup case below, but a
 * refactor that keeps the class and quietly restores a 64px ramp fails here — which is the failure
 * that actually reaches a user.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TSX = readFileSync(resolve(__dirname, '../components/flashcards/FlashcardsContent.tsx'), 'utf8');
const LOCAL_CSS = readFileSync(resolve(__dirname, '../components/flashcards/FlashcardsContent.css'), 'utf8');
const SHELL_CSS = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');

/** `clamp(<px>, <n>vw, <px>)` resolved at one viewport width, in px. */
function resolveClamp(decl: string, viewportPx: number): number {
  const m = decl.match(/clamp\(\s*([\d.]+)(px|rem)\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)(px|rem)\s*\)/);
  if (!m) throw new Error(`not a clamp(px, vw, px) declaration: ${decl}`);
  const toPx = (n: string, unit: string) => (unit === 'rem' ? Number(n) * 16 : Number(n));
  const min = toPx(m[1], m[2]);
  const max = toPx(m[4], m[5]);
  const pref = (Number(m[3]) / 100) * viewportPx;
  return Math.min(Math.max(pref, min), max);
}

function fontSizeOf(css: string, selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `${selector} is not declared`).toBeGreaterThan(-1);
  const block = css.slice(at, css.indexOf('}', at));
  const m = block.match(/font-size:\s*([^;]+);/);
  expect(m, `${selector} declares no font-size`).toBeTruthy();
  return (m as RegExpMatchArray)[1].trim();
}

describe('flashcards: the comprehension prompt does not use the single-word type ramp', () => {
  it('marks only the comprehension branch, and leaves the word branches alone', () => {
    // The comprehension branch is the one that renders `current.sentence`.
    expect(TSX).toContain(
      "className={`flash-word${current.promptKind === 'comprehension' ? ' flash-sentence-prompt' : ''}`}",
    );
    // The flipped-side word keeps the word ramp: it really is one word.
    expect(TSX).toContain('<span className="flash-word" lang={cardContentLang(current)}>{current.word}</span>');
    // Exactly one place applies the sentence ramp; a second would mean a word got it too.
    expect(TSX.match(/flash-sentence-prompt/g)).toHaveLength(1);
  });

  it('is strictly smaller than the word ramp at every viewport a window can have', () => {
    const word = fontSizeOf(SHELL_CSS, '.flash-review-shell .flash-word');
    const sentence = fontSizeOf(LOCAL_CSS, '.flash-view .flash-sentence-prompt');
    const widths = [320, 640, 800, 1024, 1264, 1440, 1920, 2560];
    const pairs = widths.map((w) => ({
      w,
      word: resolveClamp(word, w),
      sentence: resolveClamp(sentence, w),
    }));
    for (const p of pairs) {
      expect(p.sentence, `at ${p.w}px viewport`).toBeLessThan(p.word);
    }
    // The live measurement's own numbers, so a change that keeps the ordering but abandons the
    // magnitude cannot pass quietly: 64px is what produced 3.70 screens, 36px is what produced 1.56.
    const atMeasured = pairs.find((p) => p.w === 1264);
    expect(atMeasured?.word).toBe(64);
    expect(atMeasured?.sentence).toBe(36);
  });

  it('still overrides the shell ramp on source order, the way the recall prompt already does', () => {
    // Both are (0,2,0) specificity, so the local sheet wins only because it loads after
    // styles.css. That is measured, not assumed - `.flash-recall-prompt` computes 32px live
    // against the 22px its `.flash-review-shell .flash-meaning` rule would give it - and this
    // case pins the pairing so the two cannot drift apart.
    expect(LOCAL_CSS.indexOf('.flash-view .flash-recall-prompt')).toBeGreaterThan(-1);
    expect(LOCAL_CSS.indexOf('.flash-view .flash-sentence-prompt')).toBeGreaterThan(-1);
    expect(fontSizeOf(LOCAL_CSS, '.flash-view .flash-recall-prompt')).toContain('clamp(');
  });
});
