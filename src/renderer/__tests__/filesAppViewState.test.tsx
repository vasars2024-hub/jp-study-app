// @vitest-environment jsdom
/**
 * Gate 22 on the real component — "Sort column, direction and view mode are
 * remembered per folder across a restart."
 *
 * **The restart is a real unmount plus a cleared memory fallback.** The store
 * keeps a `memoryDoc` so that a session survives a `setItem` that throws; a test
 * that only remounts would read that copy back and would pass even if nothing
 * had ever reached `localStorage`. `resetViewStateMemoryForTests()` is what
 * makes the second mount read from storage the way a new process does — this is
 * the same shape gates 16, 18 and 19 used, and it is the only reason those
 * restart claims mean anything.
 *
 * **Per folder is asserted from the neighbour, not from the folder itself.**
 * Every "remembered" claim here is paired with a second folder that must NOT
 * have moved. A global sort would satisfy the sentence and fail the feature.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesApp } from '../components/filesapp/FilesApp';
import {
  countByCategory,
  deriveCrossStoreFlags,
  type FilesIndexSnapshot,
  type FilesItem,
} from '../../shared/filesApp/catalog';
import {
  FILES_VIEW_STATE_STORAGE_KEY,
  resetViewStateMemoryForTests,
} from '../filesViewStateStore';
import { parseViewStateDoc } from '../../shared/filesApp/viewState';
import { resetSmartFoldersMemoryForTests } from '../filesSmartFoldersStore';
import { resetFavoritesMemoryForTests } from '../filesFavoritesStore';
import { resetCollectionsMemoryForTests } from '../filesCollectionsStore';

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

/**
 * What a restart looks like from in here: the component is gone, and every
 * renderer document store has forgotten its in-memory copy. Only what actually
 * reached `localStorage` can answer the second mount.
 */
async function restart(): Promise<void> {
  await unmount();
  resetViewStateMemoryForTests();
  resetSmartFoldersMemoryForTests();
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

/** A derived-category node in the rail, found by the label the user reads. */
function treeNode(label: string): HTMLElement | undefined {
  return all('.fa-tree-node[data-derived="true"]').find(
    (b) => b.querySelector('.fa-tree-label')?.textContent === label,
  );
}

async function openFolder(label: string): Promise<void> {
  await click(treeNode(label));
}

async function openEverything(): Promise<void> {
  await click(q('.fa-tree-root'));
}

/* ---------------- what the user can see, as values ---------------- */

function sortColumnOnScreen(): string {
  return q<HTMLSelectElement>('.fa-sort select')?.value ?? '';
}

/** Read off the header's own `aria-sort`, not off a variable. */
function sortedHeader(): { column: string; direction: string } | null {
  const header = all('.fa-head [role="columnheader"]').find(
    (h) => h.getAttribute('aria-sort') === 'ascending' || h.getAttribute('aria-sort') === 'descending',
  );
  if (!header) return null;
  return {
    column: header.className.replace(/.*fa-cell-/, ''),
    direction: header.getAttribute('aria-sort') === 'ascending' ? 'asc' : 'desc',
  };
}

function viewModeOnScreen(): string {
  return q('.fa-list')?.getAttribute('data-view') ?? '';
}

function pressedViewButton(): string {
  return (
    all('.fa-view-mode-button').find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset
      .mode ?? ''
  );
}

function bodyRowNames(): string[] {
  return all('[role="row"]')
    .filter((r) => !r.classList.contains('fa-head'))
    .map((r) => r.querySelector('.fa-cell-name')?.textContent ?? '');
}

function headerColumns(): string[] {
  return all('.fa-head [role="columnheader"]')
    .map((h) => h.className.replace(/.*fa-cell-/, ''))
    .filter((c) => c !== 'select');
}

async function setSortColumn(value: string): Promise<void> {
  const select = q<HTMLSelectElement>('.fa-sort select');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set?.call(
      select,
      value,
    );
    select?.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function flipDirection(): Promise<void> {
  await click(q('.fa-sort-dir'));
}

async function chooseViewMode(mode: string): Promise<void> {
  await click(all('.fa-view-mode-button').find((b) => b.dataset.mode === mode));
}

function persisted() {
  const raw = localStorage.getItem(FILES_VIEW_STATE_STORAGE_KEY);
  return parseViewStateDoc(raw ? JSON.parse(raw) : null);
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

/** Sizes chosen so name-order and size-order disagree in every direction. */
const ITEMS: FilesItem[] = [
  item({
    id: 'v:1',
    name: 'alpha.mkv',
    kind: 'video',
    categoryId: 'sources/video',
    sizeBytes: 30,
  }),
  item({
    id: 'v:2',
    name: 'beta.mkv',
    kind: 'video',
    categoryId: 'sources/video',
    sizeBytes: 10,
  }),
  item({
    id: 'v:3',
    name: 'gamma.mkv',
    kind: 'video',
    categoryId: 'sources/video',
    sizeBytes: 20,
  }),
  item({ id: 't:1', name: 'one.srt', kind: 'subtitle', categoryId: 'sources/text', sizeBytes: 3 }),
  item({ id: 't:2', name: 'two.srt', kind: 'subtitle', categoryId: 'sources/text', sizeBytes: 1 }),
];

const filesIndex = vi.fn<(force?: boolean) => Promise<FilesIndexSnapshot>>();

function snapshot(items: FilesItem[]): FilesIndexSnapshot {
  const derived = deriveCrossStoreFlags(items);
  return {
    items: derived,
    counts: countByCategory(derived),
    enumerators: [{ source: 'test', itemCount: derived.length, elapsedMs: 1 }],
    builtAt: Date.now(),
  };
}

beforeEach(() => {
  localStorage.clear();
  resetViewStateMemoryForTests();
  resetSmartFoldersMemoryForTests();
  resetFavoritesMemoryForTests();
  resetCollectionsMemoryForTests();
  filesIndex.mockReset();
  filesIndex.mockImplementation(async () => snapshot(ITEMS));
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

describe('gate 22 — sort survives a restart, per folder', () => {
  it('Video sorted by size descending comes back that way; Text and Everything do not move', async () => {
    await mount(<FilesApp />);

    await openFolder('Video');
    expect(bodyRowNames()).toEqual(['alpha.mkv', 'beta.mkv', 'gamma.mkv']);
    await setSortColumn('size');
    await flipDirection();
    expect(bodyRowNames()).toEqual(['alpha.mkv', 'gamma.mkv', 'beta.mkv']);

    // The neighbour, in the same session: it must still be name/ascending.
    await openFolder('Text');
    expect(sortColumnOnScreen()).toBe('name');
    expect(bodyRowNames()).toEqual(['one.srt', 'two.srt']);

    await restart();

    await openFolder('Video');
    expect(sortColumnOnScreen()).toBe('size');
    expect(sortedHeader()).toEqual({ column: 'size', direction: 'desc' });
    expect(bodyRowNames()).toEqual(['alpha.mkv', 'gamma.mkv', 'beta.mkv']);

    await openFolder('Text');
    expect(sortColumnOnScreen()).toBe('name');
    expect(sortedHeader()).toEqual({ column: 'name', direction: 'asc' });
    expect(bodyRowNames()).toEqual(['one.srt', 'two.srt']);

    await openEverything();
    expect(sortColumnOnScreen()).toBe('name');
  });

  it('two folders hold two different sorts at once, after a restart', async () => {
    await mount(<FilesApp />);
    await openFolder('Video');
    await setSortColumn('size');
    await openFolder('Text');
    await setSortColumn('modified');
    await flipDirection();

    await restart();

    await openFolder('Video');
    expect(sortedHeader()).toEqual({ column: 'size', direction: 'asc' });
    await openFolder('Text');
    expect(sortedHeader()).toEqual({ column: 'modified', direction: 'desc' });

    // And the document says the same thing, keyed per folder.
    const doc = persisted();
    expect(doc.folders['category:sources/video'].sortColumn).toBe('size');
    expect(doc.folders['category:sources/text'].sortColumn).toBe('modified');
    expect(doc.folders['category:sources/text'].sortDirection).toBe('desc');
  });

  it('a column header click is one write, and the same column flips rather than resetting', async () => {
    await mount(<FilesApp />);
    await openFolder('Video');

    const sizeHeader = all('.fa-head [role="columnheader"]').find((h) =>
      h.classList.contains('fa-cell-size'),
    );
    await click(sizeHeader);
    expect(sortedHeader()).toEqual({ column: 'size', direction: 'asc' });
    await click(
      all('.fa-head [role="columnheader"]').find((h) => h.classList.contains('fa-cell-size')),
    );
    expect(sortedHeader()).toEqual({ column: 'size', direction: 'desc' });

    // A different column starts ascending again rather than inheriting `desc`.
    await click(
      all('.fa-head [role="columnheader"]').find((h) => h.classList.contains('fa-cell-kind')),
    );
    expect(sortedHeader()).toEqual({ column: 'kind', direction: 'asc' });

    await restart();
    await openFolder('Video');
    expect(sortedHeader()).toEqual({ column: 'kind', direction: 'asc' });
  });
});

describe('gate 22 — view mode is a mode, and it survives a restart per folder', () => {
  it('compact drops three columns from the DOM and details brings them back', async () => {
    await mount(<FilesApp />);
    await openFolder('Video');
    expect(viewModeOnScreen()).toBe('details');
    expect(headerColumns()).toEqual(['name', 'kind', 'provenance', 'size', 'modified']);
    expect(all('.fa-cell-size').length).toBeGreaterThan(0);

    await chooseViewMode('compact');
    expect(viewModeOnScreen()).toBe('compact');
    expect(pressedViewButton()).toBe('compact');
    expect(headerColumns()).toEqual(['name', 'kind']);
    // Not hidden — absent. A `display:none` cell would still be found here.
    expect(all('.fa-cell-size')).toHaveLength(0);
    expect(all('.fa-cell-provenance')).toHaveLength(0);
    expect(all('.fa-cell-modified')).toHaveLength(0);
    // The rows themselves are unchanged; only their columns are.
    expect(bodyRowNames()).toEqual(['alpha.mkv', 'beta.mkv', 'gamma.mkv']);

    await chooseViewMode('details');
    expect(all('.fa-cell-size').length).toBeGreaterThan(0);
  });

  it('Video is compact after a restart while Text is still details', async () => {
    await mount(<FilesApp />);
    await openFolder('Video');
    await chooseViewMode('compact');
    await openFolder('Text');
    expect(viewModeOnScreen()).toBe('details');

    await restart();

    await openFolder('Video');
    expect(viewModeOnScreen()).toBe('compact');
    expect(pressedViewButton()).toBe('compact');
    await openFolder('Text');
    expect(viewModeOnScreen()).toBe('details');
    expect(pressedViewButton()).toBe('details');
  });

  it('sort and view mode are remembered together, not one at the cost of the other', async () => {
    await mount(<FilesApp />);
    await openFolder('Video');
    await setSortColumn('size');
    await flipDirection();
    await chooseViewMode('compact');

    await restart();
    await openFolder('Video');

    expect(viewModeOnScreen()).toBe('compact');
    expect(sortColumnOnScreen()).toBe('size');
    // The ORDER is the proof here, because compact does not render a `size`
    // header for `aria-sort` to sit on — a folder may be sorted by a column its
    // own view mode has dropped. That is Explorer's behaviour too, and the sort
    // stays visible in the toolbar select rather than becoming a secret.
    expect(sortedHeader()).toBeNull();
    expect(bodyRowNames()).toEqual(['alpha.mkv', 'gamma.mkv', 'beta.mkv']);

    // Switching back to details re-marks the same column, so nothing was lost.
    await chooseViewMode('details');
    expect(sortedHeader()).toEqual({ column: 'size', direction: 'desc' });
  });
});

describe('gate 22 — a save that did not land says so', () => {
  it('the change is live, the notice names it, and the restart really does lose it', async () => {
    await mount(<FilesApp />);
    await openFolder('Video');

    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    await chooseViewMode('compact');

    // Live for this session — a button that does nothing at all would be worse.
    expect(viewModeOnScreen()).toBe('compact');
    // And honest about tomorrow.
    const notice = q('.fa-view-notice');
    expect(notice?.textContent).toContain('restarts');

    setItem.mockRestore();
    await restart();
    await openFolder('Video');
    // The gate's own claim, tested in the negative: nothing reached storage, so
    // the restart shows the default. This is what makes the passing cases above
    // proof of persistence rather than proof of a memory cache.
    expect(viewModeOnScreen()).toBe('details');
    expect(q('.fa-view-notice')).toBeNull();
  });
});
