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
const STYLES = strip(read('styles.css'));

/** WCAG relative luminance, on 0..255 channels. */
const relLum = (c: readonly [number, number, number]) => {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratioAgainstWhite = (c: readonly [number, number, number]) => 1.05 / (relLum(c) + 0.05);

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
    // `[^{}]*` after the anchor, not `\s*`: the pop-out's toggle
    // (`.popout-btn-liquid`, `6c16653f`) SHARES this rule rather than restating
    // it, so the selector is a list and the 16% sweep below governs both hosts.
    // Matching only the bare `.fwin-b-liquid.is-liquid {` form made a shared
    // rule read as a deleted one.
    const m = WINDOW_CSS.match(
      /\.fwin-b-liquid\.is-liquid[^{}]*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--accent\)\s*(\d+)%/,
    );
    expect(m, 'the pressed fill is no longer a measurable accent mix').not.toBeNull();
    // Both hosts, or the sweep governs one button and the other drifts.
    expect(WINDOW_CSS, 'the pop-out toggle must share this measured fill').toMatch(
      /\.popout-btn-liquid\.is-liquid/,
    );
    const pct = m ? Number(m[1]) : Number.NaN;
    // The fill IS this glyph's background. 24% put it back under the bar at 4.07:1; the sweep
    // found 16 the largest share holding >= 4.5:1 on all thirteen palettes (18 -> soft-sepia 4.46).
    expect(pct, `pressed fill ${pct}% — above 16% the glyph drops under 4.5:1`).toBeLessThanOrEqual(16);
  });

  it('bounds the manga OCR "done" badge against the lightest accent a user can set, not the shipped ones', () => {
    // Category 1 scored Library at 3.69:1 on this badge, on forest-night. Sweeping the
    // four shipped accents afterwards showed the old 82% mix failed on THREE of them
    // (#10b981 3.69, #00a8c8 4.07, #6df1ff 2.02; only #ff2e4d passed at 5.17) — the live
    // surface had only ever exposed whichever theme it happened to be running.
    //
    // So the bound is not "the shipped palettes pass". `--accent` is user-settable —
    // Theme Studio writes it and the custom-CSS sandbox accepts `:root { --accent: … }` —
    // and an srgb mix is linear in encoded channels, so the LIGHTEST this fill can ever
    // be is N% of white. That is the value scored here. A percentage tuned against one
    // palette is exactly the defect this replaced.
    const rule = STYLES.match(
      /\.manga-ocr-badge--done[^{}]*\{[^}]*background:\s*color-mix\(in srgb,\s*var\(--accent[^)]*\)\s*(\d+)%\s*,\s*#000\s*\)/,
    );
    expect(rule, 'the done-badge fill is no longer a measurable accent-over-black mix').not.toBeNull();

    // The 4.5 bar is only the right bar while the glyph is white and small; if either
    // moves, this computation is measuring the wrong thing and should be rewritten.
    const base = STYLES.match(/\.manga-ocr-badge\s*\{([^}]*)\}/);
    expect(base, 'the base badge rule moved').not.toBeNull();
    expect(base?.[1], 'the badge glyph is no longer white — re-derive the bound').toMatch(/color:\s*#fff\b/);
    expect(base?.[1], 'the badge is no longer small text — the 4.5 bar may not apply').toMatch(
      /font-size:\s*11px/,
    );

    const pct = rule ? Number(rule[1]) / 100 : Number.NaN;
    const lightestPossible: [number, number, number] = [255 * pct, 255 * pct, 255 * pct];
    const worst = ratioAgainstWhite(lightestPossible);
    expect(
      worst,
      `accent mixed at ${rule?.[1]}% reaches only ${worst.toFixed(2)}:1 against white text ` +
        'when the accent itself is white; 45% is the largest share that clears 4.5',
    ).toBeGreaterThanOrEqual(4.5);
  });
});
