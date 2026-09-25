// @vitest-environment jsdom
/**
 * Audit round 2 — the renderer-side halves of Delete (#2) and Watch (#3).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runOwnerDelete } from '../components/filesapp/filesOwnerDeleters';
import {
  FilesDeletionSession,
  browserFilesSoftDeletePersistence,
} from '../components/filesapp/filesDeletionSession';
import { runWatchImports } from '../components/filesapp/filesWatchAutoImport';
import { loadImportLedger } from '../filesImportLedgerStore';
import { removeNotebookEntry, NOTEBOOK_TIMELINE_STORAGE_KEY, loadNotebookTimeline } from '../notebookTimeline';
import type { FilesScanEntry } from '../../shared/filesApp/scan';

beforeEach(() => {
  localStorage.clear();
});

describe('r2 #2 — each owner deletes through its own API', () => {
  it('falls back from the Yomitan registry to the source table, and treats "already gone" as done', async () => {
    const api = {
      dictRemoveYomitan: vi.fn(async () => ({ ok: false, error: 'Dictionary not found.' })),
      dictRemoveSource: vi.fn(async () => ({ ok: false, error: 'not-found' })),
    };
    await expect(runOwnerDelete('dictionary:x', { owner: 'dictionary', localId: 'x' }, api)).resolves.toEqual({ ok: true });
    expect(api.dictRemoveSource).toHaveBeenCalledWith('x');
  });

  it('reports a dictionary the owner refuses (a bundled one), without trying the table', async () => {
    const api = {
      dictRemoveYomitan: vi.fn(async () => ({ ok: false, error: 'Bundled default dictionaries cannot be removed.' })),
      dictRemoveSource: vi.fn(),
    };
    await expect(runOwnerDelete('dictionary:k', { owner: 'dictionary', localId: 'k' }, api)).resolves.toEqual({
      ok: false,
      reason: 'Bundled default dictionaries cannot be removed.',
    });
    expect(api.dictRemoveSource).not.toHaveBeenCalled();
  });

  it('trashes a linked file only when asked, and before the record goes', async () => {
    const order: string[] = [];
    const api = {
      removeMedia: vi.fn(async () => order.push('remove')),
      filesTrashOwnedFile: vi.fn(async () => {
        order.push('trash');
        return { ok: true };
      }),
    };
    await runOwnerDelete('media:m1', { owner: 'media', localId: 'm1' }, api);
    expect(order).toEqual(['remove']);
    order.length = 0;
    await runOwnerDelete('media:m1', { owner: 'media', localId: 'm1', trashFile: true }, api);
    expect(order).toEqual(['trash', 'remove']);
    expect(api.filesTrashOwnedFile).toHaveBeenCalledWith('media:m1');
  });

  it('removes a Notebook note from its store', async () => {
    localStorage.setItem(
      NOTEBOOK_TIMELINE_STORAGE_KEY,
      JSON.stringify([{ id: 'a', stream: 'ocr', title: 'A', ts: 1 }, { id: 'b', stream: 'ocr', title: 'B', ts: 2 }]),
    );
    await expect(runOwnerDelete('notebook:a', { owner: 'notebook', localId: 'a' }, {})).resolves.toEqual({ ok: true });
    expect(loadNotebookTimeline().map((e) => e.id)).toEqual(['b']);
    expect(removeNotebookEntry('missing')).toBe(false);
  });

  it('the session commits due deletes once, settles successes and keeps refusals hidden', async () => {
    const values = new Map<string, string>();
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const session = new FilesDeletionSession(
      { trash: vi.fn() },
      browserFilesSoftDeletePersistence(
        { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v) },
        () => undefined,
      ),
      (() => {
        let n = 0;
        return () => `t${++n}`;
      })(),
      10_000,
    );
    const base = { kind: 'dictionary', sizeBytes: null, location: { store: 'sqlite' as const, database: 'd', table: 't', rowId: 'x' } };
    await session.delete({ ...base, id: 'dictionary:ok', name: 'OK' });
    await session.delete({ ...base, id: 'dictionary:no', name: 'No' });
    const run = vi.fn(async (itemId: string) =>
      itemId === 'dictionary:ok' ? ({ ok: true } as const) : ({ ok: false, reason: 'refused' } as const),
    );
    await expect(session.commitDue(run)).resolves.toEqual({ committed: 0, failed: 0 });
    now = 20_000;
    await expect(session.commitDue(run)).resolves.toEqual({ committed: 1, failed: 1 });
    await expect(session.commitDue(run)).resolves.toEqual({ committed: 0, failed: 0 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(session.hiddenRows().map((r) => [r.itemId, r.commitError])).toEqual([['dictionary:no', 'refused']]);
    vi.restoreAllMocks();
  });
});

function entry(path: string, over: Partial<FilesScanEntry> = {}): FilesScanEntry {
  return {
    path,
    name: path.split('/').pop() ?? path,
    sizeBytes: 10,
    target: 'library-book',
    confidence: 'exact',
    reasonKey: 'x',
    candidateCount: 1,
    settlement: 'placed',
    ...over,
  };
}

describe('r2 #3 — arrivals import through the one importer, once', () => {
  it('imports the auto pile, records it in the ledger, and skips it the second time', async () => {
    const importOne = vi.fn(async () => ({ targetId: 'library-book' as const, libraryIds: ['L1'], mediaIds: [] }));
    const arrivals = [
      { root: 'D:/in', entry: entry('D:/in/a.epub') },
      { root: 'D:/in', entry: entry('D:/in/ep.mkv', { target: 'media' }), coveredByMediaIngest: true },
    ];
    const first = await runWatchImports(arrivals, { importOne });
    expect(importOne).toHaveBeenCalledTimes(1);
    expect(importOne).toHaveBeenCalledWith({ path: 'D:/in/a.epub', name: 'a.epub', isDirectory: false }, 'library-book');
    expect(first.imported.map((i) => i.path)).toEqual(['D:/in/a.epub']);
    expect(first.plan.coveredByMedia).toBe(1);
    expect(loadImportLedger().rows.length).toBe(1);

    const second = await runWatchImports(arrivals, { importOne });
    expect(importOne).toHaveBeenCalledTimes(1);
    expect(second.imported).toEqual([]);
  });
});

describe('r2 #7 — a scoped open reaches a Files window in another renderer', () => {
  it('parks the scope where a fresh module instance (a pop-out) reads it', async () => {
    const first = await import('../components/filesapp/filesAppScope');
    first.openFilesAppScoped({ categoryId: 'sources/books', focusItemId: 'library:b1' });
    vi.resetModules();
    const popout = await import('../components/filesapp/filesAppScope');
    expect(popout.peekPendingFilesScope()).toEqual({ categoryId: 'sources/books', focusItemId: 'library:b1' });
    popout.clearPendingFilesScope();
    expect(popout.peekPendingFilesScope()).toBeNull();
  });
});
