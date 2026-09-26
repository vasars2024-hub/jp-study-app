// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Round-3 visual sweep, Classic Light: the secondary ink of the redesigned surfaces was the
 * dark-theme recipe carried onto light grounds.
 *
 *  - The Liquid roles' muted ink (`--lq-work/anchor/liquid-text-muted`) is `--text` FADED to
 *    58-66%. On a dark ground fading moves light ink toward the ground and stays legible; on a
 *    light one it measured 2.75-4.4:1 (Files' modified column, empty states, rail counts).
 *  - A disabled switch or checkbox faded its whole label to 0.45 opacity: 2.7:1 on a light card,
 *    3.9:1 on the dark one, in every locale.
 *  - A selected tab painted its label in raw `--accent`: 3.65:1 on white.
 *
 * These cases recompute the ratios from the palette literals, so a palette edit that breaks
 * the bar fails here rather than in the next sweep.
 */

const STYLES = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const UI = readFileSync(resolve(__dirname, '..', 'components', 'ui', 'ui.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

type Block = { selector: string; body: string };
function blocks(css: string): Block[] {
  const out: Block[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
  return out;
}
function decl(body: string, name: string): string | null {
  const m = new RegExp(`(?:^|;|\\s)${name.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`).exec(body);
  return m ? m[1].trim() : null;
}

type Rgb = [number, number, number];
function hex(h: string): Rgb {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as Rgb;
}
const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(a: Rgb, b: Rgb): number {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;

/** Every palette block that declares `color-scheme: light`, with its literal colours. */
function lightPalettes() {
  const out: { id: string; bg: Rgb; panel: Rgb; panel2: Rgb; text: Rgb; muted: Rgb }[] = [];
  for (const b of blocks(STYLES)) {
    const id = /^:root\[data-theme='([^']+)'\]$/.exec(b.selector)?.[1];
    if (!id || !/color-scheme\s*:\s*light/.test(b.body)) continue;
    const get = (n: string) => {
      const v = decl(b.body, n);
      if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${id} ${n} is not a 6-digit literal: ${v}`);
      return hex(v);
    };
    out.push({ id, bg: get('--bg'), panel: get('--panel'), panel2: get('--panel-2'), text: get('--text'), muted: get('--muted') });
  }
  return out;
}

describe('light palettes: secondary ink', () => {
  const palettes = lightPalettes();

  it('finds the six light palettes', () => {
    expect(palettes.map((p) => p.id).sort()).toEqual(
      ['classic-light', 'mint-green', 'ocean-blue', 'paper', 'rose-pine', 'soft-sepia'].sort(),
    );
  });

  it.each(palettes.map((p) => [p.id, p] as const))('%s: --muted clears 4.5:1 on bg, panel and panel-2', (_id, p) => {
    for (const ground of [p.bg, p.panel, p.panel2]) expect(ratio(p.muted, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it('the faded Liquid recipe would fail there, which is why the light palettes override it', () => {
    // The default `color-mix(in srgb, var(--text) 58%, transparent)` over each light ground.
    const failing = palettes.filter((p) => ratio(over(p.text, p.panel2, 0.58), p.panel2) < 4.5);
    expect(failing.length).toBeGreaterThan(0);
  });

  it('every light palette resolves the three Liquid muted roles to its own --muted', () => {
    for (const p of palettes) {
      const covering = blocks(STYLES).filter((b) =>
        b.selector.split(',').some((s) => s.trim() === `:root[data-theme='${p.id}']`),
      );
      for (const role of ['--lq-work-text-muted', '--lq-anchor-text-muted', '--lq-liquid-text-muted']) {
        const values = covering.map((b) => decl(b.body, role)).filter(Boolean);
        expect(values, `${p.id} ${role}`).toContain('var(--muted)');
      }
    }
  });
});

describe('ui.css: disabled and selected text', () => {
  const rules = blocks(UI);
  const rule = (sel: string) => rules.find((b) => b.selector === sel);

  it.each(['.ui-toggle--disabled', '.ui-check--disabled'])('%s does not fade the whole label', (sel) => {
    const r = rule(sel);
    expect(r, `${sel} rule missing`).toBeDefined();
    expect(decl(r?.body ?? '', 'opacity')).toBeNull();
  });

  it.each([
    ['.ui-toggle--disabled .ui-toggle__track', '.ui-toggle--disabled > span:not(.ui-toggle__track)'],
    ['.ui-check--disabled .ui-check__box', '.ui-check--disabled > span:not(.ui-check__box)'],
  ])('%s fades and the sentence goes to --muted', (control, text) => {
    expect(decl(rule(control)?.body ?? '', 'opacity')).toBe('var(--alpha-disabled)');
    expect(decl(rule(text)?.body ?? '', 'color')).toBe('var(--muted)');
  });

  it('a selected tab paints its label with the accent-as-text token', () => {
    const r = rule(".ui-tab[aria-selected='true']");
    expect(decl(r?.body ?? '', 'color')).toMatch(/^var\(--accent-text\b/);
  });
});
