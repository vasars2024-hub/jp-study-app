import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';

// The poll persists its snapshot next to userData. Give it a directory of its own so a
// test run cannot read — or clobber — a real profile's anki-intervals.json.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-anki-intervals-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: { handle: () => undefined },
}));

interface FakeNote {
  noteId: number;
  modelName: string;
  tags: string[];
  cards: number[];
  fields: Record<string, { value: string; order: number }>;
}

const calls: { action: string; params: Record<string, unknown> }[] = [];
let collection: FakeNote[] = [];
let intervalByCard = new Map<number, number>();
let suspendedCards = new Set<number>();

vi.mock('../anki/client', () => ({
  invoke: async (action: string, params: Record<string, unknown>) => {
    calls.push({ action, params });
    if (action === 'findNotes') return collection.map((n) => n.noteId);
    if (action === 'notesInfo') {
      const wanted = params.notes as number[];
      return wanted.map((id) => collection.find((n) => n.noteId === id) ?? {});
    }
    if (action === 'getIntervals') {
      return (params.cards as number[]).map((c) => intervalByCard.get(c) ?? null);
    }
    if (action === 'areSuspended') {
      return (params.cards as number[]).map((c) => suspendedCards.has(c));
    }
    throw new Error(`unexpected action ${action}`);
  },
}));

const {
  configureIntervals, kickPoll, resetNoteProjections, resetThinCardReadProbe,
  noteProjectionCount, flushSnapshotWrites,
} = await import('../anki/intervals');

let epoch = 1;
/** The app-side field mapping (`profile.anki.fieldMap.term`), per model. Boss audit F2. */
let termOverride = new Map<string, string | undefined>();

configureIntervals({
  getQueries: () => ['deck:*'],
  getEpoch: () => epoch,
  isConnected: () => true,
  getTermOverride: (model) => termOverride.get(model),
});

/** `id` doubles as the card id, so a fixture reads as one row. */
const note = (id: number, term: string, tags: string[] = []): FakeNote => ({
  noteId: id,
  modelName: 'm',
  tags,
  cards: [id],
  fields: { Term: { value: term, order: 0 } },
});

/**
 * Two fields, so a term-field override has somewhere else to point. With no override
 * `resolveTermFieldName` takes `Term` (the `ROLE_SYNONYMS.term` hit); with
 * `override: 'Alt'` it takes `Alt` verbatim.
 */
const twoFieldNote = (
  id: number,
  term: string,
  alt: string,
  modelName = 'm',
): FakeNote => ({
  noteId: id,
  modelName,
  tags: [],
  cards: [id],
  fields: { Term: { value: term, order: 0 }, Alt: { value: alt, order: 1 } },
});

const notesInfoIds = () => calls
  .filter((c) => c.action === 'notesInfo')
  .flatMap((c) => c.params.notes as number[]);

const cardsAsked = () => calls
  .filter((c) => c.action === 'getIntervals')
  .flatMap((c) => c.params.cards as number[]);

/** A fresh poll every time: `getSnapshotOrPoll` would answer from the cached snapshot. */
const poll = async () => kickPoll();

beforeEach(() => {
  calls.length = 0;
  epoch += 1;
  collection = [];
  intervalByCard = new Map();
  suspendedCards = new Set();
  termOverride = new Map();
  resetNoteProjections();
  resetThinCardReadProbe();
});

afterAll(async () => {
  // The poll persists fire-and-forget. Deleting the directory out from under the last
  // write made it fail ENOENT and log after the worker's rpc had closed, which vitest
  // reported as an unhandled EnvironmentTeardownError — this file exited 1 with every
  // test in it green.
  await flushSnapshotWrites();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/**
 * The poll used to re-read every note's full field HTML on every run. Measured
 * 2026-09-05 against the user's own Anki, sampled evenly across all 155,384 notes of
 * `deck:*`: 2,048 bytes per note, 303.5 MB per poll, and `kickPoll` single-flights, so
 * on that collection main was permanently mid-poll.
 *
 * These tests hold the two halves of the replacement apart: what is CACHED (the note's
 * fields, note type, tags and card list) and what must stay FRESH on every poll (the
 * scheduling).
 */
describe('interval poll — note projections', () => {
  it('reads every note once, then only a rotating slice', async () => {
    // 24 notes over 12 rotation slices: the second poll should re-read the two whose
    // id falls in slice 0, and no others.
    for (let i = 0; i < 24; i += 1) {
      collection.push(note(100 + i, `語${i}`));
      intervalByCard.set(100 + i, i);
    }

    await poll();
    expect(new Set(notesInfoIds())).toEqual(new Set(collection.map((n) => n.noteId)));

    calls.length = 0;
    await poll();
    // Named exactly, not bounded: `second.length < 24` and `second.every(...)` are BOTH
    // satisfied by an empty array, so a rotation that re-read nothing at all would have
    // passed. Measured 2026-09-05 by deleting the rotation, which left this green.
    // Ids 100-123, cursor 1 after the first poll: 109 and 121 are the whole slice.
    expect(notesInfoIds()).toEqual([109, 121]);
  });

  it('still asks for EVERY card interval on every poll', async () => {
    // The whole point of caching the note is that the scheduling is not cached.
    for (let i = 0; i < 24; i += 1) {
      collection.push(note(200 + i, `字${i}`));
      intervalByCard.set(200 + i, 1);
    }
    await poll();

    calls.length = 0;
    intervalByCard.set(207, 99);
    const snapshot = await poll();

    expect(new Set(cardsAsked())).toEqual(new Set(collection.map((n) => n.noteId)));
    const changed = snapshot.entries.find((e) => e.noteId === 207);
    expect(changed?.ivlDays).toBe(99);
  });

  it('sees a suspension the poll after it happens, with no note re-read', async () => {
    collection.push(note(300, '橋'));
    intervalByCard.set(300, 10);
    const before = await poll();
    expect(before.entries[0].suspended).toBeUndefined();

    calls.length = 0;
    suspendedCards.add(300);
    const after = await poll();

    expect(after.entries[0].suspended).toBe(true);
    // 300 % 12 === 0 and the cursor has moved off slice 0, so this poll re-read nothing.
    expect(notesInfoIds()).toEqual([]);
  });

  it('reads a NEW note immediately rather than waiting for its rotation slice', async () => {
    collection.push(note(400, 'あ'));
    intervalByCard.set(400, 3);
    await poll();

    calls.length = 0;
    collection.push(note(401, 'い'));
    intervalByCard.set(401, 4);
    const snapshot = await poll();

    expect(notesInfoIds()).toContain(401);
    expect(snapshot.entries.map((e) => e.expression).sort()).toEqual(['あ', 'い']);
  });

  it('drops a note that left the collection instead of projecting it forever', async () => {
    collection.push(note(500, 'か'), note(501, 'き'));
    intervalByCard.set(500, 1);
    intervalByCard.set(501, 2);
    await poll();

    calls.length = 0;
    collection = collection.filter((n) => n.noteId !== 501);
    const snapshot = await poll();

    expect(snapshot.entries.map((e) => e.expression)).toEqual(['か']);
    expect(cardsAsked()).toEqual([500]);
    // The ENTRIES would be right either way — they are rebuilt from the live id list —
    // so the only observable consequence of failing to evict is a cache that grows for
    // the life of the process. That is what this asserts.
    expect(noteProjectionCount()).toBe(1);
  });

  it('rebuilds every projection when the profile epoch changes', async () => {
    collection.push(note(600, 'さ'));
    intervalByCard.set(600, 5);
    await poll();

    calls.length = 0;
    epoch += 1;
    // The term field now resolves differently for the same note id.
    collection = [note(600, 'し')];
    const snapshot = await poll();

    expect(notesInfoIds()).toEqual([600]);
    expect(snapshot.entries[0].expression).toBe('し');
  });

  /**
   * Boss audit F2 (`audit-20260905-183822-04a7d2a3`). A projection's `expression` is
   * derived from the term-field override in force when it was built, and `updateProfile`
   * — the app's own path for editing `anki.fieldMap.term` — does not bump the profile
   * epoch. So nothing invalidated the cache: the change reached each note only as its
   * `id % 12` rotation slice came round, up to an hour later and staggered by note id,
   * leaving the index in a mixed old/new state for the whole of it. Before the cache
   * existed it took effect on the next poll, and that is the bar restored here.
   */
  describe('a field-mapping change is not left to the rotation', () => {
    it('re-reads the remapped model on the very next poll, with the rotation as the control', async () => {
      for (let i = 0; i < 24; i += 1) {
        collection.push(twoFieldNote(800 + i, `旧${i}`, `新${i}`));
        intervalByCard.set(800 + i, 1);
      }
      const first = await poll();
      expect(first.entries[0].expression).toBe('旧0');

      // CONTROL: the very same second poll, with the mapping untouched, re-reads only
      // the rotation slice. Without it "re-read everything" would look like a pass on a
      // poll that simply re-reads everything anyway.
      calls.length = 0;
      const unchanged = await poll();
      // Ids 800-823, cursor 1 after the first poll: 805 and 817 are the whole slice.
      expect(notesInfoIds()).toEqual([805, 817]);
      expect(unchanged.entries[0].expression).toBe('旧0');

      // The user remaps the term field in this app. Nothing else moves — same epoch,
      // same collection, same notes.
      calls.length = 0;
      termOverride.set('m', 'Alt');
      const remapped = await poll();

      expect(new Set(notesInfoIds())).toEqual(new Set(collection.map((n) => n.noteId)));
      expect(remapped.entries.map((e) => e.expression))
        .toEqual(collection.map((_n, i) => `新${i}`));
    });

    it('drops only the model that moved, and settles back to the rotation afterwards', async () => {
      collection.push(twoFieldNote(900, '旧A', '新A', 'moved'));
      collection.push(twoFieldNote(902, '旧B', '新B', 'untouched'));
      intervalByCard.set(900, 1);
      intervalByCard.set(902, 1);
      await poll();

      calls.length = 0;
      termOverride.set('moved', 'Alt');
      const after = await poll();
      // 902 belongs to a model whose mapping did not change, and with the cursor at 1
      // after the first poll `902 % 12 === 2` is not this poll's slice either — so a
      // correct invalidation leaves it cached and it is not re-read for any reason.
      expect(notesInfoIds()).toEqual([900]);
      expect(after.entries.find((e) => e.noteId === 900)?.expression).toBe('新A');
      expect(after.entries.find((e) => e.noteId === 902)?.expression).toBe('旧B');

      // And the new value is now the recorded one, so 900 is not dropped a second time:
      // the third poll re-reads only 902, which the cursor has now reached.
      calls.length = 0;
      const settled = await poll();
      expect(notesInfoIds()).toEqual([902]);
      expect(settled.entries.find((e) => e.noteId === 900)?.expression).toBe('新A');
    });
  });

  it('produces the same entries as a poll that caches nothing', async () => {
    for (let i = 0; i < 30; i += 1) {
      const tags = i % 5 === 0 ? ['leech'] : [];
      collection.push(note(700 + i, `漢${i}`, tags));
      intervalByCard.set(700 + i, i * 2);
      if (i % 7 === 0) suspendedCards.add(700 + i);
    }

    // Three polls with the cache alive, so the rotation has moved.
    await poll();
    await poll();
    const cached = await poll();

    // Same fixture, cache cleared before every poll, i.e. the old full-read behaviour.
    resetNoteProjections();
    const fresh = await poll();

    expect(cached.entries).toEqual(fresh.entries);
    expect(cached.entries).toHaveLength(30);
  });
});
