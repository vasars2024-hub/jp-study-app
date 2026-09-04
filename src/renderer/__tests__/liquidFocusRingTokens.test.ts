// @vitest-environment node
/**
 * The Liquid focus ring must be built from tokens that EXIST.
 *
 * `theme/liquid-surfaces.css` shipped `outline: 2px solid var(--focus-ring)`.
 * Nothing in this repo declares `--focus-ring` — the real names are the three
 * `theme/tokens.css` declares at `:root`, `--focus-ring-color` / `-width` /
 * `-offset`. A `var()` that resolves to nothing is invalid at computed-value
 * time, and the browser drops the WHOLE declaration, so the rule that exists
 * specifically to keep focus visible on translucent material did nothing on any
 * of the four surface roles.
 *
 * Two separate things are asserted, because fixing only one leaves a real
 * defect standing:
 *
 * 1. **No `--lq-*`-adjacent name is read that nothing declares.** Generalised
 *    over the whole sheet, not pinned to the one name that was wrong.
 * 2. **The ring is not hardcoded.** `a11y.css` raises the width to 3px under
 *    high contrast and `blanc.css` / `frutiger-aero.css` remap the colour; a
 *    literal `2px solid <colour>` here opts every Liquid surface out of all
 *    three, which is the accessibility invariant and the "never hardcode one
 *    shell's values into a shared component" rule at the same time.
 *
 * **Comments are stripped before anything is counted.** This repo has twice
 * produced a false reading from prose: a source ratchet scored a function name
 * inside a comment as a real call site, and a CSS guard tripped on a sentence
 * about `display: none`. `liquid-window.css` and `statsLiquid.css` both
 * document their own past repairs by naming the undeclared token they used to
 * read, so a raw-text scan reports them as live defects. Stripping is what
 * makes this guard's numbers mean anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../..');
const SURFACES = path.join(SRC, 'renderer/theme/liquid-surfaces.css');

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.coordination') continue;
      cssFiles(p, out);
    } else if (entry.name.endsWith('.css')) {
      out.push(p);
    }
  }
  return out;
}

/** Comments out. See the header — this is the whole reason the counts are trustworthy. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every custom property DECLARED anywhere in the app's CSS. */
function declaredEverywhere(): Set<string> {
  const declared = new Set<string>();
  for (const file of cssFiles(SRC)) {
    for (const m of stripComments(fs.readFileSync(file, 'utf8')).matchAll(
      /(^|[;{\s])(--[A-Za-z0-9-]+)\s*:/g,
    )) {
      declared.add(m[2]);
    }
  }
  return declared;
}

describe('Liquid surfaces — the focus ring is built from real tokens', () => {
  const sheet = stripComments(fs.readFileSync(SURFACES, 'utf8'));

  it('reads no custom property that nothing declares', () => {
    const declared = declaredEverywhere();
    // Only fallback-less reads: `var(--x, y)` degrades to `y` and is a choice,
    // not a silent failure. A bare `var(--x)` that resolves to nothing kills
    // its whole declaration.
    const read = [...sheet.matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*\)/g)].map((m) => m[1]);
    expect(read.length, 'the sheet reads custom properties at all').toBeGreaterThan(0);
    const undeclared = [...new Set(read)].filter((name) => !declared.has(name)).sort();
    expect(undeclared, `read here, declared nowhere: ${undeclared.join(', ')}`).toEqual([]);
  });

  it('spends the three focus tokens rather than a literal ring', () => {
    const rule = /:focus-visible[^{]*\{([^}]*)\}/.exec(sheet);
    expect(rule, 'liquid-surfaces.css declares a :focus-visible rule').toBeTruthy();
    const body = rule![1];
    expect(body).toMatch(/outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--focus-ring-color\)/);
    expect(body).toMatch(/outline-offset:\s*var\(--focus-ring-offset\)/);
    // The regression this catches by name: a hardcoded width or colour opts the
    // Liquid roles out of high contrast (a11y.css 3px) and out of Blanc/Aero.
    expect(body, 'the ring width is hardcoded').not.toMatch(/outline:\s*\d/);
  });

  it('the three tokens it now spends are really declared, at :root', () => {
    const tokens = stripComments(fs.readFileSync(path.join(SRC, 'renderer/theme/tokens.css'), 'utf8'));
    for (const name of ['--focus-ring-color', '--focus-ring-width', '--focus-ring-offset']) {
      expect(tokens, `${name} is declared in tokens.css`).toMatch(
        new RegExp(`(^|[;{\\s])${name}\\s*:`),
      );
    }
  });
});
