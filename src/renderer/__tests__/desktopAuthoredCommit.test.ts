/**
 * The *second* writer of `authoredW/H`, and why fixing the fit alone did nothing.
 *
 * `clampLayoutToViewport` was taught (see `desktopLayoutFitAuthored.test.ts`)
 * that a clamp pass must preserve the origin it was handed. Measured live, the
 * stored value kept getting re-stamped anyway: `DesktopShell` rebuilds the
 * layout from React state on every commit and passed the *live* viewport as the
 * authored size, and the first such commit fires immediately after hydrate —
 * the `hydrating` guard is cleared in a microtask, before React runs the
 * debounced commit effect. So the fit computed the right number and the commit
 * path threw it away one tick later.
 *
 * These pin the rule the commit path now follows. The judgement call inside it
 * is deliberate and documented on `resolveAuthoredViewport`: an echo keeps the
 * origin, a real rearrangement claims the viewport it happened in.
 */
import { describe, expect, it } from 'vitest';
import type { IconSnapshot, WidgetSnapshot, WindowSnapshot } from '../../shared/desktop';
import { layoutGeometrySignature, resolveAuthoredViewport } from '../desktopLayoutFit';

function win(over: Partial<WindowSnapshot> = {}): WindowSnapshot {
  return {
    id: 'w1',
    section: 'novels',
    x: 100,
    y: 60,
    w: 500,
    h: 300,
    z: 10,
    visible: true,
    maximized: false,
    ...over,
  };
}

function geometry(over: Partial<{ windows: WindowSnapshot[]; icons: IconSnapshot[]; widgets: WidgetSnapshot[] }> = {}) {
  return {
    windows: [win()],
    icons: [{ id: 'i1', kind: 'app', name: 'Novels', x: 20, y: 20 } as IconSnapshot],
    widgets: [{ id: 'g1', type: 'clock', x: 74, y: 53, w: 275, h: 131, z: 5 } as WidgetSnapshot],
    ...over,
  };
}

const BIG = { w: 1264, h: 821 };
const SMALL = { w: 880, h: 507 };

describe('layoutGeometrySignature', () => {
  it('is stable across two structurally equal layouts', () => {
    expect(layoutGeometrySignature(geometry())).toBe(layoutGeometrySignature(geometry()));
  });

  it('changes when a window moves', () => {
    const moved = geometry({ windows: [win({ x: 101 })] });
    expect(layoutGeometrySignature(moved)).not.toBe(layoutGeometrySignature(geometry()));
  });

  it('changes when an icon or a widget moves', () => {
    const icons = geometry({ icons: [{ id: 'i1', kind: 'app', name: 'Novels', x: 21, y: 20 } as IconSnapshot] });
    const widgets = geometry({ widgets: [{ id: 'g1', type: 'clock', x: 74, y: 53, w: 300, h: 131, z: 5 } as WidgetSnapshot] });
    expect(layoutGeometrySignature(icons)).not.toBe(layoutGeometrySignature(geometry()));
    expect(layoutGeometrySignature(widgets)).not.toBe(layoutGeometrySignature(geometry()));
  });

  it('ignores non-geometric churn — z-order, focus and minimize are not re-authoring', () => {
    const restacked = geometry({ windows: [win({ z: 99, visible: false })] });
    expect(layoutGeometrySignature(restacked)).toBe(layoutGeometrySignature(geometry()));
  });

  it('does still notice a maximize, which is a geometry change with a restore rect behind it', () => {
    const maxed = geometry({ windows: [win({ maximized: true })] });
    expect(layoutGeometrySignature(maxed)).not.toBe(layoutGeometrySignature(geometry()));
  });
});

describe('resolveAuthoredViewport', () => {
  it('keeps the hydrated origin for the post-hydrate echo commit', () => {
    // This is the exact case measured live: a 1264x821 desk opened in an
    // 880x507 secondary window, committed once with nothing touched.
    expect(resolveAuthoredViewport({ hydrated: BIG, live: SMALL, geometryChanged: false })).toEqual(BIG);
  });

  it('claims the live viewport once the user has actually rearranged', () => {
    expect(resolveAuthoredViewport({ hydrated: BIG, live: SMALL, geometryChanged: true })).toEqual(SMALL);
  });

  it('stamps the live viewport when nothing has hydrated yet', () => {
    expect(resolveAuthoredViewport({ hydrated: null, live: SMALL, geometryChanged: false })).toEqual(SMALL);
  });

  it('stamps the live viewport rather than trusting a degenerate origin', () => {
    for (const bad of [{ w: 0, h: 507 }, { w: 880, h: 0 }, { w: -1, h: -1 }]) {
      expect(resolveAuthoredViewport({ hydrated: bad, live: SMALL, geometryChanged: false })).toEqual(SMALL);
    }
  });

  it('is a no-op when the desk is already being shown at its authored size', () => {
    expect(resolveAuthoredViewport({ hydrated: SMALL, live: SMALL, geometryChanged: false })).toEqual(SMALL);
    expect(resolveAuthoredViewport({ hydrated: SMALL, live: SMALL, geometryChanged: true })).toEqual(SMALL);
  });
});

describe('the round trip the two writers used to break together', () => {
  it('an untouched open on a smaller display leaves the stored origin alone', () => {
    // Fit says "still 1264x821"; the commit that follows must agree with it.
    const fitted = { w: BIG.w, h: BIG.h };
    const committed = resolveAuthoredViewport({
      hydrated: fitted,
      live: SMALL,
      geometryChanged:
        layoutGeometrySignature(geometry()) !== layoutGeometrySignature(geometry()),
    });
    expect(committed).toEqual(BIG);
  });

  it('but dragging one window there does hand the desk to this viewport', () => {
    const before = layoutGeometrySignature(geometry());
    const after = layoutGeometrySignature(geometry({ windows: [win({ x: 400, y: 200 })] }));
    const committed = resolveAuthoredViewport({
      hydrated: BIG,
      live: SMALL,
      geometryChanged: before !== after,
    });
    expect(committed).toEqual(SMALL);
  });
});
