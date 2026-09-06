/**
 * A window button whose label is a drawing character must carry `aria-label`.
 *
 * Measured live through the debug bridge on 2026-09-06, on all seven windows open at once
 * (Translate, Reading Finder, Anki, Settings, Immersion, Library, Dictionary): the pop-out
 * button announced as **`⧉`** and Minimize as **`─`** on 7 of 7 — fourteen controls whose
 * accessible name was a box-drawing glyph. `◇` (Make Liquid), `▢` (Maximize) and `×` (Close)
 * announced correctly in the same bars, so this was three controls right and two missed rather
 * than a missing convention.
 *
 * The cause is a rule that is easy to get wrong twice: **`title` does not name a button that
 * has its own text.** In the accessible-name computation, an element's contents outrank the
 * `title` attribute, so `title="Minimize"` on a button reading `─` yields the name `─` and the
 * tooltip is the only place the word survives. `title` is a fallback, not a label.
 *
 * A source scan rather than a render, for the reason `desktopNoteChromeInk.test.ts` gives:
 * `vitest.config.ts` is `environment: 'node'` and `DesktopShell.tsx` pulls the whole shell tree
 * at module eval. Two things stop the scan passing vacuously:
 *
 *  - **Comments are stripped first.** The repair's own comment spells out `aria-label` in prose
 *    and a raw-text scan would count that prose as a label. This repo has published a false
 *    "closed" that way before (`source-ratchet-reads-comments`).
 *  - **The glyph set is derived from the file**, not listed here. The assertion is "every
 *    glyph-only button", so a *new* one added tomorrow fails this test on arrival. A ratchet on
 *    the two known offenders would have said nothing about the third.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const SHELL = 'src/renderer/components/DesktopShell.tsx';

function shellSource(): string {
  return readFileSync(resolve(REPO, SHELL), 'utf8');
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Every `<button>` whose entire rendered child is a single non-alphanumeric character.
 *
 * Those are the ones the defect can reach: a button reading `Search` names itself, a button
 * reading `─` cannot. A conditional child (`{liquid ? '◆' : '◇'}`) counts too — both arms are
 * glyphs — so the Liquid toggle stays in scope and its existing label keeps being asserted.
 */
function glyphButtons(source: string): { glyph: string; hasAriaLabel: boolean; title: string }[] {
  const text = stripComments(source);
  const out: { glyph: string; hasAriaLabel: boolean; title: string }[] = [];
  const open = /<button\b/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(text))) {
    const tagEnd = text.indexOf('>', match.index);
    const close = text.indexOf('</button>', tagEnd);
    if (tagEnd < 0 || close < 0) continue;
    const attrs = text.slice(match.index, tagEnd);
    const children = text.slice(tagEnd + 1, close).trim();
    // A bare glyph, or a ternary whose two arms are both quoted glyphs.
    const bare = /^[^\w\s]$/u.test(children);
    const ternary = /^\{[^}]*\?\s*'([^\w\s])'\s*:\s*'([^\w\s])'\s*\}$/u.exec(children);
    if (!bare && !ternary) continue;
    const titleMatch = /title=\{([^}]*)\}/.exec(attrs);
    out.push({
      glyph: bare ? children : `${ternary?.[1]}/${ternary?.[2]}`,
      hasAriaLabel: /\baria-label=/.test(attrs),
      title: titleMatch ? titleMatch[1].trim() : '',
    });
  }
  return out;
}

describe('DesktopShell window chrome announces itself', () => {
  it('finds the glyph-only buttons at all, so the rule below is not vacuous', () => {
    const found = glyphButtons(shellSource());
    // Framed bar and frameless cluster each render pop-out, Liquid, minimize, maximize, close.
    expect(found.length).toBeGreaterThanOrEqual(8);
    expect(found.map((b) => b.glyph)).toContain('⧉');
    expect(found.map((b) => b.glyph)).toContain('─');
  });

  it('gives every glyph-only button an aria-label, because its text cannot name it', () => {
    const unnamed = glyphButtons(shellSource()).filter((b) => !b.hasAriaLabel);
    expect(unnamed.map((b) => `${b.glyph} (title=${b.title || 'none'})`)).toEqual([]);
  });

  it('does not let title stand in for the label', () => {
    // Every glyph button that carries a title must carry the label too — the pairing is the
    // repair. A title with no label is exactly the shape that shipped.
    const titledWithoutLabel = glyphButtons(shellSource()).filter(
      (b) => b.title !== '' && !b.hasAriaLabel,
    );
    expect(titledWithoutLabel).toEqual([]);
  });
});
