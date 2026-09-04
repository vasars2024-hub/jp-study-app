/**
 * §11.4's density row — *"a 20-book list and a 300-book list are not the same
 * UI problem."*
 *
 * Two halves, and the second is the one that matters.
 *
 * The PREFERENCE half is ordinary: two named modes, a default, a junk value
 * that resolves rather than crashes, and a write failure the caller is told
 * about instead of a preference that silently does not persist.
 *
 * The STYLESHEET half exists because the obvious implementation of "compact" is
 * wrong on this surface. `.rlv__row-open` is 34px and `.rlv__selectall` is 34px
 * because the accessibility walk's floor IS 32 and it steps in halves, so a
 * control sized to exactly its floor is knife-edge (`.rlv__selectall`'s own
 * comment says so). A compact mode that took rows to 28px would buy this row of
 * §11.4 by failing the accessibility row two bullets above it. So the assertion
 * is not "compact is smaller" — it is **compact changes no hit target at all**,
 * and only the space between and around them moves.
 *
 * The stylesheet is read on a COMMENT-STRIPPED copy: the comment above the
 * density block spells out `min-height` and `28px` in prose, and a raw text
 * search finds the comment before the declaration (`css-comment-fails-css-test`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  READING_LIST_DENSITIES,
  READING_LIST_DENSITY_DEFAULT,
  READING_LIST_DENSITY_STORAGE_KEY,
  loadReadingListDensity,
  normalizeReadingListDensity,
  saveReadingListDensity,
} from '../readingListsDensity';

const RAW = readFileSync(resolve(__dirname, '../views/readingLists.css'), 'utf8');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the LAST rule whose selector list matches exactly. */
function ruleOf(selector: string): Record<string, string> {
  const needle = `\n${selector} {`;
  const at = CSS.lastIndexOf(needle);
  expect(at, `${selector} is not declared`).toBeGreaterThan(-1);
  const open = at + needle.length;
  const close = CSS.indexOf('}', open);
  const out: Record<string, string> = {};
  for (const decl of CSS.slice(open, close).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

/** Every declaration inside any `[data-density='compact']` rule in the sheet. */
function compactDeclarations(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /\[data-density='compact'\][^{}]*\{([^}]*)\}/g;
  for (const match of CSS.matchAll(re)) {
    for (const decl of match[1].split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      out.push([decl.slice(0, i).trim(), decl.slice(i + 1).trim()]);
    }
  }
  return out;
}

describe('reading lists — the density preference', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts comfortable when nothing has ever been written', () => {
    expect(loadReadingListDensity()).toBe('comfortable');
    expect(READING_LIST_DENSITY_DEFAULT).toBe('comfortable');
  });

  it('round-trips a chosen mode through storage', () => {
    expect(saveReadingListDensity('compact')).toBe(true);
    expect(store[READING_LIST_DENSITY_STORAGE_KEY]).toBe('compact');
    expect(loadReadingListDensity()).toBe('compact');
  });

  it('resolves a junk stored value instead of rendering an unknown mode', () => {
    // A profile copied between builds, or a half-finished write. `data-density`
    // would otherwise carry a value no rule in the sheet matches, and the view
    // would silently be comfortable while the control read something else.
    store[READING_LIST_DENSITY_STORAGE_KEY] = 'cosy';
    expect(loadReadingListDensity()).toBe('comfortable');
    expect(normalizeReadingListDensity(null)).toBe('comfortable');
    expect(normalizeReadingListDensity(7)).toBe('comfortable');
  });

  it('reports a failed write rather than swallowing it', () => {
    // A denied-storage partition throws on `setItem`. The mode still applies for
    // the session; the caller is told the restart promise is gone.
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(saveReadingListDensity('compact')).toBe(false);
    expect(loadReadingListDensity()).toBe('comfortable');
  });

  it('survives storage being absent entirely', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadReadingListDensity()).toBe('comfortable');
    expect(saveReadingListDensity('compact')).toBe(true);
  });
});

describe('reading lists — compact does not shrink a hit target', () => {
  it('declares a rule for every mode other than the default', () => {
    // Comfortable is the base sheet, so only `compact` needs its own block. If a
    // third mode is ever added this fails until its rules exist, rather than
    // shipping a mode that selects nothing.
    for (const mode of READING_LIST_DENSITIES) {
      if (mode === READING_LIST_DENSITY_DEFAULT) continue;
      expect(CSS, `no rules for density '${mode}'`).toContain(`[data-density='${mode}']`);
    }
  });

  it('keeps the row and select-all floors at 34px, above the knife-edge 32', () => {
    expect(ruleOf('.rlv__row-open')['min-height']).toBe('34px');
    expect(ruleOf('.rlv__selectall')['min-height']).toBe('34px');
    expect(ruleOf('.rlv__row-state')['min-height']).toBe('32px');
    expect(ruleOf('.rlv__card-open')['min-height']).toBe('44px');
  });

  it('touches no height, min-height or hit-target property in compact', () => {
    const forbidden = new Set([
      'min-height',
      'height',
      'max-height',
      'min-width',
      'width',
      'inline-size',
      'block-size',
      'min-block-size',
      'transform',
      'scale',
      'zoom',
    ]);
    const offenders = compactDeclarations().filter(([property]) => forbidden.has(property));
    expect(offenders, 'compact must spend space between targets, never the targets').toEqual([]);
  });

  it('actually does something — it is not an inert attribute', () => {
    // The vacuity check. A `data-density` attribute with no rules behind it
    // would pass every assertion above and change nothing on screen.
    const declarations = compactDeclarations();
    expect(declarations.length).toBeGreaterThanOrEqual(6);
    const properties = new Set(declarations.map(([property]) => property));
    expect(properties.has('gap')).toBe(true);
    expect(properties.has('padding')).toBe(true);
  });

  it('keeps the narrow-pane guard on its own grid track', () => {
    // The comfortable track learned this the expensive way: a bare `170px` floor
    // is wider than the 212px pane the narrowest window allows once gaps are
    // taken, and the cards clip with no scrollbar to reach them.
    const compactGrid = compactDeclarations().find(([property, value]) =>
      property === 'grid-template-columns' && value.includes('auto-fill'),
    );
    expect(compactGrid, 'compact declares no grid track').toBeTruthy();
    expect(compactGrid?.[1]).toMatch(/minmax\(\s*min\(\s*\d+px\s*,\s*100%\s*\)/);
  });
});
