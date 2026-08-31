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

/**
 * L9 bullet 4's other half: the Blanc cold-open boundary.
 *
 * Blanc shares the persisted theme id, and `bootTheme()` stamps
 * `data-theme='wired-archive'` on its root like everyone else's. It defends
 * itself two ways: `blancMain.tsx:92` strips `data-materials` and a
 * MutationObserver keeps it stripped, and the entry imports a SIX-SHEET set
 * that excludes `styles.css` and every secret material pack — so the
 * `:root[data-theme='wired-archive']` palette block does not exist in that
 * document at all.
 *
 * The second defence is the load-bearing one and nothing guarded it. Measured
 * live in the Study OS window, where those sheets ARE loaded, with
 * `data-materials` absent — i.e. Blanc's exact attribute state: setting
 * `data-theme='wired-archive'` alone moved `--bg` #0c1410 → #02070d, `--text`
 * → #d8fbff, `--panel` → #06121a, and `frutiger-aero` moved `--bg` → #9ed8f2.
 * So stripping the materials attribute does NOT stop the palette; only the
 * absent sheet does. One import added to blancMain.tsx re-opens it silently.
 */
describe('Blanc cold-open boundary', () => {
  const ENTRY = readFileSync(resolve(__dirname, '..', 'blancMain.tsx'), 'utf8');
  const imported = [...ENTRY.matchAll(/^import\s+'(\.[^']+\.css)';/gm)].map((m) => m[1]);

  it('reads the real entry, with its real sheet list', () => {
    // main.ts:545 loads `blanc.html?blanc=1`, and blanc.html:14 points here.
    expect(imported.length).toBeGreaterThan(3);
  });

  it('never pulls a secret material pack or the Study OS sheet into Blanc', () => {
    const forbidden = imported.filter((p) =>
      /(^|\/)styles\.css$/.test(p) || /\/(wired|aero|frutiger)[a-z-]*\.css$/.test(p),
    );
    expect(
      forbidden,
      `Blanc keeps data-theme, so importing any sheet that declares a ` +
        `:root[data-theme='wired-archive'|'frutiger-aero'] palette hands Blanc the ` +
        `secret shell's colours on cold open — stripping data-materials does not ` +
        `stop it:\n${forbidden.join('\n')}`,
    ).toEqual([]);
  });

  it('still strips the material attribute, and keeps it stripped', () => {
    // Belt AND suspenders: the sheet list is the palette defence, this is the
    // defence for everything keyed on [data-materials] that Blanc does import
    // (liquid-tokens.css declares aero/wired variants of the --lq-* roles).
    expect(ENTRY).toMatch(/removeAttribute\('data-materials'\)/);
    expect(ENTRY).toMatch(/MutationObserver/);
  });
});
