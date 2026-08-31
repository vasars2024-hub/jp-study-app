// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * L9's gate, in its own words: "all theme/mode combinations pass WITHOUT
 * IDENTITY LEAKAGE."
 *
 * `terminalModeSettings.ts:137-146` stamps six `data-wired-*` attributes on
 * `<html>` on every boot, under every theme — the Wired settings exist even when
 * no Wired root is mounted. Every wired sheet is imported unconditionally in
 * `main.tsx`, so a `:root[data-wired-motion='off'] .fwin` rule is live in
 * forest-night too, and a Wired-only preference silently restyles Study OS.
 *
 * Measured before the fix, live, on the running app under forest-night with
 * `data-materials` absent: setting `data-wired-motion='off'` took a real
 * `.fwin.fwin-anim-opening` from `fwinIn` / 0.14s to `none` / 0s. The generic
 * subjects reachable that way were `.fwin*`, `.os-task-win`, `.os-taskbar`,
 * `.ui-toast*`, `.flash-card*`, `.stats-*`, `.dict-results article`,
 * `.immersion-stage`, `.widget-frame`, `.os-clock`, `.media-player` and the
 * `.wgt-*` desktop widgets — i.e. most of the shell.
 *
 * `data-materials` is the identity scope the app already uses: `engine.ts:121`
 * is the single choke point that stamps it, and `wired-archive.ts:13` sets
 * `materialSet: 'wired'`. It is also what Blanc strips (`main.tsx:207`,
 * `blancMain.tsx:92`) precisely so the secret material packs cannot reach it, so
 * scoping here fixes the Blanc cold-open boundary in the same stroke.
 */

const THEME_DIR = resolve(__dirname, '..', 'theme');

/**
 * Identity attribute prefix → the material scope its rules must carry, and the
 * floor of gates the corpus must contain for the check to mean anything.
 *
 * Aero is here because it is currently CLEAN and must stay that way: every
 * `[data-aero-*]` and `[data-app-border]` rule in the tree already carries
 * `[data-materials='aero']`, which is what made the unscoped wired set legible
 * as an oversight rather than a design. `data-app-border` belongs to Aero by
 * design — `AppearancePage.tsx:89`: "Both cards are inert outside Aero and
 * always were".
 */
const IDENTITIES = [
  { attr: '[data-wired-', scope: "[data-materials='wired']", floor: 40 },
  { attr: '[data-aero-', scope: "[data-materials='aero']", floor: 10 },
  { attr: '[data-app-border', scope: "[data-materials='aero']", floor: 10 },
] as const;

/** Strip comments so prose naming an attribute cannot fail or satisfy a match. */
const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every selector prelude in the file, comments already gone. */
function selectors(source: string): string[] {
  const out: string[] = [];
  for (const m of stripComments(source).matchAll(/([^{}]+)\{/g)) {
    const prelude = m[1].trim().replace(/\s+/g, ' ');
    if (!prelude || prelude.startsWith('@')) continue;
    // A comma-separated group leaks if ANY of its selectors does.
    for (const one of prelude.split(',')) {
      const s = one.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

const sheets = [
  ...readdirSync(THEME_DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => ({ name: `theme/${f}`, text: readFileSync(resolve(THEME_DIR, f), 'utf8') })),
  { name: 'styles.css', text: readFileSync(resolve(THEME_DIR, '..', 'styles.css'), 'utf8') },
];

describe.each(IDENTITIES)('secret shell identity scope — $attr', ({ attr, scope, floor }) => {
  const gated = sheets.flatMap((s) => selectors(s.text).map((sel) => ({ sheet: s.name, sel })))
    .filter((g) => g.sel.includes(attr));

  it('reads a corpus that actually contains the gates', () => {
    // Without this the whole block passes by matching nothing — the shape of
    // false pass this repo has already produced three separate ways.
    expect(gated.length).toBeGreaterThan(floor);
  });

  it('never lets the rule apply outside its own material set', () => {
    const leaks = gated.filter((g) => !g.sel.includes(scope)).map((g) => `${g.sheet}: ${g.sel}`);
    expect(
      leaks,
      `these preferences are stamped on <html> under EVERY theme, so an unscoped ` +
        `rule restyles Study OS, the other secret shell, and Blanc from a setting ` +
        `that belongs to one identity. Prefix with ${scope}:\n${leaks.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps the scope on the root, where the attribute is actually stamped', () => {
    // `[data-materials='wired'] :root[data-wired-...]` would read as "scoped"
    // above while matching nothing at all — a gate that silently deletes the
    // feature looks the same as one that fixes the leak.
    const prefix = `:root${scope}`;
    const misplaced = gated
      .filter((g) => g.sel.includes(scope) && !g.sel.startsWith(prefix))
      .map((g) => `${g.sheet}: ${g.sel}`);
    expect(
      misplaced,
      `the material scope must sit on :root itself — engine.ts:121 stamps ` +
        `data-materials on <html>:\n${misplaced.join('\n')}`,
    ).toEqual([]);
  });
});
