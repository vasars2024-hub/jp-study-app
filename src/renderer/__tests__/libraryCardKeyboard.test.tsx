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
  document.documentElement.removeAttribute('data-materials');
});

describe.each(['', 'aero', 'wired'])('Library list keyboard activation, material %s', (material) => {
  async function listRow() {
    if (material) document.documentElement.setAttribute('data-materials', material);
    await render();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-library-layout="list"]')!.click();
    });
    const rows = [...host.querySelectorAll<HTMLButtonElement>('button.lib-list-row, button.aero-library-row')];
    expect(rows).toHaveLength(2);
    return rows.find((row) => row.textContent?.includes('コンビニ人間'))!;
  }

  it('opens the focused row on Enter exactly once, including when the key is held', async () => {
    const row = await listRow();
    row.focus();
    await press(row, 'Enter');
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }));
    });
    expect(opened).toEqual(['li_ja']);
  });

  it('keeps single click and Space as selection and ignores unrelated keys', async () => {
    const row = await listRow();
    await act(async () => { row.click(); });
    expect(row.getAttribute('aria-pressed')).toBe('true');
    await press(row, ' ');
    await press(row, 'a');
    expect(opened).toEqual([]);
  });

  it('preserves double-click opening', async () => {
    const row = await listRow();
    await act(async () => { row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(opened).toEqual(['li_ja']);
  });
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
  // a11y3: the open action moved from the card (a role=button that CONTAINED
  // Remove / File / Set-cover, axe nested-interactive) to a real <button
  // class="card-open"> stretched over the cover, a sibling of those three. A
  // native button turns Enter and Space into a click, which bubbles to the card.
  it('exposes each card as a named group whose open control is a focusable button named after the book', async () => {
    await render();
    expect(cards().length).toBeGreaterThan(0);
    for (const card of cards()) {
      expect(card.getAttribute('role')).toBe('group');
      const open = card.querySelector('button.card-open');
      expect(open, 'no open button on the card').toBeTruthy();
      expect(open?.getAttribute('aria-label')).toBe(card.getAttribute('aria-label'));
      // Nothing interactive nests inside the open button.
      expect(open?.querySelector('button, a[href], [tabindex]')).toBeNull();
    }
    // The accessible name is the title, not "card" or the badge text — this is
    // the only thing a screen-reader user has to choose a book by.
    expect(cards().map((card) => card.querySelector('button.card-open')?.getAttribute('aria-label')).sort())
      .toEqual(['Kafka on the Shore', 'コンビニ人間']);
  });

  it('opens the book from its open button exactly once', async () => {
    await render();
    const card = cards().find((node) => node.getAttribute('aria-label') === 'コンビニ人間');
    expect(card, 'no card for the Japanese book').toBeTruthy();
    const open = card?.querySelector<HTMLButtonElement>('button.card-open');
    expect(open, 'no open button').toBeTruthy();
    // Enter / Space on a native button arrive as this click.
    await act(async () => { open?.click(); });
    expect(opened).toEqual(['li_ja']);
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
    // The nested-interactive trap: confirming a removal must not open the item
    // it just removed. (Remove's click stops propagation; keys never reach it.)
    await render();
    const card = cards()[0];
    const remove = card.querySelector<HTMLElement>('.card-remove');
    expect(remove, 'no remove button on the card').toBeTruthy();
    await press(remove!, 'Enter');
    expect(opened).toEqual([]);
  });
});
