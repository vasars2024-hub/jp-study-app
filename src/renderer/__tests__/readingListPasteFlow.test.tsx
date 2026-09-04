// @vitest-environment jsdom
/**
 * Paste → preview → store, driven on the real components.
 *
 * The only stub is `window.api` — the IPC boundary itself. Everything above it
 * is production: the parser, the preview model, the sheet, the CAS client and
 * the import mutation. The point of this file is the two things the sheet alone
 * cannot prove — that a refused write is re-applied rather than reported, and
 * that a failure says what happened instead of closing on a lie.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReadingListPasteFlow, type ReadingListPasteReceipt } from '../components/reading/ReadingListPasteFlow';
import { resetReadingListsClientForTesting } from '../readingListsClient';
import {
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
} from '../../shared/readingListMutations';
import { emptyReadingListsDocument, type ReadingListsDocument } from '../../shared/readingLists';

const MESSAGE = ['1. Kino no Tabi', '2. 君の膵臓をたべたい', '3. コンビニ人間'].join('\n');

let host: HTMLDivElement;
let root: Root;
let received: ReadingListPasteReceipt[];
let closed: number;

/** Main, in miniature: one document, a revision counter, compare-and-swap. */
class FakeStore {
  document: ReadingListsDocument;
  writes = 0;
  /** Set to make the next N writes lose the CAS, exactly as a rival window would. */
  refuseNext = 0;

  constructor(document: ReadingListsDocument) {
    this.document = document;
  }

  write = async (baseRevision: number, next: ReadingListsDocument) => {
    this.writes += 1;
    if (this.refuseNext > 0 || baseRevision !== this.document.revision) {
      this.refuseNext = Math.max(0, this.refuseNext - 1);
      // A refusal bumps the revision, so a client that resent the same base
      // would be refused forever rather than looping on a stale number.
      this.document = { ...this.document, revision: this.document.revision + 1 };
      return { ok: true, applied: false, snapshot: { document: this.document, health: { state: 'ok', lostRevisions: 0 } } };
    }
    this.document = { ...next, revision: this.document.revision + 1 };
    return { ok: true, applied: true, snapshot: { document: this.document, health: { state: 'ok', lostRevisions: 0 } } };
  };
}

function listDocument(): { document: ReadingListsDocument; listId: string } {
  const context = createReadingListsMutationContext(1_700_000_000_000);
  const created = createReadingList(emptyReadingListsDocument(), { name: 'From a friend' }, context);
  return { document: sealReadingListsDocument(created.document), listId: created.listId };
}

function installBridge(store: FakeStore | null) {
  (window as unknown as { api?: unknown }).api = store
    ? {
        readingListsLoad: async () => ({
          ok: true,
          snapshot: { document: store.document, health: { state: 'ok', lostRevisions: 0 } },
        }),
        readingListsWrite: store.write,
        readingListsEvents: async () => ({ ok: true, events: [] }),
        onReadingListsChanged: () => () => undefined,
      }
    : {};
}

function render(listId: string, listName = 'From a friend') {
  act(() => {
    root.render(
      <ReadingListPasteFlow
        open
        rawText={MESSAGE}
        listId={listId}
        listName={listName}
        onClose={() => {
          closed += 1;
        }}
        onImported={(receipt) => {
          received.push(receipt);
        }}
      />,
    );
  });
}

function addButton(): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').startsWith('Add '),
  );
  if (!found) throw new Error('no Add button');
  return found as HTMLButtonElement;
}

async function clickAdd() {
  await act(async () => {
    addButton().click();
    await Promise.resolve();
  });
  // The commit awaits a load and then the queued write; two microtask turns.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  received = [];
  closed = 0;
  resetReadingListsClientForTesting();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as unknown as { api?: unknown }).api;
  resetReadingListsClientForTesting();
});

describe('ReadingListPasteFlow', () => {
  it('lands the entries on the real list and reports what landed', async () => {
    const { document: doc, listId } = listDocument();
    const store = new FakeStore(doc);
    installBridge(store);
    render(listId);

    await clickAdd();

    expect(received).toEqual([{ added: 3, skipped: 0, importId: expect.any(String) }]);
    expect(closed).toBe(1);
    const list = store.document.lists.find((entry) => entry.id === listId)!;
    expect(list.entries).toHaveLength(3);
    expect(store.document.works.map((work) => work.titleRaw)).toContain('コンビニ人間');
    // §2.4 — the paste is kept verbatim beside the entries.
    expect(list.imports[0].rawText).toBe(MESSAGE);
  });

  it('re-applies the intent when the write is refused, and lands once', async () => {
    const { document: doc, listId } = listDocument();
    const store = new FakeStore(doc);
    store.refuseNext = 2;
    installBridge(store);
    render(listId);

    await clickAdd();

    expect(store.writes).toBe(3);
    expect(received[0]?.added).toBe(3);
    const list = store.document.lists.find((entry) => entry.id === listId)!;
    // The intent ran three times; exactly one import survived.
    expect(list.entries).toHaveLength(3);
    expect(list.imports).toHaveLength(1);
  });

  it('gives up after the attempt limit and says a conflict happened', async () => {
    const { document: doc, listId } = listDocument();
    const store = new FakeStore(doc);
    store.refuseNext = 99;
    installBridge(store);
    render(listId);

    await clickAdd();

    expect(received).toHaveLength(0);
    expect(closed).toBe(0);
    expect(document.querySelector('[role="alert"]')?.textContent ?? '').toContain('Another window');
    // The sheet is still standing, with the rows still in it.
    expect(document.querySelectorAll('input[data-rl-title]')).toHaveLength(3);
  });

  it('says so when the bridge is not there, instead of closing on a lie', async () => {
    const { listId } = listDocument();
    installBridge(null);
    render(listId);

    await clickAdd();

    expect(received).toHaveLength(0);
    expect(closed).toBe(0);
    expect(document.querySelector('[role="alert"]')?.textContent ?? '').toContain('not available');
  });

  it('names the missing list rather than reporting a silent success', async () => {
    const { document: doc } = listDocument();
    const store = new FakeStore(doc);
    installBridge(store);
    render('rl_gone');

    await clickAdd();

    expect(received).toHaveLength(0);
    expect(closed).toBe(0);
    expect(document.querySelector('[role="alert"]')?.textContent ?? '').toContain('no longer exists');
  });

  it('does not duplicate a work the list already holds, and says how many it skipped', async () => {
    const { document: doc, listId } = listDocument();
    const store = new FakeStore(doc);
    installBridge(store);

    render(listId);
    await clickAdd();
    expect(received[0].added).toBe(3);

    act(() => root.unmount());
    root = createRoot(host);
    resetReadingListsClientForTesting();
    render(listId);
    await clickAdd();

    expect(received[1]).toEqual({ added: 0, skipped: 3, importId: expect.any(String) });
    expect(store.document.lists.find((entry) => entry.id === listId)!.entries).toHaveLength(3);
  });
});
