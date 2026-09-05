// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesApp } from '../components/filesapp/FilesApp';
import {
  countByCategory,
  type FilesIndexSnapshot,
  type FilesItem,
} from '../../shared/filesApp/catalog';
import type { FilesMineSourceResult } from '../../shared/filesApp/mining';
import {
  clearPendingFilesScope,
  openFilesAppForBook,
  openFilesAppForManga,
  openFilesAppScoped,
  peekPendingFilesScope,
} from '../components/filesapp/filesAppScope';
import type { DeckFlashcard } from '../flashcardDeck';

/**
 * The deck, stood in for.
 *
 * `flashcardDeck.ts` pulls in IndexedDB mirroring, companion events and the
 * Blanc console at module scope — none of which jsdom has, and none of which
 * this gate is about. What the component OWES the deck is exactly three things,
 * and a stub is what lets them be asserted: that it reads the existing cards
 * before building drafts, that it writes the drafts it built, and that undo
 * removes the ids it was handed back and nothing else. The store's own
 * behaviour is `flashcardDeck`'s tests to prove, not this file's.
 */
const deck: DeckFlashcard[] = [];
let nextDeckId = 0;

vi.mock('../flashcardDeck', () => ({
  loadDeck: () => [...deck],
  addDeckCardsTracked: (entries: Omit<DeckFlashcard, 'id' | 'addedAt'>[]) => {
    const created = entries.map((entry) => ({
      ...entry,
      id: `card-${(nextDeckId += 1)}`,
      addedAt: nextDeckId,
    })) as DeckFlashcard[];
    // `[...created, ...store.cards]`, exactly as the real store writes it: the
    // batch keeps its draft order and lands ahead of what was already there.
    deck.unshift(...created);
    return created;
  },
  removeDeckCards: (ids: readonly string[]) => {
    const wanted = new Set(ids);
    for (let i = deck.length - 1; i >= 0; i -= 1) {
      if (wanted.has(deck[i].id)) deck.splice(i, 1);
    }
    return [...deck];
  },
}));

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

// Without this React logs "not configured to support act(...)" for every state
// update that lands after an await — which is every assertion about the mine's
// result. The warning is noise, but noise that hides a real one.
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
const filesMineSource = vi.fn<(loc: unknown, kind: unknown) => Promise<FilesMineSourceResult>>();
/** Gate 10: the file router, which is what decides where an item opens. */
const fileDropClassify = vi.fn<(paths: string[]) => Promise<unknown[]>>();

/**
 * Gate 10's observable outcome. `openSectionSurface` dispatches `os:open` and
 * falls back to `api.popOut`; neither exists in jsdom, so the event IS the
 * receipt — and it is the same event the real shells listen for.
 */
const opened: string[] = [];
function recordOpen(ev: Event) {
  opened.push(String((ev as CustomEvent).detail));
}

/* Gate 25: main's side of the watcher, stood in for. `pushArrival` is the
   callback main's broadcast reaches, so a test can deliver an arrival the way
   the real IPC does — without the renderer asking for anything. */
const filesWatchSet = vi.fn();
const onFilesWatchArrival = vi.fn();
let pushArrival: ((arrivals: unknown[]) => void) | null = null;

beforeEach(() => {
  filesIndex.mockReset();
  filesReveal.mockReset();
  filesMineSource.mockReset();
  fileDropClassify.mockReset();
  opened.length = 0;
  window.addEventListener('os:open', recordOpen);
  deck.length = 0;
  filesIndex.mockImplementation(async () => snapshot());
  filesReveal.mockImplementation(async () => ({ ok: true }));
  filesMineSource.mockImplementation(async () => ({ ok: true, passages: [], readCount: 0 }));
  fileDropClassify.mockImplementation(async (paths: string[]) => [
    {
      path: paths[0],
      candidates: [{ target: 'media', confidence: 'exact', reasonKey: 'fileDrop.reason.media' }],
    },
  ]);
  filesWatchSet.mockReset();
  onFilesWatchArrival.mockReset();
  pushArrival = null;
  filesWatchSet.mockImplementation(async (roots: string[]) => ({ roots, pending: 0 }));
  onFilesWatchArrival.mockImplementation((cb: (a: unknown[]) => void) => {
    pushArrival = cb;
    return () => undefined;
  });
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: {
      filesIndex,
      filesReveal,
      filesMineSource,
      fileDropClassify,
      filesWatchSet,
      onFilesWatchArrival,
    },
  });
});

afterEach(async () => {
  window.removeEventListener('os:open', recordOpen);
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

describe('Files app — opening routes through the file router (gate 10)', () => {
  /** Every button currently in the inspector, by its visible label. */
  function buttonLabels(): string[] {
    return Array.from(host?.querySelectorAll('button') ?? []).map((b) => b.textContent ?? '');
  }
  function openButton(): Element | undefined {
    return Array.from(host?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent === 'Open',
    );
  }

  it('hands the router the real path and opens the app it names', async () => {
    await mount(<FilesApp />);
    await settle();
    await click(bodyRows().find((r) => r.textContent?.includes('Episode 01')));
    await click(openButton());
    await settle();

    expect(fileDropClassify).toHaveBeenCalledWith(['C:\\media\\ep1.mkv']);
    // `media` -> `player`, which is what DropRouter opens for the same file.
    expect(opened).toEqual(['player']);
    expect(hasText('Opened in Media.')).toBe(true);
  });

  it('a row with no file never asks the router, and opens by its kind', async () => {
    await mount(<FilesApp />);
    await settle();
    await click(bodyRows().find((r) => r.textContent?.includes('JMdict')));
    await click(openButton());
    await settle();

    // Calling the router with a SQLite row would mean inventing a path.
    expect(fileDropClassify).not.toHaveBeenCalled();
    expect(opened).toEqual(['dictionary']);
    expect(hasText('Opened by what this item is; it has no file to route.')).toBe(true);
  });

  it('two candidates offer the ranked list and open NOTHING until one is picked', async () => {
    fileDropClassify.mockImplementation(async (paths: string[]) => [
      {
        path: paths[0],
        candidates: [
          { target: 'anki-cards', confidence: 'likely', reasonKey: 'fileDrop.reason.apkgCards' },
          { target: 'anki-level', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.apkgLevel' },
        ],
      },
    ]);
    await mount(<FilesApp />);
    await settle();
    await click(bodyRows().find((r) => r.textContent?.includes('Episode 01')));
    await click(openButton());
    await settle();

    // The gate's own words: "offers the ranked list rather than silently
    // choosing". Nothing has opened yet, and that is the assertion.
    expect(opened).toEqual([]);
    expect(hasText('This file has more than one home. Which one did you mean?')).toBe(true);
    const ranked = Array.from(host?.querySelectorAll('.fa-open-candidate') ?? []);
    expect(ranked.map((b) => b.getAttribute('data-target'))).toEqual([
      'anki-cards',
      'anki-level',
    ]);

    await click(ranked[1]);
    await settle();
    expect(opened).toEqual(['anki']);
  });

  it('CONTROL: a router that answers nothing refuses instead of guessing the kind', async () => {
    fileDropClassify.mockImplementation(async () => []);
    await mount(<FilesApp />);
    await settle();
    // A video row: the kind table WOULD have an answer for it, so a refusal
    // here is the router's authority being respected rather than an empty case.
    await click(bodyRows().find((r) => r.textContent?.includes('Episode 01')));
    await click(openButton());
    await settle();

    expect(opened).toEqual([]);
    expect(hasText('This file could not be matched to any app that opens it.')).toBe(true);
  });

  it('double-clicking a row selects and opens it in one gesture', async () => {
    await mount(<FilesApp />);
    await settle();
    const row = bodyRows().find((r) => r.textContent?.includes('Episode 01'));
    expect(row).toBeTruthy();
    await act(async () => {
      (row as HTMLElement).dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      );
    });
    await settle();

    // The row it opened is the row that was double-clicked, NOT the previously
    // selected one — the trap that made `openItem` take the item as an argument.
    expect(fileDropClassify).toHaveBeenCalledWith(['C:\\media\\ep1.mkv']);
    expect(opened).toEqual(['player']);
  });

  it('double-clicking a DIFFERENT row than the selected one opens the new row', async () => {
    await mount(<FilesApp />);
    await settle();
    await click(bodyRows().find((r) => r.textContent?.includes('Episode 01')));
    const other = bodyRows().find((r) => r.textContent?.includes('Episode 02'));
    await act(async () => {
      (other as HTMLElement).dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      );
    });
    await settle();
    // ep2, not ep1. Reading `selected` inside the handler would give ep1, and
    // the paths differ by one character, so this is the assertion that catches it.
    expect(fileDropClassify).toHaveBeenCalledWith(['C:\\media\\ep2.mkv']);
    expect(fileDropClassify).toHaveBeenCalledTimes(1);
  });

  it('the result is dropped when the selection moves', async () => {
    await mount(<FilesApp />);
    await settle();
    await click(bodyRows().find((r) => r.textContent?.includes('Episode 01')));
    await click(openButton());
    await settle();
    expect(hasText('Opened in Media.')).toBe(true);

    await click(bodyRows().find((r) => r.textContent?.includes('JMdict')));
    // A receipt that followed the user to the next row would be describing an
    // item they are no longer looking at.
    expect(hasText('Opened in Media.')).toBe(false);
    expect(buttonLabels()).toContain('Open');
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

  /*
   * The anti-gatekeeper line. `FILES_ROUTE_PARITY` has recorded the route that
   * survives without the Files app since gate 6, but only a test read it, so the
   * promise was invisible to the person it is for. These four cases are the four
   * arms, driven through the real component, and the fourth is the control: an
   * item with no recorded prior route renders NO row rather than an empty one.
   */
  /*
   * The compact-width repair. `LiquidAppScaffold` drops the rail from the spine
   * entirely below 720px, and this app's dock was a status bar with no routes,
   * so under 720px the folder tree had NO home -- not collapsed, not behind a
   * menu, absent. jsdom reports width 0, which the scaffold reads as `wide`, so
   * these stub the rect rather than mock ResizeObserver: the hook measures once
   * from `getBoundingClientRect()` on mount, which is the path that runs here.
   */
  /*
   * An inspector that opens can be closed. `setSelectedId(null)` was called from
   * NOWHERE before this: one click opened the details pane and it stayed for the
   * session, because the only way to change it was to select a different row.
   * That made the folder summary -- totals, the broken-enumerator note and the
   * unindexed-stream diagnostic -- unreachable after the first click, which is
   * worse than the missing button, since that pane is where the index admits
   * what it cannot see.
   */
  describe('the details pane can be closed again', () => {
    const openRow = async (name: string) => {
      await mount(<FilesApp />);
      await settle();
      await click(bodyRows().find((r) => r.textContent?.includes(name)));
    };

    it('offers a close control, and closing returns to the folder summary', async () => {
      await openRow('JMdict');
      expect(host?.querySelector('.lq-inspector-title')?.textContent).toBe('JMdict');
      expect(host?.querySelector('.fa-details-summary')).toBeNull();

      const close = host?.querySelector('.lq-inspector-close') as HTMLElement | null;
      expect(close?.getAttribute('aria-label')).toBe('Close details');
      await click(close);

      // Back to the summary -- the pane that carries the honest index states.
      expect(host?.querySelector('.lq-inspector-title')).toBeNull();
      expect(host?.querySelector('.fa-details-summary')).not.toBeNull();
      expect(host?.querySelector('.fa-summary-unindexed')).not.toBeNull();
      // And the row is no longer marked selected, so the list agrees with it.
      expect(host?.querySelector('.fa-row[data-selected="true"]')).toBeNull();
    });

    it('Escape inside the inspector closes it too', async () => {
      await openRow('JMdict');
      const panel = host?.querySelector('.lq-inspector') as HTMLElement;
      await act(async () => {
        panel.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
      });
      expect(host?.querySelector('.fa-details-summary')).not.toBeNull();
    });

    it('closing returns focus to the row that opened it, not to body', async () => {
      // Without `returnFocusTo` focus falls to `document.body` and the next Tab
      // restarts the window from the top.
      await openRow('JMdict');
      await click(host?.querySelector('.lq-inspector-close') as HTMLElement);
      expect(document.activeElement?.className).toContain('fa-row');
      expect(document.activeElement?.textContent).toContain('JMdict');
    });

    it('the primitive owns scrolling, so the close control cannot scroll away', async () => {
      // Read from the CSS text because jsdom does no layout. `.fa-details` is
      // stacked onto `LiquidInspector`'s root, and that root is `display: flex;
      // flex-direction: column` with `.lq-inspector-head` at `flex: none` and
      // `.lq-inspector-body` as the scroller. `.fa-details`'s own
      // `overflow-y: auto` would make the ROOT a second scroll container
      // wrapping the head -- the close button scrolls out of view, and two
      // scrollers nest. Neutralised by the two-class selector.
      const css = readFileSync(
        resolve(__dirname, '..', 'components', 'filesapp', 'filesApp.css'),
        'utf8',
      ).replace(/\/\*[\s\S]*?\*\//g, '');
      const scoped = css.slice(css.indexOf('.fa-details.lq-inspector {'));
      expect(scoped.slice(0, scoped.indexOf('}'))).toMatch(/overflow:\s*visible/);
      // And the SUMMARY branch, which has no primitive under it, keeps its own.
      const plain = css.slice(css.indexOf('.fa-details {'));
      expect(plain.slice(0, plain.indexOf('}'))).toMatch(/overflow-y:\s*auto/);
      // The mount proves both classes really are on one element, so the
      // two-class selector above is not scoping to something that never occurs.
      await openRow('JMdict');
      const panel = host?.querySelector('.lq-inspector');
      expect(panel?.classList.contains('fa-details')).toBe(true);
    });

    it('CONTROL: selecting does NOT steal focus from the list', async () => {
      // `LiquidInspector` focuses its heading on open by default, which would
      // take a keyboard user out of the row list on every arrow press. This app
      // turns that off on purpose, so the default must not creep back in.
      await openRow('JMdict');
      expect(document.activeElement?.className).not.toContain('lq-inspector-title');
    });
  });

  describe('keeps its navigation when the window is too narrow for a rail', () => {
    let rect: (this: Element) => DOMRect;
    const widthIs = (px: number) => {
      rect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function stub(this: Element) {
        return { ...rect.call(this), width: px } as DOMRect;
      };
    };
    afterEach(() => {
      if (rect) Element.prototype.getBoundingClientRect = rect;
    });

    const dockRoutes = () =>
      Array.from(host?.querySelectorAll('.lq-scaffold-dock .lq-dock-route') ?? []);

    it('relocates the folder routes into the dock once the rail is gone', async () => {
      widthIs(500);
      await mount(<FilesApp />);
      await settle();

      // The scaffold really did drop the rail at this width...
      expect(host?.querySelector('.lq-scaffold')?.getAttribute('data-width')).toBe('compact');
      expect(host?.querySelector('.lq-scaffold-rail')).toBeNull();
      // ...and the routes are still there, in the dock, as one nav landmark.
      const ids = dockRoutes().map((el) => el.getAttribute('data-item-id'));
      expect(ids.length).toBeGreaterThan(5);
      expect(ids[0]).toBe('#root');
      expect(ids).toContain('sources/video');
      expect(host?.querySelector('.lq-scaffold')?.getAttribute('data-dock-compact')).toBe('true');
      // The status readout survived the swap rather than being replaced by it.
      expect(host?.querySelector('.lq-scaffold-dock .fa-status')).not.toBeNull();
    });

    it('a relocated route actually navigates -- it is a route, not decoration', async () => {
      widthIs(500);
      await mount(<FilesApp />);
      await settle();
      expect([...names()].sort()).toEqual(['Episode 01', 'Episode 02', 'JMdict', 'abc123']);

      const video = dockRoutes().find((el) => el.getAttribute('data-item-id') === 'sources/video');
      await click(video as HTMLElement);
      // Scoped, exactly as the rail button would have.
      expect(names()).toEqual(['Episode 01', 'Episode 02']);
      expect(video?.getAttribute('aria-current')).toBe('page');

      // ...and the way back out is reachable from the same dock.
      const root = dockRoutes().find((el) => el.getAttribute('data-item-id') === '#root');
      await click(root as HTMLElement);
      expect([...names()].sort()).toEqual(['Episode 01', 'Episode 02', 'JMdict', 'abc123']);
    });

    it('CONTROL: at a normal width the rail is back and the dock carries NO routes', async () => {
      // Without this a dock that showed routes at every width would pass every
      // assertion above while rendering two navigation landmarks for one set of
      // routes -- the exact failure `railInSpine` was written to prevent.
      widthIs(1400);
      await mount(<FilesApp />);
      await settle();

      expect(host?.querySelector('.lq-scaffold')?.getAttribute('data-width')).toBe('wide');
      expect(host?.querySelector('.lq-scaffold-rail')).not.toBeNull();
      expect(dockRoutes()).toHaveLength(0);
      expect(host?.querySelector('.lq-scaffold')?.getAttribute('data-dock-compact')).toBeNull();
      expect(host?.querySelectorAll('.lq-scaffold nav')).toHaveLength(1);
      // The status readout is unchanged at this width, so the swap cost nothing.
      expect(host?.querySelector('.lq-scaffold-dock .fa-status')).not.toBeNull();
    });
  });

  describe('says where else each item is reachable', () => {
    const withSource = (source: string) => [
      item({
        id: 'x:1',
        name: 'Reachability Fixture',
        kind: 'video',
        categoryId: 'sources/video',
        source,
      }),
    ];

    const openFixture = async (source: string) => {
      filesIndex.mockImplementation(async () => snapshot(withSource(source)));
      await mount(<FilesApp />);
      await settle();
      await click(bodyRows().find((r) => r.textContent?.includes('Reachability Fixture')));
    };

    it('names the one app a preserved store is still reachable in', async () => {
      await openFixture('media');
      expect(hasText('Also reachable in')).toBe(true);
      // `palette.section.player` — the same app-name family the Start menu uses,
      // so this cannot drift into a twenty-sixth name for the Media app.
      expect(textOf('.fa-details-also')).toBe('Media');
      expect(host?.querySelector('.fa-details-also')?.getAttribute('data-reach'))
        .toBe('section');
    });

    it('makes the stronger claim for a store mounted outside the section switch', async () => {
      await openFixture('lookups');
      expect(textOf('.fa-details-also')).toBe('Everywhere — this is not only in Files.');
      expect(host?.querySelector('.fa-details-also')?.getAttribute('data-reach'))
        .toBe('global');
    });

    it('admits it when Files really is the only home left', async () => {
      await openFixture('notebook');
      expect(textOf('.fa-details-also'))
        .toBe('Only here. This moved into Files and has no other home.');
      expect(host?.querySelector('.fa-details-also')?.getAttribute('data-reach'))
        .toBe('only-here');
      // The honest arm is the point: it must NOT read as reachable elsewhere.
      expect(hasText('Also reachable in')).toBe(true);
    });

    it('CONTROL: a store with no prior route renders no row, not an empty one', async () => {
      // `transcripts` is a `new` capability — nothing existed before it, so there
      // is no route to name. A blank `<dd>` here would read as a claim that
      // failed to load, which is the exact dishonest state this avoids.
      await openFixture('transcripts');
      expect(host?.querySelector('.fa-details-also')).toBeNull();
      expect(hasText('Also reachable in')).toBe(false);
      // ...and the surrounding details list still rendered, so the absence above
      // is the line's own decision and not an unmounted inspector.
      expect(host?.querySelector('.lq-inspector-title')?.textContent)
        .toBe('Reachability Fixture');
    });

    it('names the material the index cannot see, and where it still lives', async () => {
      // Gate 7's other column. Two of the deleted Notebook's fourteen streams
      // have no Files enumerator at all, and a summary that omitted them would
      // read as complete. Each is named WITH the app that still owns it, because
      // nothing was lost -- only not indexed.
      await mount(<FilesApp />);
      await settle();
      // No selection: the summary pane is what is showing.
      expect(host?.querySelector('.fa-details-summary')).not.toBeNull();

      const box = host?.querySelector('.fa-summary-unindexed');
      expect(box).not.toBeNull();
      expect(box?.textContent).toContain('2 kinds of material are not in this index.');

      const rows = Array.from(box?.querySelectorAll('li') ?? []);
      expect(rows.map((li) => li.getAttribute('data-stream')).sort())
        .toEqual(['plan', 'transcript']);
      // The Notebook's own labels, and the palette's own app names -- not a
      // second vocabulary invented here.
      expect(rows.map((li) => li.textContent)).toEqual([
        'Plan to read — still in Novels',
        'Live captions — still in Reading Finder',
      ]);
    });

    it('CONTROL: a source the table does not carry gets no route either', async () => {
      // Separate `it` rather than a second `openFixture` inside the one above:
      // mounting twice in one test orphans the first React root, and an orphaned
      // FilesApp is still live enough to consume module-level pending scope out
      // from under the next test. Five gate-5 assertions died that way once.
      await openFixture('not-a-real-store');
      expect(host?.querySelector('.fa-details-also')).toBeNull();
      expect(host?.querySelector('.lq-inspector-title')?.textContent)
        .toBe('Reachability Fixture');
    });
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

/* ------------------------- gate 3: one-click mine ------------------------- */

async function selectRow(name: string): Promise<void> {
  await click(bodyRows().find((r) => r.textContent?.includes(name)));
}

function mineButton(): HTMLButtonElement | undefined {
  return host?.querySelector<HTMLButtonElement>('.fa-action-mine') ?? undefined;
}

describe('Files app — one-click mine (gate 3)', () => {
  it('offers the action on a transcript and refuses on a video, by name', async () => {
    await mount(<FilesApp />);
    await settle();

    await selectRow('abc123');
    expect(mineButton()).toBeTruthy();

    // A video is file-backed and present, so a generic refusal would be wrong:
    // its transcript IS in this index, and the message has to point there.
    await selectRow('Episode 01');
    expect(mineButton()).toBeFalsy();
    expect(hasText('Mine its transcript instead')).toBe(true);
  });

  it('refuses a SQLite row as not-file-backed rather than offering a dead button', async () => {
    await mount(<FilesApp />);
    await settle();
    await selectRow('JMdict');
    expect(mineButton()).toBeFalsy();
    expect(hasText('not a file, so there is no text to read')).toBe(true);
  });

  it('reads passages, writes cards, and reports both numbers', async () => {
    filesMineSource.mockImplementation(async () => ({
      ok: true,
      readCount: 3,
      passages: [
        { index: 1, text: 'これはペンです', startMs: 1000 },
        { index: 2, text: '[Music]' },
        { index: 3, text: '猫が好き' },
      ],
    }));
    await mount(<FilesApp />);
    await settle();
    await selectRow('abc123');
    await click(mineButton());

    // Main is asked for THIS row's location and THIS row's kind — not a path
    // the renderer reconstructed for itself.
    expect(filesMineSource).toHaveBeenCalledWith(
      { store: 'file', path: 'C:\\t\\abc.json' },
      'transcript',
    );
    expect(deck).toHaveLength(2);
    // Draft order, and the `[Music]` cue between them is simply not here.
    expect(deck.map((c) => c.word)).toEqual(['これはペンです', '猫が好き']);
    // Numbers, never adjectives: how many landed AND how many were read.
    expect(hasText('Added 2 cards from 3 passages.')).toBe(true);
    // The one that was dropped is accounted for, not silently absent.
    expect(hasText('Skipped 1 without Japanese')).toBe(true);
  });

  it('marks transcript-derived cards, in the deck AND on the receipt', async () => {
    filesMineSource.mockImplementation(async () => ({
      ok: true,
      readCount: 1,
      passages: [{ index: 1, text: 'これはペンです' }],
    }));
    await mount(<FilesApp />);
    await settle();
    await selectRow('abc123');
    await click(mineButton());

    // The binding constraint from MINING_UNIFICATION_PLAN.md, on both halves.
    expect(deck[0].textProvenance).toBe('transcript');
    expect(hasText('marked as machine-derived text')).toBe(true);
  });

  it('undo removes exactly the cards this mine added', async () => {
    deck.push({ id: 'pre-existing', word: '既存', reading: '', meaning: '', source: 'manual' } as DeckFlashcard);
    filesMineSource.mockImplementation(async () => ({
      ok: true,
      readCount: 1,
      passages: [{ index: 1, text: 'これはペンです' }],
    }));
    await mount(<FilesApp />);
    await settle();
    await selectRow('abc123');
    await click(mineButton());
    expect(deck).toHaveLength(2);

    await click(host?.querySelector('.fa-action-undo'));
    // The pre-existing card survives — undo is scoped to the returned ids, not
    // to "cards that look like this batch".
    expect(deck.map((c) => c.id)).toEqual(['pre-existing']);
    expect(hasText('Removed 1 card again.')).toBe(true);
  });

  it('tells an empty read apart from an all-duplicates one', async () => {
    filesMineSource.mockImplementation(async () => ({
      ok: true,
      readCount: 2,
      passages: [
        { index: 1, text: '[Music]' },
        { index: 2, text: '(applause)' },
      ],
    }));
    await mount(<FilesApp />);
    await settle();
    await selectRow('abc123');
    await click(mineButton());
    expect(deck).toHaveLength(0);
    expect(hasText('none of them held any Japanese')).toBe(true);
    expect(hasText('already in your deck')).toBe(false);
  });

  it('says so when everything was already mined', async () => {
    deck.push({ id: 'old', word: 'これはペンです', sentence: 'これはペンです' } as DeckFlashcard);
    filesMineSource.mockImplementation(async () => ({
      ok: true,
      readCount: 1,
      passages: [{ index: 1, text: 'これはペンです' }],
    }));
    await mount(<FilesApp />);
    await settle();
    await selectRow('abc123');
    await click(mineButton());
    expect(deck).toHaveLength(1);
    expect(hasText('already in your deck')).toBe(true);
  });

  it("surfaces main's refusal reason instead of a generic failure", async () => {
    filesMineSource.mockImplementation(async () => ({
      ok: false,
      reasonKey: 'filesApp.mine.refuse.badTranscript',
      detail: 'Unexpected token n',
    }));
    await mount(<FilesApp />);
    await settle();
    await selectRow('abc123');
    await click(mineButton());
    expect(deck).toHaveLength(0);
    expect(hasText('not in the shape this app writes')).toBe(true);
    expect(hasText('Unexpected token n')).toBe(true);
  });

  it('clears the previous item\u2019s result when the selection changes', async () => {
    filesMineSource.mockImplementation(async () => ({
      ok: true,
      readCount: 1,
      passages: [{ index: 1, text: 'これはペンです' }],
    }));
    await mount(<FilesApp />);
    await settle();
    await selectRow('abc123');
    await click(mineButton());
    expect(hasText('Added 1 card from 1 passages.')).toBe(true);

    // A receipt that survived the selection would read as a report about the
    // newly selected item, which it is not.
    await selectRow('Episode 01');
    expect(hasText('Added 1 card')).toBe(false);
  });
});

describe('Files app — bulk mine isolates every item (gate 20)', () => {
  const bulkItems: FilesItem[] = [
    item({
      id: 'transcript:first',
      name: 'First transcript',
      kind: 'transcript',
      categoryId: 'sources/text',
      provenance: 'whisper-transcript',
      location: { store: 'file', path: 'C:\\t\\first.json' },
    }),
    item({
      id: 'transcript:broken',
      name: 'Broken transcript',
      kind: 'transcript',
      categoryId: 'sources/text',
      provenance: 'whisper-transcript',
      location: { store: 'file', path: 'C:\\t\\broken.json' },
    }),
    item({
      id: 'subtitle:last',
      name: 'Last subtitle',
      kind: 'subtitle',
      categoryId: 'sources/text',
      provenance: 'human-subs',
      location: { store: 'file', path: 'C:\\subs\\last.srt' },
    }),
  ];

  async function selectForBulk(name: string): Promise<void> {
    await click(
      host?.querySelector<HTMLInputElement>(
        `input[aria-label="Select ${name} for bulk actions"]`,
      ),
    );
  }

  it('names three outcomes and continues after the middle item throws', async () => {
    filesIndex.mockImplementation(async () => snapshot(bulkItems));
    filesMineSource.mockImplementation(async (location) => {
      const path = (location as { path?: string }).path ?? '';
      if (path.endsWith('broken.json')) throw new Error('fixture read failed');
      return {
        ok: true,
        readCount: 1,
        passages: [
          { index: 1, text: path.endsWith('first.json') ? '最初の文' : '最後の文' },
        ],
      };
    });

    await mount(<FilesApp />);
    await settle();
    await selectForBulk('First transcript');
    await selectForBulk('Broken transcript');
    await selectForBulk('Last subtitle');

    const action = host?.querySelector<HTMLButtonElement>('.fa-bulk-mine');
    expect(action?.textContent).toContain('3');
    await click(action);

    // All three were attempted. The throw in call 2 did not abort call 3.
    expect(filesMineSource).toHaveBeenCalledTimes(3);
    expect(
      filesMineSource.mock.calls.map(([location]) => (location as { path: string }).path),
    ).toEqual(['C:\\t\\first.json', 'C:\\t\\broken.json', 'C:\\subs\\last.srt']);
    expect(deck.map((card) => card.word).sort()).toEqual(['最初の文', '最後の文'].sort());

    const receipt = host?.querySelector('.fa-bulk-result');
    expect(receipt?.textContent).toContain('2 of 3 items added 2 cards; 1 failed.');
    expect(receipt?.textContent).toContain('First transcript — 1 cards added.');
    expect(receipt?.textContent).toContain('Broken transcript — The file could not be read.');
    expect(receipt?.textContent).toContain('fixture read failed');
    expect(receipt?.textContent).toContain('Last subtitle — 1 cards added.');
    expect(receipt?.querySelectorAll('li[data-outcome="done"]')).toHaveLength(2);
    expect(receipt?.querySelectorAll('li[data-outcome="refused"]')).toHaveLength(1);

    await click(receipt?.querySelector('.fa-bulk-undo'));
    expect(deck).toHaveLength(0);
    expect(host?.querySelector('.fa-bulk-result')?.textContent).toContain(
      'Removed all 2 cards added by this bulk action.',
    );
  });
});

/* ---------------------- gate 5: context entry ---------------------- */

/** Books and manga are different leaves; the fixture needs one of each. */
const SCOPED_ITEMS: FilesItem[] = [
  item({ id: 'library:b1', name: 'A Novel', kind: 'book', categoryId: 'sources/books' }),
  item({ id: 'library:b2', name: 'Another Novel', kind: 'book', categoryId: 'sources/books' }),
  item({ id: 'library:m1', name: 'A Manga', kind: 'manga', categoryId: 'sources/manga' }),
  item({ id: 'media:1', name: 'Episode 01', kind: 'video', categoryId: 'sources/video' }),
];

describe('Files app — context entry from another page (gate 5)', () => {
  beforeEach(() => {
    clearPendingFilesScope();
    filesIndex.mockImplementation(async () => snapshot(SCOPED_ITEMS));
  });
  afterEach(() => clearPendingFilesScope());

  it('opens scoped to the caller’s category with the item focused', async () => {
    // The gesture an epub page makes. `library:b1` is the index id for that book.
    openFilesAppForBook('b1');
    await mount(<FilesApp />);
    await settle();

    // Scope is a FILTER and focus is a HIGHLIGHT — the whole Books folder is
    // shown, not just the one item, or the caller could never see its siblings.
    expect(names()).toEqual(['A Novel', 'Another Novel']);
    expect(railButton(/^Books$/)?.getAttribute('data-selected')).toBe('true');
    // ...and the inspector opens on the book the caller actually meant.
    expect(host?.querySelector('.lq-inspector-title')?.textContent).toBe('A Novel');
  });

  it('clearing the scope reveals the whole tree in the SAME window', async () => {
    openFilesAppForBook('b1');
    await mount(<FilesApp />);
    await settle();
    expect(names()).toEqual(['A Novel', 'Another Novel']);

    await click(host?.querySelector('.fa-scope-clear'));
    // Every item back, and no second window: this is the same mounted root.
    expect(names().length).toBe(SCOPED_ITEMS.length);
    expect(railButton(/^Everything$/)?.getAttribute('data-selected')).toBe('true');
  });

  it('says WHY the list is short, and the way out is the same control', async () => {
    openFilesAppForBook('b1');
    await mount(<FilesApp />);
    await settle();
    const banner = host?.querySelector('.fa-scope-clear');
    expect(banner?.textContent).toContain('Books');
    expect(banner?.textContent).toContain('Everything');
  });

  it('is CONSUMED, so the next plain open is not still filtered', async () => {
    openFilesAppForBook('b1');
    await mount(<FilesApp />);
    await settle();
    expect(names()).toEqual(['A Novel', 'Another Novel']);
    expect(peekPendingFilesScope()).toBeNull();

    // A second mount with no gesture in front of it: the whole tree.
    if (root) await act(async () => root?.unmount());
    host?.remove();
    await mount(<FilesApp />);
    await settle();
    expect(names().length).toBe(SCOPED_ITEMS.length);
  });

  it('re-scopes a window that is ALREADY open', async () => {
    await mount(<FilesApp />);
    await settle();
    expect(names().length).toBe(SCOPED_ITEMS.length);

    // No remount happens here. Without the live listener this gesture would
    // work once, from a closed window, and read as dead every time after.
    await act(async () => {
      openFilesAppForManga('m1');
    });
    expect(names()).toEqual(['A Manga']);
    expect(railButton(/^Manga$/)?.getAttribute('data-selected')).toBe('true');
  });

  it('a live re-scope clears a stale search rather than intersecting with it', async () => {
    await mount(<FilesApp />);
    await settle();
    await typeSearch('Another');
    expect(names()).toEqual(['Another Novel']);

    await act(async () => {
      openFilesAppForManga('m1');
    });
    // Had the query survived, this would be empty and the folder would look bare.
    expect(names()).toEqual(['A Manga']);
  });

  it('routes manga to Manga and a book to Books — not both to Books', async () => {
    // The negative control on the vocabulary: the two kinds are different
    // leaves, and a manga scoped to Books opens on a folder without it.
    openFilesAppForManga('m1');
    expect(peekPendingFilesScope()?.categoryId).toBe('sources/manga');
    clearPendingFilesScope();
    openFilesAppForBook('b1');
    expect(peekPendingFilesScope()?.categoryId).toBe('sources/books');
  });

  it('refuses an unknown category instead of opening the whole tree', async () => {
    // Opening everything when the caller asked for one folder is a wrong answer
    // wearing a success's clothes.
    expect(openFilesAppScoped({ categoryId: 'sources/nope' as never })).toBe(false);
    expect(peekPendingFilesScope()).toBeNull();
  });
});

describe('Files app — a watched folder announces what lands (gate 25)', () => {
  /** Exactly the shape `main/filesApp/watch.ts` broadcasts. */
  function arrival(name: string, elapsedMs: number) {
    return {
      entry: {
        path: `C:\\dl\\${name}`,
        name,
        sizeBytes: 4096,
        target: 'media',
        confidence: 'exact',
        reasonKey: 'fileDrop.reason.media',
        candidateCount: 1,
        settlement: 'placed',
      },
      root: 'C:\\dl',
      elapsedMs,
      at: 1_000,
    };
  }

  it('the list refreshes and the app SAYS what arrived, with the elapsed time', async () => {
    await mount(<FilesApp />);
    await settle();
    // The first, unforced index build. Nothing has been asked for since.
    expect(filesIndex).toHaveBeenCalledTimes(1);
    expect(hasText('arrived after')).toBe(false);

    // Delivered the way main delivers it. Nothing in this test clicks Refresh.
    await act(async () => {
      pushArrival?.([arrival('ep99.mkv', 4_200)]);
      await Promise.resolve();
    });
    await settle();

    // "Without a manual refresh": a forced rebuild that no control triggered.
    expect(filesIndex).toHaveBeenCalledWith(true);
    // And it says so, with the number rather than "a file arrived".
    expect(hasText('ep99.mkv arrived after 4.2 s')).toBe(true);
  });

  it('names the watched count from what main confirmed', async () => {
    filesWatchSet.mockImplementation(async () => ({
      roots: ['C:\\dl', 'C:\\downloads'],
      pending: 0,
    }));
    await mount(<FilesApp />);
    await settle();
    expect(hasText('Watching 2 folders')).toBe(true);
  });

  it('a build with no watcher renders the app unchanged', async () => {
    // The preload is versioned separately from the renderer; a missing watcher
    // must cost the notice, never the app.
    Object.defineProperty(window, 'api', {
      configurable: true,
      writable: true,
      value: { filesIndex, filesReveal, filesMineSource, fileDropClassify },
    });
    await mount(<FilesApp />);
    await settle();
    expect(railButton(/^Video$/)).toBeTruthy();
    expect(hasText('Watching')).toBe(false);
  });
});
