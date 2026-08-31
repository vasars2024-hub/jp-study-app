// @vitest-environment jsdom
/**
 * Gates 16 and 17, measured on the real component.
 *
 * Gate 16: "Create a folder, add items of two different kinds to it, nest it,
 * reopen the app and it survives. Deleting the collection leaves every item in
 * place — proven by re-finding one of them afterwards."
 *
 * Gate 17: "Renaming or deleting a derived folder is refused with a named
 * message; it does not silently no-op. Adding an item to one by hand is not
 * offered."
 *
 * The reopen is a real unmount-and-remount against the same `localStorage`, not
 * a re-read of component state — the whole gate is whether the document went to
 * disk, and a state assertion cannot tell those apart.
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
  FILES_COLLECTIONS_STORAGE_KEY,
  resetCollectionsMemoryForTests,
} from '../filesCollectionsStore';
import { collectionById, parseCollectionsDoc } from '../../shared/filesApp/collections';

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
 * A restart. The DOM and the module's in-memory fallback both go; localStorage
 * stays, which is exactly the boundary gate 16 asks about.
 */
async function reopen(): Promise<void> {
  await unmount();
  resetCollectionsMemoryForTests();
  await mount(<FilesApp />);
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

async function setInput(el: HTMLInputElement | HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    const proto =
      el instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

function q<T extends Element = HTMLElement>(selector: string): T | null {
  return host?.querySelector<T>(selector) ?? null;
}

function all(selector: string): HTMLElement[] {
  return Array.from(host?.querySelectorAll<HTMLElement>(selector) ?? []);
}

function folderNames(): string[] {
  return all('.fa-collection-node').map((b) => b.querySelector('.fa-tree-label')?.textContent ?? '');
}

function folderNode(name: string): HTMLElement | undefined {
  return all('.fa-collection-node').find(
    (b) => b.querySelector('.fa-tree-label')?.textContent === name,
  );
}

function notice(): string {
  return q('.fa-folder-notice')?.textContent ?? '';
}

function bodyRowNames(): string[] {
  return all('[role="row"]')
    .filter((r) => !r.classList.contains('fa-head'))
    .map((r) => r.querySelector('.fa-cell-name')?.textContent ?? '');
}

function railNode(label: string): HTMLElement | undefined {
  return all('[data-derived="true"]').find(
    (b) => b.querySelector('.fa-tree-label')?.textContent === label,
  );
}

/** What is actually on disk, read the way a fresh launch would read it. */
function persisted() {
  const raw = localStorage.getItem(FILES_COLLECTIONS_STORAGE_KEY);
  return parseCollectionsDoc(raw ? JSON.parse(raw) : null);
}

/**
 * A DataTransfer jsdom does not implement. Only the three members the component
 * touches are provided; anything else would be a fake that could pass a test
 * the real API would fail.
 */
function transfer(itemId?: string) {
  const data = new Map<string, string>();
  if (itemId) data.set('application/x-jp-files-item', itemId);
  return {
    types: [...data.keys()],
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => void data.set(type, value),
    dropEffect: 'none',
    effectAllowed: 'none',
  };
}

async function fireDrag(node: Element, type: 'dragover' | 'drop', itemId?: string): Promise<void> {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer(itemId) });
  await act(async () => {
    node.dispatchEvent(event);
  });
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

/** Two different KINDS, because the gate names two different kinds. */
const ITEMS: FilesItem[] = [
  item({
    id: 'media:1',
    name: 'Episode 01',
    kind: 'video',
    categoryId: 'sources/video',
    location: { store: 'file', path: 'C:\\media\\ep1.mkv' },
  }),
  item({
    id: 'dictionary:jmdict',
    name: 'JMdict',
    kind: 'dictionary',
    categoryId: 'reference/dictionaries',
    provenance: 'installed',
    location: { store: 'sqlite', database: 'dict.db', table: 'dictionaries', rowId: 'jmdict' },
  }),
  item({
    id: 'transcript:abc',
    name: 'abc123',
    kind: 'transcript',
    categoryId: 'sources/text',
    provenance: 'whisper-transcript',
    location: { store: 'file', path: 'C:\\t\\abc.json' },
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

/** Create one folder through the UI and give it a name. */
async function makeFolder(name: string): Promise<void> {
  await click(q('.fa-collections-new'));
  const input = q<HTMLInputElement>('.fa-collection-rename input');
  expect(input).toBeTruthy();
  await setInput(input as HTMLInputElement, name);
  await click(q('.fa-collection-rename .fa-action'));
}

describe('gate 16 — collections are real folders', () => {
  it('starts with none, and says so rather than showing an empty strip', async () => {
    await mount(<FilesApp />);
    expect(q('.fa-collections-empty')).toBeTruthy();
    expect(folderNames()).toEqual([]);
  });

  it('creates a folder, and it survives a reopen', async () => {
    await mount(<FilesApp />);
    await makeFolder('Season 1');
    expect(folderNames()).toEqual(['Season 1']);

    await reopen();
    // Read from the DOM after a real remount: the store's memory fallback was
    // cleared, so this could only have come off disk.
    expect(folderNames()).toEqual(['Season 1']);
  });

  it('takes items of two different kinds by drag, and both survive a reopen', async () => {
    await mount(<FilesApp />);
    await makeFolder('Mixed');
    const node = folderNode('Mixed');
    await fireDrag(node as Element, 'drop', 'media:1');
    await fireDrag(folderNode('Mixed') as Element, 'drop', 'dictionary:jmdict');

    await reopen();
    const saved = collectionById(persisted(), persisted().collections[0].id);
    expect(saved?.itemIds).toEqual(['media:1', 'dictionary:jmdict']);

    // And the folder actually shows them — a stored id nothing renders would
    // be a folder that swallowed the file.
    await click(folderNode('Mixed'));
    expect(bodyRowNames().sort()).toEqual(['Episode 01', 'JMdict']);
  });

  it('adds by keyboard too — the drag is not the only way in', async () => {
    await mount(<FilesApp />);
    await makeFolder('Keyboard');
    await click(all('[role="row"]').find((r) => r.textContent?.includes('Episode 01')));
    const select = q<HTMLSelectElement>('.fa-add-to-collection');
    expect(select).toBeTruthy();
    await setInput(select as HTMLSelectElement, persisted().collections[0].id);

    await reopen();
    expect(persisted().collections[0].itemIds).toEqual(['media:1']);
  });

  it('nests one folder inside another, and the nesting survives a reopen', async () => {
    await mount(<FilesApp />);
    await makeFolder('Show');
    await makeFolder('Season 1');
    const showId = persisted().collections.find((c) => c.name === 'Show')?.id as string;

    await click(folderNode('Season 1'));
    await setInput(q<HTMLSelectElement>('.fa-folder-move select') as HTMLSelectElement, showId);
    expect(persisted().collections.find((c) => c.name === 'Season 1')?.parentId).toBe(showId);

    await reopen();
    expect(persisted().collections.find((c) => c.name === 'Season 1')?.parentId).toBe(showId);
    // Depth is what the rail renders nesting with, so it is what is asserted.
    expect(folderNode('Season 1')?.style.getPropertyValue('--fa-depth')).toBe('1');
  });

  it('renames a folder, and the new name survives a reopen', async () => {
    await mount(<FilesApp />);
    await makeFolder('Typo');
    await click(folderNode('Typo'));
    await click(q('.fa-folder-rename'));
    await setInput(q<HTMLInputElement>('.fa-collection-rename input') as HTMLInputElement, 'Fixed');
    await click(q('.fa-collection-rename .fa-action'));

    await reopen();
    expect(folderNames()).toEqual(['Fixed']);
  });

  it('a duplicate sibling name is refused by name, and the editor stays open', async () => {
    await mount(<FilesApp />);
    await makeFolder('One');
    await makeFolder('Two');
    await click(folderNode('Two'));
    await click(q('.fa-folder-rename'));
    await setInput(q<HTMLInputElement>('.fa-collection-rename input') as HTMLInputElement, 'one');
    await click(q('.fa-collection-rename .fa-action'));

    expect(notice()).toContain('already');
    // Still editable: a refusal that threw the typing away would make the user
    // retype it to find out what was wrong.
    expect(q('.fa-collection-rename input')).toBeTruthy();
    expect(persisted().collections.map((c) => c.name).sort()).toEqual(['One', 'Two']);
  });

  it('DELETING THE FOLDER LEAVES EVERY ITEM IN PLACE — the item is re-found afterwards', async () => {
    await mount(<FilesApp />);
    await makeFolder('Doomed');
    await fireDrag(folderNode('Doomed') as Element, 'drop', 'media:1');
    await click(folderNode('Doomed'));
    expect(bodyRowNames()).toEqual(['Episode 01']);

    await click(q('.fa-folder-delete'));
    // The confirm states the count, because the count is the claim.
    expect(q('.fa-folder-confirm')?.textContent).toContain('1 item');
    await click(q('.fa-folder-confirm-yes'));

    expect(folderNames()).toEqual([]);
    expect(persisted().collections).toEqual([]);
    // The gate's own proof: re-find the item. The list left the deleted folder
    // and the video is exactly where it always was.
    expect(bodyRowNames()).toContain('Episode 01');

    await reopen();
    expect(bodyRowNames()).toContain('Episode 01');
    expect(folderNames()).toEqual([]);
  });

  it('the delete confirm can be declined, and nothing happens', async () => {
    await mount(<FilesApp />);
    await makeFolder('Kept');
    await click(folderNode('Kept'));
    await click(q('.fa-folder-delete'));
    await click(all('.fa-folder-confirm .fa-action').find((b) => !b.classList.contains('fa-folder-confirm-yes')));
    expect(q('.fa-folder-confirm')).toBeNull();
    expect(folderNames()).toEqual(['Kept']);
  });

  it('an id the index no longer knows is COUNTED, not quietly dropped', async () => {
    await mount(<FilesApp />);
    await makeFolder('Shrinking');
    await fireDrag(folderNode('Shrinking') as Element, 'drop', 'media:1');
    await fireDrag(folderNode('Shrinking') as Element, 'drop', 'dictionary:jmdict');
    await unmount();

    // The video is gone from the library behind the folder's back.
    filesIndex.mockImplementation(async () => snapshot(ITEMS.filter((i) => i.id !== 'media:1')));
    resetCollectionsMemoryForTests();
    await mount(<FilesApp />);
    await click(folderNode('Shrinking'));

    expect(bodyRowNames()).toEqual(['JMdict']);
    expect(q('.fa-collection-missing')?.textContent ?? '').toContain('1 item');
    // Still stored: the user is the only one who can say to forget it.
    expect(persisted().collections[0].itemIds).toEqual(['media:1', 'dictionary:jmdict']);
  });

  it('removing an item from a folder leaves the item itself alone', async () => {
    await mount(<FilesApp />);
    await makeFolder('Temp');
    await fireDrag(folderNode('Temp') as Element, 'drop', 'media:1');
    await click(folderNode('Temp'));
    await click(all('[role="row"]').find((r) => r.textContent?.includes('Episode 01')));
    await click(q('.fa-remove-from-collection'));

    expect(persisted().collections[0].itemIds).toEqual([]);
    // Back to Everything and the video is still there.
    await click(q('.fa-tree-root'));
    expect(bodyRowNames()).toContain('Episode 01');
  });

  it('CONTROL: a drop carrying no item id changes nothing', async () => {
    await mount(<FilesApp />);
    await makeFolder('Empty');
    await fireDrag(folderNode('Empty') as Element, 'drop');
    expect(persisted().collections[0].itemIds).toEqual([]);
  });

  it('CONTROL: a second drop of the same item does not duplicate the row', async () => {
    await mount(<FilesApp />);
    await makeFolder('Once');
    await fireDrag(folderNode('Once') as Element, 'drop', 'media:1');
    await fireDrag(folderNode('Once') as Element, 'drop', 'media:1');
    expect(persisted().collections[0].itemIds).toEqual(['media:1']);
  });
});

describe('gate 17 — derived folders refuse honestly', () => {
  it('renaming a derived folder is refused BY NAME, not silently', async () => {
    await mount(<FilesApp />);
    await click(railNode('Sources'));
    await click(q('.fa-folder-rename'));

    const text = notice();
    expect(text).toContain('Sources');
    expect(text.length).toBeGreaterThan(20);
    // Not a no-op with a message: no editor opened, so there is nothing that
    // looks like it might have worked.
    expect(q('.fa-collection-rename')).toBeNull();
  });

  it('deleting a derived folder is refused BY NAME, and no confirm appears', async () => {
    await mount(<FilesApp />);
    await click(railNode('Sources'));
    await click(q('.fa-folder-delete'));

    expect(notice()).toContain('Sources');
    expect(q('.fa-folder-confirm')).toBeNull();
  });

  it('moving a derived folder is refused BY NAME', async () => {
    await mount(<FilesApp />);
    await makeFolder('Somewhere');
    await click(railNode('Sources'));
    const target = persisted().collections[0].id;
    await setInput(q<HTMLSelectElement>('.fa-folder-move select') as HTMLSelectElement, target);
    expect(notice()).toContain('Sources');
    expect(persisted().collections[0].parentId).toBeNull();
  });

  it('CONTROL: the same three controls ACT on a folder of the user\'s own', async () => {
    await mount(<FilesApp />);
    await makeFolder('Mine');
    await click(folderNode('Mine'));
    await click(q('.fa-folder-rename'));
    // The editor the derived refusal did not open.
    expect(q('.fa-collection-rename')).toBeTruthy();
    await click(q('.fa-collection-rename .fa-action:last-of-type'));

    await click(q('.fa-folder-delete'));
    expect(q('.fa-folder-confirm')).toBeTruthy();
  });

  it('a derived folder is NOT a drop target, and says why', async () => {
    await mount(<FilesApp />);
    await makeFolder('Mine');
    const derived = railNode('Sources') as Element;

    const event = new Event('dragover', { bubbles: true, cancelable: true });
    const dt = transfer('media:1');
    Object.defineProperty(event, 'dataTransfer', { value: dt });
    await act(async () => {
      derived.dispatchEvent(event);
    });

    // `defaultPrevented` false is what makes the drop impossible — the browser
    // only fires `drop` on a target that prevented the default on dragover. It
    // is the mechanism, so it is what is asserted, not the cursor.
    expect(event.defaultPrevented).toBe(false);
    expect(dt.dropEffect).toBe('none');
    expect(notice()).toContain('Sources');
  });

  it('CONTROL: one of the user\'s own folders DOES prevent the default on dragover', async () => {
    await mount(<FilesApp />);
    await makeFolder('Mine');
    const event = new Event('dragover', { bubbles: true, cancelable: true });
    const dt = transfer('media:1');
    Object.defineProperty(event, 'dataTransfer', { value: dt });
    await act(async () => {
      (folderNode('Mine') as Element).dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('copy');
    expect(folderNode('Mine')?.dataset.dragover).toBe('true');
  });

  it('adding an item by hand is not OFFERED on a derived folder — the menu holds only the user\'s own', async () => {
    await mount(<FilesApp />);
    await makeFolder('Mine');
    await click(railNode('Sources'));
    await click(all('[role="row"]').find((r) => r.textContent?.includes('Episode 01')));

    const options = Array.from(
      (q<HTMLSelectElement>('.fa-add-to-collection') as HTMLSelectElement).options,
    ).map((o) => o.value);
    // The placeholder plus exactly one folder: no derived category is on it.
    expect(options).toEqual(['', persisted().collections[0].id]);
  });
});
