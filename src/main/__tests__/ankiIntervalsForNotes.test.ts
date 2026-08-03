import os from 'node:os';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  ipcMain: { handle: () => undefined },
}));

/**
 * Every AnkiConnect action this function issues, in order. The whole point of
 * `intervalsForNotes` is WHICH calls it makes, so the calls are the assertion — a test that
 * only checked the returned entries would pass just as happily against the collection-wide
 * poll this exists to avoid.
 */
const calls: { action: string; params: Record<string, unknown> }[] = [];
let notesInfoResult: unknown[] = [];
let cardsInfoResult: unknown[] = [];

vi.mock('../anki/client', () => ({
  invoke: async (action: string, params: Record<string, unknown>) => {
    calls.push({ action, params });
    if (action === 'notesInfo') return notesInfoResult;
    if (action === 'cardsInfo') return cardsInfoResult;
    throw new Error(`unexpected action ${action}`);
  },
}));

const { configureIntervals, intervalsForNotes } = await import('../anki/intervals');

configureIntervals({
  // `getQueries` is the collection-wide poll's input. `intervalsForNotes` must never consult
  // it — if this ever runs, the narrowing has been lost.
  getQueries: () => { throw new Error('intervalsForNotes consulted the profile sync queries'); },
  getEpoch: () => 1,
  isConnected: () => true,
  getTermOverride: () => undefined,
});

beforeEach(() => {
  calls.length = 0;
  notesInfoResult = [];
  cardsInfoResult = [];
});

describe('intervalsForNotes', () => {
  it('asks about the named notes only, and never runs findNotes', async () => {
    notesInfoResult = [{
      noteId: 501,
      modelName: 'JP Study App::JA-EN Classic',
      tags: [],
      cards: [9001],
      fields: { Term: { value: '無防備', order: 0 } },
    }];
    cardsInfoResult = [{ cardId: 9001, interval: 21, queue: 2 }];

    const snapshot = await intervalsForNotes([501]);

    expect(calls.map((c) => c.action)).toEqual(['notesInfo', 'cardsInfo']);
    expect(calls[0].params).toEqual({ notes: [501] });
    expect(calls[1].params).toEqual({ cards: [9001] });
    expect(snapshot.entries).toEqual([
      { expression: '無防備', ivlDays: 21, noteId: 501, modelName: 'JP Study App::JA-EN Classic' },
    ]);
  });

  it('keeps a SENTENCE term, which the collection index drops outright', async () => {
    // `runPoll` skips any expression with whitespace or over 24 characters — a word-study
    // rule. `VideoCoreMiningPanel` produces `cardKind: 'sentence'` with `term = sentence` by
    // default, so under that rule a mined card could never be staged even by a snapshot that
    // finished. A by-note lookup has no reason to filter by shape: the caller named the note.
    const sentence = 'The cat is sleeping by the window.';
    notesInfoResult = [{
      noteId: 777,
      modelName: 'JP Study App::JA-EN Classic',
      tags: [],
      cards: [9002],
      fields: { Term: { value: sentence, order: 0 } },
    }];
    cardsInfoResult = [{ cardId: 9002, interval: 0, queue: 0 }];

    const snapshot = await intervalsForNotes([777]);

    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0].expression).toBe(sentence);
    expect(snapshot.entries[0].noteId).toBe(777);
  });

  it('does not call Anki at all for an empty or unusable id list', async () => {
    const snapshot = await intervalsForNotes([0, -1, Number.NaN]);
    expect(calls).toEqual([]);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.noteCount).toBe(0);
  });

  it('drops the empty objects AnkiConnect returns for deleted notes', async () => {
    // `notesInfo` answers `[{}]` for an id that no longer exists rather than omitting it,
    // and `{}` is truthy. Filtering on truthiness would invent an entry with no note id.
    notesInfoResult = [{}, {
      noteId: 502, modelName: 'm', tags: ['leech'], cards: [9003],
      fields: { Term: { value: 'x', order: 0 } },
    }];
    cardsInfoResult = [{ cardId: 9003, interval: 5, queue: -1 }];

    const snapshot = await intervalsForNotes([501, 502]);

    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0].noteId).toBe(502);
    expect(snapshot.entries[0].suspended).toBe(true);
    expect(snapshot.entries[0].leech).toBe(true);
  });

  it('clamps a negative interval, which Anki uses for learning steps in seconds', async () => {
    notesInfoResult = [{
      noteId: 503, modelName: 'm', tags: [], cards: [9004, 9005],
      fields: { Term: { value: 'y', order: 0 } },
    }];
    cardsInfoResult = [
      { cardId: 9004, interval: -600, queue: 1 },
      { cardId: 9005, interval: 3, queue: 2 },
    ];

    const snapshot = await intervalsForNotes([503]);

    // The fold takes the LONGEST interval across the note's cards, and -600 must not win it.
    expect(snapshot.entries[0].ivlDays).toBe(3);
  });

  it('deduplicates the ids it is given', async () => {
    notesInfoResult = [{
      noteId: 504, modelName: 'm', tags: [], cards: [],
      fields: { Term: { value: 'z', order: 0 } },
    }];
    await intervalsForNotes([504, 504, 504]);
    expect(calls[0].params).toEqual({ notes: [504] });
  });
});
