// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Window chrome in Liquid presentation does not sit on `--sidebar`. `.fwin-bar` is
 * `background: transparent` there, so the title glyphs sit on the frame material over
 * `.os-desktop`, which paints an OPAQUE near-black whatever the palette is. On a light palette
 * that composites to a MID-GREY, and a mid-grey ground is squeezed from both sides: measured on
 * the live Liquid Dictionary window, `var(--text)` ITSELF — the darkest colour those palettes
 * own — only reached 4.42:1 on soft-sepia. The ground was the defect, not the glyph.
 *
 * Two things hold the fix up, and each is a separate way it can silently come undone:
 *
 * 1. The light palettes opacify `--lq-liquid-bg`. Without that no glyph colour can pass.
 * 2. The winning `.fwin-b` rule derives its colour from `--text`. The winning rule is in
 *    `shell.css`, NOT `styles.css` — `:where()` contributes 0, so
 *    `.fwin:where(...) .fwin-b` is (0,2,0) and outranks `styles.css`'s (0,1,0) `.fwin-b`.
 *    A fix written in the wrong file computes to nothing and reads exactly like a fix; that
 *    already happened once in this slice.
 */

const read = (...p: string[]) => readFileSync(resolve(__dirname, '..', ...p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const TOKENS = strip(read('theme', 'liquid-tokens.css'));
const SHELL = strip(read('components', 'shell', 'shell.css'));
const WINDOW_CSS = strip(read('theme', 'liquid-window.css'));

const LIGHT_PALETTES = ['classic-light', 'soft-sepia', 'ocean-blue', 'mint-green', 'rose-pine', 'paper'];

describe('Liquid window chrome contrast', () => {
  it('opacifies the liquid material on every light palette', () => {
    // The block must both name every light palette and actually redefine the material.
    const blocks = [...TOKENS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((m) => ({ selector: m[1].trim().replace(/\s+/g, ' '), declarations: m[2] }))
      .filter((b) => /--lq-liquid-bg\s*:/.test(b.declarations));
    expect(blocks.length, 'no rule defines --lq-liquid-bg at all').toBeGreaterThan(0);

    const covered = new Set<string>();
    for (const b of blocks) {
      if (!/--lq-liquid-bg\s*:/.test(b.declarations)) continue;
      for (const m of b.selector.matchAll(/\[data-theme='([^']+)'\]/g)) covered.add(m[1]);
    }
    const missing = LIGHT_PALETTES.filter((p) => !covered.has(p));
    expect(
      missing,
      'a light palette left on the base 72% material puts its own title glyphs under 4.5:1 ' +
        'and no glyph colour can rescue it',
    ).toEqual([]);
  });

  it('derives the window-control glyph from --text in the rule that actually wins', () => {
    const winning = [...SHELL.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((m) => ({ selector: m[1].trim().replace(/\s+/g, ' '), declarations: m[2] }))
      .filter((b) => /\.fwin-b\s*$/.test(b.selector) || /\.fwin-b\s*\{?$/.test(b.selector));
    expect(winning.length, 'the shell .fwin-b rule moved or was renamed').toBeGreaterThan(0);

    const colours = winning
      .flatMap((b) =>
        b.declarations
          .split(';')
          .map((d) => d.match(/^\s*color\s*:\s*(.+)$/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => m[1].trim()),
      );
    expect(colours.length, 'the winning rule no longer sets a colour').toBeGreaterThan(0);
    expect(
      colours.filter((c) => !c.includes('var(--text)')),
      'the glyph must read the palette; --muted measured 4.04-4.22:1 on the light six',
    ).toEqual([]);
  });

  it('never paints the liquid toggle glyph with the raw accent', () => {
    const toggle = [...WINDOW_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((m) => ({ selector: m[1].trim().replace(/\s+/g, ' '), declarations: m[2] }))
      .filter((b) => b.selector.includes('.fwin-b-liquid') && b.selector.includes('.is-liquid'));
    expect(toggle.length, 'the pressed-state rule moved').toBeGreaterThan(0);
    const colours = toggle.flatMap((b) =>
      b.declarations
        .split(';')
        .map((d) => d.match(/^\s*color\s*:\s*(.+)$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => `${b.selector} { color: ${m[1].trim()} }`),
    );
    expect(
      colours,
      'the accent is the FILL here, not the glyph — as a 13px glyph it measured 3.06:1, and ' +
        'even --accent-text only reaches 4.12 on this ground',
    ).toEqual([]);
  });

  it('keeps the pressed fill low enough not to eat its own glyph', () => {
    const m = WINDOW_CSS.match(
      /\.fwin-b-liquid\.is-liquid\s*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--accent\)\s*(\d+)%/,
    );
    expect(m, 'the pressed fill is no longer a measurable accent mix').not.toBeNull();
    const pct = m ? Number(m[1]) : Number.NaN;
    // The fill IS this glyph's background. 24% put it back under the bar at 4.07:1; the sweep
    // found 16 the largest share holding >= 4.5:1 on all thirteen palettes (18 -> soft-sepia 4.46).
    expect(pct, `pressed fill ${pct}% — above 16% the glyph drops under 4.5:1`).toBeLessThanOrEqual(16);
  });
});
