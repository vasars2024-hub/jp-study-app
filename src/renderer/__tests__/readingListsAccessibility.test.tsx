// @vitest-environment jsdom
/**
 * §11.4's accessibility row, measured rather than asserted.
 *
 * *"Real `<button>`s, list semantics, labelled controls, visible focus, and
 * progress announced as text (`7 of 20 finished`) rather than colour alone."*
 *
 * Every claim here is produced by `helpers/a11yWalk.ts` walking the REAL
 * component, so it stays true as the view changes instead of being a snapshot
 * of what was true the day it was written. The walk is a harness: it takes a
 * container, and other surfaces can point it at theirs.
 *
 * The finding this file was written to catch, and which it did catch: the list
 * cards carried `role="progressbar"` with `aria-valuenow`, INSIDE the card's
 * `<button>`. ARIA gives `button` presentational children, so that role was
 * removed from the accessibility tree in every browser — the markup asserted a
 * semantic no screen reader would ever report, and reading the source made the
 * surface look covered. The sentence beside it ("0 of 2 finished") is the real
 * announcement, and it is what §11.4 asked for in the first place.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ReadingListsView from '../views/ReadingListsView';
import { resetReadingListsClientForTesting } from '../readingListsClient';
import {
  accessibleName,
  interactiveControls,
  focusableWithoutRing,
  namelessControls,
  namelessLists,
  rolesInsidePresentationalChildren,
} from './helpers/a11yWalk';
import {
  addReadingListEntry,
  bindReadingWork,
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
} from '../../shared/readingListMutations';
import { emptyReadingListsDocument, type ReadingListsDocument } from '../../shared/readingLists';
import type { LibraryItem } from '../../shared/types';

let host: HTMLDivElement;
let root: Root;

const ITEM: LibraryItem = {
  id: 'item-1',
  title: 'Kino no Tabi',
  type: 'book',
  addedAt: 1,
} as unknown as LibraryItem;

function seeded(): { document: ReadingListsDocument; listId: string } {
  const created = createReadingList(
    emptyReadingListsDocument(),
    { name: 'From a friend' },
    createReadingListsMutationContext(1_700_000_000_000),
  );
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

function installBridge(document: ReadingListsDocument) {
  (window as unknown as { api?: unknown }).api = {
    listLibrary: async () => [ITEM],
    readingListsLoad: async () => ({
      ok: true,
      snapshot: { document, health: { state: 'ok', lostRevisions: 0 } },
    }),
    readingListsWrite: async () => ({ ok: false, code: 'write-failed' }),
    readingListsEvents: async () => ({ ok: true, events: [] }),
    onReadingListsChanged: () => () => undefined,
  };
}

async function render(initialListId: string | null) {
  await act(async () => {
    root.render(
      <ReadingListsView
        initialListId={initialListId}
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

beforeEach(() => {
  host = window.document.createElement('div');
  window.document.body.appendChild(host);
  root = createRoot(host);
  resetReadingListsClientForTesting();
  window.localStorage.removeItem('jp-reading-lists-density-v1');
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
});

/** Click a real `<button>` by its exact label. Never `byText` — see the note in
 *  `readingListsView.test.tsx`: a wrapper div carries the same trimmed text. */
async function clickButton(label: string) {
  const node = [...host.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(node, `no button labelled ${label}`).toBeTruthy();
  await act(async () => {
    node?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe.each([
  ['the grid of lists', null as string | null, [] as string[]],
  ['a list of entries', 'DETAIL' as string | null, [] as string[]],
  // The panels are where the unlabelled markup hides: they are mounted by a
  // click, so a walk of the resting surface never sees them at all.
  ['a list with the library picker open', 'DETAIL', ['Add from library']],
  ['a list with the paste box open', 'DETAIL', ['Paste a message']],
])('reading lists a11y — %s', (_label, which, opens) => {
  async function mount() {
    const { document, listId } = seeded();
    installBridge(document);
    await render(which === 'DETAIL' ? listId : null);
    for (const label of opens) await clickButton(label);
  }

  it('labels every control', async () => {
    await mount();
    // The vacuity check FIRST. An empty findings list proves nothing if the
    // walk matched no controls, and a selector that stops matching is exactly
    // how a walk silently turns into a rubber stamp.
    // Four is the grid's own floor: density, sort, New list, and one card.
    expect(interactiveControls(host).length).toBeGreaterThanOrEqual(4);
    expect(namelessControls(host)).toEqual([]);
  });

  it('names every list, so "list, 2 items" says which list', async () => {
    await mount();
    expect(namelessLists(host)).toEqual([]);
  });

  it('asserts no ARIA role that the tree throws away', async () => {
    await mount();
    expect(rolesInsidePresentationalChildren(host)).toEqual([]);
  });

  it('gives every focusable a focus ring', async () => {
    await mount();
    expect(focusableWithoutRing(host)).toEqual([]);
  });

  it('uses real buttons — nothing clickable is a bare div or span', async () => {
    await mount();
    const clickable = [...host.querySelectorAll<HTMLElement>('div, span, p, li')].filter(
      (node) => node.getAttribute('role') === 'button' || node.hasAttribute('onclick'),
    );
    expect(clickable.map((node) => node.className)).toEqual([]);
  });
});

describe('reading lists a11y — progress is announced as text', () => {
  it('puts the count in the card button’s own accessible name', async () => {
    const { document } = seeded();
    installBridge(document);
    await render(null);

    const card = host.querySelector('.rlv__card-open');
    expect(card).not.toBeNull();
    // The bar is colour. This is the sentence, and it is INSIDE the button, so
    // it is part of the name the button is announced with — not a second thing
    // a user has to go and find.
    expect(accessibleName(card as Element)).toContain('0 of 2 finished');
  });

  it('marks the bar decorative rather than claiming a role it cannot keep', async () => {
    const { document } = seeded();
    installBridge(document);
    await render(null);

    const bar = host.querySelector('.rlv__bar');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('aria-hidden')).toBe('true');
    // The control: if the bar ever claims `progressbar` again while sitting in
    // a button, the walk above fails — this asserts the same fact from the
    // other side, so deleting one of the two cannot hide the regression.
    expect(bar?.getAttribute('role')).toBeNull();
  });
});
