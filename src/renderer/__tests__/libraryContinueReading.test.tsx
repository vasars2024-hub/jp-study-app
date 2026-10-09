// @vitest-environment jsdom
/**
 * The Library's reading-first additions, mounted: the "Continue reading" shelf,
 * the "Recently read" sort and arrow-key movement down the List view.
 *
 * Same harness as `libraryCardKeyboard` (its Proxy answers every unstubbed
 * `window.api` channel inertly).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LibraryView from '../views/LibraryView';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';
import type { LibraryItem } from '../../shared/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.now();
const ITEMS: LibraryItem[] = [
  { id: 'li_new', title: '新しい本', kind: 'book', createdAt: 30 },
  { id: 'li_half', title: '読みかけ', kind: 'book', createdAt: 10, lastReadAt: NOW - 60_000, progress: { percent: 0.4 } },
  { id: 'li_done', title: '読了', kind: 'book', createdAt: 20, lastReadAt: NOW, progress: { percent: 1 } },
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
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-materials');
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

describe.each(['', 'aero'])('Library reading shelf, material %s', (material) => {
  beforeEach(() => {
    if (material) document.documentElement.setAttribute('data-materials', material);
  });

  it('shows only the started, unfinished book under Continue reading, and opens it', async () => {
    await render();
    const cards = [...host.querySelectorAll<HTMLButtonElement>('[data-continue-item]')];
    expect(cards.map((card) => card.dataset.continueItem)).toEqual(['li_half']);
    expect(cards[0].querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('40');
    await act(async () => cards[0].click());
    expect(opened).toEqual(['li_half']);
  });

  it('orders by last read with the Recently read sort', async () => {
    await render();
    const select = host.querySelector<HTMLSelectElement>('select#lib-sort, select#aero-lib-sort')!;
    await act(async () => {
      select.value = 'recent';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-library-layout="list"]')!.click();
    });
    const rows = [...host.querySelectorAll<HTMLButtonElement>('[data-library-row]')];
    expect(rows.map((row) => row.dataset.libraryRow)).toEqual(['li_done', 'li_half', 'li_new']);
  });

  it('walks the List view with the arrow keys and opens with Enter', async () => {
    await render();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-library-layout="list"]')!.click();
    });
    const rows = () => [...host.querySelectorAll<HTMLButtonElement>('[data-library-row]')];
    rows()[0].focus();
    await act(async () => {
      rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(rows()[1]);
    await act(async () => {
      rows()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(rows()[2]);
    await act(async () => {
      rows()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(opened).toEqual([rows()[2].dataset.libraryRow]);
  });
});
