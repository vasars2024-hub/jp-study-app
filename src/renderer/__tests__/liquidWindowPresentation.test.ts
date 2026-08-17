/**
 * Liquid Workplace L3.2 — the shell seam and the sheet.
 *
 * L3's gate is verbatim: "an unchanged sample app can switch modes and back
 * with byte-for-byte app data and equivalent observable state." L3.1 proved
 * that for the pure commands. This proves it across the SHELL's own conversion,
 * which is where the two field vocabularies (`max`/`rect`/`min` versus
 * `maximized`/`restoreRect`/`visible`) meet and where a round trip is normally
 * lost — a dropped key here would make the schema's guarantee unobservable.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  isWinLiquid,
  presentationFromSnapshot,
  presentationToSnapshot,
  toggleWinPresentation,
} from '../liquidWindowPresentation';

const SHEET = resolve(__dirname, '..', 'theme', 'liquid-window.css');

/** A `Win` as `DesktopShell` actually holds one, including the keys this module must not touch. */
function win(over: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    section: 'dictionary',
    x: 120,
    y: 80,
    w: 640,
    h: 480,
    z: 7,
    min: false,
    pin: true,
    rect: { x: 10, y: 20, w: 300, h: 200 },
    ...over,
  } as Record<string, unknown> & {
    x: number; y: number; w: number; h: number; max?: boolean;
    presentation?: import('../../shared/liquidWindowState').LiquidPresentationState;
  };
}

describe('liquid window presentation — the shell seam', () => {
  it('a fresh window is conventional, and conventional is the ABSENCE of the key', () => {
    const w = win();
    expect(isWinLiquid(w)).toBe(false);
    expect('presentation' in w).toBe(false);
    // NOT `toEqual({})`: that passes for `{presentation: undefined}` too, and
    // an undefined-valued key is precisely the failure this module is written
    // to avoid. A mutation making `presentationToSnapshot` unconditional
    // survived the `toEqual` form. Assert on the key set.
    expect(Object.keys(presentationToSnapshot(w))).toEqual([]);
  });

  it('makes a window liquid without moving it', () => {
    const w = win();
    const liquid = toggleWinPresentation(w);
    expect(isWinLiquid(liquid)).toBe(true);
    // Presentation only. Entering Liquid is not a layout command.
    expect([liquid.x, liquid.y, liquid.w, liquid.h]).toEqual([120, 80, 640, 480]);
    expect(liquid.presentation?.standardRect).toEqual({ x: 120, y: 80, w: 640, h: 480 });
  });

  it('round-trips key-for-key, not merely equivalently', () => {
    const w = win();
    const back = toggleWinPresentation(toggleWinPresentation(w));
    // `toEqual` cannot see a residual `presentation: undefined`; the key set can.
    expect(Object.keys(back).sort()).toEqual(Object.keys({ ...w, max: false }).sort());
    expect(JSON.stringify(back)).toBe(JSON.stringify({ ...w, max: false }));
  });

  it('does not touch z, pin, min, section or restoreRect across a round trip', () => {
    const w = win();
    const liquid = toggleWinPresentation(w);
    for (const key of ['id', 'section', 'z', 'min', 'pin', 'rect'] as const) {
      expect(liquid[key]).toEqual(w[key]);
    }
    const back = toggleWinPresentation(liquid);
    for (const key of ['id', 'section', 'z', 'min', 'pin', 'rect'] as const) {
      expect(back[key]).toEqual(w[key]);
    }
  });

  it('a window dragged while liquid returns to where it came from', () => {
    const liquid = toggleWinPresentation(win());
    const dragged = { ...liquid, x: 900, y: 600, w: 1200, h: 700 };
    const back = toggleWinPresentation(dragged);
    expect([back.x, back.y, back.w, back.h]).toEqual([120, 80, 640, 480]);
    expect('presentation' in back).toBe(false);
  });

  it('going liquid twice does not overwrite the way home', () => {
    const once = toggleWinPresentation(win());
    // The shell can only toggle, but a re-entrant command or a replayed event
    // reaches `makeLiquid` on an already-liquid window; the captured rect must
    // survive it, or the original geometry is gone silently and permanently.
    const moved = { ...once, x: 900, y: 600 };
    expect(toggleWinPresentation(toggleWinPresentation(moved)).presentation?.standardRect).toEqual({
      x: 120, y: 80, w: 640, h: 480,
    });
  });

  it('restores the maximized flag it captured, and normalises absent to false', () => {
    const fromMax = toggleWinPresentation(win({ max: true }));
    expect(fromMax.presentation?.standardMaximized).toBe(true);
    expect(toggleWinPresentation(fromMax).max).toBe(true);
    // A window with no `max` key at all persists as `maximized: false` either
    // way (`winToSnapshot` does `!!win.max`), so the blob still round-trips.
    expect(toggleWinPresentation(toggleWinPresentation(win())).max).toBe(false);
  });
});

describe('liquid window presentation — loading a persisted blob', () => {
  it('keeps a valid liquid blob', () => {
    const parsed = presentationFromSnapshot({
      v: 1, mode: 'liquid', standardRect: { x: 1, y: 2, w: 3, h: 4 }, standardMaximized: false,
    });
    expect(parsed?.mode).toBe('liquid');
    expect(parsed?.standardRect).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it.each([
    ['liquid with no rect to come back to', { v: 1, mode: 'liquid' }],
    ['liquid with a zero-size rect', { v: 1, mode: 'liquid', standardRect: { x: 0, y: 0, w: 0, h: 9 } }],
    ['a stored standard, which is normalised away', { v: 1, mode: 'standard' }],
    ['a version this build cannot read', { v: 99, mode: 'liquid', standardRect: { x: 1, y: 2, w: 3, h: 4 } }],
    ['an unknown mode', { v: 1, mode: 'frosted', standardRect: { x: 1, y: 2, w: 3, h: 4 } }],
    ['an array', []],
    ['null', null],
    ['a string', 'liquid'],
  ])('loads %s as a conventional window', (_label, blob) => {
    expect(presentationFromSnapshot(blob)).toBeUndefined();
    // And the shell then writes NO key at all, so corruption is not persisted forward.
    expect(Object.keys(presentationToSnapshot({ presentation: presentationFromSnapshot(blob) }))).toEqual([]);
  });
});

describe('liquid-window.css', () => {
  const css = readFileSync(SHEET, 'utf8');
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('paints nothing outside the opt-in class', () => {
    const selectors = rules
      .split('}')
      .map((block) => block.split('{')[0]?.trim())
      .filter((s): s is string => Boolean(s));
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toMatch(/\.fwin-liquid|\.fwin-b-liquid/);
    }
  });

  it('pins window CONTENT to the opaque anchor surface — Liquid is selective', () => {
    expect(rules).toMatch(/\.fwin-liquid \.fwin-body\s*\{[^}]*--lq-anchor-bg/);
    // The failure this guards: a body given the liquid fill, which is where
    // "universal glass" costs a contrast measurement on reading and forms.
    expect(rules).not.toMatch(/\.fwin-liquid \.fwin-body\s*\{[^}]*--lq-liquid-bg/);
  });

  it('carries the blur on .fwin-liquid itself, never on a descendant', () => {
    // `.fwin` has `transform: translateZ(0)`, which makes it a backdrop root
    // for its descendants: a backdrop-filter on `.fwin-bar` would sample the
    // window's own interior and be silently inert.
    for (const block of rules.split('}')) {
      if (!/backdrop-filter/.test(block)) continue;
      const selector = block.split('{')[0]?.trim() ?? '';
      expect(selector).toBe('.fwin.fwin-liquid');
    }
    expect(rules).toMatch(/backdrop-filter/);
  });

  it('outranks the theme rules it overrides, measured not assumed', () => {
    // The live gate caught this: the shell's own bar rule is
    // `:where(html:not(…)) .fwin:where(…) .fwin-bar`, and `:where()` adds ZERO
    // specificity — so it scores `.fwin .fwin-bar` (0,2,0), a TIE with a plain
    // `.fwin-liquid .fwin-bar`, and won on import order. The window went
    // translucent while its title bar stayed opaque and covered it: blur that
    // is live in the computed style and invisible on screen. Every rule that
    // restyles an element the shell already styles is a compound `.fwin.fwin-liquid`.
    const overrides = rules
      .split('}')
      .map((block) => block.split('{')[0]?.trim())
      .filter((s): s is string => Boolean(s) && s.includes('.fwin-liquid'));
    expect(overrides.length).toBeGreaterThanOrEqual(6);
    for (const selector of overrides) {
      expect(selector, selector).toMatch(/^\.fwin\.fwin-liquid\b/);
    }
  });

  it('leaves body text color to the conventional cascade', () => {
    // Setting `color` here made the same text render at a different value in
    // Liquid than in standard, which is a contrast delta the presentation
    // toggle has no business introducing. The opaque anchor fill is what makes
    // Liquid safe for reading; the text is not this sheet's to change.
    expect(rules).not.toMatch(/\.fwin\.fwin-liquid \.fwin-body\s*\{[^}]*\bcolor\s*:/);
  });

  it('uses only --lq-* tokens for material, never a shell color literal', () => {
    for (const decl of rules.matchAll(/(background|border-color|box-shadow|color)\s*:\s*([^;]+);/g)) {
      const value = decl[2].trim();
      if (/^(transparent|none|inherit|currentColor)$/.test(value)) continue;
      // The toggle's pressed state is an accent affordance, not window material.
      if (/var\(--accent\)/.test(value)) continue;
      expect(value, `${decl[1]}: ${value}`).toMatch(/var\(--lq-/);
    }
  });
});
