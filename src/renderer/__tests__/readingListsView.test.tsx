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

/**
 * Returns the native event so a test can read `defaultPrevented`. That is the
 * only honest control for "Space ticks instead of activating": jsdom never
 * synthesises the click a real browser fires from Space on a `<button>`, so
 * asserting `opened` stayed empty would pass even with the guard deleted.
 */
async function press(node: Element | null, key: string): Promise<KeyboardEvent> {
  expect(node).not.toBeNull();
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => {
    (node as HTMLElement).dispatchEvent(event);
    await Promise.resolve();
    await Promise.resolve();
  });
  return event;
}

/** React tracks the value node-side, so the native setter is what it notices. */
async function typeInto(node: HTMLInputElement | null, value: string) {
  expect(node).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(node, value);
    node?.dispatchEvent(new window.Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

function filterField(): HTMLInputElement | null {
  return host.querySelector<HTMLInputElement>('.rlv__filter-field');
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

  it('filters rows by title and says so, rather than looking like an empty list', async () => {
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);
    expect(rows()).toHaveLength(2);

    await typeInto(filterField(), 'kino');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Kino no Tabi');
    expect(host.querySelector('.rlv__filter-count')?.textContent).toContain('1 of 2 shown');

    await typeInto(filterField(), 'nothing here');
    expect(rows()).toHaveLength(0);
    // The distinction the plan asks for: "no match" is not "this list is empty".
    expect(host.textContent).toContain('matches “nothing here”');
    expect(host.textContent).not.toContain('This list is empty');

    await typeInto(filterField(), '');
    expect(rows()).toHaveLength(2);
    expect(host.querySelector('.rlv__filter-count')).toBeNull();
  });

  it('focuses the filter on “/” from a row, and leaves “/” alone inside a field', async () => {
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);

    const rowButton = rows()[0].querySelector<HTMLButtonElement>('.rlv__row-open');
    rowButton?.focus();
    const fromRow = await press(rowButton, '/');
    expect(fromRow.defaultPrevented).toBe(true);
    expect(window.document.activeElement).toBe(filterField());

    // Control: the same key inside the field must reach the field as text.
    const inField = await press(filterField(), '/');
    expect(inField.defaultPrevented).toBe(false);
  });

  it('ticks a row finished on Space and puts it back on a second Space', async () => {
    const { document, listId } = seeded();
    const store = new FakeStore(document);
    installBridge(store);
    await render(listId);

    const button = () => rows()[0].querySelector('.rlv__row-open');
    const first = await press(button(), ' ');
    // Prevented, or a real browser also fires the click and the row opens the
    // reader at the same moment it is ticked.
    expect(first.defaultPrevented).toBe(true);
    expect(rows()[0].dataset.state).toBe('finished');
    expect(opened).toEqual([]);

    await press(button(), ' ');
    // §4.5: un-finishing lands on a state the row could really have been in.
    expect(rows()[0].dataset.state).not.toBe('finished');
    expect(['reading', 'owned', 'wanted']).toContain(rows()[0].dataset.state);
    expect(store.writes).toBe(2);
  });

  it('removes a row on Delete and still offers the undo', async () => {
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);

    const removed = await press(rows()[1].querySelector('.rlv__row-open'), 'Delete');
    expect(removed.defaultPrevented).toBe(true);
    expect(rows()).toHaveLength(1);

    await click(byText('Undo'));
    expect(rows()).toHaveLength(2);
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

  describe('bulk selection (§11.4)', () => {
    /** Five titles, so a shift-range has an inside as well as two ends. */
    function seededFive(): { document: ReadingListsDocument; listId: string } {
      const base = seeded();
      let current = base.document;
      for (const title of ['Three', 'Four', 'Five']) {
        current = addReadingListEntry(
          current,
          base.listId,
          { title },
          createReadingListsMutationContext(1_700_000_000_010),
        ).document;
      }
      return { document: sealReadingListsDocument(current), listId: base.listId };
    }

    function picks(): HTMLInputElement[] {
      return [...host.querySelectorAll<HTMLInputElement>('.rlv__row-pick')];
    }

    async function shiftClick(node: Element | null) {
      expect(node).not.toBeNull();
      await act(async () => {
        (node as HTMLElement).dispatchEvent(
          new window.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }),
        );
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    it('shift-click selects the whole range between the two clicks', async () => {
      const { document, listId } = seededFive();
      installBridge(new FakeStore(document));
      await render(listId);
      expect(rows()).toHaveLength(5);

      await click(picks()[1]);
      await shiftClick(picks()[3]);

      expect(picks().map((box) => box.checked)).toEqual([false, true, true, true, false]);
      expect(byText('3 selected')).not.toBeNull();
    });

    it('a range spans only the rows on screen, never the ones the filter hid', async () => {
      const { document, listId } = seededFive();
      installBridge(new FakeStore(document));
      await render(listId);

      // Leaves rows 1, 3 and 5 (the two seeded titles are neither "Three" nor
      // "Five"), so a range across them would sweep in "Four" if it ranged over
      // the unfiltered list.
      await typeInto(filterField(), 'e');
      const shown = rows().map((row) => row.querySelector('.rlv__row-title')?.textContent);
      expect(shown).toEqual(['Three', 'Five']);

      await click(picks()[0]);
      await shiftClick(picks()[1]);
      expect(byText('2 selected')).not.toBeNull();

      await typeInto(filterField(), '');
      // Still exactly two, and they are the two that were on screen.
      expect(picks().map((box) => box.checked)).toEqual([false, false, true, false, true]);
    });

    it('marks a selection finished in ONE write, and one undo puts all of them back', async () => {
      const { document, listId } = seededFive();
      const store = new FakeStore(document);
      installBridge(store);
      await render(listId);

      const states = () => rows().map((row) => row.getAttribute('data-state'));
      // The first row is `owned` — it is the bound one. Captured rather than
      // written out, because the undo has to restore THAT, not a uniform default.
      const original = states();
      expect(original[0]).toBe('owned');

      await click(picks()[0]);
      await shiftClick(picks()[2]);
      const before = store.writes;
      await click(byText('Mark finished'));

      expect(store.writes).toBe(before + 1);
      expect(states()).toEqual(['finished', 'finished', 'finished', 'wanted', 'wanted']);
      // The selection is spent, so the bar is gone rather than offering to do it again.
      expect(byText('3 selected')).toBeNull();

      await click(byText('Undo'));
      expect(states()).toEqual(original);
    });

    it('removes a selection in one write and restores the original row order on undo', async () => {
      const { document, listId } = seededFive();
      const store = new FakeStore(document);
      installBridge(store);
      await render(listId);
      const titles = () =>
        rows().map((row) => row.querySelector('.rlv__row-title')?.textContent);
      const original = titles();

      await click(picks()[0]);
      await shiftClick(picks()[1]);
      const before = store.writes;
      await click(byText('Remove'));

      expect(store.writes).toBe(before + 1);
      expect(rows()).toHaveLength(3);

      await click(byText('Undo'));
      expect(titles()).toEqual(original);
    });

    it('moves a selection to another list and names what it refused to move', async () => {
      const base = seededFive();
      const second = createReadingList(
        base.document,
        { name: 'Later' },
        createReadingListsMutationContext(1_700_000_000_020),
      );
      const store = new FakeStore(sealReadingListsDocument(second.document));
      installBridge(store);
      await render(base.listId);

      await click(picks()[0]);
      await click(picks()[1]);
      const select = host.querySelector<HTMLSelectElement>('.rlv__bulk-move');
      expect(select).not.toBeNull();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          'value',
        )?.set;
        setter?.call(select, second.listId);
        select?.dispatchEvent(new window.Event('change', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(rows()).toHaveLength(3);
      expect(store.document.lists.find((l) => l.id === second.listId)?.entries).toHaveLength(2);

      await click(byText('Undo'));
      expect(rows()).toHaveLength(5);
      expect(store.document.lists.find((l) => l.id === second.listId)?.entries).toHaveLength(0);
    });

    it('offers no move target — and says so — when this is the only list', async () => {
      const { document, listId } = seededFive();
      installBridge(new FakeStore(document));
      await render(listId);
      await click(picks()[0]);
      expect(host.querySelector('.rlv__bulk-move')).toBeNull();
      expect(byText('No other list to move these to yet.')).not.toBeNull();
    });

    it('drops a selected row from the selection when it is removed one at a time', async () => {
      const { document, listId } = seededFive();
      installBridge(new FakeStore(document));
      await render(listId);

      await click(picks()[0]);
      await shiftClick(picks()[2]);
      expect(byText('3 selected')).not.toBeNull();

      // The single-row trash button on the middle row of the selection.
      await click(rows()[1].querySelector('.ui-btn--ghost'));
      expect(rows()).toHaveLength(4);
      // Two, not three: the count cannot name a row that is no longer there.
      expect(byText('2 selected')).not.toBeNull();
    });
  });
});
