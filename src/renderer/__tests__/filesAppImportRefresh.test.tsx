// @vitest-environment jsdom
/**
 * Gate 11 — "A file dragged in from Explorer is routed, lands in the correct
 * category, and appears in the tree **without a manual refresh**. A file the
 * router cannot place gets a named refusal, not a silent drop."
 *
 * The routing half already worked: `DropRouter` listens on `window`, so a file
 * released over the Files app window has always reached the importers. Two
 * halves did not, and they are what this file pins.
 *
 * 1. The Files tree never learned that an import happened. `useFilesIndex`
 *    fetches once by design (the index walks ~5 GB of `downloads`), so a
 *    dragged-in file stayed invisible until the user pressed Refresh.
 * 2. Two paths in the drop handler returned with NOTHING rendered — real files
 *    released onto the window and no reaction whatsoever, which reads as a
 *    broken app rather than as a refusal.
 *
 * `force: true` on the announced reload is load-bearing and has its own test:
 * main caches the snapshot behind a TTL, so a non-forced reload returns the
 * very build that predates the import.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesApp } from '../components/filesapp/FilesApp';
import { announceFilesIndexChanged, onFilesIndexChanged } from '../filesIndexBus';
import { countByCategory, type FilesIndexSnapshot, type FilesItem } from '../../shared/filesApp/catalog';

class NoopResizeObserver {
  observe() {
    /* jsdom has no layout to observe */
  }

  unobserve() {
    /* jsdom has no layout to observe */
  }

  disconnect() {
    /* jsdom has no layout to observe */
  }
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function item(over: Partial<FilesItem>): FilesItem {
  return {
    id: 'x',
    name: 'x',
    kind: 'video',
    categoryId: 'sources/video',
    provenance: 'user-file',
    sizeBytes: 1,
    createdAt: null,
    modifiedAt: null,
    lastUsedAt: null,
    location: { store: 'file', path: 'C:\\x' },
    flags: {},
    source: 'test',
    ...over,
  };
}

const BEFORE: FilesItem[] = [
  item({ id: 'media:1', name: 'Episode 01', location: { store: 'file', path: 'C:\\m\\1.mkv' } }),
];
/** The import's result: one more video, in the category its KIND derives. */
const AFTER: FilesItem[] = [
  ...BEFORE,
  item({ id: 'media:2', name: 'Dropped In', location: { store: 'file', path: 'C:\\m\\2.mkv' } }),
];

function snapshot(items: FilesItem[]): FilesIndexSnapshot {
  return {
    items,
    counts: countByCategory(items),
    enumerators: [{ source: 'test', itemCount: items.length, elapsedMs: 1 }],
    builtAt: Date.now(),
  };
}

const filesIndex = vi.fn<(force?: boolean) => Promise<FilesIndexSnapshot>>();
let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  filesIndex.mockReset();
  filesIndex.mockImplementation(async () => snapshot(BEFORE));
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { filesIndex, filesReveal: vi.fn(), fileDropClassify: vi.fn() },
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mountApp(): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<FilesApp />));
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

function names(): string[] {
  // The header is `.fa-row.fa-head` and carries the same cell class, so it has
  // to be excluded by name — `.fa-row` alone matches it too.
  return Array.from(host?.querySelectorAll('.fa-row:not(.fa-head) .fa-cell-name') ?? []).map(
    (c) => c.textContent ?? '',
  );
}

describe('gate 11 — an import appears in the tree with no manual refresh', () => {
  it('rebuilds the index when an importer announces a change', async () => {
    await mountApp();
    expect(names()).toEqual(['Episode 01']);
    expect(filesIndex).toHaveBeenCalledTimes(1);

    filesIndex.mockImplementation(async () => snapshot(AFTER));
    await act(async () => {
      announceFilesIndexChanged();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // The row the drop produced, without anything having been clicked. It
    // arrives sorted by the list's own default (name, ascending), which is why
    // "Dropped In" leads — a new row is not appended, it is placed.
    expect(names()).toEqual(['Dropped In', 'Episode 01']);
  });

  it('asks main to REBUILD, not to re-serve its cache', async () => {
    await mountApp();
    expect(filesIndex).toHaveBeenLastCalledWith(false);
    await act(async () => {
      announceFilesIndexChanged();
      await Promise.resolve();
    });
    // `getFilesIndex(force)` returns the cached build inside its TTL, so a
    // `false` here would leave the tree showing the pre-import index while
    // looking like it had reloaded.
    expect(filesIndex).toHaveBeenLastCalledWith(true);
  });

  it('the new row lands in the category its kind derives, not at the root', async () => {
    filesIndex.mockImplementation(async () => snapshot(AFTER));
    await mountApp();
    const videoNode = Array.from(host?.querySelectorAll('.fa-tree-node') ?? []).find((n) =>
      n.textContent?.startsWith('Video'),
    );
    expect(videoNode?.textContent).toContain('2');
  });

  it('CONTROL: with no announcement the tree stays as it was', async () => {
    await mountApp();
    filesIndex.mockImplementation(async () => snapshot(AFTER));
    await act(async () => {
      await Promise.resolve();
    });
    // Proves the pass above is the EVENT and not a component that re-fetches on
    // every render anyway.
    expect(names()).toEqual(['Episode 01']);
    expect(filesIndex).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount, so a closed window stops rebuilding the index', async () => {
    await mountApp();
    await act(async () => root?.unmount());
    root = null;
    const before = filesIndex.mock.calls.length;
    await act(async () => {
      announceFilesIndexChanged();
      await Promise.resolve();
    });
    expect(filesIndex.mock.calls.length).toBe(before);
  });
});

describe('gate 11 — a drop the router cannot place refuses by name', () => {
  /** Every `os:toast` raised during one test, as `kind: message`. */
  const toasts: string[] = [];
  const onToast = (e: Event) => {
    const d = (e as CustomEvent<{ message: string; kind: string }>).detail;
    toasts.push(`${d.kind}: ${d.message}`);
  };

  beforeEach(() => {
    toasts.length = 0;
    window.addEventListener('os:toast', onToast);
  });
  afterEach(() => window.removeEventListener('os:toast', onToast));

  /** A `drop` jsdom will carry — it has no DragEvent, so the payload is bolted on. */
  async function drop(fileCount: number): Promise<void> {
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', {
      value: {
        types: ['Files'],
        files: Array.from({ length: fileCount }, (_, i) => ({ name: `f${i}` })),
      },
    });
    await act(async () => {
      window.dispatchEvent(ev);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  async function mountRouter(): Promise<void> {
    const { default: DropRouter } = await import('../components/DropRouter');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root?.render(<DropRouter />));
  }

  it('says so when Windows gives no path for the dragged item', async () => {
    // getFilePath throwing is the real shape: Electron cannot resolve a virtual
    // item dragged out of an archive or a mail client.
    (window.api as unknown as Record<string, unknown>).getFilePath = () => {
      throw new Error('no path');
    };
    await mountRouter();
    await drop(2);

    // Was: `if (!paths.length) return;` — two real files, and nothing at all.
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toContain('warn:');
    expect(toasts[0]).toContain('did not say where those 2 items are');
  });

  it('says so when the router itself returns nothing', async () => {
    (window.api as unknown as Record<string, unknown>).getFilePath = (f: { name: string }) =>
      `C:\\drop\\${f.name}`;
    const classify = vi.fn(async () => []);
    (window.api as unknown as Record<string, unknown>).fileDropClassify = classify;
    await mountRouter();
    await drop(1);

    expect(classify).toHaveBeenCalledWith(['C:\\drop\\f0']);
    // A different sentence and a different severity from the one above: no path
    // is the user's drag, no plan is a fault on this side.
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toContain('err:');
    expect(toasts[0]).toContain('could not be examined');
  });

  it('a drop that DOES import announces the index change', async () => {
    // The other half of gate 11, end to end through the real DropRouter: the
    // announcement `useFilesIndex` listens for is raised by the importer, not
    // by the Files app noticing something on its own.
    const changes: number[] = [];
    const count = () => changes.push(1);
    window.addEventListener('filesapp:index-changed', count);
    const api = window.api as unknown as Record<string, unknown>;
    api.getFilePath = (f: { name: string }) => `C:\\drop\\${f.name}`;
    api.fileDropClassify = vi.fn(async (paths: string[]) => [
      {
        path: paths[0],
        name: 'ep.mkv',
        isDirectory: false,
        sizeBytes: 1,
        candidates: [{ target: 'media', confidence: 'exact', reasonKey: 'fileDrop.reason.media' }],
      },
    ]);
    api.addMediaPaths = vi.fn(async () => [{ id: 'media:new' }]);
    try {
      await mountRouter();
      await drop(1);
      expect(api.addMediaPaths).toHaveBeenCalledWith(['C:\\drop\\f0']);
      expect(changes).toHaveLength(1);
      // Raised AFTER the import resolved, alongside the success toast — never
      // optimistically, or the tree would add a row an import then failed to make.
      expect(toasts.some((m) => m.startsWith('ok:'))).toBe(true);
    } finally {
      window.removeEventListener('filesapp:index-changed', count);
    }
  });

  it('CONTROL: a drop carrying no files at all stays silent', async () => {
    // The refusals above must not have turned every stray drag into a toast —
    // a text or link drop is not a failed import, it is not an import.
    (window.api as unknown as Record<string, unknown>).getFilePath = () => 'C:\\x';
    await mountRouter();
    await drop(0);
    expect(toasts).toEqual([]);
  });
});

describe('gate 11 — the bus itself', () => {
  it('delivers to every listener and stops after unsubscribe', () => {
    const seen: string[] = [];
    const offA = onFilesIndexChanged(() => seen.push('a'));
    const offB = onFilesIndexChanged(() => seen.push('b'));
    announceFilesIndexChanged();
    expect(seen).toEqual(['a', 'b']);
    offA();
    announceFilesIndexChanged();
    expect(seen).toEqual(['a', 'b', 'b']);
    offB();
    announceFilesIndexChanged();
    expect(seen).toEqual(['a', 'b', 'b']);
  });
});
