// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Mooncap garden's frameless window buttons were dark-on-dark in every LIGHT palette.
 * Measured 2026-09-04 on the live 680x747 window in `classic-light`: `⧉ ◇ ─ ×` at 1.62:1
 * focused, 1.24:1 at rest, against a 4.5 bar. A `capturePage` of the 130x28 cluster agreed —
 * pill (13,13,19), glyph (52,52,52), a true 1.65:1.
 *
 * The defect is a SPLIT between two files that no single-file reading can see:
 *   `styles.css`  `.fwin-frameless-controls` paints a HARDCODED dark pill.
 *   `shell.css`   `.fwin-b` takes a THEME-OWNED colour derived from `--text`.
 * Swap to a light palette and only one of the two moves. This test holds the pair together,
 * so a future edit to either side has to answer for the other.
 *
 * Why a hardcoded light glyph is the correct answer rather than a theme-owned one: this
 * cluster never sits on a theme surface. `.reading-garden-sky` is a hardcoded night gradient
 * over a `#050711` root with no day phase anywhere in the component, so the ground is dark in
 * all thirteen palettes. `.popout-root-mooncap .popout-btn` — the SAME cluster in the pop-out
 * window — already ships its own `rgba(222, 242, 244, .72)` moonlight and has never had this
 * bug. This is the desktop-window half catching up.
 *
 * Comments are stripped before every assertion. This file's own prose names
 * `color-mix(in srgb, var(--text) ...)` and `rgba(16, 15, 21, 0.72)`, and a ratchet that read
 * raw text would score them as declarations — that exact shape has produced a false pass in
 * this repo before.
 */

const read = (...p: string[]) => readFileSync(resolve(__dirname, '..', ...p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const STYLES = strip(read('styles.css'));
const SHELL = strip(read('components', 'shell', 'shell.css'));
const GARDEN = strip(read('components', 'reading-garden', 'readingGarden.css'));

type Rule = { selector: string; declarations: string };
const rules = (css: string): Rule[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim().replace(/\s+/g, ' '),
    declarations: m[2],
  }));

const decl = (r: Rule, prop: string): string | null => {
  let last: string | null = null;
  for (const d of r.declarations.split(';')) {
    const m = d.match(new RegExp(`^\\s*${prop}\\s*:\\s*(.+)$`));
    if (m) last = m[1].trim();
  }
  return last;
};

type Rgba = { r: number; g: number; b: number; a: number };
const parseColour = (s: string): Rgba | null => {
  const rgba = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: rgba[4] === undefined ? 1 : +rgba[4] };
  const hex = s.match(/#([0-9a-f]{6})\b/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  return null;
};

/** `src` composited over an opaque `dst`. */
const over = (src: Rgba, dst: Rgba): Rgba => ({
  r: src.a * src.r + (1 - src.a) * dst.r,
  g: src.a * src.g + (1 - src.a) * dst.g,
  b: src.a * src.b + (1 - src.a) * dst.b,
  a: 1,
});

const relLum = (c: Rgba) => {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (x: Rgba, y: Rgba) => {
  const a = relLum(x);
  const b = relLum(y);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/**
 * `a` and `b` are ONE class each unless the selector says otherwise; `:where()` contributes 0,
 * which is the whole reason `shell.css`'s rule outranks `styles.css`'s and a fix written in the
 * wrong file computes to nothing. Only the class/attribute/pseudo-class column matters here.
 */
const classWeight = (selector: string): number => {
  const bare = selector.replace(/:where\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ');
  const classes = bare.match(/\.[A-Za-z_][-\w]*/g)?.length ?? 0;
  const attrs = bare.match(/\[[^\]]+\]/g)?.length ?? 0;
  const pseudos =
    bare.match(/:(?!:)(?:hover|focus-visible|focus|active|not|is|root|disabled|checked)\b/g)?.length ?? 0;
  return classes + attrs + pseudos;
};

/** The pill, from the file that actually paints it. */
const pillRule = rules(STYLES).find((r) => r.selector === '.fwin-frameless-controls');
/** The garden's own glyph rules, whatever their guard prefix. */
const glyphRules = rules(GARDEN).filter((r) => /\.fwin-frameless-controls .fwin-b$/.test(r.selector));
/** The garden ground the pill is translucent over. */
const gardenRoot = rules(GARDEN).find((r) => r.selector === '.reading-garden');

describe('Mooncap garden window-control contrast', () => {
  it('still paints a hardcoded dark pill that no palette can move', () => {
    expect(pillRule, '.fwin-frameless-controls moved out of styles.css').toBeTruthy();
    const bg = decl(pillRule!, 'background');
    expect(bg, 'the cluster no longer declares a background').toBeTruthy();
    expect(
      /var\(|color-mix\(/.test(bg!),
      'the pill became theme-owned — if it now tracks the palette, the hardcoded light glyph ' +
        'below is no longer the right answer and both sides must be re-measured together',
    ).toBe(false);
    const pill = parseColour(bg!);
    expect(pill, `unparseable pill background: ${bg}`).toBeTruthy();
    expect(relLum(pill!), 'the pill stopped being dark').toBeLessThan(0.05);
  });

  it('gives the glyph its own light colour rather than deriving it from --text', () => {
    expect(glyphRules.length, 'the garden sheet no longer colours the frameless controls').toBeGreaterThan(0);
    const base = glyphRules.filter((r) => !/:(hover|focus-visible|active)/.test(r.selector));
    expect(base.length, 'no resting-state rule for the cluster glyph').toBeGreaterThan(0);
    for (const r of base) {
      const c = decl(r, 'color');
      expect(c, `no colour on ${r.selector}`).toBeTruthy();
      expect(
        /var\(--text\)|color-mix\(/.test(c!),
        `${r.selector} derives its colour from the palette again — that is the defect`,
      ).toBe(false);
    }
  });

  it('outranks the shell rule that owns .fwin-b everywhere else', () => {
    const shellRule = rules(SHELL).find((r) => /\.fwin-b$/.test(r.selector) && decl(r, 'color'));
    expect(shellRule, 'the shell .fwin-b colour rule moved or was renamed').toBeTruthy();
    const shellWeight = classWeight(shellRule!.selector);
    const base = glyphRules.filter((r) => !/:(hover|focus-visible|active)/.test(r.selector));
    for (const r of base) {
      expect(
        classWeight(r.selector),
        `${r.selector} (${classWeight(r.selector)}) does not outrank ` +
          `${shellRule!.selector} (${shellWeight}); a tie is decided by sheet order and this ` +
          'fix would compute to nothing while reading exactly like a fix',
      ).toBeGreaterThan(shellWeight);
    }
  });

  it('clears 4.5:1 over its own pill in both the focused and the resting cluster', () => {
    const ground = parseColour(decl(gardenRoot!, 'background')!)!;
    const pill = parseColour(decl(pillRule!, 'background')!)!;
    const glyph = parseColour(
      decl(
        glyphRules.filter((r) => !/:(hover|focus-visible|active)/.test(r.selector))[0],
        'color',
      )!,
    )!;
    // `.fwin-frameless-controls` is a GROUP: the pill and the glyph render into one buffer and
    // the buffer is then composited at the cluster's `opacity`. 1 when the window is focused or
    // hovered, 0.55 at rest — both are states a user sees, so both are scored.
    const restOpacity = Number(
      decl(rules(STYLES).find((r) => r.selector === '.fwin-frameless-controls')!, 'opacity') ?? '1',
    );
    expect(restOpacity, 'the resting opacity left the 0..1 range').toBeGreaterThan(0);

    for (const groupA of [1, restOpacity]) {
      const pillOut = over({ ...pill, a: pill.a * groupA }, ground);
      // Inside the buffer the glyph lands on the pill; the pair then fades together.
      const glyphInBuffer = over(glyph, over(pill, ground));
      const bufferAlpha = glyph.a + pill.a * (1 - glyph.a);
      const glyphOut = over({ ...glyphInBuffer, a: bufferAlpha * groupA }, ground);
      expect(
        ratio(glyphOut, pillOut),
        `glyph on pill at group opacity ${groupA} is under the 4.5 bar`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the close button destructive on hover', () => {
    const closeHover = rules(GARDEN).find((r) =>
      /\.fwin-frameless-controls .fwin-b\.fwin-close:hover$/.test(r.selector),
    );
    expect(
      closeHover,
      'the cluster hover rule outranks shell.css`s .fwin-close:hover, so without an explicit ' +
        'restatement the one control whose hover means danger is quietly demoted to neutral',
    ).toBeTruthy();
    expect(decl(closeHover!, 'background')).toContain('--danger');
  });
});
