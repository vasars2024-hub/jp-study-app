// @vitest-environment jsdom
/**
 * Gate 19 on the real component — "A saved search such as *Untranscribed
 * videos* changes its membership after a video is transcribed, with the count
 * before and after both reported."
 *
 * The counts are read off the rail node the user actually sees, not from the
 * model. The model already has its own suite; what this file proves is that the
 * number on screen is the one the live index produces, with no cached
 * membership between them.
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
  FILES_SMART_FOLDERS_STORAGE_KEY,
  resetSmartFoldersMemoryForTests,
} from '../filesSmartFoldersStore';
import { resetFavoritesMemoryForTests } from '../filesFavoritesStore';
import { resetCollectionsMemoryForTests } from '../filesCollectionsStore';
import { parseSmartFoldersDoc } from '../../shared/filesApp/smartFolders';

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

function resetStores(): void {
  resetSmartFoldersMemoryForTests();
  resetFavoritesMemoryForTests();
  resetCollectionsMemoryForTests();
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

function smartNode(label: string): HTMLElement | undefined {
  return all('.fa-smart-node').find(
    (b) => b.querySelector('.fa-tree-label')?.textContent === label,
  );
}

/** The number the user reads off the rail, as a number. */
function smartCount(label: string): number {
  const text = smartNode(label)?.querySelector('.fa-tree-count')?.textContent ?? '';
  return Number(text.replace(/[^\d]/g, ''));
}

function bodyRowNames(): string[] {
  return all('[role="row"]')
    .filter((r) => !r.classList.contains('fa-head'))
    .map((r) => r.querySelector('.fa-cell-name')?.textContent ?? '');
}

function persisted() {
  const raw = localStorage.getItem(FILES_SMART_FOLDERS_STORAGE_KEY);
  return parseSmartFoldersDoc(raw ? JSON.parse(raw) : null);
}

async function typeSearch(value: string): Promise<void> {
  const input = q<HTMLInputElement>('input[type="search"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      value,
    );
    input?.dispatchEvent(new Event('input', { bubbles: true }));
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

const VIDEOS: FilesItem[] = [
  item({
    id: 'media:1',
    name: 'lecture [dQw4w9WgXcQ].mkv',
    kind: 'video',
    categoryId: 'sources/video',
    location: { store: 'file', path: 'C:\\media\\lecture [dQw4w9WgXcQ].mkv' },
  }),
  item({
    id: 'media:2',
    name: 'talk [abc12345678].mkv',
    kind: 'video',
    categoryId: 'sources/video',
    location: { store: 'file', path: 'C:\\media\\talk [abc12345678].mkv' },
  }),
];

const TRANSCRIPT = item({
  id: 'transcript:dQw4w9WgXcQ',
  name: 'dQw4w9WgXcQ',
  kind: 'transcript',
  categoryId: 'sources/text',
  provenance: 'whisper-transcript',
});

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
  resetStores();
  filesIndex.mockReset();
  filesIndex.mockImplementation(async () => snapshot(VIDEOS));
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

describe('gate 19 — smart folders stay live', () => {
  it('UNTRANSCRIBED VIDEOS reads 2, then 1 after a transcript arrives — both numbers on screen', async () => {
    await mount(<FilesApp />);
    expect(smartCount('Untranscribed videos')).toBe(2);
    expect(smartCount('Transcribed videos')).toBe(0);

    // A transcript lands. Nothing tells the saved search; the refresh rebuilds
    // the index and the folder re-asks it.
    filesIndex.mockImplementation(async () => snapshot([...VIDEOS, TRANSCRIPT]));
    await click(q('.fa-refresh'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(smartCount('Untranscribed videos')).toBe(1);
    expect(smartCount('Transcribed videos')).toBe(1);
  });

  it('the list inside the folder changes with it, not just the count', async () => {
    await mount(<FilesApp />);
    await click(smartNode('Untranscribed videos'));
    expect(bodyRowNames().sort()).toEqual([
      'lecture [dQw4w9WgXcQ].mkv',
      'talk [abc12345678].mkv',
    ]);

    filesIndex.mockImplementation(async () => snapshot([...VIDEOS, TRANSCRIPT]));
    await click(q('.fa-refresh'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(bodyRowNames()).toEqual(['talk [abc12345678].mkv']);
  });

  it('CONTROL: a folder with no transcript in play does not move', async () => {
    await mount(<FilesApp />);
    const before = smartCount('Broken links');
    filesIndex.mockImplementation(async () => snapshot([...VIDEOS, TRANSCRIPT]));
    await click(q('.fa-refresh'));
    await act(async () => {
      await Promise.resolve();
    });
    // The transcript changed the transcription folders and nothing else, so a
    // "both numbers moved" reading cannot be an artifact of the refresh itself.
    expect(smartCount('Broken links')).toBe(before);
  });

  /**
   * MINING_UNIFICATION_PLAN gate 6 — "take a video transcribed earlier, whose
   * transcript file exists, and find it in the catalogue WITHOUT navigating to
   * that video." The count moving (above) is not that gate; arriving at the
   * row from the rail, and at the transcript from the search box, is.
   */
  it('gate 6 — the transcribed video is reached from the rail, not from its video page', async () => {
    filesIndex.mockImplementation(async () => snapshot([...VIDEOS, TRANSCRIPT]));
    await mount(<FilesApp />);

    // Two clicks, neither of them on a video: the rail, then nothing else.
    await click(smartNode('Transcribed videos'));
    expect(bodyRowNames()).toEqual(['lecture [dQw4w9WgXcQ].mkv']);

    // CONTROL: the other video is real, is in the index, and is deliberately
    // NOT here — so the folder is discriminating rather than listing videos.
    expect(bodyRowNames()).not.toContain('talk [abc12345678].mkv');
    await click(smartNode('Untranscribed videos'));
    expect(bodyRowNames()).toEqual(['talk [abc12345678].mkv']);
  });

  it('gate 6 — the transcript is its own row, findable without knowing the video', async () => {
    filesIndex.mockImplementation(async () => snapshot([...VIDEOS, TRANSCRIPT]));
    await mount(<FilesApp />);

    // The transcript file is an asset in its own right. Searching for it never
    // touches the video row, which is the point: `ytPlaylists.ts:254` already
    // knew the answer and only ever told that one video.
    await typeSearch('dQw4w9WgXcQ');
    expect(bodyRowNames()).toContain('dQw4w9WgXcQ');

    // CONTROL: a string in nothing returns nothing, so the hit above is a
    // match and not a search box that ignores its input.
    await typeSearch('zzzz-no-such-asset');
    expect(bodyRowNames()).toEqual([]);
  });

  it('saves the current search, and it survives a restart', async () => {
    await mount(<FilesApp />);
    await typeSearch('talk');
    await click(q('.fa-smart-save'));
    const input = q<HTMLInputElement>('.fa-smart-name input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'Talks',
      );
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(q('.fa-smart-name-save'));

    expect(persisted().folders.map((f) => f.name)).toEqual(['Talks']);

    await unmount();
    resetStores();
    await mount(<FilesApp />);
    expect(smartNode('Talks')).toBeTruthy();
    expect(smartCount('Talks')).toBe(1);
  });

  it('saving an UNFILTERED view is refused by name, and no editor opens', async () => {
    await mount(<FilesApp />);
    await click(q('.fa-smart-save'));
    expect(q('.fa-folder-notice')?.textContent ?? '').toContain('not filtered');
    expect(q('.fa-smart-name')).toBeNull();
    expect(persisted().folders).toEqual([]);
  });

  it('a PRESET has no delete control; a saved search does', async () => {
    await mount(<FilesApp />);
    const preset = smartNode('Untranscribed videos')?.parentElement;
    expect(preset?.querySelector('.fa-smart-delete')).toBeNull();
    expect(preset?.dataset.preset).toBe('true');

    await typeSearch('talk');
    await click(q('.fa-smart-save'));
    const input = q<HTMLInputElement>('.fa-smart-name input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'Talks',
      );
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(q('.fa-smart-name-save'));

    const own = smartNode('Talks')?.parentElement;
    expect(own?.querySelector('.fa-smart-delete')).toBeTruthy();
    await click(own?.querySelector('.fa-smart-delete'));
    expect(persisted().folders).toEqual([]);
    // The presets are all still there.
    expect(smartNode('Untranscribed videos')).toBeTruthy();
  });

  it('opening a saved search says which one is showing, and the way out clears it', async () => {
    await mount(<FilesApp />);
    await click(smartNode('Untranscribed videos'));
    expect(q('.fa-scope-clear')?.textContent ?? '').toContain('Untranscribed videos');

    await click(q('.fa-scope-clear'));
    expect(q('.fa-scope-clear')).toBeNull();
    expect(bodyRowNames()).toHaveLength(2);
  });
});
