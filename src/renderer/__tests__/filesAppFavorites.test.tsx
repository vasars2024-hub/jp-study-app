// @vitest-environment jsdom
/**
 * Gate 18, measured on the real component.
 *
 * "Pin an item and a location; both appear under Favorites and survive a
 * restart. Unpinning removes them and deletes nothing."
 *
 * The restart is a real unmount-and-remount against the same `localStorage`
 * with both stores' in-memory fallbacks cleared — a React-state assertion
 * cannot tell "persisted" from "still mounted", and that is the whole gate.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesApp } from '../components/filesapp/FilesApp';
import {
  countByCategory,
  type FilesIndexSnapshot,
  type FilesItem,
} from '../../shared/filesApp/catalog';
import {
  FILES_FAVORITES_STORAGE_KEY,
  resetFavoritesMemoryForTests,
} from '../filesFavoritesStore';
import { resetCollectionsMemoryForTests } from '../filesCollectionsStore';
import { favoriteKey, parseFavoritesDoc } from '../../shared/filesApp/favorites';

vi.mock('../flashcardDeck', () => ({
  loadDeck: () => [],
  addDeckCardsTracked: () => [],
  removeDeckCards: () => [],
}));

/** Never fires: `useElementSize` stays at 0 and VirtualList falls back to overscan. */
class NoopResizeObserver {
  observe(): void {
    /* nothing observed */
  }
  unobserve(): void {
    /* nothing observed */
  }
  disconnect(): void {
    /* nothing observed */
  }
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

async function unmount(): Promise<void> {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
}

async function restart(): Promise<void> {
  await unmount();
  resetFavoritesMemoryForTests();
  resetCollectionsMemoryForTests();
  await mount(<FilesApp />);
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function q<T extends Element = HTMLElement>(selector: string): T | null {
  return host?.querySelector<T>(selector) ?? null;
}

function all(selector: string): HTMLElement[] {
  return Array.from(host?.querySelectorAll<HTMLElement>(selector) ?? []);
}

function favoriteNames(): string[] {
  return all('.fa-favorite-node').map((b) => b.querySelector('.fa-tree-label')?.textContent ?? '');
}

function favoriteNode(name: string): HTMLElement | undefined {
  return all('.fa-favorite-node').find(
    (b) => b.querySelector('.fa-tree-label')?.textContent === name,
  );
}

function unpinButtonFor(name: string): HTMLElement | undefined {
  return favoriteNode(name)?.parentElement?.querySelector<HTMLElement>('.fa-favorite-unpin') ?? undefined;
}

function railNode(label: string): HTMLElement | undefined {
  return all('[data-derived="true"]').find(
    (b) => b.querySelector('.fa-tree-label')?.textContent === label,
  );
}

function bodyRowNames(): string[] {
  return all('[role="row"]')
    .filter((r) => !r.classList.contains('fa-head'))
    .map((r) => r.querySelector('.fa-cell-name')?.textContent ?? '');
}

async function selectRow(name: string): Promise<void> {
  await click(all('[role="row"]').find((r) => r.textContent?.includes(name)));
}

/** What is actually on disk, read the way a fresh launch would read it. */
function persisted() {
  const raw = localStorage.getItem(FILES_FAVORITES_STORAGE_KEY);
  return parseFavoritesDoc(raw ? JSON.parse(raw) : null);
}

function persistedKeys(): string[] {
  return persisted().favorites.map((f) => favoriteKey(f.target));
}

/* --------------------------- the fixture --------------------------- */

function item(
  over: Partial<FilesItem> & Pick<FilesItem, 'id' | 'name' | 'kind' | 'categoryId'>,
): FilesItem {
  return {
    provenance: 'unknown',
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    lastUsedAt: null,
    location: { store: 'derived', describes: 'test' },
    flags: {},
    source: 'test',
    ...over,
  };
}

const ITEMS: FilesItem[] = [
  item({
    id: 'media:1',
    name: 'Episode 01',
    kind: 'video',
    categoryId: 'sources/video',
    location: { store: 'file', path: 'C:\\media\\ep1.mkv' },
  }),
  item({
    id: 'media:2',
    name: 'Episode 02',
    kind: 'video',
    categoryId: 'sources/video',
    location: { store: 'file', path: 'C:\\media\\ep2.mkv' },
  }),
];

const filesIndex = vi.fn<(force?: boolean) => Promise<FilesIndexSnapshot>>();

function snapshot(items: FilesItem[] = ITEMS): FilesIndexSnapshot {
  return {
    items,
    counts: countByCategory(items),
    enumerators: [{ source: 'test', itemCount: items.length, elapsedMs: 1 }],
    builtAt: Date.now(),
  };
}

beforeEach(() => {
  localStorage.clear();
  resetFavoritesMemoryForTests();
  resetCollectionsMemoryForTests();
  filesIndex.mockReset();
  filesIndex.mockImplementation(async () => snapshot());
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { filesIndex, filesReveal: async () => ({ ok: true }) },
  });
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

async function makeFolder(name: string): Promise<void> {
  await click(q('.fa-collections-new'));
  const input = q<HTMLInputElement>('.fa-collection-rename input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      name,
    );
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(q('.fa-collection-rename .fa-action'));
}

describe('gate 18 — Favorites', () => {
  it('starts empty, and says so', async () => {
    await mount(<FilesApp />);
    expect(q('.fa-collections-empty')).toBeTruthy();
    expect(favoriteNames()).toEqual([]);
  });

  it('PINS AN ITEM AND A LOCATION; both appear and both survive a restart', async () => {
    await mount(<FilesApp />);

    // The item.
    await selectRow('Episode 01');
    await click(q('.fa-favorite-toggle'));

    // The location: a derived folder, pinned from the folder you are in.
    await click(railNode('Video'));
    await click(q('.fa-favorite-pin-location'));

    expect(favoriteNames()).toEqual(['Episode 01', 'Video']);
    expect(persistedKeys()).toEqual(['item:media:1', 'category:sources/video']);

    await restart();
    // Off disk, with both stores' memory fallbacks cleared.
    expect(favoriteNames()).toEqual(['Episode 01', 'Video']);
  });

  it('pins one of the user\'s OWN folders as a location too', async () => {
    await mount(<FilesApp />);
    await makeFolder('Watch later');
    await click(
      all('.fa-collection-node').find(
        (b) => b.querySelector('.fa-tree-label')?.textContent === 'Watch later',
      ),
    );
    await click(q('.fa-favorite-pin-location'));

    await restart();
    expect(favoriteNames()).toContain('Watch later');
    expect(persistedKeys()[0]).toMatch(/^collection:col_/);
  });

  it('UNPINNING REMOVES IT AND DELETES NOTHING — the item is re-found afterwards', async () => {
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-favorite-toggle'));
    expect(favoriteNames()).toEqual(['Episode 01']);

    await click(unpinButtonFor('Episode 01'));
    expect(favoriteNames()).toEqual([]);
    expect(persistedKeys()).toEqual([]);
    // The gate's own proof: the video is exactly where it always was.
    expect(bodyRowNames()).toContain('Episode 01');

    await restart();
    expect(favoriteNames()).toEqual([]);
    expect(bodyRowNames()).toContain('Episode 01');
  });

  it('unpinning a LOCATION deletes nothing either — the folder is still in the tree', async () => {
    await mount(<FilesApp />);
    await click(railNode('Video'));
    await click(q('.fa-favorite-pin-location'));
    await click(q('.fa-favorite-pin-location'));

    expect(favoriteNames()).toEqual([]);
    expect(railNode('Video')).toBeTruthy();
    await click(railNode('Video'));
    expect(bodyRowNames()).toEqual(['Episode 01', 'Episode 02']);
  });

  it('the inspector button is a TOGGLE, and reports its own state', async () => {
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    expect(q('.fa-favorite-toggle')?.getAttribute('aria-pressed')).toBe('false');
    await click(q('.fa-favorite-toggle'));
    expect(q('.fa-favorite-toggle')?.getAttribute('aria-pressed')).toBe('true');
    await click(q('.fa-favorite-toggle'));
    expect(q('.fa-favorite-toggle')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('the receipt names what happened, and pin and unpin do not read the same', async () => {
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-favorite-toggle'));
    const pinned = q('.fa-folder-notice')?.textContent ?? '';
    await click(q('.fa-favorite-toggle'));
    const unpinned = q('.fa-folder-notice')?.textContent ?? '';

    expect(pinned).toContain('Episode 01');
    expect(unpinned).toContain('Episode 01');
    expect(unpinned).not.toBe(pinned);
    // "Nothing was deleted" is the sentence the gate is really about.
    expect(unpinned).toContain('deleted');
  });

  it('a pinned item leads back to itself', async () => {
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-favorite-toggle'));
    await click(railNode('Dictionaries'));
    await click(favoriteNode('Episode 01'));

    expect(q('.lq-inspector-title')?.textContent).toBe('Episode 01');
  });

  it('a pinned location leads back to itself', async () => {
    await mount(<FilesApp />);
    await click(railNode('Video'));
    await click(q('.fa-favorite-pin-location'));
    await click(q('.fa-tree-root'));
    expect(bodyRowNames()).toHaveLength(2);

    await click(favoriteNode('Video'));
    expect(q('.fa-scope-clear')?.textContent ?? '').toContain('Video');
  });

  it('a favorite pointing at something gone is MARKED and COUNTED, not swept', async () => {
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-favorite-toggle'));
    await unmount();

    // The video leaves the library behind the pin's back.
    filesIndex.mockImplementation(async () => snapshot(ITEMS.filter((i) => i.id !== 'media:1')));
    resetFavoritesMemoryForTests();
    resetCollectionsMemoryForTests();
    await mount(<FilesApp />);

    expect(all('.fa-favorite-row[data-stale="true"]')).toHaveLength(1);
    expect(q('.fa-favorites-stale')?.textContent ?? '').toContain('1 favorite');
    // Still stored: only the user can say to forget it.
    expect(persistedKeys()).toEqual(['item:media:1']);
    // And still unpinnable, which is the way out.
    await click(q('.fa-favorite-unpin'));
    expect(persistedKeys()).toEqual([]);
  });

  it('CONTROL: the root is not a location — no pin control is offered there', async () => {
    await mount(<FilesApp />);
    await click(q('.fa-tree-root'));
    expect(q('.fa-favorite-pin-location')).toBeNull();
  });

  it('CONTROL: pinning the same item twice does not make two rows', async () => {
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-favorite-toggle'));
    // Reach the same target from the favorites strip's own row and back.
    await selectRow('Episode 02');
    await selectRow('Episode 01');
    expect(q('.fa-favorite-toggle')?.getAttribute('aria-pressed')).toBe('true');
    expect(persistedKeys()).toEqual(['item:media:1']);
  });

  it('CONTROL: pinning two different things gives two rows, so the check above is not vacuous', async () => {
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-favorite-toggle'));
    await selectRow('Episode 02');
    await click(q('.fa-favorite-toggle'));
    expect(persistedKeys()).toEqual(['item:media:1', 'item:media:2']);
    expect(favoriteNames()).toEqual(['Episode 01', 'Episode 02']);
  });
});
