// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `--accent-2` is the accent mixed 28% toward WHITE (osPersonalization.ts:226). That is a
 * highlight recipe: right for a border or a fill on a dark panel, and by construction the wrong
 * direction for a glyph on a light one. Nine rules painted `color: var(--accent-2)` and on the
 * six light palettes they measured 1.34-2.69:1 against a 4.5:1 bar — swept live across all nine
 * shipped accent presets, 54 of 54 cells failing.
 *
 * `--accent-text` is the accent WHEN IT IS TEXT: `var(--accent-2)` on dark palettes (27 of 27
 * preset x dark cells already clear the bar, so moving them would only dull the accent), and
 * `color-mix(in srgb, var(--accent) 30%, var(--text))` on the light six. Mixing toward the
 * palette's own text is what makes one declaration serve both directions.
 *
 * Two failure modes this guards, both of which have happened in this file before:
 *  - a NEW light palette added without joining the override list, which silently inherits the
 *    dark default and reintroduces the defect on a surface nobody re-measures;
 *  - one of the nine rules being reverted to `var(--accent-2)` by a later edit.
 *
 * Comments are stripped first. The note at the top of styles.css quotes `--accent-2` as
 * documentation, and a substring test over the raw file reads its own explanation as the defect.
 */

const RAW = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

type Block = { selector: string; declarations: string };

function blocks(): Block[] {
  const out: Block[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    out.push({ selector, declarations: m[2] });
  }
  return out;
}

/** `:root[data-theme='x']` -> x, for every theme named anywhere in a selector list. */
function themesIn(selector: string): string[] {
  return [...selector.matchAll(/\[data-theme='([^']+)'\]/g)].map((m) => m[1]);
}

/** The nine runs that were measured failing. Each is text, not a border or a fill. */
const ACCENT_TEXT_RULES = [
  '.novel-link-article a',
  '.dict-reading',
  '.dict-anki-icon',
  '.cs-tag',
  '.flash-row-reading',
  '.flash-strip-reading',
  '.flash-reading',
  '.gram-gloss',
  '.dict-ex-btn',
];

describe('--accent-text', () => {
  it('is defined on :root, so no consumer can resolve to nothing', () => {
    const root = blocks().filter((b) => /^:root$/.test(b.selector));
    expect(root.length, 'the base :root block moved or was renamed').toBeGreaterThan(0);
    const declares = root.some((b) => /--accent-text\s*:/.test(b.declarations));
    expect(declares, ':root must carry the dark default `--accent-text: var(--accent-2)`').toBe(true);
  });

  it('is overridden by every palette that sets color-scheme: light', () => {
    const lightThemes = new Set<string>();
    for (const b of blocks()) {
      if (!/color-scheme\s*:\s*light/.test(b.declarations)) continue;
      for (const t of themesIn(b.selector)) lightThemes.add(t);
    }
    // An empty set would make the next assertion vacuously true.
    expect(lightThemes.size, 'no light palette found at all — the selector shape changed').toBe(6);

    const overridden = new Set<string>();
    for (const b of blocks()) {
      if (!/--accent-text\s*:/.test(b.declarations)) continue;
      for (const t of themesIn(b.selector)) overridden.add(t);
    }
    const missing = [...lightThemes].filter((t) => !overridden.has(t));
    expect(
      missing,
      'a light palette inheriting `--accent-text: var(--accent-2)` paints the accent lightened ' +
        'toward white on a near-white panel — 1.34-2.69:1 measured. Join the override list.',
    ).toEqual([]);
  });

  it('mixes toward the palette own --text rather than a fixed colour', () => {
    const values = blocks()
      .flatMap((b) =>
        b.declarations
          .split(';')
          .map((d) => d.match(/^\s*--accent-text\s*:\s*(.+)$/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => ({ selector: b.selector, value: m[1].trim() })),
      )
      .filter((v) => v.value !== 'var(--accent-2)');
    expect(values.length, 'no light override declares a value').toBeGreaterThan(0);
    const notDerived = values.filter(
      (v) => !v.value.includes('var(--text)') || !v.value.includes('var(--accent)'),
    );
    expect(
      notDerived.map((v) => `${v.selector} { --accent-text: ${v.value} }`),
      'a literal here is legible on exactly one palette and ignores the user accent',
    ).toEqual([]);
  });

  it('is what the nine measured text runs paint', () => {
    const found = new Map<string, string>();
    for (const b of blocks()) {
      if (!ACCENT_TEXT_RULES.includes(b.selector)) continue;
      const m = b.declarations.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
      if (m) found.set(b.selector, m[1].trim());
    }
    const absent = ACCENT_TEXT_RULES.filter((s) => !found.has(s));
    expect(absent, 'rule missing or no longer declares a colour — the predicate is stale').toEqual([]);
    const wrong = [...found.entries()].filter(([, v]) => v !== 'var(--accent-text)');
    expect(
      wrong.map(([s, v]) => `${s} { color: ${v} }`),
      'accent-as-text must read --accent-text; --accent-2 is the highlight, not the glyph',
    ).toEqual([]);
  });
});
