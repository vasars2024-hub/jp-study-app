// @vitest-environment jsdom
/**
 * A note saved before the notes store has loaded is as durable as one saved after.
 *
 * `appendNotebookEvent` runs at boot (the extension bridge, the analysis actions),
 * but the notes store (`userNotesStore.ts` + `shared/userNotes.ts`) is no longer in
 * the boot graph: `notebookActivity.ts` hands a note to `userNotesHandoff.ts`, which
 * writes it synchronously to the store's own journal and lets the store adopt it
 * once loaded. These tests pin that: the journal holds the note before the store
 * exists, the store then lands it in IndexedDB, and a window that never loads the
 * store still leaves the note for the next start.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const kv = vi.hoisted(() => ({
  map: new Map<string, unknown>(),
  clone: (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))),
}));

vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => kv.clone(kv.map.get(key)),
  kvSet: async (key: string, value: unknown) => {
    kv.map.set(key, kv.clone(value));
  },
  kvUpdate: async () => undefined,
  kvDelete: async (key: string) => {
    kv.map.delete(key);
  },
  kvBatch: async (ops: Array<{ type: 'put' | 'delete'; key: string; value?: unknown }>) => {
    for (const op of ops) {
      if (op.type === 'put') kv.map.set(op.key, kv.clone(op.value));
      else kv.map.delete(op.key);
    }
  },
  kvScanPrefix: async (prefix: string) =>
    [...kv.map.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, kv.clone(v)]),
  idbWritesBlocked: () => false,
}));

const JOURNAL_KEY = 'jp-user-notes-journal-v1';
const ACTIVITY_KEY = 'jp-grammarx-notebook-timeline-v1';

function journalNotes(): Record<string, { title: string; detail?: string; changedAt?: number }> {
  const raw = localStorage.getItem(JOURNAL_KEY);
  return raw ? (JSON.parse(raw) as { notes: Record<string, { title: string; detail?: string }> }).notes : {};
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  kv.map.clear();
});

describe('notes saved before the notes store loads', () => {
  it('journals the note synchronously, then the store adopts it into IndexedDB', async () => {
    const { appendNotebookEvent } = await import('../notebookActivity');
    const { boundUserNotesStore } = await import('../userNotesHandoff');
    expect(boundUserNotesStore()).toBeNull();

    const body = 'x'.repeat(10_000);
    const note = appendNotebookEvent({ stream: 'highlights', title: 'Snapshot', detail: body, folder: 'Analysis' });
    // Durable before anything async ran: the store's own journal holds it in full.
    expect(journalNotes()[note.id]).toMatchObject({ title: 'Snapshot', detail: body });
    // A note is never written to the capped activity list.
    expect(localStorage.getItem(ACTIVITY_KEY)).toBeNull();

    // An automatic event still goes to the activity list, not the journal.
    const event = appendNotebookEvent({ stream: 'extension', title: 'mined', detail: 'sentence' });
    expect(journalNotes()[event.id]).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? '[]').map((e: { id: string }) => e.id)).toEqual([event.id]);

    const store = await import('../userNotesStore');
    await vi.waitFor(() => expect(store.getUserNote(note.id)?.detail).toBe(body));
    await store.whenUserNotesReady();
    await store.flushUserNotes();
    expect(kv.map.get(`user-note:${note.id}`)).toMatchObject({ title: 'Snapshot', detail: body, folder: 'Analysis' });
    expect(store.userNoteSaveState(note.id)).toBe('saved');
    expect(journalNotes()[note.id]).toBeUndefined();
  });

  it('keeps the note for the next start when the store never loads in this window', async () => {
    const { appendNotebookEvent } = await import('../notebookActivity');
    const note = appendNotebookEvent({ stream: 'media', title: 'Episode 3: explain', detail: 'keep me' });
    expect(journalNotes()[note.id]?.detail).toBe('keep me');

    // The next window: a fresh module graph, and only the journal and IndexedDB carry over.
    vi.resetModules();
    const store = await import('../userNotesStore');
    expect(store.getUserNote(note.id)?.detail).toBe('keep me');
    await store.whenUserNotesReady();
    await store.flushUserNotes();
    expect(kv.map.get(`user-note:${note.id}`)).toMatchObject({ title: 'Episode 3: explain', detail: 'keep me' });
  });

  it('goes straight to the store once it has loaded', async () => {
    const store = await import('../userNotesStore');
    const { appendNotebookEvent } = await import('../notebookActivity');
    const note = appendNotebookEvent({ stream: 'media', title: 'Live', detail: 'body' });
    // Synchronously in memory, as `createUserNote` does.
    expect(store.getUserNote(note.id)).toMatchObject({ title: 'Live', detail: 'body' });
    await store.flushUserNotes();
    expect(kv.map.get(`user-note:${note.id}`)).toMatchObject({ title: 'Live', detail: 'body' });
  });
});
