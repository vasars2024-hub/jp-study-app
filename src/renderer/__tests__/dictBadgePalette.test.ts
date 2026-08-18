// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The dictionary badges (`common` / `jlpt` / `freq` / `bundled`) carried fixed
 * pastel labels — #aeb6ff, #f3a3b0, #c9b0e8, #9fd49f — chosen against Study OS's
 * dark panel. A pastel is only legible on a dark ground, so on every light
 * palette they measured pastel-on-near-white: 10 failing text runs in a single
 * Dictionary window at 1.56:1 against a 4.5:1 bar.
 *
 * The fix is a shape, not four new constants: each badge declares one saturated
 * `--dict-badge-hue`, the chip tints with it, and the LABEL is that hue mixed
 * toward `var(--text)`. Mixing toward the palette's own text is what makes it
 * bidirectional — near-white on a dark theme reconstructs the pastel, #1e1e1e on
 * a light one yields a dark tint of the same hue.
 *
 * So the assertion is that the label reads the palette, not that it equals some
 * value: a future edit that hardcodes a "better" pastel is the same defect back.
 */

const CSS = readFileSync(
  resolve(__dirname, '..', 'styles.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `selector { declarations }` block whose selector list mentions .dict-badge. */
function badgeBlocks(): { selector: string; declarations: string }[] {
  const out: { selector: string; declarations: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    if (!/\.dict-badge\b/.test(selector)) continue;
    out.push({ selector, declarations: m[2] });
  }
  return out;
}

describe('dictionary badges follow the palette', () => {
  it('finds the badge rules at all, so an empty set cannot pass', () => {
    const blocks = badgeBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    const hues = CSS.match(/--dict-badge-hue:/g) ?? [];
    expect(hues.length, 'one hue per badge variant').toBeGreaterThanOrEqual(4);
  });

  it('never sets a badge label to a literal colour', () => {
    const offenders: string[] = [];
    for (const { selector, declarations } of badgeBlocks()) {
      for (const decl of declarations.split(';')) {
        const m = decl.match(/^\s*color\s*:\s*(.+)$/);
        if (!m) continue;
        const value = m[1].trim();
        if (/^#[0-9a-f]{3,8}$/i.test(value) || /^(rgba?|hsla?)\s*\(/i.test(value)) {
          offenders.push(`${selector} { color: ${value} }`);
        }
      }
    }
    expect(
      offenders,
      'a fixed label colour is legible on exactly one palette. Derive it: ' +
        `color-mix(in srgb, var(--dict-badge-hue) 42%, var(--text)).\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('derives every badge label from var(--text)', () => {
    const labels = badgeBlocks()
      .flatMap(({ selector, declarations }) =>
        declarations
          .split(';')
          .map((d) => d.match(/^\s*color\s*:\s*(.+)$/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => ({ selector, value: m[1].trim() })),
      );
    expect(labels.length, 'no badge declares a label colour at all').toBeGreaterThan(0);
    const notPaletteDriven = labels.filter((l) => !l.value.includes('var(--text)'));
    expect(
      notPaletteDriven.map((l) => `${l.selector} { color: ${l.value} }`),
      'a badge label that does not read --text cannot move with the palette',
    ).toEqual([]);
  });
});
