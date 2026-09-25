// @vitest-environment jsdom
/**
 * Audit round 2 — the Files app's fixes, on the real component.
 *
 * #1 Open lands on the item, not the owner's front page.
 * #2 Delete runs the owner's delete after Undo; hides are listed and restorable.
 * #5 A pinned collection opens even while a saved search is open.
 * #6 Computed flags show as badges; the column choice survives a restart.
 * #8 The details pane names the store in words.
 * #9 Right-click menu; a note opens in the preview.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesApp } from '../components/filesapp/FilesApp';
import { countByCategory, type FilesIndexSnapshot, type FilesItem } from '../../shared/filesApp/catalog';
import { takeMediaCenterIntent } from '../mediaCenterIntent';
import { takeFlashcardsFocus } from '../openIntents';
import { FILES_FAVORITES_STORAGE_KEY, resetFavoritesMemoryForTests } from '../filesFavoritesStore';
import { resetCollectionsMemoryForTests } from '../filesCollectionsStore';
import { NOTEBOOK_TIMELINE_STORAGE_KEY } from '../notebookTimeline';

const removed: string[][] = [];
vi.mock('../flashcardDeck', () => ({
  loadDeck: () => [],
  addDeckCardsTracked: () => [],
  removeDeckCards: (ids: readonly string[]) => {
    removed.push([...ids]);
    return [];
  },
}));

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

async function mount(node: ReactNode): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  await settle();
}

async function unmount(): Promise<void> {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

function bodyRows(): HTMLElement[] {
  return Array.from(host?.querySelectorAll<HTMLElement>('[role="row"]') ?? []).filter(
    (r) => !r.classList.contains('fa-head'),
  );
}

function row(name: string): HTMLElement | undefined {
  return bodyRows().find((r) => r.querySelector('.fa-cell-name')?.textContent?.startsWith(name));
}

function button(label: string): HTMLElement | undefined {
  return Array.from(host?.querySelectorAll<HTMLElement>('button') ?? []).find((b) => b.textContent === label);
}

function hasText(needle: string): boolean {
  return (document.body.textContent ?? '').includes(needle);
}

function item(over: Partial<FilesItem> & Pick<FilesItem, 'id' | 'name' | 'kind' | 'categoryId'>): FilesItem {
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
    id: 'library:b1',
    name: 'Kokoro',
    kind: 'book',
    categoryId: 'sources/books',
    source: 'library',
    location: { store: 'file', path: 'C:\\lib\\b1\\kokoro.epub' },
  }),
  item({
    id: 'media:m1',
    name: 'Episode 01',
    kind: 'video',
    categoryId: 'sources/video',
    source: 'media',
    flags: { referenced: true, transcribed: true },
    location: { store: 'file', path: 'D:\\anime\\ep01.mkv' },
  }),
  item({
    id: 'deck-card:c1',
    name: '猫',
    kind: 'mined-card',
    categoryId: 'outputs/mined',
    source: 'local-deck',
    flags: { mined: true, exported: true },
    location: { store: 'localStorage', key: 'jp-flashcard-deck', pointer: 'c1' },
  }),
  item({
    id: 'notebook:nb-1',
    name: 'Reading log',
    kind: 'note',
    categoryId: 'outputs/notes',
    source: 'notebook',
    location: { store: 'localStorage', key: NOTEBOOK_TIMELINE_STORAGE_KEY, pointer: 'nb-1' },
  }),
  item({
    id: 'lookup:犬',
    name: '犬',
    kind: 'note',
    categoryId: 'outputs/notes',
    source: 'lookups',
    location: { store: 'localStorage', key: 'jp-lookup-history', pointer: '犬' },
  }),
  item({
    id: 'dictionary:jmdict',
    name: 'JMdict',
    kind: 'dictionary',
    categoryId: 'reference/dictionaries',
    source: 'dictionaries',
    flags: { enabled: false },
    location: { store: 'sqlite', database: 'dict.db', table: 'dictionaries', rowId: 'jmdict' },
  }),
];

function snapshot(items: FilesItem[] = ITEMS): FilesIndexSnapshot {
  return {
    items,
    counts: countByCategory(items),
    enumerators: [{ source: 'test', itemCount: items.length, elapsedMs: 1 }],
    builtAt: Date.now(),
  };
}

const opened: unknown[] = [];
const recordOpen = (ev: Event): void => {
  opened.push((ev as CustomEvent).detail);
};
const fileDropClassify = vi.fn(async (paths: string[]) => [
  {
    path: paths[0],
    candidates: [
      {
        target: paths[0].endsWith('.epub') ? 'library-book' : 'media',
        confidence: 'exact',
        reasonKey: 'fileDrop.reason.media',
      },
    ],
  },
]);
const dictRemoveYomitan = vi.fn(async () => ({ ok: true }));

beforeEach(() => {
  localStorage.clear();
  resetFavoritesMemoryForTests();
  resetCollectionsMemoryForTests();
  opened.length = 0;
  removed.length = 0;
  takeMediaCenterIntent();
  window.addEventListener('os:open', recordOpen);
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: {
      filesIndex: vi.fn(async () => snapshot()),
      filesReveal: vi.fn(async () => ({ ok: true })),
      fileDropClassify,
      dictRemoveYomitan,
    },
  });
});

afterEach(async () => {
  window.removeEventListener('os:open', recordOpen);
  await unmount();
  vi.useRealTimers();
});

describe('r2 #1 — Open opens the item itself', () => {
  it('a book opens its reader through a Reading route that names the book', async () => {
    await mount(<FilesApp />);
    await click(row('Kokoro'));
    await click(button('Open'));
    expect(opened).toContainEqual(
      expect.objectContaining({ section: 'library', intent: 'open', itemId: 'b1' }),
    );
    expect(hasText('Opened in Library.')).toBe(true);
  });

  it('a video lands on its own title in the Media Center', async () => {
    await mount(<FilesApp />);
    await click(row('Episode 01'));
    await click(button('Open'));
    expect(takeMediaCenterIntent()).toEqual({ tab: 'title', mediaId: 'm1' });
  });

  it('a deck card opens the deck filtered to that card', async () => {
    await mount(<FilesApp />);
    await click(row('猫'));
    await click(button('Open'));
    expect(takeFlashcardsFocus()).toEqual({ folder: null, cardId: 'c1' });
    expect(opened).toContain('flashcards');
  });

  it('a note with no app of its own opens in the preview', async () => {
    localStorage.setItem(
      NOTEBOOK_TIMELINE_STORAGE_KEY,
      JSON.stringify([{ id: 'nb-1', stream: 'ocr', title: 'Reading log', detail: '今日は三章', ts: 1 }]),
    );
    await mount(<FilesApp />);
    await click(row('Reading log'));
    expect(hasText('今日は三章')).toBe(true);
    await click(button('Open'));
    expect(hasText('This note has no app of its own, so it is shown in the preview.')).toBe(true);
  });
});

describe('r2 #2 — Delete is real, deferred, and hides are restorable', () => {
  it('uninstalls a dictionary through its own API only after the undo window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    await mount(<FilesApp />);
    await click(row('JMdict'));
    expect(hasText('Uninstall')).toBe(false);
    await click(button('Delete'));
    expect(hasText('Uninstall the dictionary “JMdict”?')).toBe(true);
    await click(button('Confirm delete'));
    expect(hasText('“JMdict” will be deleted in 10 seconds.')).toBe(true);
    expect(dictRemoveYomitan).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(10_500);
    });
    await settle();
    expect(dictRemoveYomitan).toHaveBeenCalledWith('jmdict');
  });

  it('a record no owner can delete is hidden, listed under Hidden items, and restored from there', async () => {
    await mount(<FilesApp />);
    await click(row('犬'));
    await click(button('Delete'));
    expect(hasText('Hide “犬” from Files?')).toBe(true);
    await click(button('Confirm delete'));
    expect(row('犬')).toBeUndefined();
    await click(host?.querySelector('[data-special="hidden"]'));
    expect(host?.querySelector('[data-item="lookup:犬"]')).not.toBeNull();
    await click(host?.querySelector('.fa-hidden-restore'));
    await click(host?.querySelector('[data-derived="true"][title="Notes"]'));
    expect(row('犬')).toBeDefined();
  });
});

describe('r2 #5 — a pinned collection opens while a saved search is open', () => {
  it('replaces the saved search instead of being shadowed by it', async () => {
    localStorage.setItem(
      'jp-files-collections-v1',
      JSON.stringify({
        version: 1,
        collections: [{ id: 'c1', name: 'Study', parentId: null, itemIds: ['library:b1'], createdAt: 1, updatedAt: 1 }],
      }),
    );
    localStorage.setItem(
      FILES_FAVORITES_STORAGE_KEY,
      JSON.stringify({ version: 1, favorites: [{ target: { type: 'collection', collectionId: 'c1' }, pinnedAt: 1 }] }),
    );
    resetFavoritesMemoryForTests();
    resetCollectionsMemoryForTests();
    await mount(<FilesApp />);
    const smart = host?.querySelector<HTMLElement>('.fa-smart-node');
    await click(smart);
    await click(host?.querySelector('.fa-favorite-node'));
    expect(bodyRows().map((r) => r.querySelector('.fa-cell-name')?.textContent)).toEqual(['Kokoro']);
  });
});

describe('r2 #6 — badges and a column picker that persists', () => {
  it('shows computed flags on the row', async () => {
    await mount(<FilesApp />);
    const badges = (name: string) =>
      Array.from(row(name)?.querySelectorAll('.fa-badge') ?? []).map((b) => b.textContent);
    expect(badges('Episode 01')).toEqual(['transcribed']);
    expect(badges('猫')).toEqual(['mined', 'exported']);
    expect(badges('JMdict')).toEqual(['off']);
  });

  it('adds a column and keeps it after a restart', async () => {
    await mount(<FilesApp />);
    await click(button('Columns'));
    await click(host?.querySelector('input[data-column="lastUsed"]'));
    expect(host?.querySelector('[role="columnheader"].fa-cell-lastUsed')).not.toBeNull();
    await unmount();
    await mount(<FilesApp />);
    expect(host?.querySelector('[role="columnheader"].fa-cell-lastUsed')).not.toBeNull();
    expect(row('Kokoro')?.querySelector('.fa-cell-lastUsed')).not.toBeNull();
  });
});

describe('r2 #8 and #9 — words, not ids; a right-click menu', () => {
  it('names the source store in the details pane', async () => {
    await mount(<FilesApp />);
    await click(row('猫'));
    expect(hasText('Flashcard deck')).toBe(true);
    expect(hasText('local-deck')).toBe(false);
  });

  it('right-click offers Open, Reveal, Rename, Pin and Delete, and Delete lands on the confirm', async () => {
    await mount(<FilesApp />);
    const target = row('Episode 01');
    await act(async () => {
      target?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });
    await settle();
    const labels = Array.from(document.querySelectorAll('.ui-menu__item')).map((b) => b.textContent);
    expect(labels).toEqual(['Open', 'Reveal in Explorer', 'Rename', 'Pin to Favorites', 'Delete']);
    const del = Array.from(document.querySelectorAll<HTMLElement>('.ui-menu__item')).find((b) => b.textContent === 'Delete');
    await click(del);
    expect(hasText('Remove “Episode 01” from the media library?')).toBe(true);
    expect(host?.querySelector('.fa-delete-trash-file input')).not.toBeNull();
  });
});
