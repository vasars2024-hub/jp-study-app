// @vitest-environment jsdom
/**
 * Liquid Workplace · City (the Reading Garden) — rubric category 7, resize cost.
 *
 * `ReadingGardenSkyEvents` hands ONE ResizeObserver two boxes that always move together
 * (the canvas's parent and `.reading-garden`), and its callback read a rect and then wrote
 * the canvas backing store and two inline styles — from inside the observation phase, which
 * runs AFTER layout, so each write forced a second layout in the same frame and got the
 * observer re-delivered inside it. Instrumented live on 2026-09-05 by wrapping
 * `window.ResizeObserver` and dragging City's window edge through 60 rAF-paced steps:
 * **116 callbacks over 59 frames — two per frame — costing 338.6 ms, 83% of every
 * ResizeObserver on the surface**, every second one reallocating a backing store whose size
 * had not changed.
 *
 * The repair is one size guard, so an unchanged box is a no-op rather than a realloc. Both
 * directions are asserted, because a guard that never lets go is worse than the churn it
 * replaced — the canvas would keep a stale backing store and the sky would stretch.
 *
 * Deferring the work to a rAF as well — the textbook move, since a ResizeObserver callback
 * runs after layout and mutating there forces a second pass — was written, measured and
 * REVERTED in the same turn: the resize leg read p50 33.3 ms with and without it. Do not
 * re-add it on the mechanism alone; it buys a one-frame lag in the canvas size for no
 * number. The frame-rate finding it was reaching for has a different cause, still open.
 *
 * The rAF stub below is therefore load-bearing scaffolding, not a claim about the code
 * under test: it exists so the component's own draw loop cannot run away inside jsdom.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ReadingGardenSkyEvents from '../components/reading-garden/ReadingGardenSkyEvents';

const noop = (): void => undefined;

let root: Root | null = null;
let host: HTMLDivElement;
let observerCallbacks: ResizeObserverCallback[] = [];
let frameQueue: FrameRequestCallback[] = [];
let widthWrites = 0;
let hostBox = { width: 680, height: 747 };

/**
 * Drains exactly ONE generation of animation frames. The component's own draw loop
 * re-queues itself, so draining until empty would spin forever; taking the current queue
 * and running only that is the frame boundary.
 */
function flushFrame() {
  const due = frameQueue;
  frameQueue = [];
  act(() => {
    for (const cb of due) cb(performance.now());
  });
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frameQueue.push(cb));
  vi.stubGlobal('cancelAnimationFrame', noop);
  if (typeof window.matchMedia !== 'function') {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: noop,
      removeEventListener: noop,
    }));
  }

  // Everything the drawing code reaches for answers with itself, so a gradient handle and a
  // `setTransform` are equally happy. This test is about the resize path, not the paint.
  function ctxTarget(): undefined {
    return undefined;
  }
  const fakeCtx: unknown = new Proxy(ctxTarget, {
    get: () => fakeCtx,
    set: () => true,
    apply: () => fakeCtx,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    fakeCtx as CanvasRenderingContext2D,
  );

  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) {
      observerCallbacks.push(cb);
    }
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  };

  // Counting the WIDTH writes alone, so one resize() is one unit rather than two.
  const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  if (!descriptor?.get || !descriptor.set) throw new Error('canvas width is not an accessor here');
  const { get, set } = descriptor;
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true,
    get(this: HTMLCanvasElement) {
      return get.call(this);
    },
    set(this: HTMLCanvasElement, value: number) {
      widthWrites += 1;
      set.call(this, value);
    },
  });
});

afterEach(() => {
  root?.unmount();
  root = null;
  host?.remove();
  observerCallbacks = [];
  frameQueue = [];
  widthWrites = 0;
  hostBox = { width: 680, height: 747 };
});

function mount() {
  host = document.createElement('div');
  document.body.append(host);
  // The component measures `canvas.parentElement`, which is this host once React mounts.
  host.getBoundingClientRect = () =>
    ({
      width: hostBox.width,
      height: hostBox.height,
      top: 0,
      left: 0,
      right: hostBox.width,
      bottom: hostBox.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  root = createRoot(host);
  act(() => {
    root?.render(<ReadingGardenSkyEvents />);
  });
}

/** N observer deliveries, then the single frame they are allowed to cost. */
function deliver(times: number) {
  for (let i = 0; i < times; i += 1) {
    for (const cb of observerCallbacks) {
      act(() => {
        cb([], {} as ResizeObserver);
      });
    }
  }
  flushFrame();
}

describe('City · the sky-events canvas resize path', () => {
  it('reallocates once on mount and never again while the box holds still', () => {
    mount();
    expect(observerCallbacks.length).toBe(1);
    expect(widthWrites).toBe(1);

    // Two deliveries per frame across a 60-step edge drag is what was measured live.
    deliver(120);
    expect(widthWrites).toBe(1);
  });

  it('still reallocates the moment the box actually moves', () => {
    mount();
    expect(widthWrites).toBe(1);

    hostBox = { width: 820, height: 747 };
    deliver(1);
    expect(widthWrites).toBe(2);

    // ...and settles again at the new size rather than latching on forever.
    deliver(40);
    expect(widthWrites).toBe(2);

    hostBox = { width: 820, height: 900 };
    deliver(1);
    expect(widthWrites).toBe(3);
  });

  it('collapses a burst of notifications about one move into one reallocation', () => {
    mount();
    expect(widthWrites).toBe(1);

    // Both observed boxes report, twice over, for a single move. That was four rect reads
    // and four reallocations; the first one now takes the size and the other three are
    // no-ops, which is the whole of the 338.6 ms -> 20.5 ms above.
    hostBox = { width: 900, height: 800 };
    deliver(4);
    expect(widthWrites).toBe(2);
  });

  it('treats sub-pixel jitter as a no-op, because the canvas is sized in floored integers', () => {
    mount();
    expect(widthWrites).toBe(1);

    hostBox = { width: 680.4, height: 747.9 };
    deliver(10);
    expect(widthWrites).toBe(1);
  });
});
