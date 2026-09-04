// @vitest-environment jsdom
/**
 * §11.1's last unbuilt row: *"Back works. Opening a book from a list and coming
 * back returns to the list at the same scroll position and selection."*
 *
 * Two journeys, and they are NOT the same journey:
 *
 *   · back to the grid and in again — the component stays mounted;
 *   · open a book — the app navigates away and this view UNMOUNTS.
 *
 * The second is the one the rule is actually about, and the one a `useRef` would
 * silently fail. Every mount below is a FRESH root for exactly that reason.
 *
 * ── Why the scroll assertions are written the way they are ──────────────────
 *
 * jsdom performs no layout: every element reports `clientHeight` 0 and
 * `scrollHeight` 0, so a real `scrollTop` write is clamped to 0 and an
 * assertion on it would read 0 whether the feature works or not — a vacuous
 * pass. So the container's `scrollTop` is given a real backing property for the
 * duration of these tests. That makes the assertion about what the CODE does
 * with the value, which is the part under test; the browser's own clamping is
 * not this suite's to prove.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ReadingListsView, { resetReadingListReturnForTesting } from '../views/ReadingListsView';
import { resetReadingListsClientForTesting } from '../readingListsClient';
import {
  addReadingListEntry,
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
} from '../../shared/readingListMutations';
import {
  emptyReadingListsDocument,
  type ReadingListsDocument,
} from '../../shared/readingLists';
import type { LibraryItem } from '../../shared/types';

let host: HTMLDivElement;
let root: Root;
let restoreScrollTop: (() => void) | null = null;

const ITEM: LibraryItem = {
  id: 'item-1',
  title: 'Kino no Tabi',
  type: 'book',
  addedAt: 1,
} as unknown as LibraryItem;

/** Two lists, so "keyed by list" has something to be keyed against. */
function seeded(): { document: ReadingListsDocument; a: string; b: string } {
  const ctx = (n: number) => createReadingListsMutationContext(1_700_000_000_000 + n);
  let doc = emptyReadingListsDocument();
  const first = createReadingList(doc, { name: 'From Aya', kind: 'pool' }, ctx(0));
  doc = first.document;
  const second = createReadingList(doc, { name: 'From Ken', kind: 'pool' }, ctx(1));
  doc = second.document;
  for (let i = 0; i < 6; i += 1) {
    doc = addReadingListEntry(doc, first.listId, { title: `Book A${i}` }, ctx(10 + i)).document;
    doc = addReadingListEntry(doc, second.listId, { title: `Book B${i}` }, ctx(30 + i)).document;
  }
  return { document: sealReadingListsDocument(doc), a: first.listId, b: second.listId };
}

/** Set by `installBridge`, so a test can push a store broadcast at the view. */
let broadcast: ((snapshot: unknown) => void) | null = null;

function installBridge(document: ReadingListsDocument) {
  broadcast = null;
  (window as unknown as { api?: unknown }).api = {
    listLibrary: async () => [ITEM],
    readingListsLoad: async () => ({
      ok: true,
      snapshot: { document, health: { state: 'ok', lostRevisions: 0 } },
    }),
    readingListsWrite: async () => ({ ok: true, revision: document.revision + 1 }),
    readingListsEvents: async () => ({ ok: true, events: [] }),
    onReadingListsChanged: (cb: (snapshot: unknown) => void) => {
      broadcast = cb;
      return () => {
        broadcast = null;
      };
    },
  };
}

/** A FRESH root — this is what makes "the view unmounted" a real journey. */
async function mount(initialListId: string | null) {
  if (root) {
    act(() => root.unmount());
    host.remove();
  }
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <ReadingListsView
        initialListId={initialListId}
        initialEntryId={null}
        onOpenBook={() => undefined}
        onFindWork={() => undefined}
      />,
    );
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function detail(): HTMLElement | null {
  return host.querySelector<HTMLElement>('[data-mode="detail"]');
}

function rows(): HTMLLIElement[] {
  return [...host.querySelectorAll<HTMLLIElement>('.rlv__row')];
}

function checkboxes(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('.rlv__row input[type="checkbox"]')];
}

function selectedIds(): string[] {
  return rows()
    .filter((row) => row.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked)
    .map((row) => row.getAttribute('data-entry-id') ?? '');
}

/**
 * Set the offset AND fire the event. The product records the scroll from the
 * container's own `onScroll`, so a bare assignment in jsdom (which fires
 * nothing) would leave the feature un-driven and the test measuring its own
 * assignment.
 */
async function scrollTo(px: number) {
  const node = detail();
  expect(node).not.toBeNull();
  await act(async () => {
    node!.scrollTop = px;
    node!.dispatchEvent(new window.Event('scroll', { bubbles: true }));
    await Promise.resolve();
  });
}

async function click(node: Element | null | undefined) {
  expect(node).toBeTruthy();
  await act(async () => {
    (node as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** The control is labelled "All lists", not "Back" — the header's first button. */
async function back() {
  const button = [...host.querySelectorAll<HTMLButtonElement>('.rlv__head button')][0];
  expect(button?.textContent).toContain('All lists');
  await click(button);
}

/** `.rlv__card` is the `<li>`; the control inside it is `.rlv__card-open`. */
async function openCard(name: string) {
  const card = [...host.querySelectorAll<HTMLButtonElement>('.rlv__card-open')].find((node) =>
    node.textContent?.includes(name),
  );
  await click(card);
}

beforeEach(() => {
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  resetReadingListsClientForTesting();
  resetReadingListReturnForTesting();

  // jsdom's `scrollTop` is a hard 0. Give it a real backing store so the
  // assertions below are about what the code writes and reads, not about a
  // layout engine that is not present.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  const previous = Object.getOwnPropertyDescriptor(proto, 'scrollTop');
  const store = new WeakMap<object, number>();
  Object.defineProperty(proto, 'scrollTop', {
    configurable: true,
    get(this: object) {
      return store.get(this) ?? 0;
    },
    set(this: object, value: number) {
      store.set(this, value);
    },
  });
  restoreScrollTop = () => {
    if (previous) Object.defineProperty(proto, 'scrollTop', previous);
    else delete proto.scrollTop;
  };
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  restoreScrollTop?.();
  restoreScrollTop = null;
  delete (window as unknown as { api?: unknown }).api;
});

describe('ReadingListsView — §11.1 "Back works"', () => {
  it('restores the scroll offset after the view has fully unmounted', async () => {
    const { document, a } = seeded();
    installBridge(document);

    await mount(a);
    expect(rows().length).toBeGreaterThan(0);
    await scrollTo(420);

    // The journey the rule is about: opening a book navigates the app away, so
    // the whole view goes. Anything held in component state is gone here.
    await mount(a);
    expect(detail()?.scrollTop).toBe(420);
  });

  it('restores the selection, and only ids that still exist', async () => {
    const { document, a } = seeded();
    installBridge(document);

    await mount(a);
    await click(checkboxes()[1]);
    await click(checkboxes()[3]);
    const ticked = selectedIds();
    expect(ticked).toHaveLength(2);

    await mount(a);
    expect(selectedIds()).toEqual(ticked);

    // A list whose entries have gone — the remembered ids name nothing, and a
    // revived phantom selection would arm the bulk bar over rows that are not
    // on screen.
    const emptied: ReadingListsDocument = {
      ...document,
      lists: document.lists.map((list) => (list.id === a ? { ...list, entries: [] } : list)),
    };
    installBridge(emptied);
    await mount(a);
    expect(selectedIds()).toEqual([]);
  });

  it('is keyed BY LIST — arriving at another list does not inherit this one', async () => {
    const { document, a } = seeded();
    installBridge(document);

    await mount(a);
    await click(checkboxes()[0]);
    await scrollTo(300);

    // In-component navigation, the other journey: back to the grid and into a
    // DIFFERENT list. The existing clearing effect is what must win here.
    await back();
    await openCard('From Ken');
    expect(selectedIds()).toEqual([]);
    expect(detail()?.scrollTop).toBe(0);

    // And going back to the first list still finds its own state.
    await back();
    await openCard('From Aya');
    expect(selectedIds()).toHaveLength(1);
    expect(detail()?.scrollTop).toBe(300);
  });

  it('restores ONCE — a later store broadcast does not re-tick a deselected row', async () => {
    const { document, a } = seeded();
    installBridge(document);

    await mount(a);
    await click(checkboxes()[1]);
    await mount(a);
    expect(selectedIds()).toHaveLength(1);

    // The user changes their mind after arriving.
    await click(checkboxes()[1]);
    expect(selectedIds()).toEqual([]);

    // Something else writes to the store — another window, the finish detector,
    // a rename. Without the once-per-arrival guard the restore effect re-runs on
    // the new document and puts the tick back, which reads as a haunted UI.
    expect(broadcast).toBeTruthy();
    await act(async () => {
      broadcast?.({
        document: { ...document, revision: document.revision + 1 },
        health: { state: 'ok', lostRevisions: 0 },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(selectedIds()).toEqual([]);
  });

  it('starts at the top for a list that was never visited', async () => {
    const { document, a, b } = seeded();
    installBridge(document);
    await mount(a);
    await scrollTo(250);
    // The control for the whole feature: a fresh list must not inherit an offset
    // from somewhere. `b` has no record, so nothing is written and it stays 0.
    await mount(b);
    expect(detail()?.scrollTop).toBe(0);
    expect(selectedIds()).toEqual([]);
  });

  it('lets a deep link to one entry win over a remembered offset', async () => {
    const { document, a } = seeded();
    installBridge(document);
    await mount(a);
    await scrollTo(380);

    // Row 8's arrival names a specific entry. Restoring an offset on top of that
    // would fight the scroll the caller explicitly asked for.
    const entryId = document.lists.find((list) => list.id === a)!.entries[4].id;
    if (root) {
      act(() => root.unmount());
      host.remove();
    }
    host = window.document.createElement('div');
    window.document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <ReadingListsView
          initialListId={a}
          initialEntryId={entryId}
          onOpenBook={() => undefined}
          onFindWork={() => undefined}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(detail()?.scrollTop).toBe(0);
  });
});
