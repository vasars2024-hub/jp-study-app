// @vitest-environment jsdom
/**
 * Rubric category 7 (performance under real load), Flashcards — resizing a window that holds a
 * real deck.
 *
 * `useElementSize` allocated a NEW `{width, height}` object on every ResizeObserver callback, so
 * a consumer that reads only `height` still re-rendered on every change to `width`. Measured
 * live 2026-09-03, Flashcards with a 600-card deck over 3 book groups, 48 mounted `.flash-row`s:
 * a 70-frame window resize ran at renderer frame **p95 30.0 ms** against an 8.5 ms compositor
 * ceiling, 10 frames over 16 ms. Attributed by hiding one subtree at a time in the live
 * renderer — with the three `.flash-group-body-vlist`s hidden the same gesture was p95 8.7 ms
 * and 0 over 16, while hiding the card strip changed nothing (28.2 ms). After the fix, the same
 * gesture with the lists PRESENT: p95 9.5 and 11.9 ms over two runs, 0 frames over 16.
 *
 * What is asserted here is the mechanism, because the millisecond figures belong to one machine:
 * a width-only change must not produce a new state object for a height-only consumer, and it
 * must still produce one when the height moves. A `useState` setter that returns `prev` is what
 * makes React bail out, so identity is the property, not the value.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useElementSize } from '../hooks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Cb = (entries: { contentRect: { width: number; height: number } }[]) => void;
let fire: ((width: number, height: number) => void) | null = null;

beforeEach(() => {
  fire = null;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    private readonly cb: Cb;

    constructor(cb: Cb) {
      this.cb = cb;
    }

    observe(): void {
      fire = (width, height) => this.cb([{ contentRect: { width, height } }]);
    }

    unobserve(): void { /* not used */ }

    disconnect(): void { fire = null; }
  };
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** Mounts a probe component and reports how many times it rendered, plus the last size seen. */
function mountProbe(axis: 'both' | 'height' | 'width'): { renders: () => number; size: () => { width: number; height: number } } {
  const counter = { n: 0 };
  let last = { width: -1, height: -1 };
  function Probe(): ReturnType<typeof createElement> {
    const [ref, size] = useElementSize<HTMLDivElement>(axis);
    const seen = useRef(0);
    seen.current += 1;
    counter.n = seen.current;
    last = size;
    return createElement('div', { ref });
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Probe)));
  return { renders: () => counter.n, size: () => last };
}

describe('useElementSize: a narrowed axis does not re-render on the other one', () => {
  it('ignores a width-only change when only the height is asked for', () => {
    const probe = mountProbe('height');
    act(() => fire!(300, 420));
    const settled = probe.renders();
    expect(probe.size().height).toBe(420);

    // Sixty frames of a window drag-resize: the width moves every frame, the height never does.
    for (let i = 0; i < 60; i += 1) act(() => fire!(300 + i, 420));
    // React re-renders the component ONCE on the first bail-out and then stops, which is
    // documented behaviour and not a leak: 60 frames must not cost 60 renders.
    expect(probe.renders() - settled).toBeLessThanOrEqual(1);
  });

  it('and the same sixty frames DO cost sixty renders without the narrowing', () => {
    // The control for the case above. Without it, "1 render" proves nothing — a component that
    // never re-rendered at all would pass just as well.
    const probe = mountProbe('both');
    act(() => fire!(300, 420));
    const settled = probe.renders();
    for (let i = 0; i < 60; i += 1) act(() => fire!(300 + i, 420));
    expect(probe.renders() - settled).toBeGreaterThanOrEqual(59);
  });

  it('still reacts to the axis it was asked for', () => {
    const probe = mountProbe('height');
    act(() => fire!(300, 420));
    const settled = probe.renders();
    act(() => fire!(300, 421));
    expect(probe.renders()).toBeGreaterThan(settled);
    expect(probe.size().height).toBe(421);
  });

  it('keeps the default tracking both dimensions, so VirtualGrid is unaffected', () => {
    const probe = mountProbe('both');
    act(() => fire!(300, 420));
    const settled = probe.renders();
    act(() => fire!(301, 420));
    expect(probe.renders()).toBeGreaterThan(settled);
    expect(probe.size()).toEqual({ width: 301, height: 420 });
  });

  it('bails out on a repeat of the same box, whatever the axis', () => {
    const probe = mountProbe('both');
    act(() => fire!(300, 420));
    const settled = probe.renders();
    for (let i = 0; i < 10; i += 1) act(() => fire!(300, 420));
    expect(probe.renders() - settled).toBeLessThanOrEqual(1);
  });
});
