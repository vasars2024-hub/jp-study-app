// @vitest-environment jsdom
/**
 * §11.1 row 8 — the reader's *"on 2 lists"* line.
 *
 * The claim under test is not "a button exists". It is that the button's click
 * survives the REAL resolver: `resolveReadingWorkspaceOpenRequest` is what
 * `DesktopShell` runs on `os:open`, and it returned `null` for every `lists`
 * route until `421bdff1`. So this drives the production resolver rather than
 * reading the event detail — asserting the detail alone passes on a route that
 * nothing downstream can use, which is exactly how five call sites shipped dead.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ReadingListMembership from '../components/reading/ReadingListMembership';
import { resetReadingListsClientForTesting } from '../readingListsClient';
import { resolveReadingWorkspaceOpenRequest } from '../readingWorkspaceNavigation';
import {
  addReadingListEntry,
  bindReadingWork,
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
  updateReadingList,
} from '../../shared/readingListMutations';
import {
  emptyReadingListsDocument,
  type ReadingListsDocument,
} from '../../shared/readingLists';

let host: HTMLDivElement;
let root: Root;
/** Every `os:open` the surface fired, in order. */
let opens: unknown[];

const ITEM_ID = 'item-1';

/**
 * Three lists holding the same bound work, the third archived, plus one list
 * that does NOT hold it. Anything the strip shows must be chosen from four.
 */
function seeded(): { document: ReadingListsDocument; entryIds: Record<string, string> } {
  let clock = 1_700_000_000_000;
  const next = () => createReadingListsMutationContext((clock += 1));

  let document = emptyReadingListsDocument();
  const ids: Record<string, string> = {};
  const listIds: Record<string, string> = {};

  for (const name of ['From a friend', 'Book club', 'Retired', 'Unrelated']) {
    const created = createReadingList(document, { name }, next());
    document = created.document;
    listIds[name] = created.listId;
    const added = addReadingListEntry(
      document,
      created.listId,
      { title: name === 'Unrelated' ? 'コンビニ人間' : 'Kino no Tabi' },
      next(),
    );
    document = added.document;
    ids[name] = added.entryId;
  }

  // Every 'Kino no Tabi' work, not the first. `addReadingListEntry` mints a NEW
  // work on each call (readingListMutations.ts:762 — `workFromParsed` then
  // `works: [...next.works, work]`), so adding the same book to three lists by
  // hand produces THREE works, each bindable to the same library item. That is
  // the multi-claim shape `readingListsForItem` scans for, and binding only the
  // first would seed a fixture that answers "on 1 list".
  const works = document.works.filter((candidate) => candidate.titleRaw === 'Kino no Tabi');
  if (works.length !== 3) {
    throw new Error(`expected 3 seeded works, got ${works.length} — mutations changed shape`);
  }
  for (const work of works) {
    document = bindReadingWork(document, work.id, ITEM_ID, 0.95, next()).document;
  }
  document = updateReadingList(document, listIds.Retired, { archived: true }, next()).document;

  return { document: sealReadingListsDocument(document), entryIds: ids };
}

function installBridge(document: ReadingListsDocument | null) {
  (window as unknown as { api?: unknown }).api = document
    ? {
        readingListsLoad: async () => ({
          ok: true,
          snapshot: { document, health: { state: 'ok', lostRevisions: 0 } },
        }),
        readingListsEvents: async () => ({ ok: true, events: [] }),
        onReadingListsChanged: () => () => undefined,
      }
    : {};
}

async function render(itemId: string | null) {
  await act(async () => {
    root.render(<ReadingListMembership itemId={itemId} />);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function links(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('.rlm__link')];
}

function onOpen(event: Event) {
  opens.push((event as CustomEvent).detail);
}

beforeEach(() => {
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  opens = [];
  window.addEventListener('os:open', onOpen);
  resetReadingListsClientForTesting();
});

afterEach(() => {
  window.removeEventListener('os:open', onOpen);
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
  resetReadingListsClientForTesting();
});

describe('ReadingListMembership — §11.1 row 8', () => {
  it('names every live list the book is on, and counts them', async () => {
    const { document } = seeded();
    installBridge(document);
    await render(ITEM_ID);

    // Two, not three: `Retired` is archived and is not somewhere to send anyone.
    // Not four: `Unrelated` holds a different work.
    expect(links().map((link) => link.textContent)).toEqual(['From a friend', 'Book club']);
    expect(host.querySelector('.rlm__count')?.textContent).toBe('On 2 lists');
  });

  it('renders nothing at all for a book on no list', async () => {
    const { document } = seeded();
    installBridge(document);
    await render('item-nobody-listed');
    // Not an empty state — an "on 0 lists" chip is noise in a reading surface.
    expect(host.textContent).toBe('');
    expect(links()).toHaveLength(0);

    // The control: the SAME document does render for the bound item, so the
    // silence above is the item having no lists and not the bridge being dead.
    await render(ITEM_ID);
    expect(links()).toHaveLength(2);
  });

  it('renders nothing when the reader has no item id yet', async () => {
    const { document } = seeded();
    installBridge(document);
    await render(null);
    expect(host.textContent).toBe('');
  });

  it('fires a route the REAL resolver accepts, carrying the list AND the entry', async () => {
    const { document, entryIds } = seeded();
    installBridge(document);
    await render(ITEM_ID);

    await act(async () => {
      links()[1].click();
      await Promise.resolve();
    });

    expect(opens).toHaveLength(1);
    // Through `resolveReadingWorkspaceOpenRequest`, the function DesktopShell
    // actually runs. Reading `opens[0]` directly would pass on a route the
    // resolver rejects — which is precisely how §11.2's widget headers and
    // §11.3's reminders shipped dead for five call sites.
    const resolved = resolveReadingWorkspaceOpenRequest(opens[0]);
    expect(resolved).not.toBeNull();
    expect(resolved!.host).toBe('reading');
    expect(resolved!.route).toMatchObject({
      section: 'lists',
      listId: expect.any(String),
      entryId: entryIds['Book club'],
    });
  });

  it('survives a bridge that cannot load, without taking the reader down', async () => {
    installBridge(null);
    await render(ITEM_ID);
    // A cross-reference is not worth an error in a reading surface; it simply
    // has nothing to say. What matters is that the reader still rendered.
    expect(host.textContent).toBe('');
  });
});
