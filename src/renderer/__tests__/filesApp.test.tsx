// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesApp } from '../components/filesapp/FilesApp';
import {
  countByCategory,
  type FilesIndexSnapshot,
  type FilesItem,
} from '../../shared/filesApp/catalog';

/**
 * The Files app's live contract, measured on the real component.
 *
 * A note on the windowed list, because it decides whether these assertions mean
 * anything: `VirtualList` derives its viewport from `useElementSize`, which
 * reports 0 in jsdom, so `visibleCount` falls back to `overscan * 2` = 12 rows.
 * Every fixture here is under twelve items on purpose — beyond that the DOM
 * would hold a window rather than the list, and a row-count assertion would be
 * measuring the overscan instead of the app.
 */

/**
 * jsdom has no `ResizeObserver`, and `renderer/hooks.ts`'s `useElementSize`
 * constructs one unguarded — so without this every mount throws before the
 * component renders a single row. A no-op is the right stub rather than a
 * fake that reports a size: it leaves `size.height` at 0, which is the exact
 * state the overscan fallback above is reasoned about.
 */
class NoopResizeObserver {
  observe(): void {
    /* never fires: the size stays 0 and the overscan fallback supplies the rows */
  }
  unobserve(): void {
    /* nothing observed, nothing to release */
  }
  disconnect(): void {
    /* nothing observed, nothing to release */
  }
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  return host;
}

/** Let the index promise settle and React commit the result. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

async function typeSearch(value: string): Promise<void> {
  const input = host?.querySelector<HTMLInputElement>('input[type="search"]');
  expect(input).toBeTruthy();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function rows(): HTMLElement[] {
  return Array.from(host?.querySelectorAll<HTMLElement>('[role="row"]') ?? []);
}

/** Body rows only — row 1 is the sticky header. */
function bodyRows(): HTMLElement[] {
  return rows().filter((r) => !r.classList.contains('fa-head'));
}

function names(): string[] {
  return bodyRows().map((r) => r.querySelector('.fa-cell-name')?.textContent ?? '');
}

function railButton(label: RegExp): HTMLElement | undefined {
  return Array.from(host?.querySelectorAll<HTMLElement>('nav button') ?? []).find((b) =>
    label.test(b.querySelector('.fa-tree-label')?.textContent ?? ''),
  );
}

function columnHeader(label: string): HTMLElement | undefined {
  return Array.from(host?.querySelectorAll<HTMLElement>('[role="columnheader"]') ?? []).find(
    (h) => h.textContent === label,
  );
}

function textOf(selector: string): string {
  return Array.from(host?.querySelectorAll(selector) ?? [])
    .map((n) => n.textContent ?? '')
    .join(' | ');
}

function hasText(needle: string): boolean {
  return (host?.textContent ?? '').includes(needle);
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
    sizeBytes: 900,
    location: { store: 'file', path: 'C:\\media\\ep1.mkv' },
  }),
  item({
    id: 'media:2',
    name: 'Episode 02',
    kind: 'video',
    categoryId: 'sources/video',
    sizeBytes: 100,
    location: { store: 'file', path: 'C:\\media\\ep2.mkv' },
  }),
  item({
    id: 'transcript:abc',
    name: 'abc123',
    kind: 'transcript',
    categoryId: 'sources/text',
    provenance: 'whisper-transcript',
    sizeBytes: 50,
    location: { store: 'file', path: 'C:\\t\\abc.json' },
  }),
  item({
    id: 'dictionary:jmdict',
    name: 'JMdict',
    kind: 'dictionary',
    categoryId: 'reference/dictionaries',
    provenance: 'installed',
    location: { store: 'sqlite', database: 'dict.db', table: 'dictionaries', rowId: 'jmdict' },
  }),
];

function snapshot(
  items: FilesItem[] = ITEMS,
  over: Partial<FilesIndexSnapshot> = {},
): FilesIndexSnapshot {
  return {
    items,
    counts: countByCategory(items),
    enumerators: [{ source: 'test', itemCount: items.length, elapsedMs: 1 }],
    builtAt: Date.now(),
    ...over,
  };
}

const filesIndex = vi.fn<(force?: boolean) => Promise<FilesIndexSnapshot>>();
const filesReveal = vi.fn<(loc: unknown) => Promise<{ ok: boolean; reasonKey?: string }>>();

beforeEach(() => {
  filesIndex.mockReset();
  filesReveal.mockReset();
  filesIndex.mockImplementation(async () => snapshot());
  filesReveal.mockImplementation(async () => ({ ok: true }));
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { filesIndex, filesReveal },
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/* ------------------------------ tests ------------------------------ */

describe('Files app — the tree reports a count per category (gate 1)', () => {
  it('shows a category with nothing in it as 0 rather than hiding it', async () => {
    await mount(<FilesApp />);
    await settle();

    expect(railButton(/^Video$/)?.querySelector('.fa-tree-count')?.textContent).toBe('2');
    // Books holds nothing in this fixture. It is PRESENT and reads 0 — a tree
    // that drops its empty nodes cannot be checked for the gate-1 finding.
    expect(railButton(/^Books$/)?.querySelector('.fa-tree-count')?.textContent).toBe('0');
  });

  it('a rendered group total equals the sum of its rendered leaves', async () => {
    await mount(<FilesApp />);
    await settle();
    // 2 video + 1 transcript (Text) = 3 under Sources.
    expect(railButton(/^Sources$/)?.querySelector('.fa-tree-count')?.textContent).toBe('3');
    expect(railButton(/^Text$/)?.querySelector('.fa-tree-count')?.textContent).toBe('1');
    expect(railButton(/^Everything$/)?.querySelector('.fa-tree-count')?.textContent).toBe('4');
  });
});

describe('Files app — scope is a filter, not a mode (gate 5 shape)', () => {
  it('narrows on a category and restores everything from the root, same window', async () => {
    await mount(<FilesApp />);
    await settle();
    expect(bodyRows()).toHaveLength(4);

    await click(railButton(/^Video$/));
    expect(bodyRows()).toHaveLength(2);
    expect(hasText('JMdict')).toBe(false);

    await click(railButton(/^Everything$/));
    expect(bodyRows()).toHaveLength(4);
    expect(hasText('JMdict')).toBe(true);
  });

  it('opens on a caller-supplied scope for context entry', async () => {
    await mount(<FilesApp initialScope="reference/dictionaries" />);
    await settle();
    expect(names()).toEqual(['JMdict']);
    // Still the same window: clearing the scope reveals the full tree.
    await click(railButton(/^Everything$/));
    expect(bodyRows()).toHaveLength(4);
  });
});

describe('Files app — sorting is real and reversible (gate 14)', () => {
  it('sorts by size ascending, then reverses, keeping the sizeless row last', async () => {
    await mount(<FilesApp />);
    await settle();
    const header = columnHeader('Size');

    await click(header);
    expect(header?.getAttribute('aria-sort')).toBe('ascending');
    // 50, 100, 900 — then JMdict, which has no size at all.
    expect(names()).toEqual(['abc123', 'Episode 02', 'Episode 01', 'JMdict']);

    await click(header);
    expect(header?.getAttribute('aria-sort')).toBe('descending');
    // The arrow reverses the items that HAVE a value; it does not promote the
    // one that has none.
    expect(names()).toEqual(['Episode 01', 'Episode 02', 'abc123', 'JMdict']);
  });

  it('reports its sort state on exactly one column', async () => {
    await mount(<FilesApp />);
    await settle();
    await click(columnHeader('Size'));
    const sorted = Array.from(host?.querySelectorAll('[role="columnheader"]') ?? []).filter(
      (h) => h.getAttribute('aria-sort') !== 'none',
    );
    expect(sorted).toHaveLength(1);
    expect(sorted[0].textContent).toBe('Size');
  });

  it('switching column starts that column ascending rather than inheriting a flip', async () => {
    await mount(<FilesApp />);
    await settle();
    await click(columnHeader('Size'));
    await click(columnHeader('Size')); // now descending
    await click(columnHeader('Name'));
    expect(columnHeader('Name')?.getAttribute('aria-sort')).toBe('ascending');
    expect(columnHeader('Size')?.getAttribute('aria-sort')).toBe('none');
  });
});

describe('Files app — one search across everything', () => {
  it('filters by name, and says "no matches" in different words from "empty"', async () => {
    await mount(<FilesApp />);
    await settle();

    await typeSearch('JMdict');
    expect(names()).toEqual(['JMdict']);

    await typeSearch('zzzz');
    expect(bodyRows()).toHaveLength(0);
    expect(hasText('Nothing matches that search.')).toBe(true);
    expect(hasText('Nothing here yet.')).toBe(false);
  });

  it('matches on kind and on provenance, not only on name', async () => {
    await mount(<FilesApp />);
    await settle();
    await typeSearch('whisper');
    expect(names()).toEqual(['abc123']);
    await typeSearch('dictionary');
    expect(names()).toEqual(['JMdict']);
  });

  it('recounts the tree against the search, so the rail cannot contradict the list', async () => {
    await mount(<FilesApp />);
    await settle();
    await typeSearch('JMdict');
    expect(railButton(/^Video$/)?.querySelector('.fa-tree-count')?.textContent).toBe('0');
    expect(railButton(/^Dictionaries$/)?.querySelector('.fa-tree-count')?.textContent).toBe('1');
  });
});

describe('Files app — reveal is offered only where it can work (gate 12)', () => {
  it('offers Reveal for a file-backed item and passes its real location', async () => {
    await mount(<FilesApp />);
    await settle();
    await click(bodyRows().find((r) => r.textContent?.includes('Episode 01')));

    const reveal = Array.from(host?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent === 'Reveal in Explorer',
    );
    await click(reveal);
    expect(filesReveal).toHaveBeenCalledWith({ store: 'file', path: 'C:\\media\\ep1.mkv' });
  });

  it('a SQLite row has no Reveal button at all, and says why in words', async () => {
    await mount(<FilesApp />);
    await settle();
    await click(bodyRows().find((r) => r.textContent?.includes('JMdict')));

    expect(hasText('This item is not a file, so there is no folder to open.')).toBe(true);
    // Absent, not present-and-failing.
    expect(
      Array.from(host?.querySelectorAll('button') ?? []).some(
        (b) => b.textContent === 'Reveal in Explorer',
      ),
    ).toBe(false);
    expect(filesReveal).not.toHaveBeenCalled();
  });

  it('states the delete consequence that matches the store', async () => {
    await mount(<FilesApp />);
    await settle();

    await click(bodyRows().find((r) => r.textContent?.includes('Episode 01')));
    expect(hasText('Deleting this sends the file to the Recycle Bin.')).toBe(true);

    await click(bodyRows().find((r) => r.textContent?.includes('JMdict')));
    expect(hasText('Deleting this removes the record, with an undo window.')).toBe(true);
    expect(hasText('Deleting this sends the file to the Recycle Bin.')).toBe(false);
  });

  it('describes a non-file location instead of printing a raw object', async () => {
    await mount(<FilesApp />);
    await settle();
    await click(bodyRows().find((r) => r.textContent?.includes('JMdict')));
    expect(textOf('.fa-details-location')).toBe('Row in dictionaries (dict.db)');
  });
});

describe('Files app — honest states', () => {
  it('names the store that failed, so its 0 is not read as a real count', async () => {
    filesIndex.mockImplementation(async () =>
      snapshot(ITEMS, {
        enumerators: [
          { source: 'media', itemCount: 2, elapsedMs: 1 },
          { source: 'dictionaries', itemCount: 0, elapsedMs: 3, error: 'db locked' },
        ],
      }),
    );
    await mount(<FilesApp />);
    await settle();
    expect(hasText('Some stores could not be read, so their counts show 0: dictionaries')).toBe(
      true,
    );
  });

  it('an index that threw reports the error, not an empty list', async () => {
    filesIndex.mockImplementation(async () => {
      throw new Error('index build failed');
    });
    await mount(<FilesApp />);
    await settle();
    expect(hasText('The index could not be read.')).toBe(true);
    expect(hasText('index build failed')).toBe(true);
    expect(host?.querySelector('[role="grid"]')).toBeNull();
  });

  it('a genuinely empty index says so in different words from a failure', async () => {
    filesIndex.mockImplementation(async () => snapshot([]));
    await mount(<FilesApp />);
    await settle();
    expect(hasText('Nothing here yet.')).toBe(true);
    expect(hasText('The index could not be read.')).toBe(false);
  });

  it('a missing preload binding is its own state, not a silent blank', async () => {
    Object.defineProperty(window, 'api', { configurable: true, writable: true, value: {} });
    await mount(<FilesApp />);
    await settle();
    expect(hasText('The Files app needs the desktop app; this build has no index.')).toBe(true);
    expect(filesIndex).not.toHaveBeenCalled();
  });

  it('refresh asks main to rebuild rather than re-serving the cache', async () => {
    await mount(<FilesApp />);
    await settle();
    expect(filesIndex).toHaveBeenCalledWith(false);

    const refresh = Array.from(host?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent === 'Refresh',
    );
    await click(refresh);
    await settle();
    expect(filesIndex).toHaveBeenLastCalledWith(true);
  });
});

describe('Files app — machine-produced text stays marked', () => {
  it('marks a Whisper transcript and leaves installed material unmarked', async () => {
    await mount(<FilesApp />);
    await settle();
    const cell = (name: string) =>
      bodyRows()
        .find((r) => r.textContent?.includes(name))
        ?.querySelector('.fa-cell-provenance');

    expect(cell('abc123')?.getAttribute('data-machine')).toBe('true');
    expect(cell('abc123')?.textContent).toBe('Whisper transcript');
    expect(cell('JMdict')?.getAttribute('data-machine')).toBeNull();
  });
});

describe('Files app — the windowed grid declares its real size', () => {
  it('reports the full row count, which the window itself cannot supply', async () => {
    await mount(<FilesApp />);
    await settle();
    const grid = host?.querySelector('[role="grid"]');
    // Header plus every item.
    expect(grid?.getAttribute('aria-rowcount')).toBe(String(ITEMS.length + 1));
    expect(bodyRows()[0].getAttribute('aria-rowindex')).toBe('2');
  });

  it('builds on the liquid scaffold, with every slot filled', async () => {
    await mount(<FilesApp />);
    await settle();
    const shell = host?.querySelector('.lq-scaffold');
    expect(shell?.getAttribute('data-has-rail')).toBe('true');
    expect(shell?.getAttribute('data-has-toolbar')).toBe('true');
    expect(shell?.getAttribute('data-has-inspector')).toBe('true');
    expect(shell?.getAttribute('data-has-dock')).toBe('true');
  });
});
