// @vitest-environment jsdom
/**
 * Liquid Workplace · City (the Reading Garden) — rubric category 7, resize cost.
 *
 * `ReadingGardenSkyEvents` hands ONE ResizeObserver two boxes that always move together
 * (the canvas's parent and `.reading-garden`), and its callback then writes the canvas
 * backing store and two inline styles — from inside the observation phase, which dirties
 * layout and gets the observer re-delivered inside the same frame. Instrumented live on
 * 2026-09-05 by wrapping `window.ResizeObserver` and dragging City's window edge through
 * 60 rAF-paced steps: **116 callbacks over 59 frames — two per frame — costing 338.6 ms,
 * 83% of every ResizeObserver on the surface**, every second one reallocating a backing
 * store whose size had not changed. After the guard: **20.5 ms**, and total observer work
 * on the surface fell 409.4 ms -> 131.2 ms.
 *
 * So this test asserts BOTH directions, because a guard that never lets go is worse than
 * the churn it replaced — the canvas would keep a stale backing store and the sky would
 * stretch. Same mount, same observer, differing only in whether the host box moved.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ReadingGardenSkyEvents from '../components/reading-garden/ReadingGardenSkyEvents';

const noop = (): void => undefined;

let root: Root | null = null;
let host: HTMLDivElement;
let observerCallbacks: ResizeObserverCallback[] = [];
let widthWrites = 0;
let hostBox = { width: 680, height: 747 };

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  // The rAF loop is not what this test measures, and letting it run would need the whole
  // 2D drawing surface. Held open instead: `resize()` is the only thing that touches ctx.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', noop);
  if (typeof window.matchMedia !== 'function') {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: noop,
      removeEventListener: noop,
    }));
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: noop,
  } as unknown as CanvasRenderingContext2D);

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
  widthWrites = 0;
  hostBox = { width: 680, height: 747 };
});

function mount() {
  host = document.createElement('div');
  document.body.append(host);
  // The component measures `canvas.parentElement`, which is this host once React mounts.
  host.getBoundingClientRect = () =>
    ({ width: hostBox.width, height: hostBox.height, top: 0, left: 0, right: hostBox.width, bottom: hostBox.height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  root = createRoot(host);
  act(() => {
    root?.render(<ReadingGardenSkyEvents />);
  });
}

function deliver(times: number) {
  for (let i = 0; i < times; i += 1) {
    for (const cb of observerCallbacks) {
      act(() => {
        cb([], {} as ResizeObserver);
      });
    }
  }
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

  it('treats sub-pixel jitter as a no-op, because the canvas is sized in floored integers', () => {
    mount();
    expect(widthWrites).toBe(1);

    hostBox = { width: 680.4, height: 747.9 };
    deliver(10);
    expect(widthWrites).toBe(1);
  });
});
