// @vitest-environment jsdom
/**
 * The Library shelf's management surfaces, mounted for real:
 *
 * - Remove → Undo restores through `library:restore`; a refused removal says so;
 * - the import job's progress, Stop, receipt and Resume;
 * - the view (folder, layout, grouping, filters) is remembered between visits,
 *   and a remembered folder that was deleted opens All;
 * - the shelf search matches title, authors, series and tags;
 * - Edit details saves through `library:updateMeta`;
 * - a missing file is marked in the drawer with Locate file….
 *
 * Mounted through `installReadingSurfaceApi` (its Proxy answers every unstubbed
 * channel inertly), in the Aero shell, whose detail pane is a plain aside.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../../shared/types';
import type { LibraryImportProgress } from '../../shared/libraryManage';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';
import { LIBRARY_VIEW_STORAGE_KEY } from '../libraryViewPref';

const confirmDialog = vi.hoisted(() => vi.fn(async (_opts: unknown) => true));
vi.mock('../components/ui/dialogService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/ui/dialogService')>()),
  confirmDialog: (opts: unknown) => confirmDialog(opts),
}));

const { default: LibraryView } = await import('../views/LibraryView');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: LibraryItem[] = [
  { id: 'li_neko', title: '吾輩は猫である', kind: 'book', createdAt: 3, author: '夏目漱石', tags: ['古典'], epubFile: 'original.epub' },
  { id: 'li_yotsuba', title: 'よつばと! 1', kind: 'manga', createdAt: 2, series: 'よつばと!', seriesIndex: 1 },
  { id: 'li_kafka', title: 'Kafka on the Shore', kind: 'book', createdAt: 1, folder: 'English', epubFile: 'original.epub' },
];

let host: HTMLDivElement;
let root: Root;
let api: Record<string, ReturnType<typeof vi.fn>>;
let progressListener: ((p: LibraryImportProgress) => void) | null;

function progress(extra: Partial<LibraryImportProgress>): LibraryImportProgress {
  return {
    jobId: 'job-1',
    state: 'running',
    total: 10,
    done: 3,
    imported: 3,
    duplicates: 0,
    failed: 0,
    remaining: 7,
    failures: [],
    addedIds: [],
    ...extra,
  };
}

function install(overrides: Record<string, unknown> = {}): void {
  progressListener = null;
  api = {
    syncLibrary: vi.fn(async () => ITEMS),
    getWatchFolder: vi.fn(async () => ''),
    getLibraryFolders: vi.fn(async () => ['English']),
    removeItem: vi.fn(async (id: string) => ITEMS.filter((it) => it.id !== id)),
    restoreLibraryItem: vi.fn(async (id: string) => ({ ok: true, items: ITEMS, item: ITEMS.find((it) => it.id === id) })),
    listLibraryTrash: vi.fn(async () => []),
    libraryImportStatus: vi.fn(async () => ({ progress: null, resumable: 0 })),
    libraryImportCancel: vi.fn(async () => true),
    libraryImportResume: vi.fn(async () => ({ started: true, remaining: 4 })),
    libraryImportDiscard: vi.fn(async () => true),
    onLibraryImportProgress: vi.fn((cb: (p: LibraryImportProgress) => void) => {
      progressListener = cb;
      return () => undefined;
    }),
    checkLibraryMissing: vi.fn(async () => []),
    updateLibraryMeta: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const item = { ...ITEMS.find((it) => it.id === id)!, ...patch } as LibraryItem;
      return { ok: true, item, items: ITEMS.map((it) => (it.id === id ? item : it)) };
    }),
    relinkBook: vi.fn(async () => ({ ok: true })),
    ...overrides,
  } as unknown as Record<string, ReturnType<typeof vi.fn>>;
  installReadingSurfaceApi(api);
}

beforeEach(() => {
  localStorage.removeItem(LIBRARY_VIEW_STORAGE_KEY);
  confirmDialog.mockClear();
  installResizeObserver();
  install();
  document.documentElement.setAttribute('data-materials', 'aero');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-materials');
});

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
  });
}

async function render(revealItemId: string | null = null): Promise<void> {
  await act(async () => {
    root.render(<LibraryView onOpen={() => undefined} revealItemId={revealItemId} />);
    await Promise.resolve();
  });
  await settle();
}

function button(name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name,
  );
  if (!found) throw new Error(`no button "${name}"`);
  return found;
}

async function click(node: HTMLElement): Promise<void> {
  await act(async () => {
    node.click();
    await Promise.resolve();
  });
  await settle();
}

function shelfTitles(): string[] {
  return [...host.querySelectorAll('[data-library-tile]')].map((tile) => tile.getAttribute('data-library-tile') ?? '');
}

describe('Remove is undoable', () => {
  it('says the item is recoverable, then Undo restores it through main', async () => {
    await render('li_neko');
    await click(button('Remove'));
    const message = String((confirmDialog.mock.calls[0]?.[0] as { message: string }).message);
    expect(message).toContain('Recently removed');
    expect(message).toContain('restore it for 30 days');
    // One honest message: it never opens by promising the copy is deleted now.
    expect(message).not.toMatch(/imported copy will be deleted/);
    expect(message).not.toContain('\n\n');
    expect(api.removeItem).toHaveBeenCalledWith('li_neko');
    expect(host.textContent).toContain('Removed “吾輩は猫である”.');
    await click(button('Undo'));
    expect(api.restoreLibraryItem).toHaveBeenCalledWith('li_neko');
    expect(host.textContent).not.toContain('Removed “吾輩は猫である”.');
  });

  it('a removal main refused is reported, and nothing is offered to undo', async () => {
    install({ removeItem: vi.fn(async () => Promise.reject(new Error('library-remove-busy'))) });
    await render('li_neko');
    await click(button('Remove'));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be removed');
    expect(host.textContent).not.toContain('Removed “');
  });

  it('lists recently removed items with Restore', async () => {
    install({
      listLibraryTrash: vi.fn(async () => [
        { id: 'gone', title: 'Old book', kind: 'book', removedAt: 1, expiresAt: Date.UTC(2030, 0, 1) },
      ]),
    });
    await render();
    expect(host.textContent).toContain('Recently removed (1)');
    await click(button('Restore Old book'));
    expect(api.restoreLibraryItem).toHaveBeenCalledWith('gone');
  });
});

describe('the import job, out loud', () => {
  it('shows progress with Stop, then the receipt', async () => {
    // Main answers status with the job as it stands, so a status read after the
    // last event agrees with it.
    let current = progress({ current: 'vol 4.cbz' });
    install({
      libraryImportStatus: vi.fn(async () => ({ progress: current, resumable: current.state === 'cancelled' ? current.remaining : 0 })),
    });
    await render();
    expect(host.textContent).toContain('Importing 3 of 10');
    expect(host.textContent).toContain('Now: vol 4.cbz');
    await click(button('Stop'));
    expect(api.libraryImportCancel).toHaveBeenCalledWith('job-1');

    current = progress({
      state: 'cancelled',
      done: 4,
      imported: 2,
      duplicates: 1,
      failed: 1,
      remaining: 6,
      failures: [{ name: 'bad.cbz', errorCode: 'no-pages' }],
    });
    await act(async () => {
      progressListener?.(current);
    });
    await settle();
    expect(host.textContent).toContain('Import stopped.');
    expect(host.textContent).toContain('Added: 2');
    expect(host.textContent).toContain('Already in the library: 1');
    expect(host.textContent).toContain('bad.cbz — the archive holds no images');
  });

  it('offers Resume for an import a quit left unfinished', async () => {
    install({ libraryImportStatus: vi.fn(async () => ({ progress: null, resumable: 4 })) });
    await render();
    expect(host.textContent).toContain('Files left: 4');
    await click(button('Resume'));
    expect(api.libraryImportResume).toHaveBeenCalled();
  });
});

describe('the view is remembered', () => {
  it('layout and grouping survive a remount', async () => {
    await render();
    await click(host.querySelector<HTMLButtonElement>('[data-library-layout="list"]')!);
    const group = host.querySelector<HTMLSelectElement>('#aero-lib-group')!;
    await act(async () => {
      group.value = 'series';
      group.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    act(() => root.unmount());
    root = createRoot(host);
    await render();
    expect(host.querySelector('[data-library-layout="list"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector<HTMLSelectElement>('#aero-lib-group')?.value).toBe('series');
  });

  it('a remembered folder that no longer exists opens All instead of an empty shelf', async () => {
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, JSON.stringify({ folder: 'Deleted shelf', layout: 'grid' }));
    await render();
    expect(shelfTitles().sort()).toEqual(['li_kafka', 'li_neko', 'li_yotsuba']);
    expect(JSON.parse(localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY) ?? '{}').folder).toBe('all');
  });
});

describe('search', () => {
  it('matches authors, series and tags, kana-insensitively', async () => {
    await render();
    const search = host.querySelector<HTMLInputElement>('#aero-lib-search')!;
    const type = async (value: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(search, value);
        search.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await settle();
    };
    await type('漱石');
    expect(shelfTitles()).toEqual(['li_neko']);
    await type('ヨツバ');
    expect(shelfTitles()).toEqual(['li_yotsuba']);
    await type('古典');
    expect(shelfTitles()).toEqual(['li_neko']);
    await type('');
    expect(shelfTitles()).toHaveLength(3);
  });
});

describe('details', () => {
  it('shows the stored details and saves edits through main', async () => {
    await render('li_neko');
    expect(host.textContent).toContain('夏目漱石');
    await click(button('Edit details'));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).toBeTruthy();
    const inputs = [...dialog.querySelectorAll<HTMLInputElement>('input')];
    const series = inputs[2];
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(series, '猫シリーズ');
      series.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save')!;
    await click(save);
    expect(api.updateLibraryMeta).toHaveBeenCalledWith('li_neko', {
      title: '吾輩は猫である',
      author: '夏目漱石',
      series: '猫シリーズ',
      seriesIndex: null,
      tags: ['古典'],
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('a blank title is refused before anything is sent', async () => {
    await render('li_neko');
    await click(button('Edit details'));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const title = dialog.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(title, '  ');
      title.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click([...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save')!);
    expect(api.updateLibraryMeta).not.toHaveBeenCalled();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe('A title is required.');
  });
});

describe('missing files', () => {
  it('marks the item and relinks it from the drawer', async () => {
    install({ checkLibraryMissing: vi.fn(async () => ['li_neko']) });
    await render('li_neko');
    expect(host.querySelector('[data-library-missing="li_neko"]')?.textContent).toContain('File missing');
    await click(button('Locate file…'));
    expect(api.relinkBook).toHaveBeenCalledWith('li_neko');
    expect(host.textContent).toContain('Found — the item can be opened again.');
  });
});
