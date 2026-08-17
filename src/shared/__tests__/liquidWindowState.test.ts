import { describe, expect, it } from 'vitest';
import type { WindowSnapshot } from '../desktop';
import {
  LIQUID_PRESENTATION_MODES,
  LIQUID_PRESENTATION_VERSION,
  isLiquid,
  makeLiquid,
  parsePresentation,
  returnToStandard,
  sanitizeWindowPresentation,
  togglePresentation,
} from '../liquidWindowState';

/**
 * L3's gate: "an unchanged sample app can switch modes and back with
 * byte-for-byte app data and equivalent observable state." Everything here
 * serves that one sentence.
 *
 * The three ways it is normally lost, each with its own case below:
 *   - a second Make Liquid captures the LIQUID geometry as the way home;
 *   - Return leaves a residual `{mode:'standard'}` so the blob grew a key;
 *   - a corrupt blob renders a window that is liquid with no way back.
 */

const WINDOW: WindowSnapshot = {
  id: 'w1',
  section: 'anki',
  x: 120,
  y: 64,
  w: 980,
  h: 640,
  z: 7,
  visible: true,
  maximized: false,
  pinned: true,
  restoreRect: { x: 10, y: 10, w: 400, h: 300 },
};

describe('liquid presentation — the round trip is the gate', () => {
  it('returns a window key-for-key identical to the one that went liquid', () => {
    const round = returnToStandard(makeLiquid(WINDOW));
    expect(round).toEqual(WINDOW);
    // toEqual ignores key order but NOT extra keys; assert the key set anyway,
    // because a residual `presentation: undefined` is invisible to toEqual on
    // some shapes and still lands in the persisted JSON.
    expect(Object.keys(round).sort()).toEqual(Object.keys(WINDOW).sort());
    expect('presentation' in round).toBe(false);
    expect(JSON.stringify(round)).toBe(JSON.stringify(WINDOW));
  });

  it('round-trips a maximized window, including the flag itself', () => {
    const maximized = { ...WINDOW, maximized: true };
    expect(returnToStandard(makeLiquid(maximized))).toEqual(maximized);
    // And the captured state says so, rather than defaulting to false.
    expect(makeLiquid(maximized).presentation?.standardMaximized).toBe(true);
  });

  it('survives the shell moving and resizing the window while it is liquid', () => {
    const liquid = makeLiquid(WINDOW);
    // What a liquid presentation actually does: the window is somewhere else.
    const moved = { ...liquid, x: 0, y: 0, w: 1920, h: 1080, maximized: true, z: 12 };
    const back = returnToStandard(moved);
    expect({ x: back.x, y: back.y, w: back.w, h: back.h, maximized: back.maximized }).toEqual({
      x: 120,
      y: 64,
      w: 980,
      h: 640,
      maximized: false,
    });
    // Everything the presentation does NOT own is left exactly as the shell had
    // it — z-order, pin, visibility, the separate maximize restoreRect.
    expect(back.z).toBe(12);
    expect(back.pinned).toBe(true);
    expect(back.visible).toBe(true);
    expect(back.restoreRect).toEqual(WINDOW.restoreRect);
  });

  it('refuses to re-capture geometry when it is already liquid', () => {
    // THE BUG THIS GUARD EXISTS FOR: a second Make Liquid on a window the shell
    // has already moved would record the liquid rect as the way home, and the
    // original geometry would be gone permanently and silently.
    const liquid = makeLiquid(WINDOW);
    const moved = { ...liquid, x: 0, y: 0, w: 1920, h: 1080 };
    expect(makeLiquid(moved)).toBe(moved);
    expect(makeLiquid(moved).presentation?.standardRect).toEqual({ x: 120, y: 64, w: 980, h: 640 });
    expect(returnToStandard(makeLiquid(moved))).toEqual(WINDOW);
  });

  it('toggles both ways and lands back on the original', () => {
    expect(isLiquid(WINDOW)).toBe(false);
    const there = togglePresentation(WINDOW);
    expect(isLiquid(there)).toBe(true);
    const back = togglePresentation(there);
    expect(isLiquid(back)).toBe(false);
    expect(back).toEqual(WINDOW);
    // Ten round trips, in case any of them accumulates.
    let w = WINDOW;
    for (let i = 0; i < 10; i += 1) w = togglePresentation(togglePresentation(w));
    expect(w).toEqual(WINDOW);
  });
});

describe('liquid presentation — conventional stays the default', () => {
  it('leaves a layout saved before this field existed exactly as it was', () => {
    const legacy = { ...WINDOW };
    expect(sanitizeWindowPresentation(legacy)).toBe(legacy);
    expect(isLiquid(legacy)).toBe(false);
    expect(returnToStandard(legacy)).toBe(legacy);
  });

  it('normalises a stored standard blob away instead of round-tripping it', () => {
    // Standard IS the absence of the field. Keeping `{mode:'standard'}` would
    // make every conventional window carry a key it never needed.
    expect(parsePresentation({ v: 1, mode: 'standard' })).toBeUndefined();
    const withStandard = { ...WINDOW, presentation: { v: 1, mode: 'standard' as const } };
    const clean = sanitizeWindowPresentation(withStandard);
    expect('presentation' in clean).toBe(false);
    expect(clean).toEqual(WINDOW);

    // THE CASE A BARE `{mode:'standard'}` DOES NOT COVER, and the one a real
    // store produces: a window that WAS liquid and still carries the geometry
    // it came back to. Deleting the mode check reads that as liquid and the
    // window silently re-enters a presentation the user left. Without this
    // line the mode check can be removed entirely and the suite stays green,
    // because a standard blob with no rect is rejected either way.
    const standardWithRect = { v: 1, mode: 'standard', standardRect: { x: 1, y: 2, w: 3, h: 4 } };
    expect(parsePresentation(standardWithRect)).toBeUndefined();
    const stale = { ...WINDOW, presentation: standardWithRect } as unknown as WindowSnapshot;
    expect('presentation' in sanitizeWindowPresentation(stale)).toBe(false);
    expect(isLiquid(sanitizeWindowPresentation(stale))).toBe(false);
  });
});

describe('liquid presentation — a corrupt blob means standard, never half-liquid', () => {
  const corrupt: [string, unknown][] = [
    ['null', null],
    ['a string', 'liquid'],
    ['an array', [{ mode: 'liquid' }]],
    ['no mode', { v: 1 }],
    ['an unknown mode', { v: 1, mode: 'glass', standardRect: { x: 0, y: 0, w: 8, h: 8 } }],
    ['a future version', { v: 2, mode: 'liquid', standardRect: { x: 0, y: 0, w: 8, h: 8 } }],
    ['liquid with no way back', { v: 1, mode: 'liquid' }],
    ['a rect missing a side', { v: 1, mode: 'liquid', standardRect: { x: 0, y: 0, w: 8 } }],
    ['a zero-size rect', { v: 1, mode: 'liquid', standardRect: { x: 0, y: 0, w: 0, h: 8 } }],
    ['a negative-size rect', { v: 1, mode: 'liquid', standardRect: { x: 0, y: 0, w: 8, h: -8 } }],
    ['NaN geometry', { v: 1, mode: 'liquid', standardRect: { x: NaN, y: 0, w: 8, h: 8 } }],
    ['Infinity geometry', { v: 1, mode: 'liquid', standardRect: { x: 0, y: Infinity, w: 8, h: 8 } }],
    ['stringified numbers', { v: 1, mode: 'liquid', standardRect: { x: '0', y: 0, w: 8, h: 8 } }],
  ];

  it.each(corrupt)('rejects %s without throwing', (_name, input) => {
    expect(() => parsePresentation(input)).not.toThrow();
    expect(parsePresentation(input)).toBeUndefined();
  });

  it('drops a corrupt blob off the window rather than rendering it', () => {
    for (const [, input] of corrupt) {
      const broken = { ...WINDOW, presentation: input } as unknown as WindowSnapshot;
      const clean = sanitizeWindowPresentation(broken);
      // Not merely "not liquid" — the key is gone, so the next save does not
      // persist the corruption forward for the next load to re-reject.
      expect('presentation' in clean).toBe(false);
      expect(clean).toEqual(WINDOW);
    }
  });

  it('accepts the one shape it should, and normalises it', () => {
    const parsed = parsePresentation({
      mode: 'liquid',
      standardRect: { x: 1, y: 2, w: 3, h: 4 },
      standardMaximized: 'yes',
      strayKey: 'dropped',
    });
    expect(parsed).toEqual({
      v: LIQUID_PRESENTATION_VERSION,
      mode: 'liquid',
      standardRect: { x: 1, y: 2, w: 3, h: 4 },
      // A truthy non-boolean is not a boolean. Coercing it would let a blob
      // decide the window comes back maximized when it never was.
      standardMaximized: false,
    });
    expect('strayKey' in (parsed as object)).toBe(false);
    // A blob with no `v` at all is the pre-versioning shape and is readable.
    expect(parsePresentation({ mode: 'liquid', standardRect: { x: 1, y: 2, w: 3, h: 4 } })).toEqual(
      parsed,
    );
  });

  it('survives a real JSON persistence round trip', () => {
    const liquid = makeLiquid(WINDOW);
    const reloaded = JSON.parse(JSON.stringify(liquid)) as WindowSnapshot;
    expect(sanitizeWindowPresentation(reloaded)).toEqual(liquid);
    expect(returnToStandard(sanitizeWindowPresentation(reloaded))).toEqual(WINDOW);
  });

  it('names exactly the two modes it implements', () => {
    expect(LIQUID_PRESENTATION_MODES).toEqual(['standard', 'liquid']);
    expect(LIQUID_PRESENTATION_VERSION).toBe(1);
  });
});
