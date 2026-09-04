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
import ReadingListsView, { readingRowRendersForTesting } from '../views/ReadingListsView';
import { resetReadingListsClientForTesting } from '../readingListsClient';
import { READING_LIST_EXAMPLE_MESSAGE } from '../../shared/readingListParser';
import { getUiLang, setUiLang } from '../i18n';
import {
  addReadingListEntry,
  bindReadingWork,
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
  setReadingEntryState,
  suggestReadingWorkBinding,
} from '../../shared/readingListMutations';
import {
  emptyReadingListsDocument,
  type ReadingEntryState,
  type ReadingListsDocument,
} from '../../shared/readingLists';
import type { LibraryItem } from '../../shared/types';

let host: HTMLDivElement;
let root: Root;
let opened: LibraryItem[];
let sought: string[];

/** The ja catalog's `readingLists.view.rowOpen`, asserted rather than "not English". */
const JA_ROW_OPEN = '開く';

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

function installBridge(
  store: FakeStore | null,
  loadFails = false,
  /** How the served document came to be. Defaults to the healthy read. */
  health: { state: string; lostRevisions: number; detectedAt?: number } = {
    state: 'ok',
    lostRevisions: 0,
  },
) {
  (window as unknown as { api?: unknown }).api = {
    listLibrary: async () => [ITEM],
    ...(store && !loadFails
      ? {
          readingListsLoad: async () => ({
            ok: true,
            snapshot: { document: store.document, health },
          }),
          readingListsWrite: store.write,
          readingListsEvents: async () => ({ ok: true, events: [] }),
          onReadingListsChanged: () => () => undefined,
        }
      : {}),
  };
}

async function render(initialListId: string | null = null, initialEntryId: string | null = null) {
  await act(async () => {
    root.render(
      <ReadingListsView
        initialListId={initialListId}
        initialEntryId={initialEntryId}
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

  /**
   * P5 §7's panel is reached from HERE, and a component that works standalone
   * while the view never renders it is the same dead route as a module with no
   * caller. So: the panel is on the grid, its presets are real, and it is NOT on
   * the detail — the detail is one list, and a question about all of them there
   * would answer about books the open list does not contain.
   */
  it('renders the smart-list panel on the grid', async () => {
    const { document } = seeded();
    installBridge(new FakeStore(document));
    await render();
    const panel = host.querySelector('[data-testid="rlv-smart-lists"]');
    expect(panel).not.toBeNull();
    expect([...panel!.querySelectorAll('.rlsm__chip')].map((n) => n.textContent)).toEqual([
      'Abandoned',
      'Ready to read',
      'Author sweep',
    ]);
  });

  /**
   * A SEPARATE mount, deliberately. `render()` re-renders the same root and the
   * view holds `listId` in state seeded from the prop, so calling it twice never
   * leaves the grid — an in-test navigation here asserted nothing and read as a
   * product defect on the first run.
   */
  it('does not render the smart-list panel on a list detail', async () => {
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);
    // The detail really is open, so the absence below is about the panel.
    expect(rows()).toHaveLength(2);
    expect(host.querySelector('[data-testid="rlv-smart-lists"]')).toBeNull();
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
    // The negative control for the two tests below: a healthy read shows NO
    // recovery notice, so the notice is not simply always rendered.
    expect(host.querySelector('[data-health]')).toBeNull();
  });

  /**
   * §11.4's *real empty states*: the no-list case is the paste box itself with
   * the §2.1 example as a hint, and neither case is a bare sentence.
   */
  describe('empty states (§11.4)', () => {
    it('makes the empty grid the paste box, not a sentence about one', async () => {
      installBridge(new FakeStore(sealReadingListsDocument(emptyReadingListsDocument())));
      await render();
      const empty = host.querySelector('[data-testid="rlv-empty-grid"]');
      expect(empty).not.toBeNull();
      // A real field for each half of the one action, in the empty state itself.
      expect(empty?.querySelector('#rlv-empty-name')).not.toBeNull();
      expect(empty?.querySelector('#rlv-empty-paste')).not.toBeNull();
      expect(host.querySelector('.rlv__grid')).toBeNull();
    });

    it('shows §2.1’s example verbatim — the same string the parser test pins', async () => {
      installBridge(new FakeStore(sealReadingListsDocument(emptyReadingListsDocument())));
      await render();
      const sample = host.querySelector<HTMLElement>('.rlv__example-text');
      // Identity, not "contains a Japanese title". If the hint and the acceptance
      // fixture ever diverge, the app is showing a sample it cannot vouch for.
      expect(sample?.textContent).toBe(READING_LIST_EXAMPLE_MESSAGE);
      expect(READING_LIST_EXAMPLE_MESSAGE).toContain('コンビニ人間');
    });

    it('fills the box from the hint, and one submit mints the list AND opens the preview', async () => {
      const store = new FakeStore(sealReadingListsDocument(emptyReadingListsDocument()));
      installBridge(store);
      await render();

      await click(byText('Try it with this'));
      const field = host.querySelector<HTMLTextAreaElement>('#rlv-empty-paste');
      expect(field?.value).toBe(READING_LIST_EXAMPLE_MESSAGE);

      // The name is required and says so, rather than silently doing nothing.
      /**
       * Queried by selector, NOT `byText`. `byText` scans `button, span, p, div`
       * in document order and `.rlv__paste-actions` wraps exactly this one
       * button — so once the "needs a name" span disappears the DIV's trimmed
       * text is also "Read the message" and `byText` returns the wrapper.
       * Clicking a div does nothing, silently, and the test reads as a product
       * defect. Measured: it returned `tag: "DIV"`.
       */
      const submit = () =>
        host.querySelector<HTMLButtonElement>('[data-testid="rlv-empty-grid"] .rlv__paste-actions button');
      expect(host.textContent).toContain('Give the list a name first');
      expect(submit()?.disabled).toBe(true);

      await typeInto(host.querySelector<HTMLInputElement>('#rlv-empty-name'), 'From a friend');
      expect(submit()?.disabled).toBe(false);
      await click(submit());

      // One write created the list...
      expect(store.writes).toBe(1);
      expect(store.document.lists).toHaveLength(1);
      expect(store.document.lists[0]?.name).toBe('From a friend');
      // ...and the surface is now inside it with the preview sheet standing, so
      // the user reaches triage in one action rather than create-then-find-paste.
      expect(host.querySelector('[data-mode="detail"]')).not.toBeNull();
      expect(host.querySelector('.rl-preview')).not.toBeNull();
    });

    it('never shows a bare “No items”, and offers a route out of an empty list', async () => {
      const context = createReadingListsMutationContext(1_700_000_000_000);
      const made = createReadingList(emptyReadingListsDocument(), { name: 'Empty' }, context);
      installBridge(new FakeStore(sealReadingListsDocument(made.document)));
      await render(made.listId);
      const empty = host.querySelector<HTMLElement>('[data-testid="rlv-empty-list"]');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain('Nothing in this list yet');
      // The route is a real control that opens the paste form, not prose — and
      // it is the EMPTY STATE's own button, not the one in the header, which
      // `byText` would have matched first because it comes earlier in the DOM.
      await click(empty?.querySelector('.rlv__paste-actions button') ?? null);
      expect(host.querySelector('#rlv-paste')).not.toBeNull();
    });

    /**
     * Replaces "does not advertise a library route the app cannot perform yet",
     * deleted in the commit that built the route. The clause's copy reads
     * "paste a message or add from your library" and now BOTH halves are real
     * controls in the empty block, not prose pointing at the header.
     */
    it('offers both of the clause’s routes, as controls, from the empty list', async () => {
      const context = createReadingListsMutationContext(1_700_000_000_000);
      const made = createReadingList(emptyReadingListsDocument(), { name: 'Empty' }, context);
      installBridge(new FakeStore(sealReadingListsDocument(made.document)));
      await render(made.listId);
      const buttons = [
        ...(host
          .querySelector('[data-testid="rlv-empty-list"]')
          ?.querySelectorAll<HTMLButtonElement>('.rlv__paste-actions button') ?? []),
      ].map((button) => button.textContent?.trim());
      expect(buttons).toEqual(['Paste a message', 'Add from library']);
    });
  });

  /**
   * §11.4's "or add from your library" — the route that did not exist until the
   * commit adding these. `addReadingListEntry` had no renderer caller outside
   * the paste flow, so a book already in the library could not be put on a list
   * at all.
   */
  describe('adding from the library (§11.4)', () => {
    async function openPicker() {
      const context = createReadingListsMutationContext(1_700_000_000_000);
      const made = createReadingList(emptyReadingListsDocument(), { name: 'Mine' }, context);
      const store = new FakeStore(sealReadingListsDocument(made.document));
      installBridge(store);
      await render(made.listId);
      await click(
        host
          .querySelector('[data-testid="rlv-empty-list"]')
          ?.querySelectorAll('.rlv__paste-actions button')[1] ?? null,
      );
      return store;
    }

    function pickerItems(): HTMLButtonElement[] {
      return [...host.querySelectorAll<HTMLButtonElement>('.rlv__picker-item')];
    }

    it('puts the picked book on the list, owned and bound to the real item', async () => {
      const store = await openPicker();
      expect(host.querySelector('[data-testid="rlv-library-picker"]')).not.toBeNull();
      expect(pickerItems().map((button) => button.textContent?.trim())).toEqual(['Kino no Tabi']);

      await click(pickerItems()[0]);
      expect(store.writes).toBe(1);
      const list = store.document.lists[0];
      expect(list?.entries).toHaveLength(1);
      // `owned`, because the file is on disk — not `wanted`, which is the state
      // that routes a row to acquisition. Promoted by the bind, not set here.
      expect(list?.entries[0]?.state).toBe('owned');
      const work = store.document.works.find((w) => w.id === list?.entries[0]?.workId);
      expect(work?.boundItemIds).toEqual([ITEM.id]);
      expect(work?.bindConfidence).toBe(1);
    });

    it('opens the added row at the library item, not at acquisition', async () => {
      await openPicker();
      await click(pickerItems()[0]);
      // The row is now in the list; §11.1 says it must go somewhere real, and a
      // bound row goes to the item. This is the whole point of binding on add.
      await click(host.querySelector('.rlv__row-open'));
      expect(opened.map((item) => item.id)).toEqual([ITEM.id]);
      expect(sought).toEqual([]);
    });

    it('offers an undo that takes it back off', async () => {
      const store = await openPicker();
      await click(pickerItems()[0]);
      expect(host.querySelector('.rlv__notice--undo')?.textContent).toContain('Kino no Tabi');
      await click(byText('Undo'));
      expect(store.document.lists[0]?.entries).toEqual([]);
    });

    it('shows a book already on the list, disabled and marked, rather than hiding it', async () => {
      await openPicker();
      await click(pickerItems()[0]);
      // Still listed — hiding it reads as the library being incomplete and the
      // user goes looking for it.
      const [item] = pickerItems();
      expect(item?.disabled).toBe(true);
      expect(item?.textContent).toContain('already here');
    });

    it('says how many of the library it is showing, and answers an empty filter', async () => {
      await openPicker();
      expect(host.querySelector('.rlv__picker-count')?.textContent).toBe('Showing 1 of 1.');
      await typeInto(host.querySelector<HTMLInputElement>('#rlv-pick'), 'zzz');
      expect(pickerItems()).toHaveLength(0);
      expect(host.textContent).toContain('Nothing in your library matches');
      // A filter that matches nothing is NOT the same message as a library that
      // has nothing, and the surface must not conflate them.
      expect(host.textContent).not.toContain('Your library is empty');
    });
  });

  /**
   * §11.4's *a corrupt store shows what happened, it does not silently show
   * zero lists*.
   *
   * `reset` is the case that makes this a defect rather than a nicety: main
   * hands back `emptyReadingListsDocument()`, byte-identical to a first run's,
   * so the ONLY thing separating "you have no lists yet" from "your lists are
   * gone" is the health record — which the view discarded before this.
   */
  describe('store health (§11.4)', () => {
    const EMPTY = () => new FakeStore(sealReadingListsDocument(emptyReadingListsDocument()));

    it('does not let a reset store read as a first run', async () => {
      installBridge(EMPTY(), false, { state: 'reset', lostRevisions: 0, detectedAt: 7 });
      await render();
      const notice = host.querySelector<HTMLElement>('[data-health="reset"]');
      expect(notice).not.toBeNull();
      expect(notice?.getAttribute('role')).toBe('alert');
      expect(notice?.textContent).toContain('could not be read');
      // It says the unreadable file survives, because that is the user's only
      // route back to it and deleting it is what they will assume happened.
      expect(notice?.textContent).toContain('still on disk');
    });

    it('tells a recovered store apart from a reset one, and does not call it danger', async () => {
      const { document } = seeded();
      installBridge(new FakeStore(document), false, {
        state: 'recovered',
        lostRevisions: 1,
        detectedAt: 9,
      });
      await render();
      const notice = host.querySelector<HTMLElement>('[data-health="recovered"]');
      expect(notice).not.toBeNull();
      expect(notice?.className).toContain('rlv__notice--warn');
      expect(notice?.className).not.toContain('rlv__notice--error');
      // The lists it recovered are real and still drawn — this is a warning
      // over a working surface, not a replacement for it.
      expect(host.querySelector('.rlv__grid')).not.toBeNull();
      // `lostRevisions` is documented as unknown-but-at-least-one, so no count
      // is printed. Asserting the absence keeps a later "helpful" edit honest.
      expect(notice?.textContent).not.toContain('1 ');
    });

    it('stays dismissed once dismissed', async () => {
      installBridge(EMPTY(), false, { state: 'reset', lostRevisions: 0, detectedAt: 7 });
      await render();
      await click(byText('Dismiss'));
      expect(host.querySelector('[data-health]')).toBeNull();
    });
  });

  it('draws skeleton cards while the store is loading, and only until it answers', async () => {
    let release: ((value: unknown) => void) | null = null;
    const store = new FakeStore(seeded().document);
    (window as unknown as { api?: unknown }).api = {
      listLibrary: async () => [ITEM],
      readingListsLoad: () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              snapshot: { document: store.document, health: { state: 'ok', lostRevisions: 0 } },
            });
        }),
      readingListsWrite: store.write,
      readingListsEvents: async () => ({ ok: true, events: [] }),
      onReadingListsChanged: () => () => undefined,
    };
    await render();

    const skeleton = host.querySelector('[data-testid="rlv-skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.querySelectorAll('.rlv__skeleton-card')).toHaveLength(6);
    // Placeholders are hidden from assistive tech; the status text is what a
    // screen reader gets, and it is a real sentence rather than six empty cards.
    expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Loading');
    // A skeleton is not an error and is not an empty state.
    expect(host.querySelector('.rlv__state--error')).toBeNull();
    expect(host.textContent).not.toContain('No lists yet');

    await act(async () => {
      (release as unknown as (value: unknown) => void)(null);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.querySelector('[data-testid="rlv-skeleton"]')).toBeNull();
    expect(host.querySelector('.rlv__grid')).not.toBeNull();
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

    it('does not re-render 500 rows when ONE entry changes state', async () => {
      /*
        §11.4: "A 500-entry list scrolls without jank; the list view must not
        re-render every row when one entry's state changes."

        The second clause is the cause of the first, and it is the one that can be
        measured deterministically. A frame-time assertion in jsdom would be noise;
        a render count is the mechanism, so that is what this asserts. What it does
        NOT claim is a painted frame budget — nothing here has been on a screen.
      */
      const base = seeded();
      let current = base.document;
      for (let index = 0; index < 498; index += 1) {
        current = addReadingListEntry(
          current,
          base.listId,
          { title: `Book ${index}` },
          createReadingListsMutationContext(1_700_000_100_000 + index),
        ).document;
      }
      const store = new FakeStore(sealReadingListsDocument(current));
      installBridge(store);
      await render(base.listId);
      expect(rows()).toHaveLength(500);

      const before = readingRowRendersForTesting();
      const select = rows()[7].querySelector<HTMLSelectElement>('.rlv__row-state');
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          'value',
        )?.set;
        setter?.call(select, 'finished');
        select?.dispatchEvent(new window.Event('change', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(rows()[7].getAttribute('data-state')).toBe('finished');
      // One row moved, so one row repaints. Not 500.
      expect(readingRowRendersForTesting() - before).toBe(1);
    });

    it('repaints memoized rows on a language switch, which `t` alone cannot do', async () => {
      /*
        The trap CLAUDE.md names as the #1 review item for new i18n code, here in
        its memo form: `t`'s identity is STABLE by design, so a shallow-compared
        row that took `t` alone would keep English forever after a switch —
        silently, with no error and no failing key-count gate. The `lang` prop is
        unused in the row body and exists only to break that tie; this is the test
        that makes it load-bearing rather than decorative.
      */
      const { document, listId } = seeded();
      installBridge(new FakeStore(document));
      await render(listId);
      const label = () => rows()[0].querySelector('.rlv__row-where')?.textContent;
      expect(label()).toBe('Open');

      const before = readingRowRendersForTesting();
      try {
        await act(async () => {
          setUiLang('ja');
          // The catalog is a dynamic import of a 12,000-key module, so this waits
          // on the switch actually LANDING rather than on a fixed number of turns.
          // A fixed six microtask turns read 0 repaints on a correct component and
          // looked exactly like the defect this test is for.
          for (let turn = 0; turn < 200 && getUiLang() !== 'ja'; turn += 1) {
            await new Promise((done) => setTimeout(done, 5));
          }
          expect(getUiLang()).toBe('ja');
        });

        expect(readingRowRendersForTesting() - before).toBe(rows().length);
        expect(label()).toBe(JA_ROW_OPEN);
      } finally {
        // `finally`, because the language is module state shared by every test in
        // this file: leaving it on ja after a failure fails the NEXT test too, and
        // a mutation control then reads two RED where one is real.
        await act(async () => {
          setUiLang('en');
          for (let turn = 0; turn < 200 && getUiLang() !== 'en'; turn += 1) {
            await new Promise((done) => setTimeout(done, 5));
          }
        });
      }
      expect(label()).toBe('Open');
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

/**
 * §11.4's density row, on the real component.
 *
 * `readingListsDensity.test.ts` proves the preference round-trips and that the
 * stylesheet touches no hit target. What only the mounted view can prove is the
 * three things that make it a feature rather than a stored string: the
 * attribute the sheet selects on is actually on the surface, the control moves
 * it, and it is the SAME preference in the grid and in a list — a mode that
 * applied to only half the surface reads as a bug the first time you go back.
 */
describe('ReadingListsView — density (§11.4)', () => {
  function surface(): HTMLElement | null {
    return host.querySelector<HTMLElement>('.rlv');
  }

  function densitySelect(): HTMLSelectElement {
    const found = [...host.querySelectorAll<HTMLSelectElement>('select')].find(
      (node) => node.getAttribute('aria-label') === 'Density',
    );
    expect(found, 'no control labelled Density').toBeTruthy();
    return found as HTMLSelectElement;
  }

  async function choose(node: HTMLSelectElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )?.set;
    await act(async () => {
      setter?.call(node, value);
      node.dispatchEvent(new window.Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    window.localStorage.removeItem('jp-reading-lists-density-v1');
  });

  it('marks the surface with the mode the stylesheet selects on', async () => {
    const { document } = seeded();
    installBridge(new FakeStore(document));
    await render();

    // Not "some attribute": the exact one `[data-density='compact']` matches.
    expect(surface()?.getAttribute('data-density')).toBe('comfortable');
    await choose(densitySelect(), 'compact');
    expect(surface()?.getAttribute('data-density')).toBe('compact');
  });

  it('offers the control in the detail view too, over the same preference', async () => {
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);

    await choose(densitySelect(), 'compact');
    expect(surface()?.getAttribute('data-density')).toBe('compact');

    // Back to the grid. The grid must not be comfortable while the list it came
    // from is compact — one preference, one surface. A `button`-only lookup,
    // never `byText`: that helper scans `div` too and returns the wrapper.
    await click(
      [...host.querySelectorAll('button')].find(
        (node) => node.textContent?.trim() === 'All lists',
      ) ?? null,
    );
    expect(surface()?.getAttribute('data-mode')).toBe('grid');
    expect(surface()?.getAttribute('data-density')).toBe('compact');
  });

  it('survives a remount, which is the only reason it is persisted at all', async () => {
    const { document } = seeded();
    installBridge(new FakeStore(document));
    await render();
    await choose(densitySelect(), 'compact');

    await act(async () => root.unmount());
    root = createRoot(host);
    resetReadingListsClientForTesting();
    installBridge(new FakeStore(seeded().document));
    await render();

    expect(surface()?.getAttribute('data-density')).toBe('compact');
    expect(densitySelect().value).toBe('compact');
  });

  it('does not touch the rows themselves — compact is a stylesheet, not a filter', async () => {
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);

    const before = rows().length;
    await choose(densitySelect(), 'compact');
    // The trap this catches is a "compact" that hides secondary rows to look
    // denser. Two entries seeded, two entries visible, in both modes.
    expect(rows()).toHaveLength(before);
    expect(host.textContent).toContain('Kino no Tabi');
    expect(host.textContent).toContain('コンビニ人間');
  });
});

/**
 * §11.4's drag-and-drop reorder, driven on the real component.
 *
 * `reorderEntryIds` has its own suite in `shared/__tests__/readingListViews`;
 * what only the mounted view can prove is that the gesture reaches it, that the
 * order handed to the mutation is the WHOLE list rather than the filtered view,
 * that the keyboard path exists at all, and that it undoes.
 *
 * TRAP: jsdom implements no `DataTransfer`. `event.dataTransfer` is `undefined`
 * on every synthetic drag event, so a payload put there is unreadable and a
 * feature built on it cannot be driven from a test at all. The dragged id is
 * held in the view; `setData` is called only where it exists.
 */
describe('ReadingListsView — reorder (§11.4)', () => {
  function seededFour(
    entryTitles: string[] = ['Alpha', 'Bravo', 'Charlie', 'Delta'],
  ): { document: ReadingListsDocument; listId: string } {
    let current = emptyReadingListsDocument();
    const created = createReadingList(
      current,
      { name: 'Ordered' },
      createReadingListsMutationContext(1_700_000_000_000),
    );
    current = created.document;
    for (const title of entryTitles) {
      current = addReadingListEntry(
        current,
        created.listId,
        { title },
        createReadingListsMutationContext(1_700_000_000_010),
      ).document;
    }
    return { document: sealReadingListsDocument(current), listId: created.listId };
  }

  function titles(): string[] {
    return rows().map((row) => row.querySelector('.rlv__row-title')?.textContent ?? '');
  }

  /** A drag from one row onto another, in the three events the view listens for. */
  async function dragRowOnto(from: number, to: number) {
    const source = rows()[from];
    const target = rows()[to];
    expect(source, `no row at ${from}`).toBeTruthy();
    expect(target, `no row at ${to}`).toBeTruthy();
    await act(async () => {
      source.dispatchEvent(new window.Event('dragstart', { bubbles: true }));
      target.dispatchEvent(new window.Event('dragover', { bubbles: true, cancelable: true }));
      target.dispatchEvent(new window.Event('drop', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('moves a dragged row down, landing it AFTER the row it was dropped on', async () => {
    const { document, listId } = seededFour();
    installBridge(new FakeStore(document));
    await render(listId);
    expect(titles()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);

    await dragRowOnto(0, 2);
    expect(titles()).toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta']);
  });

  it('moves a dragged row up, landing it BEFORE the row it was dropped on', async () => {
    const { document, listId } = seededFour();
    installBridge(new FakeStore(document));
    await render(listId);

    await dragRowOnto(3, 1);
    expect(titles()).toEqual(['Alpha', 'Delta', 'Bravo', 'Charlie']);
  });

  it('cancels dragover, which is the only thing that allows the drop at all', async () => {
    // MEASURED, not assumed: jsdom implements none of the HTML drag-and-drop
    // model, so a synthetic `drop` fires whether or not `dragover` was
    // cancelled — deleting the `preventDefault` leaves every other test in this
    // block green while the feature is dead in the real app. `defaultPrevented`
    // on the dispatched event is the one fact jsdom does report, so it is what
    // is asserted, and the negative half (no drag in progress → not cancelled)
    // ships with it.
    const { document, listId } = seededFour();
    installBridge(new FakeStore(document));
    await render(listId);

    const idle = new window.Event('dragover', { bubbles: true, cancelable: true });
    await act(async () => {
      rows()[1].dispatchEvent(idle);
      await Promise.resolve();
    });
    expect(idle.defaultPrevented).toBe(false);

    const during = new window.Event('dragover', { bubbles: true, cancelable: true });
    await act(async () => {
      rows()[0].dispatchEvent(new window.Event('dragstart', { bubbles: true }));
      rows()[1].dispatchEvent(during);
      await Promise.resolve();
    });
    expect(during.defaultPrevented).toBe(true);
  });

  it('writes nothing when a row is dropped on itself', async () => {
    const { document, listId } = seededFour();
    const store = new FakeStore(document);
    installBridge(store);
    await render(listId);

    const before = store.writes;
    await dragRowOnto(1, 1);
    expect(store.writes).toBe(before);
    expect(titles()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('reorders from the keyboard, because a drag-only reorder is unreachable', async () => {
    const { document, listId } = seededFour();
    installBridge(new FakeStore(document));
    await render(listId);

    const open = rows()[2].querySelector('.rlv__row-open');
    await act(async () => {
      open?.dispatchEvent(
        new window.KeyboardEvent('keydown', {
          key: 'ArrowUp',
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(titles()).toEqual(['Alpha', 'Charlie', 'Bravo', 'Delta']);
  });

  it('leaves a filtered-out entry where it was, instead of appending it', async () => {
    // THE reason the write is computed over `rows` and not `visibleRows`.
    // `reorderReadingListEntries` appends every id the caller omitted, so a
    // reorder computed from the filtered view would silently move Bravo and
    // Delta to the end of the list — invisibly, because they are filtered out.
    const { document, listId } = seededFour([
      'Keep One',
      'Skip Two',
      'Keep Three',
      'Skip Four',
    ]);
    installBridge(new FakeStore(document));
    await render(listId);

    await typeInto(filterField(), 'keep');
    expect(titles()).toEqual(['Keep One', 'Keep Three']);

    // "Keep One" moves DOWN past a hidden row onto "Keep Three".
    await dragRowOnto(0, 1);
    expect(titles()).toEqual(['Keep Three', 'Keep One']);

    await typeInto(filterField(), '');
    // Computed over the full order, "Keep One" lands immediately after "Keep
    // Three" and the two hidden rows keep their own places.
    //
    // Computed over the FILTERED order it would be ['Keep Three', 'Keep One']
    // plus the two omitted ids appended, i.e. Skip Two would jump from
    // position 2 to position 3 — invisibly, because it is filtered out. That is
    // the discriminating difference and it is why this assertion exists.
    expect(titles()).toEqual(['Skip Two', 'Keep Three', 'Keep One', 'Skip Four']);
  });

  it('undoes back to the exact order it started in', async () => {
    const { document, listId } = seededFour();
    installBridge(new FakeStore(document));
    await render(listId);

    await dragRowOnto(0, 3);
    expect(titles()).toEqual(['Bravo', 'Charlie', 'Delta', 'Alpha']);

    await click(
      [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Undo') ??
        null,
    );
    expect(titles()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });
});

/**
 * §11.4's drag-and-drop remainder: an entry BETWEEN lists, a library item onto
 * a list, and a `.txt` onto the view.
 *
 * All three ride `dataTransfer`, which jsdom does not implement at all — so
 * every event below is dispatched with a HAND-BUILT transfer whose `types`,
 * `getData` and `files` behave the way the HTML model says they do at the
 * moment the event fires. That is the point rather than a shortcut: the guards
 * under test are written against `types` precisely because `getData` is
 * specified to return the empty string during `dragover`, and a test that let
 * `getData` answer during dragover would validate a guard that cannot work in
 * Chromium.
 */
describe('ReadingListsView — drops (§11.4)', () => {
  /**
   * A transfer in the mode the spec calls *protected*: `types` is readable,
   * `getData` returns the empty string, `files` is empty. This is what a
   * `dragover` handler really sees in a browser.
   */
  function protectedTransfer(types: string[]): DataTransfer {
    return { types, getData: () => '', files: [] } as unknown as DataTransfer;
  }

  /** A transfer in read/write mode — what a `drop` handler really sees. */
  function readableTransfer(data: Record<string, string>, files: unknown[] = []): DataTransfer {
    return {
      types: [...Object.keys(data), ...(files.length ? ['Files'] : [])],
      getData: (type: string) => data[type] ?? '',
      files,
      setData: () => undefined,
    } as unknown as DataTransfer;
  }

  /** A stand-in for a dropped `File`: `name` plus the `Blob.text()` the view uses. */
  function droppedFile(name: string, text: string | null): unknown {
    return { name, text: async () => (text === null ? Promise.reject(new Error('io')) : text) };
  }

  async function fire(
    node: Element | null,
    type: 'dragover' | 'drop',
    transfer: DataTransfer,
  ): Promise<Event> {
    expect(node, 'no node to dispatch ' + type + ' on').toBeTruthy();
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    await act(async () => {
      node?.dispatchEvent(event);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    return event;
  }

  /** Two lists, three entries in the first — a real cross-list move needs both. */
  function twoLists(): { document: ReadingListsDocument; from: string; to: string } {
    let current = emptyReadingListsDocument();
    const a = createReadingList(
      current,
      { name: 'Reading now' },
      createReadingListsMutationContext(1_700_000_000_000),
    );
    current = a.document;
    const b = createReadingList(
      current,
      { name: 'Someday' },
      createReadingListsMutationContext(1_700_000_000_001),
    );
    current = b.document;
    for (const title of ['Alpha', 'Bravo', 'Charlie']) {
      current = addReadingListEntry(
        current,
        a.listId,
        { title },
        createReadingListsMutationContext(1_700_000_000_010),
      ).document;
    }
    return { document: sealReadingListsDocument(current), from: a.listId, to: b.listId };
  }

  function rowTitles(): string[] {
    return rows().map((row) => row.querySelector('.rlv__row-title')?.textContent ?? '');
  }

  function rail(): HTMLElement | null {
    return host.querySelector<HTMLElement>('[data-testid="rlv-droprail"]');
  }

  function railTarget(listId: string): HTMLElement | null {
    return (
      [...host.querySelectorAll<HTMLElement>('.rlv__droprail-target')].find(
        (node) => node.dataset.listId === listId,
      ) ?? null
    );
  }

  function cards(): HTMLLIElement[] {
    return [...host.querySelectorAll<HTMLLIElement>('.rlv__card')];
  }

  function dropNote(): string {
    return (
      host.querySelector<HTMLElement>('[data-testid="rlv-drop-note"] span')?.textContent?.trim() ??
      ''
    );
  }

  async function startRowDrag(index: number) {
    await act(async () => {
      rows()[index].dispatchEvent(new window.Event('dragstart', { bubbles: true }));
      await Promise.resolve();
    });
  }

  async function endRowDrag(index: number) {
    await act(async () => {
      rows()[index].dispatchEvent(new window.Event('dragend', { bubbles: true }));
      await Promise.resolve();
    });
  }

  it('has no move rail at rest — it exists only for the length of the drag', async () => {
    const { document, from, to } = twoLists();
    installBridge(new FakeStore(document));
    await render(from);

    // The vacuity check for every assertion below: if the rail were always
    // mounted, "the rail appeared on dragstart" would be true of nothing.
    expect(rail()).toBeNull();

    await startRowDrag(0);
    expect(rail()).not.toBeNull();
    expect(railTarget(to)?.textContent).toBe('Someday');
    // The list you are IN is never a destination for its own entry.
    expect(railTarget(from)).toBeNull();

    await endRowDrag(0);
    expect(rail()).toBeNull();
  });

  it('moves an entry to another list when it is dropped on that list, and undoes it', async () => {
    const { document, from, to } = twoLists();
    const store = new FakeStore(document);
    installBridge(store);
    await render(from);
    expect(rowTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);

    await startRowDrag(1);
    await fire(railTarget(to), 'drop', readableTransfer({}));

    expect(rowTitles()).toEqual(['Alpha', 'Charlie']);
    expect(store.document.lists.find((entry) => entry.id === to)?.entries).toHaveLength(1);

    // Undo, because §11.4 says every destructive action leaves one, and a move
    // out of the list the user is looking at is destructive from where they sit.
    await click(
      [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Undo') ??
        null,
    );
    expect(rowTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(store.document.lists.find((entry) => entry.id === to)?.entries).toHaveLength(0);
  });

  it('cancels dragover on a rail target only while a row is actually being dragged', async () => {
    const { document, from, to } = twoLists();
    installBridge(new FakeStore(document));
    await render(from);

    await startRowDrag(0);
    const target = railTarget(to);
    const during = await fire(target, 'dragover', protectedTransfer([]));
    expect(during.defaultPrevented).toBe(true);

    // The negative half, and it is the ONLY honest one: jsdom fires `drop`
    // whether or not `dragover` was cancelled, so asserting "the row did not
    // move" would pass with the guard deleted. `defaultPrevented` is the single
    // fact jsdom does report about the drag model.
    await endRowDrag(0);
    const after = new window.Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(after, 'dataTransfer', { value: protectedTransfer([]) });
    await act(async () => {
      target?.dispatchEvent(after);
      await Promise.resolve();
    });
    expect(after.defaultPrevented).toBe(false);
  });

  it('mounts the rail without re-rendering a single row', async () => {
    // §11.4's performance row, and the reason the dragged id stayed in a ref
    // while only the rail's visibility went into state. If `ReadingRow`'s memo
    // were broken by this change, dragstart would repaint every row.
    const { document, from } = twoLists();
    installBridge(new FakeStore(document));
    await render(from);

    const before = readingRowRendersForTesting();
    await startRowDrag(0);
    expect(rail()).not.toBeNull();
    expect(readingRowRendersForTesting() - before).toBe(0);
  });

  it('adds a library book dropped onto a list card, and says so when the book is gone', async () => {
    const { document, to } = twoLists();
    const store = new FakeStore(document);
    installBridge(store);
    await render(null);

    const card = cards().find((node) => node.dataset.listId === to) ?? null;
    const dropped = await fire(card, 'drop', readableTransfer({ 'app/lib-item': ITEM.id }));
    expect(dropped.defaultPrevented).toBe(true);

    const entries = store.document.lists.find((entry) => entry.id === to)?.entries ?? [];
    expect(entries).toHaveLength(1);
    const work = store.document.works.find((candidate) => candidate.id === entries[0]?.workId);
    expect(work?.titleRaw).toBe(ITEM.title);
    // BOUND, not merely titled the same. `addLibraryItemToReadingList` binds at
    // confidence 1 through `boundItemIds`; a row that only carried the title
    // would still need §3's matcher to find its own book back.
    expect(work?.boundItemIds).toContain(ITEM.id);

    // An id the library no longer has is a real state — the library loads
    // independently of this view and a drag outlives a refresh.
    const writesBefore = store.writes;
    await fire(card, 'drop', readableTransfer({ 'app/lib-item': 'item-vanished' }));
    expect(dropNote()).toBe('That book is no longer in the library, so it was not added.');
    expect(store.writes).toBe(writesBefore);
  });

  it('cancels dragover on a card for a library item and for nothing else', async () => {
    const { document, to } = twoLists();
    installBridge(new FakeStore(document));
    await render(null);
    const card = cards().find((node) => node.dataset.listId === to) ?? null;

    const good = await fire(card, 'dragover', protectedTransfer(['app/lib-item']));
    expect(good.defaultPrevented).toBe(true);

    // `text/plain` is what a text-selection drag carries. Accepting it would
    // make every card a target for every stray drag in the shell.
    const bad = await fire(card, 'dragover', protectedTransfer(['text/plain']));
    expect(bad.defaultPrevented).toBe(false);
  });

  it('opens the preview for a .txt dropped on an open list rather than importing it unseen', async () => {
    const { document, from } = twoLists();
    const store = new FakeStore(document);
    installBridge(store);
    await render(from);

    const writesBefore = store.writes;
    const event = await fire(
      host.querySelector('.rlv[data-mode="detail"]'),
      'drop',
      readableTransfer({}, [droppedFile('friend.txt', '1. Delta\n2. Echo\n')]),
    );
    expect(event.defaultPrevented).toBe(true);

    // §2.5 makes the preview mandatory for a paste, and a dropped file is a
    // paste through a different door. Nothing may be written before it is seen:
    // the list still holds its three rows and the store took no write.
    expect(store.writes).toBe(writesBefore);
    expect(rowTitles()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    // The file's own titles are what the preview is showing, not a stale paste.
    const preview = host.querySelector('[data-testid="rlv-preview"], .rlpf') ?? host;
    expect(preview.textContent).toContain('Delta');
    expect(preview.textContent).toContain('Echo');
  });

  it('names the new list after the dropped file when there is no list open', async () => {
    const store = new FakeStore(sealReadingListsDocument(emptyReadingListsDocument()));
    installBridge(store);
    await render(null);

    await fire(
      host.querySelector('.rlv[data-mode="grid"]'),
      'drop',
      readableTransfer({}, [droppedFile('Books from Mika.txt', 'Alpha\nBravo\n')]),
    );

    // The file name is the only name the gesture carries; inventing "Untitled"
    // would throw it away.
    expect(store.document.lists.map((entry) => entry.name)).toEqual(['Books from Mika']);
  });

  it('refuses a file that is not text, an unreadable one and an empty one, in words', async () => {
    const { document, from } = twoLists();
    const store = new FakeStore(document);
    installBridge(store);
    await render(from);
    const surface = () => host.querySelector('.rlv[data-mode="detail"]');
    const writesBefore = store.writes;

    await fire(surface(), 'drop', readableTransfer({}, [droppedFile('cover.png', 'binary')]));
    expect(dropNote()).toBe('Only .txt and .md files can be imported here.');

    await fire(surface(), 'drop', readableTransfer({}, [droppedFile('gone.txt', null)]));
    expect(dropNote()).toBe('That file could not be read, so nothing was imported.');

    await fire(surface(), 'drop', readableTransfer({}, [droppedFile('blank.txt', '   \n')]));
    expect(dropNote()).toBe('That file was empty, so there was nothing to import.');

    expect(store.writes).toBe(writesBefore);
  });

  it('cancels dragover on the surface for Files and not for a plain text drag', async () => {
    const { document, from } = twoLists();
    installBridge(new FakeStore(document));
    await render(from);
    const surface = host.querySelector('.rlv[data-mode="detail"]');

    const files = await fire(surface, 'dragover', protectedTransfer(['Files']));
    expect(files.defaultPrevented).toBe(true);

    const plain = await fire(surface, 'dragover', protectedTransfer(['text/plain']));
    expect(plain.defaultPrevented).toBe(false);
  });
});

/**
 * §11.1's click-through table, the two rows nothing named until now: *"an entry,
 * bound, never started → the reader at the start, and the entry flips
 * `owned → reading`"*, and *"a source-message chip → the original paste, with
 * the producing line highlighted"*.
 *
 * Rows 1, 3 and 5 of that table (bound → reader, `wanted` → acquisition, card →
 * detail) are already asserted above and in `shared/__tests__/readingListViews`.
 */
describe('ReadingListsView — §11.1 click-through', () => {
  /** One list, one entry bound to `ITEM`, in whatever state the caller names. */
  function boundIn(state: ReadingEntryState): { document: ReadingListsDocument; listId: string } {
    const context = createReadingListsMutationContext(1_700_000_000_000);
    const created = createReadingList(emptyReadingListsDocument(), { name: 'Shelf' }, context);
    const added = addReadingListEntry(
      created.document,
      created.listId,
      { title: ITEM.title },
      createReadingListsMutationContext(1_700_000_000_001),
    );
    const entry = added.document.lists[0].entries[0];
    let current = bindReadingWork(
      added.document,
      entry.workId,
      ITEM.id,
      1,
      createReadingListsMutationContext(1_700_000_000_002),
    ).document;
    current = setReadingEntryState(
      current,
      created.listId,
      entry.id,
      state,
      createReadingListsMutationContext(1_700_000_000_003),
    ).document;
    return { document: sealReadingListsDocument(current), listId: created.listId };
  }

  function stateOf(store: FakeStore): string {
    return store.document.lists[0].entries[0].state;
  }

  async function openFirstRow() {
    await click(host.querySelector('.rlv__row-open'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('flips a bound entry from owned to reading when it is opened', async () => {
    const { document, listId } = boundIn('owned');
    const store = new FakeStore(document);
    installBridge(store);
    await render(listId);
    expect(stateOf(store)).toBe('owned');

    await openFirstRow();

    // Both halves: the reader really opened, AND the shelf copy is now being read.
    expect(opened.map((item) => item.id)).toEqual([ITEM.id]);
    expect(stateOf(store)).toBe('reading');
  });

  it('does not overwrite a state the user chose on purpose', async () => {
    // The promotion is written ONLY from `owned`. `finished`, `abandoned` and
    // `skipped` are decisions; opening an abandoned book to check one line is
    // not a decision to resume it, and `reading` is already right.
    for (const state of ['reading', 'finished', 'abandoned', 'skipped'] as const) {
      const { document, listId } = boundIn(state);
      const store = new FakeStore(document);
      installBridge(store);
      await render(listId);
      const writesBefore = store.writes;

      await openFirstRow();

      expect(opened.length, `the reader did not open from ${state}`).toBeGreaterThan(0);
      expect(stateOf(store), `${state} was overwritten`).toBe(state);
      expect(store.writes, `${state} cost a write`).toBe(writesBefore);
      opened.length = 0;
    }
  });

  it('shows the pasted message with the producing line marked, and no chip without one', async () => {
    // The whole reason the highlight is derived from `lineIndex` and not by
    // matching the raw line back: this message names the same title twice.
    const raw = ['from mika:', 'Kino no Tabi', 'something else', 'Kino no Tabi'].join('\n');
    const context = createReadingListsMutationContext(1_700_000_000_000);
    const current = createReadingList(emptyReadingListsDocument(), { name: 'From Mika' }, context);
    const listId = current.listId;
    const added = addReadingListEntry(
      current.document,
      listId,
      { title: 'Kino no Tabi' },
      createReadingListsMutationContext(1_700_000_000_001),
    );
    const plain = addReadingListEntry(
      added.document,
      listId,
      { title: 'Typed by hand' },
      createReadingListsMutationContext(1_700_000_000_002),
    );
    // The provenance §1 stores at import time, written directly so the test
    // does not depend on the paste flow's own shape.
    const doc = plain.document;
    const list = doc.lists[0];
    const seeded: ReadingListsDocument = sealReadingListsDocument({
      ...doc,
      lists: [
        {
          ...list,
          imports: [
            {
              id: 'imp1',
              rawText: raw,
              pastedAt: 1_700_000_000_000,
              parserVersion: 'test',
              entryIds: [list.entries[0].id],
            },
          ],
          entries: [
            {
              ...list.entries[0],
              sourceRef: { importId: 'imp1', lineIndex: 3, rawLine: 'Kino no Tabi' },
            },
            list.entries[1],
          ],
        },
      ],
    });

    installBridge(new FakeStore(seeded));
    await render(listId);

    // The chip exists only where a source does — a hand-typed row has none.
    const chips = [...host.querySelectorAll('.rlv__row-source')];
    expect(chips).toHaveLength(1);
    expect(rows()[0].querySelector('.rlv__row-source')).not.toBeNull();
    expect(rows()[1].querySelector('.rlv__row-source')).toBeNull();
    expect(host.querySelector('[data-testid="rlv-source"]')).toBeNull();

    await click(chips[0]);

    const panel = host.querySelector('[data-testid="rlv-source"]');
    expect(panel).not.toBeNull();
    const lines = [...panel!.querySelectorAll('.rlv__source-line')];
    expect(lines.map((line) => line.querySelector('.rlv__source-text')?.textContent)).toEqual([
      'from mika:',
      'Kino no Tabi',
      'something else',
      'Kino no Tabi',
    ]);
    // The FOURTH line, not the second — both read 'Kino no Tabi', and matching
    // the raw line back would have marked the wrong one.
    expect(lines.map((line) => (line as HTMLElement).dataset.produced)).toEqual([
      'false',
      'false',
      'false',
      'true',
    ]);
  });

  it('routes the author link to that author OTHER works, each going somewhere real', async () => {
    // §11.1 row 6. Two lists so "across every list" is falsifiable: a version
    // scoped to the open list would find only Earthlings and miss Life Ceremony.
    const context = createReadingListsMutationContext(1_700_000_000_000);
    const a = createReadingList(emptyReadingListsDocument(), { name: 'Reading now' }, context);
    const b = createReadingList(
      a.document,
      { name: 'Someday' },
      createReadingListsMutationContext(1_700_000_000_001),
    );
    let current = b.document;
    for (const [listId, title] of [
      [a.listId, 'Convenience Store Woman'],
      [a.listId, 'Earthlings'],
      [b.listId, 'Life Ceremony'],
    ] as const) {
      current = addReadingListEntry(
        current,
        listId,
        { title },
        createReadingListsMutationContext(1_700_000_000_010),
      ).document;
    }
    // The author is what the parser writes onto the work (`parsed.author`).
    const authored: ReadingListsDocument = sealReadingListsDocument({
      ...current,
      works: current.works.map((work) => ({ ...work, authorRaw: 'Sayaka Murata' })),
    });

    installBridge(new FakeStore(authored));
    await render(a.listId);

    const links = [...host.querySelectorAll('.rlv__row-author')];
    expect(links.map((node) => node.textContent)).toEqual(['Sayaka Murata', 'Sayaka Murata']);
    expect(host.querySelector('[data-testid="rlv-author"]')).toBeNull();

    await click(links[0]);
    const panel = host.querySelector('[data-testid="rlv-author"]');
    expect(panel).not.toBeNull();

    // OTHER works: the two rows already on screen in this list are not repeated,
    // and the one on the other list — which is the whole point — is here.
    const titles = [...panel!.querySelectorAll('.rlv__author-title')].map(
      (node) => node.textContent,
    );
    expect(titles).toEqual(['Life Ceremony']);

    // Somewhere real. Nothing is bound, so it is the acquisition path with the
    // title — never a card that swallows the click.
    await click(panel!.querySelector('.rlv__author-open'));
    expect(sought).toEqual(['Life Ceremony']);

    // And the list name is a destination of its own.
    await click(host.querySelector('.rlv__author-list-link'));
    expect(host.querySelector('.rlv__title')?.textContent).toBe('Someday');
  });

  it('says which author has only this one book instead of drawing an empty panel', async () => {
    const context = createReadingListsMutationContext(1_700_000_000_000);
    const created = createReadingList(emptyReadingListsDocument(), { name: 'Solo' }, context);
    const added = addReadingListEntry(
      created.document,
      created.listId,
      { title: 'Earthlings' },
      createReadingListsMutationContext(1_700_000_000_001),
    );
    const seeded: ReadingListsDocument = sealReadingListsDocument({
      ...added.document,
      works: added.document.works.map((work) => ({ ...work, authorRaw: 'Sayaka Murata' })),
    });

    installBridge(new FakeStore(seeded));
    await render(created.listId);
    await click(host.querySelector('.rlv__row-author'));

    const panel = host.querySelector('[data-testid="rlv-author"]');
    expect(panel).not.toBeNull();
    expect(panel!.querySelectorAll('.rlv__author-row')).toHaveLength(0);
    expect(panel!.textContent).toContain('This is the only book by Sayaka Murata on your lists.');
  });

  it('routes a bound row cover to the library, as a DIFFERENT destination from the title', async () => {
    // §11.1 row 4. The two destinations on one row are the whole point: the
    // title opens the reader, the cover reveals the book. A cover that merely
    // did what the title does would be decoration with a tab index.
    const { document, listId } = boundIn('reading');
    const revealed: LibraryItem[] = [];
    installBridge(new FakeStore(document));
    await act(async () => {
      root.render(
        <ReadingListsView
          initialListId={listId}
          onOpenBook={(item) => opened.push(item)}
          onFindWork={(title) => sought.push(title)}
          onShowInLibrary={(item) => revealed.push(item)}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const cover = host.querySelector('button.rlv__row-cover');
    expect(cover).not.toBeNull();
    await click(cover);
    expect(revealed.map((item) => item.id)).toEqual([ITEM.id]);
    // The reader was NOT opened — reveal and open are different verbs.
    expect(opened).toEqual([]);
  });

  it('renders the cover inert when the host cannot reveal, rather than as a dead button', async () => {
    // §11.1's "no dead ends": `onShowInLibrary` is optional because a widget
    // rendering a list may not be able to honour it. Where it is absent the
    // cover must not be a control at all — a present button that does nothing
    // is exactly the swallowed click that rule forbids.
    const { document, listId } = boundIn('reading');
    installBridge(new FakeStore(document));
    await render(listId);

    expect(host.querySelector('button.rlv__row-cover')).toBeNull();
    const inert = host.querySelector('span.rlv__row-cover');
    expect(inert).not.toBeNull();
    expect(inert!.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives an unbound row a cover too, so the column does not go ragged', async () => {
    // `coverFallbackImage` derives one from the title, which is what the list
    // card mosaic already does. But it is never a button: there is no library
    // item behind a `wanted` row to reveal.
    const { document, listId } = seeded();
    const revealed: LibraryItem[] = [];
    installBridge(new FakeStore(document));
    await act(async () => {
      root.render(
        <ReadingListsView
          initialListId={listId}
          onOpenBook={(item) => opened.push(item)}
          onFindWork={(title) => sought.push(title)}
          onShowInLibrary={(item) => revealed.push(item)}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Two rows: the first bound to ITEM, the second bound to nothing.
    const covers = [...host.querySelectorAll('.rlv__row-cover')];
    expect(covers).toHaveLength(2);
    expect(covers[0].tagName).toBe('BUTTON');
    expect(covers[1].tagName).toBe('SPAN');
    // Both actually carry an image, so neither is an empty box.
    for (const cover of covers) {
      expect((cover as HTMLElement).style.backgroundImage).not.toBe('');
    }
  });

  it('draws no author link where the work has no author', async () => {
    // The vacuity check for both tests above. `authorRaw` is optional and most
    // works never carry one, so a link drawn unconditionally would render the
    // literal string "undefined" and open a panel matching every authorless work.
    const { document, listId } = boundIn('owned');
    installBridge(new FakeStore(document));
    await render(listId);
    expect(host.querySelectorAll('.rlv__row-author')).toHaveLength(0);
  });

  it('shows the one surviving line, and says so, when the import row is gone', async () => {
    // §2.4's re-parse replaces an import, so an entry can outlive the message
    // that produced it. An empty panel would read as a broken chip.
    const context = createReadingListsMutationContext(1_700_000_000_000);
    const created = createReadingList(emptyReadingListsDocument(), { name: 'Orphan' }, context);
    const added = addReadingListEntry(
      created.document,
      created.listId,
      { title: 'Kino no Tabi' },
      createReadingListsMutationContext(1_700_000_000_001),
    );
    const list = added.document.lists[0];
    const seeded: ReadingListsDocument = sealReadingListsDocument({
      ...added.document,
      lists: [
        {
          ...list,
          imports: [],
          entries: [
            {
              ...list.entries[0],
              sourceRef: { importId: 'vanished', lineIndex: 7, rawLine: '3. Kino no Tabi' },
            },
          ],
        },
      ],
    });

    installBridge(new FakeStore(seeded));
    await render(created.listId);
    await click(host.querySelector('.rlv__row-source'));

    const panel = host.querySelector('[data-testid="rlv-source"]');
    expect(panel?.textContent).toContain('3. Kino no Tabi');
    expect(panel?.textContent).toContain('only the line this entry came from was kept');
    // `lineIndex` 7 must not index into a one-line array and mark nothing.
    expect(
      [...panel!.querySelectorAll('.rlv__source-line')].map(
        (line) => (line as HTMLElement).dataset.produced,
      ),
    ).toEqual(['true']);
  });
});

describe('ReadingListsView — §11.1 row 8, landing on one entry', () => {
  /** jsdom implements no `scrollIntoView`; this is both the stub and the probe. */
  let scrolled: Element[];
  let restoreScroll: (() => void) | null = null;

  beforeEach(() => {
    scrolled = [];
    const proto = window.Element.prototype as unknown as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(proto, 'scrollIntoView');
    const previous = proto.scrollIntoView;
    proto.scrollIntoView = function stub(this: Element) {
      scrolled.push(this);
    };
    restoreScroll = () => {
      if (had) proto.scrollIntoView = previous;
      else delete proto.scrollIntoView;
    };
  });

  afterEach(() => {
    restoreScroll?.();
    restoreScroll = null;
  });

  function entryIds(document: ReadingListsDocument, listId: string): string[] {
    const list = document.lists.find((candidate) => candidate.id === listId);
    if (!list) throw new Error('the seeded list is missing');
    return list.entries.map((entry) => entry.id);
  }

  it('scrolls to the named entry, marks it, and puts the keyboard on it', async () => {
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    const [first, second] = entryIds(document, listId);
    await render(listId, second);

    const marked = rows().filter((row) => row.dataset.focused === 'true');
    expect(marked).toHaveLength(1);
    expect(marked[0].dataset.entryId).toBe(second);
    // The scroll was actually requested, on that row and not on the list.
    expect(scrolled).toEqual([marked[0]]);
    // Arriving with focus on the body means the next Tab starts at the top of
    // the page rather than at the row the user asked for.
    expect(marked[0].contains(window.document.activeElement)).toBe(true);

    // The control: the OTHER row is present and untouched, so the mark above is
    // a choice between two rows and not the only row there was.
    expect(rows()).toHaveLength(2);
    expect(rows()[0].dataset.entryId).toBe(first);
    expect(rows()[0].dataset.focused).toBeUndefined();
  });

  it('clears a filter that would hide the entry it was sent to', async () => {
    // The trap §11.1 row 4's reveal hit as well: `resolveSelection` and every
    // row lookup run over the FILTERED rows, so a filter left over from earlier
    // hides the row the route named and the deep link silently does nothing.
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    const [, second] = entryIds(document, listId);
    await render(listId);

    await typeInto(filterField(), 'kino');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].dataset.entryId).not.toBe(second);

    // Now arrive at the hidden entry, exactly as the reader strip does.
    await act(async () => {
      root.render(
        <ReadingListsView
          initialListId={listId}
          initialEntryId={second}
          onOpenBook={(item) => opened.push(item)}
          onFindWork={(title) => sought.push(title)}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(filterField()?.value).toBe('');
    expect(rows()).toHaveLength(2);
    const marked = rows().filter((row) => row.dataset.focused === 'true');
    expect(marked.map((row) => row.dataset.entryId)).toEqual([second]);
    expect(scrolled).toEqual([marked[0]]);
  });

  it('marks nothing for an entry that is not on this list, and keeps the filter', async () => {
    // A stale route names a row that is not here. Landing on the top instead
    // would claim to have found it.
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId, 'entry-from-another-list');

    expect(rows()).toHaveLength(2);
    expect(rows().some((row) => row.dataset.focused === 'true')).toBe(false);
    expect(scrolled).toEqual([]);

    // The half that only a filter can show. Without the membership guard the
    // effect falls through to the "hidden by the filter" branch and CLEARS the
    // user's filter — for a row that was never here. Nothing is marked either
    // way, so the mark alone cannot tell the two apart, and a mutation control
    // deleting the guard read GREEN until this was added.
    await typeInto(filterField(), 'kino');
    expect(rows()).toHaveLength(1);
    await act(async () => {
      root.render(
        <ReadingListsView
          initialListId={listId}
          initialEntryId="another-stale-entry"
          onOpenBook={(item) => opened.push(item)}
          onFindWork={(title) => sought.push(title)}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(filterField()?.value).toBe('kino');
    expect(rows()).toHaveLength(1);
    expect(scrolled).toEqual([]);
  });
});

describe('ReadingListsView — P5 §8, copying a list out', () => {
  let written: string[];
  let clipboardFails: boolean;
  let restoreClipboard: (() => void) | null = null;

  beforeEach(() => {
    written = [];
    clipboardFails = false;
    const had = Object.prototype.hasOwnProperty.call(window.navigator, 'clipboard');
    const previous = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard');
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (clipboardFails) throw new Error('denied');
          written.push(text);
        },
      },
    });
    restoreClipboard = () => {
      if (had && previous) Object.defineProperty(window.navigator, 'clipboard', previous);
      else delete (window.navigator as unknown as { clipboard?: unknown }).clipboard;
    };
  });

  afterEach(() => {
    restoreClipboard?.();
    restoreClipboard = null;
  });

  function exportSelect(): HTMLSelectElement | null {
    return host.querySelector<HTMLSelectElement>('.rlv__export-select');
  }

  async function pick(format: string) {
    const select = exportSelect();
    expect(select).not.toBeNull();
    await act(async () => {
      select!.value = format;
      select!.dispatchEvent(new window.Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('puts the real rendered list on the clipboard and says how much', async () => {
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);

    await pick('message');
    expect(written).toHaveLength(1);
    // The actual export, not a placeholder: both seeded titles, numbered.
    expect(written[0]).toContain('1. Kino no Tabi');
    expect(written[0]).toContain('2. コンビニ人間');
    expect(host.querySelector('[data-testid="rlv-export-note"]')?.textContent).toContain('2 books');

    // The select returns to its prompt, so picking the same format twice works.
    expect(exportSelect()?.value).toBe('');
  });

  it('copies a different format when a different one is picked', async () => {
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);

    await pick('csv');
    expect(written[0].split('\r\n')[0]).toBe('"position","title","author","state","finished"');
    await pick('markdown');
    expect(written[1].split('\n')[0]).toBe('# From a friend');
    // The control that the format is READ rather than ignored: three picks,
    // three different strings.
    expect(new Set(written).size).toBe(2);
  });

  it('says nothing was copied when the clipboard refuses', async () => {
    // A silent failure is indistinguishable from success until the user pastes
    // into a chat and sends nothing.
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);

    clipboardFails = true;
    await pick('message');
    expect(written).toHaveLength(0);
    const note = host.querySelector('[data-testid="rlv-export-note"]');
    expect(note?.textContent).toContain('Nothing was copied');
    expect(note?.className).toContain('rlv__notice--error');
  });

  it('reports a host with no clipboard API rather than claiming a copy', async () => {
    // `await undefined` resolves, so an unguarded optional call reports success
    // on a host that has no clipboard at all.
    const { document, listId } = seeded();
    installBridge(new FakeStore(document));
    await render(listId);

    delete (window.navigator as unknown as { clipboard?: unknown }).clipboard;
    await pick('message');
    expect(host.querySelector('[data-testid="rlv-export-note"]')?.textContent).toContain(
      'Nothing was copied',
    );
  });
});
