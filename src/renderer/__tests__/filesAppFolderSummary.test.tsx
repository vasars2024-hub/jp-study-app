// @vitest-environment jsdom
/**
 * The no-selection inspector — rubric category 4 ("use of space") on `files`.
 *
 * Measured live 2026-09-04 at maximized (1264x773): the inspector was a 320px
 * column holding ONE 43px sentence, and its empty remainder was the surface's
 * largest dead rectangle at **316x572, 17.4% of the viewport** against a 15%
 * bar. The repair fills it with a summary of the folder you are looking at.
 *
 * Every assertion here is paired with the thing that must NOT be true, because
 * a summary is the easiest kind of panel to ship wrong and still look right:
 *
 * - **Scope.** Video says 4 / 100 B while Everything says 12 / 114 B. An
 *   implementation that summed the SNAPSHOT rather than `visible` prints the
 *   same two numbers in every folder, and both folders assert against that.
 * - **Filters, not just folders.** A search that leaves 3 rows must move the
 *   summary to 3. `visible` is what the list renders; a summary derived one
 *   step earlier would sit at 12 and silently disagree with the rows beside it.
 * - **`null` is not zero.** `sizeBytes: null` means "this store has no size".
 *   Text prints its total AND names the 1 row it could not weigh; Audio, where
 *   nothing has a size, prints an em dash. A `?? 0` fold prints "3 B" with no
 *   mention and "0 B" — both of which are inventions, and both are asserted
 *   against by name.
 * - **The broken note is absent when nothing is broken.** Video shows it,
 *   Text must not. A note that always renders would pass the positive half.
 * - **Parity.** The sentence the panel used to be is still on screen, last.
 *   Selecting a row still replaces the whole panel with the item inspector,
 *   and leaving the folder brings the summary back.
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
import { resetViewStateMemoryForTests } from '../filesViewStateStore';
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

async function search(text: string): Promise<void> {
  const input = q<HTMLInputElement>('.fa-search input');
  expect(input, '.fa-search input').toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      text,
    );
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/* -------- what the summary says, read off the rendered pairs -------- */

/** `[label, value]` for every row of the summary's own definition list. */
function summaryRows(): [string, string][] {
  const list = q('.fa-details-summary .fa-details-list');
  if (!list) return [];
  const dts = Array.from(list.querySelectorAll('dt'));
  const dds = Array.from(list.querySelectorAll('dd'));
  return dts.map((dt, i) => [dt.textContent ?? '', dds[i]?.textContent ?? '']);
}

function summaryValue(label: string): string | undefined {
  return summaryRows().find(([l]) => l === label)?.[1];
}

function brokenNote(): string | null {
  return q('.fa-details-summary .fa-summary-broken')?.textContent ?? null;
}

function bodyRowNames(): string[] {
  return all('[role="row"]')
    .filter((r) => !r.classList.contains('fa-head'))
    .map((r) => r.querySelector('.fa-cell-name')?.textContent ?? '');
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

/**
 * Twelve rows, eight kinds, and three folders that answer the size question
 * three different ways: all sized (Video), partly sized (Text), none sized
 * (Audio). The kind tail is deliberately longer than the six the column shows.
 */
const ITEMS: FilesItem[] = [
  item({ id: 'v:1', name: 'alpha.mkv', kind: 'video', categoryId: 'sources/video', sizeBytes: 30 }),
  item({ id: 'v:2', name: 'beta.mkv', kind: 'video', categoryId: 'sources/video', sizeBytes: 10 }),
  item({ id: 'v:3', name: 'gamma.mkv', kind: 'video', categoryId: 'sources/video', sizeBytes: 20 }),
  item({
    id: 'v:4',
    name: 'delta.mkv',
    kind: 'video',
    categoryId: 'sources/video',
    sizeBytes: 40,
    flags: { brokenLink: true },
  }),
  item({ id: 't:1', name: 'one.srt', kind: 'subtitle', categoryId: 'sources/text', sizeBytes: 3 }),
  item({ id: 't:2', name: 'two.txt', kind: 'transcript', categoryId: 'sources/text' }),
  item({ id: 'a:1', name: 'first.m4a', kind: 'audio', categoryId: 'sources/audio' }),
  item({ id: 'a:2', name: 'second.m4a', kind: 'audio', categoryId: 'sources/audio' }),
  item({ id: 'b:1', name: 'novel.epub', kind: 'book', categoryId: 'sources/books', sizeBytes: 5 }),
  item({ id: 'm:1', name: 'vol1.cbz', kind: 'manga', categoryId: 'sources/manga', sizeBytes: 6 }),
  item({ id: 'd:1', name: 'Core deck', kind: 'deck', categoryId: 'outputs/decks' }),
  item({ id: 'n:1', name: 'a note', kind: 'note', categoryId: 'outputs/notes' }),
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

describe('files — the inspector with nothing selected summarises the folder', () => {
  it('counts and weighs the rows THIS folder shows, not the whole index', async () => {
    await mount(<FilesApp />);
    await openEverything();

    expect(bodyRowNames()).toHaveLength(12);
    expect(summaryValue('Shown')).toBe('12 items');
    // 30+10+20+40+3+5+6 = 114; the five null rows are named, never folded to 0.
    expect(summaryValue('Total size')).toBe('114 B · 5 with no size');

    await openFolder('Video');
    expect(bodyRowNames()).toHaveLength(4);
    // Both numbers move. A summary over the snapshot would still read 12/114.
    expect(summaryValue('Shown')).toBe('4 items');
    expect(summaryValue('Total size')).toBe('100 B');
  });

  it('follows the search box, so it can never disagree with the rows beside it', async () => {
    await mount(<FilesApp />);
    await openEverything();
    expect(summaryValue('Shown')).toBe('12 items');

    await search('.mkv');
    expect(bodyRowNames()).toHaveLength(4);
    expect(summaryValue('Shown')).toBe('4 items');
    expect(summaryValue('Total size')).toBe('100 B');

    await search('');
    expect(summaryValue('Shown')).toBe('12 items');
  });

  it('tells a store with no size apart from a folder that weighs nothing', async () => {
    await mount(<FilesApp />);

    // Partly sized: the total is real AND the row it could not weigh is named.
    await openFolder('Text');
    expect(summaryValue('Total size')).toBe('3 B · 1 with no size');

    // Nothing sized at all: an em dash, which is `format.ts`'s own answer for
    // `null`. "0 B" here would claim two empty files.
    await openFolder('Audio');
    expect(summaryValue('Shown')).toBe('2 items');
    expect(summaryValue('Total size')).toBe('—');
    expect(summaryValue('Total size')).not.toBe('0 B');
  });

  it('breaks the folder down by kind, and counts the tail it cannot show', async () => {
    await mount(<FilesApp />);
    await openEverything();

    const rows = summaryRows();
    const kindRows = rows.filter(([l]) => l !== 'Shown' && l !== 'Total size');
    // Six kinds shown plus the tail row. Eight kinds are present.
    expect(kindRows).toHaveLength(7);
    expect(kindRows[0]).toEqual(['Video', '4 items']);
    expect(kindRows[1]).toEqual(['Audio', '2 items']);
    expect(kindRows[6]).toEqual(['Other kinds', '2 more kinds']);
    // The shown rows plus the counted tail account for every kind: 6 + 2 = 8.
    const distinctKinds = new Set(ITEMS.map((i) => i.kind)).size;
    expect(kindRows.length - 1 + 2).toBe(distinctKinds);

    // One folder, one kind: no tail row at all.
    await openFolder('Audio');
    const audioKinds = summaryRows().filter(([l]) => l !== 'Shown' && l !== 'Total size');
    expect(audioKinds).toEqual([['Audio', '2 items']]);
  });

  it('names broken links where there are some, and says nothing where there are none', async () => {
    await mount(<FilesApp />);

    await openFolder('Video');
    expect(brokenNote()).toBe('1 item points at a file that is gone.');

    // The negative half: Text has no broken row, so the note must not render.
    await openFolder('Text');
    expect(brokenNote()).toBeNull();
  });

  it('keeps the sentence it replaced, and still yields the panel to a selection', async () => {
    await mount(<FilesApp />);
    await openFolder('Video');

    // Parity: the original empty state is still on screen, and it is LAST.
    const state = q('.fa-details-summary .fa-state');
    expect(state?.textContent).toBe('Select an item to see its details.');
    expect(state?.nextElementSibling).toBeNull();

    // Selecting swaps the whole panel for the item inspector.
    await click(all('[role="row"]').find((r) => !r.classList.contains('fa-head')));
    expect(q('.fa-details-summary')).toBeNull();
    expect(q('.fa-details-title')?.textContent).toBe('alpha.mkv');

    // Leaving the folder drops the selection, and the summary comes back.
    await openFolder('Audio');
    expect(q('.fa-details-summary')).toBeTruthy();
    expect(summaryValue('Shown')).toBe('2 items');
  });
});
