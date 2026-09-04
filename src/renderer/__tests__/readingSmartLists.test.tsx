// @vitest-environment jsdom
/**
 * P5 §7's panel.
 *
 * The claim under test is NOT "three chips exist". It is that pressing one
 * derives the right books from a real document plus a real library, and that the
 * button on a row goes somewhere real — `onOpenBook` with the actual
 * `LibraryItem` when the book is held, `onFindWork` with the title when it is
 * not. A panel whose rows swallow the click is exactly what §11.1 forbids, and a
 * chip test alone passes on one.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReadingSmartLists from '../components/reading/ReadingSmartLists';
import {
  addReadingListEntry,
  bindReadingWork,
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
  setReadingEntryState,
} from '../../shared/readingListMutations';
import {
  emptyReadingListsDocument,
  type ReadingListsDocument,
} from '../../shared/readingLists';
import type { LibraryItem } from '../../shared/types';

let host: HTMLDivElement;
let root: Root;

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function item(id: string, over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id,
    title: id,
    kind: 'book',
    createdAt: NOW - 500 * DAY,
    ...over,
  } as LibraryItem;
}

/**
 * One shelf holding four books, each in a state a different preset must find:
 *
 *   · `stale`  — started 200 days ago, 30% read, last opened 90 days ago
 *   · `fresh`  — owned, never opened, level 2
 *   · `hard`   — owned, never opened, level 7
 *   · `wanted` — no file at all, so its row must route to acquisition
 */
function seeded(): { document: ReadingListsDocument; items: LibraryItem[] } {
  let clock = NOW - 400 * DAY;
  const next = () => createReadingListsMutationContext((clock += 1));
  let document = emptyReadingListsDocument();
  const created = createReadingList(document, { name: 'Shelf' }, next());
  document = created.document;
  const listId = created.listId;

  const add = (title: string, state: 'owned' | 'wanted', author?: string) => {
    const result = addReadingListEntry(
      document,
      listId,
      { title, state, ...(author ? { author } : {}) },
      next(),
    );
    document = result.document;
    const entryId = result.entryId;
    if (!entryId) throw new Error(`add refused ${title}`);
    const workId = document.lists
      .flatMap((list) => list.entries)
      .find((entry) => entry.id === entryId)?.workId;
    if (!workId) throw new Error('no work');
    return { entryId, workId };
  };

  const stale = add('Stalled book', 'owned');
  const fresh = add('Fresh book', 'owned');
  const hard = add('Hard book', 'owned');
  const wanted = add('Unowned book', 'wanted');
  void wanted;

  document = bindReadingWork(document, stale.workId, 'it-stale', 0.99, next()).document;
  document = bindReadingWork(document, fresh.workId, 'it-fresh', 0.99, next()).document;
  document = bindReadingWork(document, hard.workId, 'it-hard', 0.99, next()).document;

  clock = NOW - 200 * DAY;
  document = setReadingEntryState(document, listId, stale.entryId, 'reading', next()).document;

  return {
    document: sealReadingListsDocument(document),
    items: [
      item('it-stale', {
        inboxMeta: { levelEstimate: 3 },
        lastReadAt: NOW - 90 * DAY,
        progress: { percent: 0.3 },
      } as Partial<LibraryItem>),
      item('it-fresh', { inboxMeta: { levelEstimate: 2 } } as Partial<LibraryItem>),
      item('it-hard', { inboxMeta: { levelEstimate: 7 } } as Partial<LibraryItem>),
    ],
  };
}

async function render(
  document: ReadingListsDocument | null,
  items: readonly LibraryItem[],
  handlers: {
    onOpenBook?: (item: LibraryItem) => void;
    onFindWork?: (title: string) => void;
  } = {},
) {
  await act(async () => {
    root.render(
      <ReadingSmartLists
        document={document}
        items={items}
        onOpenBook={handlers.onOpenBook ?? (() => undefined)}
        onFindWork={handlers.onFindWork ?? (() => undefined)}
      />,
    );
    await Promise.resolve();
  });
}

const chips = () => [...host.querySelectorAll<HTMLButtonElement>('.rlsm__chip')];
const rowTitles = () =>
  [...host.querySelectorAll('.rlsm__row-title')].map((node) => node.textContent);

async function press(label: string) {
  const chip = chips().find((node) => node.textContent === label);
  if (!chip) throw new Error(`no chip "${label}" among ${chips().map((c) => c.textContent)}`);
  await act(async () => {
    chip.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('ReadingSmartLists — P5 §7', () => {
  it('renders nothing at all with no document and with no works', async () => {
    await render(null, []);
    expect(host.querySelector('[data-testid="rlv-smart-lists"]')).toBeNull();
    await render(emptyReadingListsDocument(), []);
    expect(host.querySelector('[data-testid="rlv-smart-lists"]')).toBeNull();
  });

  it('shows the three presets, and no answer until one is pressed', async () => {
    const { document, items } = seeded();
    await render(document, items);
    expect(chips().map((node) => node.textContent)).toEqual([
      'Abandoned',
      'Ready to read',
      'Author sweep',
    ]);
    expect(host.querySelector('.rlsm__answer')).toBeNull();
    expect(chips().every((node) => node.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('Abandoned finds the stalled book and nothing else', async () => {
    const { document, items } = seeded();
    await render(document, items);
    await press('Abandoned');
    expect(rowTitles()).toEqual(['Stalled book']);
    expect(host.querySelector('.rlsm__count')?.textContent).toBe('1 book');
  });

  it('NEGATIVE CONTROL — the same book read yesterday drops out of Abandoned', async () => {
    const { document, items } = seeded();
    const recent = items.map((entry) =>
      entry.id === 'it-stale' ? ({ ...entry, lastReadAt: NOW - DAY } as LibraryItem) : entry,
    );
    await render(document, recent);
    await press('Abandoned');
    expect(rowTitles()).toEqual([]);
    expect(host.querySelector('.rlsm__empty')?.textContent).toBe(
      'Nothing matches this right now.',
    );
  });

  it('Ready to read keeps the easy shelf book and drops the L7 one', async () => {
    const { document, items } = seeded();
    await render(document, items);
    await press('Ready to read');
    expect(rowTitles()).toEqual(['Fresh book']);
    // The band is stated on screen, not implied by which rows survived.
    expect(host.querySelector('.rlsm__hint')?.textContent).toBe(
      'On your shelf, not opened yet, at level 4 or easier.',
    );
  });

  it('an unrated book is included and SAYS it is unrated', async () => {
    const { document, items } = seeded();
    const unrated = items.map((entry) =>
      entry.id === 'it-fresh' ? ({ ...entry, inboxMeta: undefined } as LibraryItem) : entry,
    );
    await render(document, unrated);
    await press('Ready to read');
    expect(rowTitles()).toEqual(['Fresh book']);
    expect(host.querySelector('.rlsm__row-level')?.textContent).toBe('Not rated yet');
  });

  it('Author sweep says what would fill it in rather than showing an empty list', async () => {
    const { document, items } = seeded();
    await render(document, items);
    await press('Author sweep');
    expect(host.querySelector('.rlsm__empty')?.textContent).toBe(
      'Finish a book that has an author on it and this fills itself in.',
    );
    expect(host.querySelector('.rlsm__rows')).toBeNull();
  });

  it('pressing the open chip again closes the answer', async () => {
    const { document, items } = seeded();
    await render(document, items);
    await press('Abandoned');
    expect(host.querySelector('.rlsm__answer')).not.toBeNull();
    await press('Abandoned');
    expect(host.querySelector('.rlsm__answer')).toBeNull();
  });

  it('a held book opens in the reader — with the real LibraryItem, not an id', async () => {
    const { document, items } = seeded();
    const onOpenBook = vi.fn();
    const onFindWork = vi.fn();
    await render(document, items, { onOpenBook, onFindWork });
    await press('Abandoned');
    const button = host.querySelector<HTMLButtonElement>('.rlsm__row button');
    expect(button?.textContent).toBe('Open');
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(onOpenBook).toHaveBeenCalledTimes(1);
    expect(onOpenBook.mock.calls[0]?.[0]?.id).toBe('it-stale');
    expect(onFindWork).not.toHaveBeenCalled();
  });

  it('a book with no file routes to acquisition instead of dead-ending', async () => {
    const { document } = seeded();
    const onOpenBook = vi.fn();
    const onFindWork = vi.fn();
    // No library at all, so every row is unowned — including the `wanted` one.
    await render(document, [], { onOpenBook, onFindWork });
    await press('Abandoned');
    const button = host.querySelector<HTMLButtonElement>('.rlsm__row button');
    expect(button?.textContent).toBe('Find this');
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(onFindWork).toHaveBeenCalledWith('Stalled book');
    expect(onOpenBook).not.toHaveBeenCalled();
  });
});
