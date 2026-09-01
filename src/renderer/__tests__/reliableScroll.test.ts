// @vitest-environment jsdom
//
// `behavior: 'smooth'` is REFUSED in this renderer. Measured live 2026-08-31 with the OS
// reporting `prefers-reduced-motion: no-preference`: the settings pane moved 0 px on the smooth
// call and 7,233 px on the identical `auto` call, and a freshly created plain scroller in the
// same document ignored smooth too. Eleven product call sites across ten files asked for smooth
// and silently arrived nowhere.
//
// These cases pin the shared recovery. The negative controls are the point: each one is a
// situation where the helper must do NOTHING, and without them "scrolls twice unconditionally"
// would pass every positive case here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nearestScroller, scrollIntoViewReliably, scrollToReliably } from '../utils/reliableScroll';

let calls: (ScrollIntoViewOptions | boolean | undefined)[];
let scrollToCalls: ScrollToOptions[];

/** jsdom reports 0 for every layout box, so a scroller is faked explicitly. */
function makeScroller(axis: 'y' | 'x'): HTMLDivElement {
  const el = document.createElement('div');
  if (axis === 'y') {
    el.style.overflowY = 'auto';
    Object.defineProperty(el, 'scrollHeight', { value: 9000, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 500, configurable: true });
  } else {
    el.style.overflowX = 'auto';
    Object.defineProperty(el, 'scrollWidth', { value: 9000, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: 500, configurable: true });
  }
  el.scrollTop = 0;
  el.scrollLeft = 0;
  el.scrollTo = ((opts: ScrollToOptions) => {
    scrollToCalls.push(opts);
  }) as HTMLElement['scrollTo'];
  document.body.append(el);
  return el;
}

function child(parent: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  parent.append(el);
  return el;
}

/** Every rect is offscreen by default; jsdom's all-zero box reads as "in view". */
function rectIs(box: { top: number; bottom: number; left: number; right: number }) {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    value: () => ({ ...box, width: box.right - box.left, height: box.bottom - box.top }),
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  calls = [];
  scrollToCalls = [];
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value(opts?: ScrollIntoViewOptions | boolean) {
      calls.push(opts);
    },
    configurable: true,
    writable: true,
  });
  rectIs({ top: 7400, bottom: 8000, left: 0, right: 100 });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('nearestScroller', () => {
  it('finds a HORIZONTAL scroller — the flashcards review strip has no vertical overflow', () => {
    const strip = makeScroller('x');
    expect(nearestScroller(child(strip))).toBe(strip);
  });

  it('finds a vertical scroller', () => {
    const pane = makeScroller('y');
    expect(nearestScroller(child(pane))).toBe(pane);
  });

  it('returns null when no ancestor actually scrolls', () => {
    const plain = document.createElement('div');
    document.body.append(plain);
    expect(nearestScroller(child(plain))).toBeNull();
  });
});

describe('scrollIntoViewReliably', () => {
  it('lands outright when the smooth request moved nothing', () => {
    const pane = makeScroller('y');
    scrollIntoViewReliably(child(pane), { block: 'nearest' });
    expect(calls).toEqual([{ behavior: 'smooth', block: 'nearest' }]);

    vi.advanceTimersByTime(400);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ block: 'nearest' });
  });

  it('NEGATIVE CONTROL: leaves a working smooth scroll alone', () => {
    const pane = makeScroller('y');
    scrollIntoViewReliably(child(pane), { block: 'nearest' });
    pane.scrollTop = 1200; // what a live smooth animation looks like at the deadline
    vi.advanceTimersByTime(400);
    expect(calls).toHaveLength(1);
  });

  it('NEGATIVE CONTROL: a HORIZONTAL animation in progress also counts as movement', () => {
    const strip = makeScroller('x');
    scrollIntoViewReliably(child(strip), { inline: 'center', block: 'nearest' });
    strip.scrollLeft = 640; // scrollTop is still 0 — a Y-only comparison would land here
    vi.advanceTimersByTime(400);
    expect(calls).toHaveLength(1);
  });

  it('NEGATIVE CONTROL: does nothing for a target that is already on screen', () => {
    rectIs({ top: 40, bottom: 200, left: 0, right: 100 });
    const pane = makeScroller('y');
    scrollIntoViewReliably(child(pane), { block: 'nearest' });
    vi.advanceTimersByTime(400);
    expect(calls).toHaveLength(1);
  });

  it('cancelling before the deadline prevents the landing', () => {
    const pane = makeScroller('y');
    const cancel = scrollIntoViewReliably(child(pane), { block: 'nearest' });
    cancel();
    vi.advanceTimersByTime(400);
    expect(calls).toHaveLength(1);
  });

  it('a null target is a no-op, not a throw', () => {
    expect(() => scrollIntoViewReliably(null)()).not.toThrow();
    expect(calls).toEqual([]);
  });
});

describe('scrollToReliably', () => {
  it('lands outright when the smooth request moved nothing', () => {
    const pane = makeScroller('y');
    pane.scrollTop = 3200;
    scrollToReliably(pane, { top: 0 });
    expect(scrollToCalls).toEqual([{ behavior: 'smooth', top: 0 }]);

    vi.advanceTimersByTime(400);
    expect(scrollToCalls).toHaveLength(2);
    expect(scrollToCalls[1]).toEqual({ top: 0 });
  });

  it('NEGATIVE CONTROL: leaves a working smooth scroll alone', () => {
    const pane = makeScroller('y');
    pane.scrollTop = 3200;
    scrollToReliably(pane, { top: 0 });
    pane.scrollTop = 1400;
    vi.advanceTimersByTime(400);
    expect(scrollToCalls).toHaveLength(1);
  });

  it('NEGATIVE CONTROL: does nothing when the scroller is already at the target', () => {
    const pane = makeScroller('y');
    pane.scrollTop = 0;
    scrollToReliably(pane, { top: 0 });
    vi.advanceTimersByTime(400);
    expect(scrollToCalls).toHaveLength(1);
  });
});
