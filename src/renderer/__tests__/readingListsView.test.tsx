// @vitest-environment jsdom
/**
 * Reading Lists §6 surface, driven on the real component.
 *
 * The only stub is `window.api` — the IPC boundary. Everything above it is
 * production: the view model, the mutation layer, the CAS client and the view
 * itself. What this file is for is the four claims the view makes that nothing
 * below it can make:
 *
 *   · a row goes SOMEWHERE — the bound one to the library item, the unbound one
 *     to acquisition, with its title (§11.1);
 *   · a destructive act is undoable and the undo actually restores it (§11.4);
 *   · a refused write reports and changes nothing, rather than redrawing a
 *     change that did not land;
 *   · loading, read failure and empty are three different states.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ReadingListsView from '../views/ReadingListsView';
import { resetReadingListsClientForTesting } from '../readingListsClient';
import {
  addReadingListEntry,
  bindReadingWork,
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
  suggestReadingWorkBinding,
} from '../../shared/readingListMutations';
import { emptyReadingListsDocument, type ReadingListsDocument } from '../../shared/readingLists';
import type { LibraryItem } from '../../shared/types';

let host: HTMLDivElement;
let root: Root;
let opened: LibraryItem[];
let sought: string[];

const ITEM: LibraryItem = {
  id: 'item-1',
  title: 'Kino no Tabi',
  type: 'book',
  addedAt: 1,
} as unknown as LibraryItem;

/** Main in miniature: one document, a revision counter, compare-and-swap. */
class FakeStore {
  document: ReadingListsDocument;
  writes = 0;
  /** Every write fails outright — the "nothing landed, say so" case. */
  failWrites = false;

  constructor(document: ReadingListsDocument) {
    this.document = document;
  }

  write = async (baseRevision: number, next: ReadingListsDocument) => {
    this.writes += 1;
    if (this.failWrites) return { ok: false, code: 'write-failed' };
    if (baseRevision !== this.document.revision) {
      this.document = { ...this.document, revision: this.document.revision + 1 };
      return {
        ok: true,
        applied: false,
        snapshot: { document: this.document, health: { state: 'ok', lostRevisions: 0 } },
      };
    }
    this.document = { ...next, revision: this.document.revision + 1 };
    return {
      ok: true,
      applied: true,
      snapshot: { document: this.document, health: { state: 'ok', lostRevisions: 0 } },
    };
  };
}

/** One list, two entries: the first bound to `item-1`, the second bound to nothing. */
function seeded(): { document: ReadingListsDocument; listId: string } {
  const context = createReadingListsMutationContext(1_700_000_000_000);
  const created = createReadingList(emptyReadingListsDocument(), { name: 'From a friend' }, context);
  const listId = created.listId;
  const bound = addReadingListEntry(
    created.document,
    listId,
    { title: 'Kino no Tabi' },
    createReadingListsMutationContext(1_700_000_000_001),
  );
  const wanted = addReadingListEntry(
    bound.document,
    listId,
    { title: 'コンビニ人間' },
    createReadingListsMutationContext(1_700_000_000_002),
  );
  const work = wanted.document.works.find((candidate) => candidate.titleRaw === 'Kino no Tabi');
  if (!work) throw new Error('the seeded work is missing — addReadingListEntry changed shape');
  const linked = bindReadingWork(
    wanted.document,
    work.id,
    ITEM.id,
    0.95,
    createReadingListsMutationContext(1_700_000_000_003),
  );
  return { document: sealReadingListsDocument(linked.document), listId };
}

function installBridge(store: FakeStore | null, loadFails = false) {
  (window as unknown as { api?: unknown }).api = {
    listLibrary: async () => [ITEM],
    ...(store && !loadFails
      ? {
          readingListsLoad: async () => ({
            ok: true,
            snapshot: { document: store.document, health: { state: 'ok', lostRevisions: 0 } },
          }),
          readingListsWrite: store.write,
          readingListsEvents: async () => ({ ok: true, events: [] }),
          onReadingListsChanged: () => () => undefined,
        }
      : {}),
  };
}

async function render(initialListId: string | null = null) {
  await act(async () => {
    root.render(
      <ReadingListsView
        initialListId={initialListId}
        onOpenBook={(item) => opened.push(item)}
        onFindWork={(title) => sought.push(title)}
      />,
    );
    await Promise.resolve();
  });
  // Two microtask turns: the document load and the library load are separate
  // effects and the second resolves after the first has re-rendered.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function byText(text: string): HTMLElement | null {
  return (
    [...host.querySelectorAll<HTMLElement>('button, span, p, div')].find(
      (node) => node.textContent?.trim() === text,
    ) ?? null
  );
}

function rows(): HTMLLIElement[] {
  return [...host.querySelectorAll<HTMLLIElement>('.rlv__row')];
}

async function click(node: Element | null) {
  expect(node).not.toBeNull();
  await act(async () => {
    (node as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  opened = [];
  sought = [];
  resetReadingListsClientForTesting();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
});

describe('ReadingListsView', () => {
  it('draws a card per list with the counts the view model computed', async () => {
    const { document } = seeded();
    installBridge(new FakeStore(document));
    await render();

    const cards = host.querySelectorAll('.rlv__card');
    expect(cards).toHaveLength(1);
    expect(host.textContent).toContain('From a friend');
    // Two entries, neither finished, and neither abandoned: 0 of 2.
    expect(host.textContent).toContain('0 of 2 finished');
  });

  it('opens the library item for a bound row and routes an unbound row to acquisition', async () => {
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);

    const [boundRow, unboundRow] = rows();
    expect(rows()).toHaveLength(2);

    await click(boundRow.querySelector('.rlv__row-open'));
    expect(opened.map((item) => item.id)).toEqual(['item-1']);
    expect(sought).toEqual([]);

    await click(unboundRow.querySelector('.rlv__row-open'));
    // The title travels with the request: "find me this book" without the title
    // is a search box the user has to retype into.
    expect(sought).toEqual(['コンビニ人間']);
    expect(opened).toHaveLength(1);
  });

  it('removes an entry, offers undo, and the undo puts it back', async () => {
    const { document, listId } = seeded();
    const store = new FakeStore(document);
    installBridge(store);
    await render(listId);

    const removeButton = rows()[1].querySelector<HTMLButtonElement>(
      'button[aria-label*="コンビニ人間"]',
    );
    await click(removeButton);
    expect(rows()).toHaveLength(1);

    const undo = byText('Undo');
    expect(undo).not.toBeNull();
    await click(undo);
    expect(rows()).toHaveLength(2);
    expect(host.textContent).toContain('コンビニ人間');
    expect(store.writes).toBe(2);
  });

  it('reports a refused write and leaves the list exactly as it was', async () => {
    const { document, listId } = seeded();
    const store = new FakeStore(document);
    store.failWrites = true;
    installBridge(store);
    await render(listId);

    await click(rows()[1].querySelector('button[aria-label*="コンビニ人間"]'));
    // The negative half of the test above: the row must still be there, because
    // an optimistic redraw of a write that did not land is the dishonest state.
    expect(rows()).toHaveLength(2);
    expect(host.querySelector('.rlv__notice--error')?.textContent).toContain('not saved');
  });

  it('says the lists could not be read rather than showing an empty grid', async () => {
    installBridge(null, true);
    await render();
    expect(host.querySelector('.rlv__state--error')).not.toBeNull();
    expect(host.querySelector('.rlv__grid')).toBeNull();
    // The empty-state copy must NOT be what a failed read shows.
    expect(host.textContent).not.toContain('No lists yet');
  });

  it('shows the empty grid only when the document really is empty', async () => {
    installBridge(new FakeStore(sealReadingListsDocument(emptyReadingListsDocument())));
    await render();
    expect(host.textContent).toContain('No lists yet');
    expect(host.querySelector('.rlv__state--error')).toBeNull();
  });

  it('offers a dismissable suggestion and restores it on undo', async () => {
    const base = seeded();
    const wantedWork = base.document.works.find((work) => work.boundItemIds.length === 0);
    if (!wantedWork) throw new Error('the seeded unbound work is missing');
    const suggested = suggestReadingWorkBinding(
      base.document,
      wantedWork.id,
      { itemId: ITEM.id, confidence: 0.6 },
      createReadingListsMutationContext(1_700_000_000_004),
    );
    const store = new FakeStore(sealReadingListsDocument(suggested.document));
    installBridge(store);
    await render(base.listId);

    expect(host.querySelector('.rlv__row-triage')).not.toBeNull();
    await click(byText('No'));
    expect(host.querySelector('.rlv__row-triage')).toBeNull();

    await click(byText('Undo'));
    expect(host.querySelector('.rlv__row-triage')).not.toBeNull();
  });
});
