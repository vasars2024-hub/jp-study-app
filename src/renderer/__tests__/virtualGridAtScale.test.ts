// @vitest-environment jsdom
/**
 * Does the library grid stay bounded on a LARGE library? — Phase 9 / slice 47f.
 *
 * `knownGaps.virtualizationAtScale` has been open since Phase 2, worded as "MediaCardLazyGrid
 * engages above 48 items, test library has 15 titles". Both halves of that were stale by the
 * time it was read on 2026-08-02: **`MediaCardLazyGrid` does not exist anywhere in the tree**,
 * and its replacement `VirtualGrid` has no engagement threshold at all — it virtualises from
 * the first item. The real question underneath survives, though, and had no test: does the
 * number of rendered cards stay bounded as the library grows?
 *
 * It does, on one precondition, and the precondition is the interesting part. `VirtualGrid`
 * renders EVERY row while its viewport height is still 0 — deliberately, so a collapsed flex
 * parent shows a grid rather than nothing (`VirtualGrid.tsx:68`). So "virtualised" is true
 * once ResizeObserver has reported, and false before that. Both halves are pinned below,
 * because a test for only the happy half would leave the scale hazard undocumented.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import VirtualGrid from '../components/VirtualGrid';

/**
 * jsdom ships no ResizeObserver and reports `clientWidth`/`clientHeight` as 0 for everything.
 *
 * Both have to be stubbed, and finding that out is worth writing down: `useElementSize`
 * (`hooks.ts:24-29`) subscribes and then IMMEDIATELY does
 * `setSize({ width: el.clientWidth, height: el.clientHeight })`. A stub that only fires the
 * observer callback is overwritten by that synchronous line a moment later, the grid sees a
 * 0-height viewport, and it renders EVERY row — so the test reads "50,000 cards" and looks
 * like a virtualisation failure when it is really a harness failure. In a real browser the
 * two agree because layout has happened by the time either is read.
 */
function installLayout(width: number, height: number): void {
  class StubResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) { this.callback = callback; }

    observe(target: Element): void {
      this.callback(
        [{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }

    unobserve(): void { /* no-op */ }
    disconnect(): void { /* no-op */ }
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  for (const [prop, value] of [['clientWidth', width], ['clientHeight', height]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get: () => value,
    });
  }
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  host = null;
  root = null;
  vi.unstubAllGlobals();
  // `unstubAllGlobals` does not undo a prototype patch, and leaving these behind would give
  // every later test in this worker an 800x600 element.
  delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
  delete (HTMLElement.prototype as Partial<HTMLElement>).clientHeight;
});

async function renderGrid(count: number, maxColWidth?: number): Promise<HTMLDivElement> {
  const items = Array.from({ length: count }, (_, index) => ({ id: index }));
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(createElement(VirtualGrid<{ id: number }>, {
      items,
      minColWidth: 200,
      maxColWidth,
      gap: 10,
      rowHeight: 200,
      getKey: (item) => String(item.id),
      renderItem: (item) => createElement('div', { className: 'card' }, String(item.id)),
    }));
  });
  return host;
}

/** The absolutely-positioned row inside the full-height spacer. */
function firstRow(el: HTMLDivElement): HTMLElement | null {
  return el.firstElementChild?.firstElementChild?.firstElementChild as HTMLElement | null;
}

describe('VirtualGrid at library scale', () => {
  it('renders a bounded number of cards no matter how many items there are', async () => {
    // 800x600 viewport, 200px columns with a 10px gap -> 3 columns; 200px rows -> 3 visible
    // rows plus overscan 2 either side, so at most 7 rows of 3.
    installLayout(800, 600);
    const small = await renderGrid(60);
    const smallCount = small.querySelectorAll('.card').length;

    act(() => { root?.unmount(); });
    host?.remove();

    const huge = await renderGrid(5_000);
    const hugeCount = huge.querySelectorAll('.card').length;

    // The assertion that matters: the DOM does not grow with the library. A grid that
    // rendered 50,000 cards would pass any "does it render" test and make the app unusable.
    expect(hugeCount).toBe(smallCount);
    expect(hugeCount).toBeLessThanOrEqual(7 * 3);
  });

  it('sizes the scroll surface for the whole library even though it renders a slice of it', async () => {
    // Bounded rendering is only correct if the scrollbar still describes the real library —
    // otherwise the user cannot reach the items that were not rendered.
    installLayout(800, 600);
    const el = await renderGrid(5_000);
    // host > the grid's scroll container > the full-height spacer. A `div > div` selector
    // matches the CONTAINER here, because the host is itself a div — and its height is '',
    // which reads as "the spacer is missing" rather than "the selector is wrong".
    const spacer = el.firstElementChild?.firstElementChild as HTMLElement | null;
    // 5,000 items / 3 columns = 1,667 rows at 200px.
    expect(spacer?.style.height).toBe(`${Math.ceil(5_000 / 3) * 200}px`);
  });

  it('renders EVERY row while the viewport height is still unknown — the documented trade-off', async () => {
    // `VirtualGrid.tsx:68`: until ResizeObserver reports, `visibleRows` falls back to the whole
    // row count so a collapsed flex parent shows a grid instead of nothing. That is a real
    // scale hazard and not a bug to fix blindly — a library opened into a zero-height parent
    // renders in full. Pinned so a future change to that fallback is a decision, not a
    // surprise, and so the bound above is read as conditional on a measured viewport.
    installLayout(800, 0);
    const el = await renderGrid(300);
    expect(el.querySelectorAll('.card').length).toBe(300);
  });
});

/**
 * The sparse half — rubric category 4, "use of space". The media library's
 * "Continue watching" shelf holds one title, and at 1080x700 that one 187px card
 * sat against a 431x532 dead region: 22.1% of the viewport against a 15% bar.
 * The empty tracks were the whole of it, so they are what these pin.
 */
describe('VirtualGrid on a sparse shelf', () => {
  it('leaves the surplus tracks empty when no maxColWidth is declared', async () => {
    // The pre-existing contract, kept for the three call sites that do not opt in:
    // 800px at 200px columns is 3 tracks, and one item still lays out against 3.
    installLayout(800, 600);
    const el = await renderGrid(1);
    expect(firstRow(el)?.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(firstRow(el)?.style.justifyContent).toBe('');
  });

  it('drops the empty tracks and centres what the cap leaves over', async () => {
    // 3 tracks, 1 item, cap 260: one 260px track centred in 800px rather than a
    // 260px card pinned left with 540px of nothing beside it.
    installLayout(800, 600);
    const el = await renderGrid(1, 260);
    expect(firstRow(el)?.style.gridTemplateColumns).toBe('repeat(1, 260px)');
    expect(firstRow(el)?.style.justifyContent).toBe('center');
  });

  it('grows a partial shelf up to the cap instead of stretching past it', async () => {
    // 2 items in a 3-track pane: (800 - 10) / 2 = 395 each, which the 260 cap bites.
    installLayout(800, 600);
    const el = await renderGrid(2, 260);
    expect(firstRow(el)?.style.gridTemplateColumns).toBe('repeat(2, 260px)');
  });

  it('leaves a full shelf on 1fr tracks, so the dense library is untouched', async () => {
    // 3 items fill the 3 tracks at (800 - 20) / 3 = 260, which does not exceed the
    // cap — the capped/centred path must not engage on a library that already fits.
    installLayout(800, 600);
    const el = await renderGrid(3, 260);
    expect(firstRow(el)?.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(firstRow(el)?.style.justifyContent).toBe('');
    const many = await (async () => {
      act(() => { root?.unmount(); });
      host?.remove();
      return renderGrid(60, 260);
    })();
    expect(firstRow(many)?.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
  });
});
