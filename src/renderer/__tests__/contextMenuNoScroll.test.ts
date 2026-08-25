// @vitest-environment jsdom
/**
 * `ContextMenu` must never scroll anything, rubric category 2.
 *
 * What it guards. The menu is `position: fixed` at coordinates the component has
 * already clamped into the viewport, so there is nothing for a scroll to reveal
 * — but `focus()` scrolls the focused element's DOM ancestors, and the menu is a
 * DOM child of the window it was opened in. Measured live on 2026-08-25, Media
 * Center in the Liquid Video window: opening a card's overflow menu set the
 * owning `.fwin`'s `scrollLeft` **0 → 186** and every pixel of the window's
 * content jumped 186px left (`.mc-root` 111 → -75) until the menu closed. The
 * window is `overflow: hidden`, so nothing could scroll it back. The same menu
 * in the Standard window left `scrollLeft` at 0 — the control that says this is
 * a real difference and not the harness.
 *
 * Both call sites are covered because fixing only the first one left the window
 * still on open and jumping 0 → 189 on the first ArrowDown.
 *
 * `.ts` and `createElement` rather than `.tsx`: `vitest.config.ts` collects
 * `src/renderer/__tests__/**\/*.test.ts`, so a `.tsx` file here runs nowhere.
 */
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from '../components/ui/ContextMenu';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.restoreAllMocks();
});

/** Every `focus()` the menu performs, with the options it passed. */
function recordFocusCalls(): Array<FocusOptions | undefined> {
  const calls: Array<FocusOptions | undefined> = [];
  const original = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function focus(
    this: HTMLElement,
    options?: FocusOptions,
  ) {
    calls.push(options);
    original.call(this);
  });
  return calls;
}

async function open(items = [
  { id: 'play', label: 'Play' },
  { id: 'details', label: 'Show details' },
  { id: 'remove', label: 'Remove' },
]): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(createElement(ContextMenu, {
      open: true,
      x: 120,
      y: 80,
      items,
      onClose: () => undefined,
    }));
  });
  return host;
}

describe('ContextMenu focus never scrolls its window', () => {
  it('opens with preventScroll on the first item', async () => {
    const calls = recordFocusCalls();
    await open();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((o) => o?.preventScroll === true)).toBe(true);
  });

  it('keeps preventScroll while arrowing through the items', async () => {
    await open();
    const calls = recordFocusCalls();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    // Two moves, two focus calls, and neither of them may scroll.
    expect(calls.length).toBe(2);
    expect(calls.every((o) => o?.preventScroll === true)).toBe(true);
  });

  it('still moves focus — preventScroll must not cost the keyboard path', async () => {
    const el = await open();
    const labels = (): string =>
      (document.activeElement?.textContent ?? '').trim();
    expect(labels()).toBe('Play');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(labels()).toBe('Show details');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(labels()).toBe('Play');
    expect(el.querySelectorAll('.ui-menu__item').length).toBe(3);
  });
});
