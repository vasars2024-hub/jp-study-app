/**
 * One harness for every L6 reading surface, parameterised by the surface.
 *
 * L6 migrates five reading surfaces onto `ReadingCanvas`, and each one's Gate is
 * the same three questions asked at two widths: does the tool dock beside the
 * document when there is room, does it become a dismissible sheet when there is
 * not, and does the document node survive both. Written per surface that is ~140
 * lines of identical plumbing each; the first two surfaces would have paid it
 * twice and the last three again. So the plumbing lives here once and a surface
 * costs a `describe` block.
 *
 * NOT a test file: `vitest.config.ts` collects only
 * `src/renderer/__tests__/**\/*.test.{ts,tsx}`, so this is invisible to the
 * runner and can only run through an importer.
 *
 * The two traps it exists to stop being rediscovered:
 *
 * 1. JSDOM LAYS NOTHING OUT. `ReadingCanvas` measures its own box, gets 0, and
 *    correctly places no tool at all — so a naive mount asserts on an empty
 *    canvas and passes for the wrong reason. Width has to arrive through the
 *    element's own `getBoundingClientRect`, which is the path the shipped
 *    renderer uses, rather than through `widthOverride`, which only tests use.
 * 2. A REAL READER TOUCHES `window.api` AT MODULE-EVAL TIME. `playerBus` and
 *    `keyboardShortcuts` run on import, so the stub has to exist before the
 *    dynamic import and every member has to be simultaneously awaitable as
 *    `null` and callable as an unsubscribe, because the tree uses both shapes.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { expect } from 'vitest';

const realRect = HTMLElement.prototype.getBoundingClientRect;

/** What the canvas should look like at one width. Every field is asserted. */
export interface ExpectedPlacement {
  placement: 'docked' | 'sheet';
  /** `data-content-width` on the document region — what the reader keeps. */
  contentWidth: number;
  /** Inline width of a docked tool. Omit for a sheet, which has none. */
  toolWidth?: number;
}

export interface ReadingSurfaceHarness {
  container: HTMLDivElement;
  /** Mount (or re-render) the surface with the canvas measuring `width`. */
  mount(width: number): Promise<void>;
  /** Change the measured width and let the observer fire, without remounting. */
  resize(width: number): Promise<void>;
  /** The open tool with this id, or `null` when it is not rendered. */
  tool(id: string): HTMLElement | null;
  /** The document region. Throws rather than returning null: its absence is a bug. */
  doc(): HTMLElement;
  /**
   * Click something inside the surface and flush. `index` picks from a group of
   * identical controls — a reader toolbar carries one trigger per tool and they
   * differ only in their label, which is localised and so not a safe selector.
   */
  click(selector: string, index?: number): Promise<void>;
  teardown(): void;
}

/**
 * Install the `window.api` a reading surface needs before it is imported.
 *
 * `explicit` wins; everything else answers inertly. Returns nothing to restore —
 * each test file owns its own jsdom global.
 */
export function installReadingSurfaceApi(explicit: Record<string, unknown> = {}): void {
  const inert = (): unknown => {
    const value = (): null => null;
    (value as unknown as { then: (r: (v: null) => void) => Promise<null> }).then = (resolve) => {
      resolve(null);
      return Promise.resolve(null);
    };
    return value;
  };
  (window as unknown as { api: unknown }).api = new Proxy(explicit, {
    get: (target, key: string) => (key in target ? target[key] : inert),
    has: () => true,
  });
}

/** jsdom has no ResizeObserver, and every reading surface observes something. */
export function installResizeObserver(): void {
  const observers = new Set<() => void>();
  (globalThis as unknown as { ResizeObserver: unknown; __flushResize?: () => void }).ResizeObserver =
    class {
      constructor(private readonly fire: (entries: unknown[]) => void) {}
      observe(el: HTMLElement): void {
        const notify = () =>
          this.fire([{ target: el, contentRect: el.getBoundingClientRect() }]);
        observers.add(notify);
      }
      unobserve(): void {
        observers.clear();
      }
      disconnect(): void {
        observers.clear();
      }
    };
  (globalThis as unknown as { __flushResize: () => void }).__flushResize = () => {
    for (const notify of observers) notify();
  };
}

export interface HarnessOptions {
  /** The surface under test, rebuilt on every mount. */
  render: () => ReactNode;
  /**
   * Ready when this returns true. A reading surface loads asynchronously and
   * asserting before it has is how a probe scores a shipped panel ABSENT.
   */
  ready?: (container: HTMLElement) => boolean;
  /** Height to report; only a couple of surfaces care. */
  height?: number;
}

export function createReadingSurfaceHarness(options: HarnessOptions): ReadingSurfaceHarness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let width = 0;
  const height = options.height ?? 800;

  HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
    // The canvas and the document region, because a surface that measures its
    // own content box (a paged reader sizing columns) reads the doc, not `.lq-reading`.
    if (this.classList.contains('lq-reading')) {
      return { ...realRect.call(this), width, height } as DOMRect;
    }
    return realRect.call(this);
  };

  const flush = async () => {
    for (let index = 0; index < 25; index += 1) {
      await act(async () => {
        await new Promise((done) => setTimeout(done, 2));
      });
      if (!options.ready || options.ready(container)) return;
    }
  };

  return {
    container,
    async mount(next: number) {
      width = next;
      await act(async () => {
        root.render(options.render());
      });
      await flush();
    },
    async resize(next: number) {
      width = next;
      await act(async () => {
        (globalThis as unknown as { __flushResize?: () => void }).__flushResize?.();
      });
      await flush();
    },
    tool(id: string) {
      return container.querySelector<HTMLElement>(`[data-reading-tool="${id}"]`);
    },
    doc() {
      const node = container.querySelector<HTMLElement>('[data-reading-role="document"]');
      if (!node) throw new Error('no document region — the canvas did not render');
      return node;
    },
    async click(selector: string, index = 0) {
      const node = container.querySelectorAll<HTMLElement>(selector)[index];
      if (!node) throw new Error(`no element matches ${selector} at index ${index}`);
      // `focus()` first: a synthetic click does not focus, and a control whose
      // handler reads `document.activeElement` then measures BODY.
      node.focus();
      await act(async () => {
        node.click();
      });
      await flush();
    },
    teardown() {
      act(() => root.unmount());
      container.remove();
      HTMLElement.prototype.getBoundingClientRect = realRect;
    },
  };
}

/**
 * The Gate, as one call. `documentCovered` is derived rather than passed: it is
 * true exactly when the placement is `sheet`, and letting a caller state it
 * separately is how the two drift apart.
 */
export function expectPlacement(
  harness: ReadingSurfaceHarness,
  id: string,
  expected: ExpectedPlacement,
): void {
  const tool = harness.tool(id);
  expect(tool, `tool "${id}" is not rendered`).not.toBe(null);
  expect(tool!.dataset.placement).toBe(expected.placement);
  expect(harness.doc().dataset.contentWidth).toBe(String(expected.contentWidth));
  if (expected.placement === 'sheet') {
    expect(tool!.getAttribute('role')).toBe('dialog');
    expect(tool!.getAttribute('aria-modal')).toBe('true');
    expect(harness.doc().hasAttribute('inert')).toBe(true);
  } else {
    expect(tool!.style.width).toBe(`${expected.toolWidth}px`);
    expect(tool!.getAttribute('role')).toBe(null);
    expect(harness.doc().hasAttribute('inert')).toBe(false);
  }
}

/**
 * Dismissal is the half of the contract that makes a sheet honest, so it is
 * asserted the same way everywhere: the tool goes, the document comes back at
 * the SAME width, and the node is the same node — not a remount that threw away
 * scroll offset, an epub rendition or a capture in flight.
 */
export async function expectDismissRestoresDocument(
  harness: ReadingSurfaceHarness,
  id: string,
): Promise<void> {
  const before = harness.doc();
  const width = before.dataset.contentWidth;
  await harness.click(`[data-reading-tool="${id}"] .lq-reading-tool-close`);
  expect(harness.tool(id)).toBe(null);
  expect(harness.doc()).toBe(before);
  expect(harness.doc().dataset.contentWidth).toBe(width);
  expect(harness.doc().hasAttribute('inert')).toBe(false);
}
