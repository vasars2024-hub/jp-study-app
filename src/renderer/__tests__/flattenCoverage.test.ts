// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  applyFlatten,
  isFlattened,
  readFlattenInputs,
  shouldFlatten,
  type FlattenInputs,
} from '../theme/flatten';

/**
 * L11 "Blur fallback", the half a token cannot reach.
 *
 * Every one of the app's six "stop painting translucent material" states works
 * by re-declaring `--lq-*-blur` / `--glass-blur` / `--blur-*` on `:root`. That
 * grades TOKENS, so a rule that writes `backdrop-filter: blur(15px)` in literal
 * pixels answers none of them. `theme/flatten.css` converts those rules under a
 * single derived `data-lq-flat` attribute.
 *
 * A conversion file that mirrors 14 other sheets by hand goes stale the first
 * time somebody adds a glass surface. So this suite does not check the file
 * against a list written down here — it re-derives the census FROM THE SHEETS
 * on every run and fails when a hardcoded rule has no counterpart.
 */

const SRC = resolve(__dirname, '..', '..');
const FLATTEN_CSS_PATH = resolve(__dirname, '..', 'theme', 'flatten.css');

/**
 * Dev-only harness sheet. It ships in no build, so converting it would be dead
 * CSS; it is named rather than pattern-matched so a new harness cannot slip an
 * unconverted product surface past this suite under the same excuse.
 */
const EXEMPT = new Set(['renderer/__devharness__/readingGardenPhaseGallery.css']);

function listCss(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listCss(full, out);
    else if (entry.endsWith('.css')) out.push(full);
  }
  return out;
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

type Rule = { selector: string; body: string };

function parseRules(css: string): Rule[] {
  const out: Rule[] = [];
  // Hoisted deliberately: stripping inside the loop condition allocates a fresh
  // copy of the sheet per rule, which is ~6 GB across styles.css alone.
  const source = stripComments(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const selector = m[1].trim().replace(/\s+/g, ' ').replace(/^[};]+\s*/, '');
    if (!selector || selector.startsWith('@')) continue;
    out.push({ selector, body: m[2] });
  }
  return out;
}

function backdropValue(body: string): string | null {
  const m = body.match(/(?:^|;)\s*backdrop-filter\s*:\s*([^;]+)/);
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

const isReset = (value: string): boolean => /^(none|unset|initial|revert)\b/.test(value);
const isTokenDriven = (value: string): boolean => value.includes('var(--');

/**
 * The part of a selector that names the SURFACE, with the root-level state
 * attributes (`html[data-chrome='frosted']`, `:root[data-materials='aero']`)
 * removed. That is the key a flatten rule has to end with; the state attributes
 * differ between the two files by design, because flatten adds `[data-lq-flat]`.
 */
function surfaceKey(part: string): string {
  return part
    .trim()
    .replace(/^(?:html|:root)(?:\[[^\]]*\])*\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type Census = { file: string; selector: string; value: string; keys: string[] };

function hardcodedCensus(): Census[] {
  const out: Census[] = [];
  for (const file of listCss(SRC)) {
    const rel = relative(SRC, file).replace(/\\/g, '/');
    if (rel === 'renderer/theme/flatten.css' || EXEMPT.has(rel)) continue;
    for (const rule of parseRules(readFileSync(file, 'utf8'))) {
      const value = backdropValue(rule.body);
      if (!value || isReset(value) || isTokenDriven(value)) continue;
      const keys = rule.selector
        .split(',')
        .map(surfaceKey)
        .filter((k) => k.length > 0);
      out.push({ file: rel, selector: rule.selector, value, keys });
    }
  }
  return out;
}

function flattenSelectorParts(css: string): string[] {
  return parseRules(css)
    .flatMap((rule) => rule.selector.split(','))
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => part.includes('[data-lq-flat]'));
}

/** A census entry is covered when one flatten selector targets the same surface. */
function uncovered(census: Census[], flattenParts: string[]): Census[] {
  return census.filter(
    (entry) =>
      !entry.keys.every((key) =>
        flattenParts.some((part) => part === key || part.endsWith(` ${key}`)),
      ),
  );
}

const CENSUS = hardcodedCensus();
const FLATTEN_CSS = readFileSync(FLATTEN_CSS_PATH, 'utf8');
const FLATTEN_PARTS = flattenSelectorParts(FLATTEN_CSS);

describe('flatten.css covers every hardcoded backdrop-filter', () => {
  it('POSITIVE CONTROL: the census parser really reads the sheets', () => {
    // An empty census would make every coverage assertion below vacuously true —
    // the exact shape of false pass this repo has produced before. The floor is
    // deliberately well under the measured count (61 rules, one exempt) so a
    // legitimate conversion of some of them to tokens does not fail the suite,
    // but far above zero.
    expect(CENSUS.length).toBeGreaterThan(40);
    expect(CENSUS.map((c) => c.file)).toContain('renderer/styles.css');
    // A surface known to be hardcoded, named so a parser that silently matched
    // nothing could not satisfy the count with junk.
    expect(CENSUS.flatMap((c) => c.keys)).toContain('.dict-popup');
    expect(FLATTEN_PARTS.length).toBeGreaterThan(30);
  });

  it('leaves no hardcoded rule unreached by any trigger', () => {
    expect(uncovered(CENSUS, FLATTEN_PARTS).map((c) => `${c.file}: ${c.selector}`)).toEqual([]);
  });

  it('MUTATION CONTROL: deleting one conversion is detected, and only that one', () => {
    const withoutMediaCenterTile = FLATTEN_PARTS.filter((p) => !p.endsWith('.mc-tile-play'));
    expect(withoutMediaCenterTile.length).toBe(FLATTEN_PARTS.length - 1);
    const missing = uncovered(CENSUS, withoutMediaCenterTile);
    expect(missing.map((c) => c.selector)).toEqual(['.mc-tile-play']);
  });

  it('resets the -webkit- twin wherever it resets backdrop-filter', () => {
    // Several of the mirrored rules declare both. Resetting only the unprefixed
    // property leaves the prefixed declaration painting on Chromium, which is
    // the engine this app ships on.
    const offenders = parseRules(FLATTEN_CSS)
      .filter((rule) => /(?:^|;)\s*backdrop-filter\s*:/.test(rule.body))
      .filter((rule) => !/(?:^|;)\s*-webkit-backdrop-filter\s*:/.test(rule.body))
      .map((rule) => rule.selector);
    expect(offenders).toEqual([]);
  });

  it('never leaves a translucent surface with its blur removed', () => {
    // The "worst of both" state `views/mediaCenter.css:6812` names: a sharply
    // see-through panel. A flatten rule may drop a blur without supplying a
    // background ONLY where it is a documented scrim or a blur-only add-on, so
    // every such rule is enumerated here and changing one is a deliberate act.
    const noBackground = parseRules(FLATTEN_CSS)
      .filter((rule) => rule.selector.includes('[data-lq-flat]'))
      .filter((rule) => /backdrop-filter\s*:\s*none/.test(rule.body))
      .filter((rule) => !/(?:^|;)\s*background(?:-color)?\s*:/.test(rule.body))
      .flatMap((rule) => rule.selector.split(',').map(surfaceKey));
    expect(new Set(noBackground)).toEqual(
      new Set([
        // Aero modal dimmers.
        '.palette-backdrop',
        '.cbh-backdrop',
        '.widget-gallery-backdrop',
        '.lib-import-backdrop',
        '.cal-modal-backdrop',
        '.nov-modal-backdrop',
        '.csv-editor-modal-backdrop',
        '.deck-action-backdrop',
        // Study OS dimmers.
        '.blanc-master-search-backdrop',
        '.reading-source-backdrop',
        '.scr-pair-editor-backdrop',
        // Lock screen: the wallpaper must survive, and the widgets carry their
        // own opaque surfaces.
        '.lockscreen',
        '.lockscreen-win11-bg',
        '.lockscreen-win11-bg-clouds',
        // Blur-only add-ons over a tint the token ladder already flattens.
        '.os-start',
        '.os-taskbar',
        '.fwin',
        // The three study toasts share a blur rule and declare their tints in
        // three sibling rules directly beneath it.
        '.study-global-status',
        '.study-global-error',
        '.study-global-undo',
      ]),
    );
  });
});

describe('shouldFlatten mirrors all six triggers', () => {
  const NONE: FlattenInputs = {
    theme: 'study-os',
    perf: 'balanced',
    transparency: 'full',
    gpu: null,
    materials: 'default',
    aeroSafeMode: 'off',
    reducedTransparency: false,
  };

  it('NEGATIVE CONTROL: a fully healthy, fully translucent app does not flatten', () => {
    expect(shouldFlatten(NONE)).toBe(false);
  });

  it.each([
    ['high contrast', { theme: 'high-contrast' }],
    ['battery performance tier', { perf: 'battery' }],
    ['in-product transparency off', { transparency: 'off' }],
    ['OS prefers-reduced-transparency', { reducedTransparency: true }],
    ['GPU software fallback', { gpu: 'software' }],
    ['GPU context lost', { gpu: 'lost' }],
    ['Aero safe mode', { materials: 'aero', aeroSafeMode: 'on' }],
  ])('flattens for %s', (_label, patch) => {
    expect(shouldFlatten({ ...NONE, ...patch })).toBe(true);
  });

  it('does not let the OS preference override the in-product `reduced` middle state', () => {
    // `reduced` is a deliberate user choice for less blur, not none; only the
    // untouched `full` state defers to the OS.
    expect(shouldFlatten({ ...NONE, transparency: 'reduced', reducedTransparency: true })).toBe(
      false,
    );
  });

  it('does not flatten Aero safe mode under another material', () => {
    expect(shouldFlatten({ ...NONE, materials: 'default', aeroSafeMode: 'on' })).toBe(false);
  });
});

describe('the attribute round-trips', () => {
  class FakeRoot {
    private attrs = new Map<string, string>();
    getAttribute(name: string): string | null {
      return this.attrs.get(name) ?? null;
    }
    setAttribute(name: string, value: string): void {
      this.attrs.set(name, value);
    }
    removeAttribute(name: string): void {
      this.attrs.delete(name);
    }
    hasAttribute(name: string): boolean {
      return this.attrs.has(name);
    }
  }

  it('reads the six attributes off the root', () => {
    const root = new FakeRoot();
    root.setAttribute('data-theme', 'high-contrast');
    root.setAttribute('data-gpu', 'lost');
    const inputs = readFlattenInputs(root as unknown as HTMLElement, true);
    expect(inputs).toEqual({
      theme: 'high-contrast',
      perf: null,
      transparency: null,
      gpu: 'lost',
      materials: null,
      aeroSafeMode: null,
      reducedTransparency: true,
    });
  });

  it('sets, reports and removes without leaving residue', () => {
    const root = new FakeRoot() as unknown as HTMLElement;
    expect(isFlattened(root)).toBe(false);
    expect(applyFlatten(root, true)).toBe(true);
    expect(isFlattened(root)).toBe(true);
    // Idempotent: a MutationObserver that re-set the attribute on every sync
    // would loop forever, so `applyFlatten` reports "no change" instead.
    expect(applyFlatten(root, true)).toBe(false);
    expect(applyFlatten(root, false)).toBe(true);
    expect(isFlattened(root)).toBe(false);
    expect(applyFlatten(root, false)).toBe(false);
  });
});
