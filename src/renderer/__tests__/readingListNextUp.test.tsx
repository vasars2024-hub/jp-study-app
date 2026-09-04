// @vitest-environment jsdom
/**
 * P5 §5.3's "Next up" button on the real list detail — the CALLER half.
 *
 * `readingListViews.test.ts` proves the ranking. What only this can prove is
 * that the view actually feeds it the two things it needs. A pure core with a
 * caller that hands it an empty map ranks nothing, passes every unit test, and
 * ships a button that silently offers the first row forever.
 *
 * So both inputs get their own falsification: the tier is varied and the button
 * must follow it, and the per-work level is removed and the button must fall
 * back to list order rather than to whatever it happened to pick before.
 *
 * Its own file, not a block inside `readingListsView.test.tsx`, because the
 * level reader is module-mocked and a `vi.mock` there would apply to every test
 * in a 2,000-line file that has nothing to do with levels.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevelTier } from '../../shared/levelScale';

/** Mutable so one mount can answer differently from the next. */
let userLevel: LevelTier = 4;
vi.mock('../levelService', () => ({
  getUserLevel: () => userLevel,
  getLevelEstimate: () => ({ short: 'N3', label: 'JLPT N3', tier: 4 }),
  onLevelChange: () => () => undefined,
}));

import ReadingListsView from '../views/ReadingListsView';
import { resetReadingListsClientForTesting } from '../readingListsClient';
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
let opened: LibraryItem[];

/**
 * Three books, deliberately in an order that DISAGREES with every tier under
 * test — `Hard` is first, so any assertion below that names `Hard` is the
 * fallback and any other name is the fit.
 */
const BOOKS: ReadonlyArray<{ id: string; title: string; level: LevelTier }> = [
  { id: 'item-hard', title: 'Hard', level: 7 },
  { id: 'item-easy', title: 'Easy', level: 2 },
  { id: 'item-mid', title: 'Mid', level: 4 },
];

function libraryItems(withLevels: boolean): LibraryItem[] {
  return BOOKS.map(
    (book) =>
      ({
        id: book.id,
        title: book.title,
        type: 'book',
        addedAt: 1,
        ...(withLevels ? { levelMeta: { levelEstimate: book.level, lang: 'ja' } } : {}),
      }) as unknown as LibraryItem,
  );
}

/** A POOL list — the one kind §5.3 lets the app re-order. */
function seeded(kind: 'pool' | 'ordered' = 'pool'): {
  document: ReadingListsDocument;
  listId: string;
} {
  const ctx = (n: number) => createReadingListsMutationContext(1_700_000_000_000 + n);
  const created = createReadingList(emptyReadingListsDocument(), { name: 'From Aya', kind }, ctx(0));
  const listId = created.listId;
  let document = created.document;
  BOOKS.forEach((book, index) => {
    const added = addReadingListEntry(document, listId, { title: book.title }, ctx(index + 1));
    document = added.document;
    const work = document.works.find((candidate) => candidate.titleRaw === book.title);
    if (!work) throw new Error(`the seeded work ${book.title} is missing`);
    document = bindReadingWork(document, work.id, book.id, 0.95, ctx(index + 10)).document;
    const entry = document.lists[0].entries.find((e) => e.workId === work.id);
    if (!entry) throw new Error('the seeded entry is missing');
    // `owned` and not `wanted`: §5.3 ranks INSIDE one state band, so a mixed
    // band would let the priority order answer instead of the difficulty fit.
    document = setReadingEntryState(document, listId, entry.id, 'owned', ctx(index + 20)).document;
  });
  return { document: sealReadingListsDocument(document), listId };
}

function installBridge(document: ReadingListsDocument, withLevels: boolean) {
  (window as unknown as { api?: unknown }).api = {
    listLibrary: async () => libraryItems(withLevels),
    readingListsLoad: async () => ({
      ok: true,
      snapshot: { document, health: { state: 'ok', lostRevisions: 0 } },
    }),
    readingListsWrite: async () => ({ ok: true, revision: document.revision + 1 }),
    readingListsEvents: async () => ({ ok: true, events: [] }),
    onReadingListsChanged: () => () => undefined,
  };
}

async function mount(listId: string) {
  await act(async () => {
    root.render(
      <ReadingListsView
        initialListId={listId}
        initialEntryId={null}
        onOpenBook={(item) => opened.push(item)}
        onFindWork={() => undefined}
      />,
    );
    await Promise.resolve();
  });
  // The document load and the library load are separate effects; the second
  // resolves after the first has already re-rendered.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function nextUpButton(): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>('button.rlv__nextup');
}

beforeEach(() => {
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  opened = [];
  userLevel = 4;
  resetReadingListsClientForTesting();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
});

describe('ReadingListsView — P5 §5.3, the Next up button', () => {
  it('offers the book closest to the reader tier, not the first row', async () => {
    const { document, listId } = seeded();
    installBridge(document, true);
    await mount(listId);
    const button = nextUpButton();
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('Mid');
    expect(button?.textContent).not.toContain('Hard');
  });

  it('follows the tier — the same list at a different level offers a different book', async () => {
    userLevel = 2;
    const { document, listId } = seeded();
    installBridge(document, true);
    await mount(listId);
    // Nothing about the LIST changed between this and the test above. Only the
    // reader did, so a button that still said "Mid" would prove the tier is
    // decorative.
    expect(nextUpButton()?.textContent).toContain('Easy');
  });

  it('falls back to list order when the library carries no level at all', async () => {
    const { document, listId } = seeded();
    installBridge(document, false);
    await mount(listId);
    // The control for the whole feature: unmeasured must not be EXCLUDED (there
    // would be no button) and must not be re-ordered (it would not be `Hard`).
    expect(nextUpButton()?.textContent).toContain('Hard');
  });

  it('leaves an ordered list in the user’s own order however the tiers fall', async () => {
    const { document, listId } = seeded('ordered');
    installBridge(document, true);
    await mount(listId);
    expect(nextUpButton()?.textContent).toContain('Hard');
  });

  it('opens the book through the same seam a row click uses', async () => {
    const { document, listId } = seeded();
    installBridge(document, true);
    await mount(listId);
    await act(async () => {
      nextUpButton()?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    // §11.1: the button routes through `openRow`, so it lands on the reader with
    // the real LibraryItem rather than on a second navigation path.
    expect(opened.map((item) => item.id)).toEqual(['item-mid']);
  });
});
