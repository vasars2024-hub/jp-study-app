// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `blanc.css` is imported by BOTH renderer entries — `blancMain.tsx` (the Blanc
 * window) and `main.tsx` (Study OS, for the Blanc panels it embeds) — and in
 * Study OS it is imported AFTER `styles.css`. So any unqualified `html` or
 * `body` selector in this sheet wins every specificity tie in a window that is
 * not Blanc.
 *
 * That is not hypothetical. `body { color: var(--blanc-text, #f5f5f7) }` did
 * exactly this: `--blanc-text` is declared on `.blanc-root`, a DESCENDANT of
 * body, so at body the variable was never set and the dark fallback painted the
 * Study OS page. `--text` had no effect on `document.body` at all. On a light
 * palette that is #f5f5f7 on #ffffff — 32 failing text runs measured in a single
 * Dictionary window, and it reproduced identically in both presentations, so it
 * was never Liquid's.
 *
 * CLAUDE.md's shell invariant is the general form: never hardcode one shell's
 * colours into anything a different shell loads.
 *
 * The check is structural rather than a spot-fix on that one rule, because the
 * next unqualified `body` rule added to this file would be just as invisible.
 */

const REPO = resolve(__dirname, '..', '..', '..');
const CSS = readFileSync(resolve(REPO, 'src', 'renderer', 'theme', 'blanc.css'), 'utf8');
const BODY = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** Innermost `selector { declarations }` pairs; at-rule preludes carry no declarations. */
function selectors(source: string): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const prelude = m[1].trim().replace(/\s+/g, ' ');
    if (!prelude) continue;
    for (const part of prelude.split(',')) {
      const sel = part.trim();
      if (!sel || sel.startsWith('@')) continue;
      out.push(sel);
    }
  }
  return out;
}

/** The leftmost compound of a selector — what decides which element it can root at. */
function firstCompound(sel: string): string {
  return sel.split(/[\s>+~]+/)[0] ?? '';
}

describe('blanc.css page baseline is scoped to the Blanc document', () => {
  it('parses a real corpus, so an empty match set cannot pass by accident', () => {
    const all = selectors(BODY);
    expect(all.length).toBeGreaterThan(400);
    expect(all).toContain('html.blanc-shell body');
  });

  it('has no unqualified html or body selector that could reach another shell', () => {
    const bare = selectors(BODY).filter((sel) => {
      const head = firstCompound(sel);
      return head === 'html' || head === 'body';
    });
    expect(
      bare,
      'blanc.css is loaded by main.tsx too, after styles.css — an unqualified root ' +
        'selector here restyles the Study OS page and its dark fallbacks win on every ' +
        `palette. Qualify with html.blanc-shell:\n${bare.join('\n')}`,
    ).toEqual([]);
  });

  it('still declares the page baseline it owns, rather than having dropped it', () => {
    const block = BODY.match(/html\.blanc-shell body\s*\{([^}]*)\}/);
    expect(block, 'the Blanc page baseline rule is gone entirely').not.toBeNull();
    const decls = block![1];
    for (const prop of ['background', 'color', 'font-family', 'font-size', 'overflow']) {
      expect(decls, `page baseline lost its ${prop}`).toContain(`${prop}:`);
    }
  });

  it('stamps blanc-shell in every document that boots blancMain', () => {
    // JS-applied would leave the Blanc window one frame unpainted, so this is
    // asserted on the HTML rather than on a boot module.
    for (const entry of ['blanc.html', 'blanc-harness.html']) {
      const html = readFileSync(resolve(REPO, entry), 'utf8');
      expect(html, `${entry} boots blancMain`).toContain('blancMain.tsx');
      expect(
        /<html[^>]*\bclass="[^"]*\bblanc-shell\b/.test(html),
        `${entry} boots blancMain but its <html> has no blanc-shell class, so the ` +
          'Blanc page baseline never applies there',
      ).toBe(true);
    }
  });

  it('does not stamp blanc-shell on the Study OS document', () => {
    // The negative control for the rule above: if index.html carried the class,
    // every assertion here would pass while the defect was fully intact.
    const html = readFileSync(resolve(REPO, 'index.html'), 'utf8');
    expect(html).toContain('main.tsx');
    expect(/<html[^>]*\bclass="[^"]*\bblanc-shell\b/.test(html)).toBe(false);
  });
});
