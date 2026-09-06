// @vitest-environment jsdom
/**
 * Opening a book from the Covers grid, with the keyboard.
 *
 * Measured live on 2026-09-06 against the user's own library (24 items, Study
 * OS, Covers view): every `.card` held exactly TWO focusable elements — Remove
 * and File — and neither opened the book. The card itself was a bare `div` with
 * an `onClick`, so the primary action of the whole surface was mouse-only and a
 * screen reader was told the card was a group of decorations.
 *
 * Mounted through the same `installReadingSurfaceApi` harness `libraryReveal`
 * uses (RULE 1): its Proxy answers every unstubbed `window.api` channel inertly,
 * which is what makes mounting this view in jsdom possible at all.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LibraryView from '../views/LibraryView';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';
import type { LibraryItem } from '../../shared/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: LibraryItem[] = [
  { id: 'li_ja', title: 'コンビニ人間', type: 'book', createdAt: 2 },
  { id: 'li_en', title: 'Kafka on the Shore', type: 'book', createdAt: 1 },
] as unknown as LibraryItem[];

let host: HTMLDivElement;
let root: Root;
let opened: string[] = [];

beforeEach(() => {
  installResizeObserver();
  installReadingSurfaceApi({
    syncLibrary: async () => ITEMS,
    getWatchFolder: async () => '',
    getLibraryFolders: async () => [],
  });
  opened = [];
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(): Promise<void> {
  await act(async () => {
    root.render(<LibraryView onOpen={(item: LibraryItem) => opened.push(item.id)} />);
    await Promise.resolve();
  });
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  });
}

function cards(): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('.card')];
}

async function press(node: HTMLElement, key: string): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
    await Promise.resolve();
  });
}

describe('LibraryView — a Covers card is reachable by keyboard', () => {
  it('exposes each card as a focusable button named after the book', async () => {
    await render();
    expect(cards().length).toBeGreaterThan(0);
    for (const card of cards()) {
      expect(card.getAttribute('role')).toBe('button');
      expect(card.getAttribute('tabindex')).toBe('0');
    }
    // The accessible name is the title, not "card" or the badge text — this is
    // the only thing a screen-reader user has to choose a book by.
    expect(cards().map((card) => card.getAttribute('aria-label')).sort())
      .toEqual(['Kafka on the Shore', 'コンビニ人間']);
  });

  it('opens the book on Enter and on Space', async () => {
    await render();
    const card = cards().find((node) => node.getAttribute('aria-label') === 'コンビニ人間');
    expect(card, 'no card for the Japanese book').toBeTruthy();

    await press(card!, 'Enter');
    expect(opened).toEqual(['li_ja']);

    await press(card!, ' ');
    expect(opened).toEqual(['li_ja', 'li_ja']);
  });

  it('CONTROL — an unrelated key opens nothing', async () => {
    // Without this the test above would pass on a card that opened the book on
    // every keystroke, which is a different defect wearing the same green.
    await render();
    const card = cards()[0];
    await press(card, 'a');
    await press(card, 'Tab');
    await press(card, 'Escape');
    expect(opened).toEqual([]);
  });

  it('CONTROL — Enter on the Remove button does not also open the book', async () => {
    // The nested-interactive trap. The card's handler sees keydowns that bubble
    // up from Remove / File / Set-cover, so without the `e.target` guard,
    // confirming a removal would open the item it just removed.
    await render();
    const card = cards()[0];
    const remove = card.querySelector<HTMLElement>('.card-remove');
    expect(remove, 'no remove button on the card').toBeTruthy();
    await press(remove!, 'Enter');
    expect(opened).toEqual([]);
  });
});
