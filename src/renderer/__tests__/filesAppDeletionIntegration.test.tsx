// @vitest-environment jsdom
/**
 * Gates 9 and 21, measured through the PRODUCTION `FilesApp` component.
 *
 * The deletion policy, the control and the main-process boundary each already
 * had their own suites, on both sides of a mergeback — and all of them passed
 * while nothing rendered the control and no `ipcMain` handler existed. That is
 * the exact shape this repo calls an unrefereed track: green tests over a
 * feature the user cannot reach.
 *
 * So every assertion here starts from `<FilesApp />` and a row the user
 * selects. What is NOT covered here, deliberately: gate 21's "restorable from
 * the Recycle Bin, verified by actually restoring one" — `shell.trashItem` is
 * an OS operation and a jsdom mock proving it was *called* would be a
 * restatement of the mock, not evidence. That half is a live check, recorded
 * in the plan.
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
import type { FilesDeleteRequest, FilesDeletionResult } from '../../shared/filesApp/deletion';
import { FILES_SOFT_DELETE_STORAGE_KEY } from '../../shared/filesApp/softDelete';
import { resetFavoritesMemoryForTests } from '../filesFavoritesStore';
import { resetCollectionsMemoryForTests } from '../filesCollectionsStore';

vi.mock('../flashcardDeck', () => ({
  loadDeck: () => [],
  addDeckCardsTracked: () => [],
  removeDeckCards: () => [],
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

/** A real restart: remount off persisted storage with the memory fallbacks gone. */
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

function bodyRowNames(): string[] {
  return all('[role="row"]')
    .filter((r) => !r.classList.contains('fa-head'))
    .map((r) => r.querySelector('.fa-cell-name')?.textContent ?? '');
}

async function selectRow(name: string): Promise<void> {
  await click(all('[role="row"]').find((r) => r.textContent?.includes(name)));
}

/**
 * The item count alone, so "left the list" can be told from "hidden in it".
 * Deliberately the first span rather than the whole dock — the dock also
 * carries the selection and the delete receipt, which are supposed to change.
 */
function statusCount(): string {
  return q('.fa-status > span')?.textContent ?? '';
}

function tombstonedIds(): string[] {
  const raw = localStorage.getItem(FILES_SOFT_DELETE_STORAGE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { tombstones?: { itemId: string }[] };
  return (parsed.tombstones ?? []).map((t) => t.itemId);
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

/** A file-backed row (trash), an index-only row (soft delete), a computed row (refusal). */
const ITEMS: FilesItem[] = [
  item({
    id: 'media:1',
    name: 'Episode 01',
    kind: 'video',
    categoryId: 'sources/video',
    sizeBytes: 4096,
    location: { store: 'file', path: 'C:\\media\\ep1.mkv' },
  }),
  item({
    id: 'note:1',
    name: 'Grammar note',
    kind: 'note',
    categoryId: 'study/notes',
    location: { store: 'localStorage', key: 'jp-notes-v1', describes: 'a note' },
  }),
  item({
    id: 'stat:1',
    name: 'Reviews this week',
    kind: 'stat',
    categoryId: 'system/statistics',
    location: { store: 'derived', describes: 'a computed reading' },
  }),
];

const filesIndex = vi.fn<(force?: boolean) => Promise<FilesIndexSnapshot>>();
const filesDelete = vi.fn<(request: FilesDeleteRequest) => Promise<FilesDeletionResult>>();

/** What main would still return; the renderer must never assume the row is gone. */
let liveItems: FilesItem[] = ITEMS;

function snapshot(items: FilesItem[]): FilesIndexSnapshot {
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
  liveItems = ITEMS;
  filesIndex.mockReset();
  filesIndex.mockImplementation(async () => snapshot(liveItems));
  filesDelete.mockReset();
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { filesIndex, filesDelete, filesReveal: async () => ({ ok: true }) },
  });
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe('gates 9/21 — Delete, from the production Files inspector', () => {
  it('OFFERS Delete on a selected row, and asks before doing anything', async () => {
    await mount(<FilesApp />);
    await selectRow('Episode 01');

    expect(q('.fa-delete-action')).toBeTruthy();
    // Nothing destructive is one click away.
    expect(q('.fa-delete-confirm')).toBeNull();

    await click(q('.fa-delete-action'));
    const confirm = q('.fa-delete-confirm');
    expect(confirm).toBeTruthy();
    expect(confirm?.getAttribute('role')).toBe('alertdialog');
    // Still nothing has been asked of main.
    expect(filesDelete).not.toHaveBeenCalled();
  });

  it('CANCEL leaves the row and calls nothing', async () => {
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-delete-action'));
    await click(all('.fa-delete-confirm-actions .fa-action').find((b) => !b.classList.contains('fa-delete-confirm-yes')));

    expect(q('.fa-delete-confirm')).toBeNull();
    expect(filesDelete).not.toHaveBeenCalled();
    expect(bodyRowNames()).toContain('Episode 01');
  });

  it('a file-backed delete reaches MAIN carrying only the id and its confirmation', async () => {
    filesDelete.mockImplementation(async (request) => ({
      ok: true,
      itemId: request.itemId,
      mode: 'trash',
    }));
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-delete-action'));

    // Main is the only thing that can remove the file, so the row goes when the
    // rebuilt index no longer carries it — not because the renderer assumed.
    liveItems = ITEMS.filter((i) => i.id !== 'media:1');
    await click(q('.fa-delete-confirm-yes'));

    expect(filesDelete).toHaveBeenCalledTimes(1);
    const sent = filesDelete.mock.calls[0][0];
    expect(sent.itemId).toBe('media:1');
    expect(sent.confirmedItemId).toBe('media:1');
    // The security property the boundary is built on: no path crosses.
    expect(Object.keys(sent).sort()).toEqual(['confirmedItemId', 'itemId']);
    expect(JSON.stringify(sent)).not.toContain('ep1.mkv');

    expect(q('.fa-delete-notice.is-ok')).toBeTruthy();
    expect(bodyRowNames()).not.toContain('Episode 01');
  });

  it('a REFUSAL from main is shown, and the row stays', async () => {
    filesDelete.mockImplementation(async (request) => ({
      ok: false,
      itemId: request.itemId,
      reasonKey: 'filesApp.delete.refuseNotTrashable',
    }));
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-delete-action'));
    await click(q('.fa-delete-confirm-yes'));

    expect(q('.fa-delete-notice.is-error')).toBeTruthy();
    expect(bodyRowNames()).toContain('Episode 01');
  });

  it('an INDEX-ONLY row soft-deletes with a working Undo, and never touches main', async () => {
    await mount(<FilesApp />);
    expect(bodyRowNames()).toContain('Grammar note');
    const before = statusCount();

    await selectRow('Grammar note');
    await click(q('.fa-delete-action'));
    await click(q('.fa-delete-confirm-yes'));

    // Renderer-owned: main is not a second writer for localStorage rows.
    expect(filesDelete).not.toHaveBeenCalled();
    expect(tombstonedIds()).toEqual(['note:1']);
    // It left the LIST, not just the view — the count moved too.
    expect(bodyRowNames()).not.toContain('Grammar note');
    expect(statusCount()).not.toBe(before);

    await click(q('.fa-delete-undo'));
    expect(tombstonedIds()).toEqual([]);
    expect(bodyRowNames()).toContain('Grammar note');
    expect(statusCount()).toBe(before);
  });

  it('a soft delete SURVIVES A RESTART when it is not undone', async () => {
    await mount(<FilesApp />);
    await selectRow('Grammar note');
    await click(q('.fa-delete-action'));
    await click(q('.fa-delete-confirm-yes'));
    expect(bodyRowNames()).not.toContain('Grammar note');

    await restart();
    // Read back off localStorage with the memory fallbacks cleared: the index
    // still returns the row, so only the persisted tombstone can hide it.
    expect(liveItems.map((i) => i.name)).toContain('Grammar note');
    expect(bodyRowNames()).not.toContain('Grammar note');
  });

  it('a COMPUTED row refuses in different words and offers no action at all', async () => {
    await mount(<FilesApp />);
    await selectRow('Reviews this week');

    expect(q('.fa-delete-action')).toBeNull();
    const refusal = q('.fa-delete-refusal');
    expect(refusal).toBeTruthy();
    // Gate 21's "different words": not the recoverable-delete copy.
    expect(refusal?.textContent).not.toBe(q('.fa-delete-notice')?.textContent);
    expect(refusal?.textContent?.trim().length).toBeGreaterThan(0);
    expect(filesDelete).not.toHaveBeenCalled();
  });

  it('a confirmation does not carry over to a row selected after it opened', async () => {
    filesDelete.mockImplementation(async (request) => ({
      ok: true,
      itemId: request.itemId,
      mode: 'trash',
    }));
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-delete-action'));
    expect(q('.fa-delete-confirm')).toBeTruthy();

    // Change the selection while the confirmation is open.
    await selectRow('Grammar note');
    expect(q('.fa-delete-confirm')).toBeNull();
    expect(filesDelete).not.toHaveBeenCalled();
    expect(bodyRowNames()).toContain('Episode 01');
  });

  it('CONTROL: with no preload bridge, the delete fails by name and the row stays', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      writable: true,
      value: { filesIndex, filesReveal: async () => ({ ok: true }) },
    });
    await mount(<FilesApp />);
    await selectRow('Episode 01');
    await click(q('.fa-delete-action'));
    await click(q('.fa-delete-confirm-yes'));

    expect(q('.fa-delete-notice.is-error')).toBeTruthy();
    expect(bodyRowNames()).toContain('Episode 01');
  });
});
