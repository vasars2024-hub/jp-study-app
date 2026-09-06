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
let cardsInfoResult: { cardId: number; interval: number; queue: number }[] = [];

/**
 * The card row this fake serves. `getIntervals` and `areSuspended` are PROJECTIONS of the
 * same rows `cardsInfo` returns, so both paths are answered from one fixture and a test
 * cannot accidentally prove them equivalent by feeding them different data.
 */
const cardRow = (id: number) => cardsInfoResult.find((c) => c.cardId === id);

/** `false` models an AnkiConnect too old to know the thin actions. */
let thinSupported = true;
/** `true` models a positional reply that does not line up with the request. */
let thinMisaligned = false;

vi.mock('../anki/client', () => ({
  invoke: async (action: string, params: Record<string, unknown>) => {
    calls.push({ action, params });
    if (action === 'notesInfo') return notesInfoResult;
    if (action === 'cardsInfo') {
      const wanted = params.cards as number[];
      return cardsInfoResult.filter((c) => wanted.includes(c.cardId));
    }
    if (action === 'getIntervals' || action === 'areSuspended') {
      if (!thinSupported) throw new Error(`unsupported action: ${action}`);
      const wanted = params.cards as number[];
      const values = wanted.map((id) => {
        const row = cardRow(id);
        if (!row) return null;
        return action === 'getIntervals' ? row.interval : row.queue === -1;
      });
      return thinMisaligned ? values.slice(0, -1) : values;
    }
    throw new Error(`unexpected action ${action}`);
  },
}));

const { configureIntervals, intervalsForNotes, resetThinCardReadProbe } = await import('../anki/intervals');

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
  thinSupported = true;
  thinMisaligned = false;
  // The unavailable flag is deliberately process-lifetime state, so a test that
  // knocked it down would otherwise silently disable the thin path for every test
  // that ran after it.
  resetThinCardReadProbe();
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

    expect(calls.map((c) => c.action)).toEqual(['notesInfo', 'getIntervals', 'areSuspended']);
    expect(calls[0].params).toEqual({ notes: [501] });
    expect(calls[1].params).toEqual({ cards: [9001] });
    expect(calls[2].params).toEqual({ cards: [9001] });
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

/**
 * `cardsInfo` returns the rendered question, answer and CSS for every card, and the
 * interval pipeline reads two numbers off it. Measured 2026-09-05 against the user's
 * own collection (155,384 notes, `deck:*`): 0.516 MB per 500 cards versus 0.005 MB for
 * `getIntervals` + `areSuspended` — 160.4 MB versus 1.55 MB per full poll, parsed in
 * MAIN every five minutes. That churn is what drove main's major GCs.
 *
 * These tests guard the substitution itself: it must produce the SAME fold, it must
 * refuse a reply it cannot zip, and it must survive a host that has never heard of the
 * two actions.
 */
describe('readCardStates — the thin card read', () => {
  const noteWithTwoCards = () => [{
    noteId: 601, modelName: 'm', tags: [], cards: [9101, 9102],
    fields: { Term: { value: '橋', order: 0 } },
  }];

  it('folds the thin pair to exactly what cardsInfo folded to', async () => {
    notesInfoResult = noteWithTwoCards();
    cardsInfoResult = [
      { cardId: 9101, interval: -600, queue: 1 },  // learning step, seconds
      { cardId: 9102, interval: 34, queue: -1 },   // suspended review card
    ];

    const thin = await intervalsForNotes([601]);
    expect(calls.map((c) => c.action)).toEqual(['notesInfo', 'getIntervals', 'areSuspended']);

    // Same fixture, forced down the old path, and the two answers are compared rather
    // than each being asserted against a hand-written expectation.
    calls.length = 0;
    thinSupported = false;
    const fat = await intervalsForNotes([601]);
    // Both thin calls are issued together, so both are recorded before the rejection
    // lands; the point of the assertion is that `cardsInfo` then answered the chunk.
    expect(calls.map((c) => c.action)).toEqual(['notesInfo', 'getIntervals', 'areSuspended', 'cardsInfo']);

    expect(thin.entries).toEqual(fat.entries);
    expect(thin.entries[0].ivlDays).toBe(34);
    expect(thin.entries[0].suspended).toBe(true);
  });

  it('zips by POSITION, so two cards cannot swap their intervals', async () => {
    notesInfoResult = [
      { noteId: 602, modelName: 'm', tags: [], cards: [9201], fields: { Term: { value: 'a', order: 0 } } },
      { noteId: 603, modelName: 'm', tags: [], cards: [9202], fields: { Term: { value: 'b', order: 0 } } },
    ];
    cardsInfoResult = [
      { cardId: 9201, interval: 2, queue: 2 },
      { cardId: 9202, interval: 90, queue: -1 },
    ];

    const snapshot = await intervalsForNotes([602, 603]);
    const byTerm = Object.fromEntries(snapshot.entries.map((e) => [e.expression, e]));
    expect(byTerm.a.ivlDays).toBe(2);
    expect(byTerm.a.suspended).toBeUndefined();
    expect(byTerm.b.ivlDays).toBe(90);
    expect(byTerm.b.suspended).toBe(true);
  });

  it('refuses a reply it cannot zip and falls back rather than guessing', async () => {
    // A short array would silently assign card N-1's interval to card N under a
    // forgiving zip. The whole point of the length check is that it must not.
    notesInfoResult = noteWithTwoCards();
    cardsInfoResult = [
      { cardId: 9101, interval: 7, queue: 2 },
      { cardId: 9102, interval: 34, queue: 2 },
    ];
    thinMisaligned = true;

    const snapshot = await intervalsForNotes([601]);

    expect(calls.map((c) => c.action)).toEqual(['notesInfo', 'getIntervals', 'areSuspended', 'cardsInfo']);
    expect(snapshot.entries[0].ivlDays).toBe(34);
  });

  it('stops retrying the thin pair once the host has refused it once', async () => {
    notesInfoResult = noteWithTwoCards();
    cardsInfoResult = [{ cardId: 9101, interval: 1, queue: 2 }, { cardId: 9102, interval: 1, queue: 2 }];
    thinSupported = false;

    await intervalsForNotes([601]);
    calls.length = 0;
    await intervalsForNotes([601]);

    // Second call: no probe at all. An unsupported host must not pay a failed round
    // trip on every chunk of every poll, forever.
    expect(calls.map((c) => c.action)).toEqual(['notesInfo', 'cardsInfo']);
  });

  /**
   * DISCLOSED, because a mutation control found it and a green suite hid it: the
   * `Math.max(0, …)` inside `readCardStates` is NOT reachable through this API in either
   * path. Deleting it from the thin read, and separately from the `cardsInfo` fallback,
   * left all twelve tests green on 2026-09-05. The reason is the fold itself — it seeds
   * `maxIvl = 0` and takes `Math.max` per card, so a negative learning step can never
   * become an `ivlDays`. The clamp is kept because `readCardStates` promises days ≥ 0 to
   * whatever reads it next, but no test here earns it and none pretends to.
   *
   * What IS worth a test on that shape is the thing the substitution could break: a lone
   * learning card must fold identically on both paths.
   */
  it('folds a lone negative learning step the same way on both paths', async () => {
    notesInfoResult = [{
      noteId: 605, modelName: 'm', tags: [], cards: [9401],
      fields: { Term: { value: 'd', order: 0 } },
    }];
    cardsInfoResult = [{ cardId: 9401, interval: -600, queue: 1 }];

    const thin = await intervalsForNotes([605]);
    thinSupported = false;
    const fat = await intervalsForNotes([605]);

    expect(thin.entries).toEqual(fat.entries);
    expect(thin.entries[0].ivlDays).toBe(0);
  });

  it('treats a card AnkiConnect cannot resolve as an unseen card, not as a hole', async () => {
    notesInfoResult = [{
      noteId: 604, modelName: 'm', tags: [], cards: [9301, 9302],
      fields: { Term: { value: 'c', order: 0 } },
    }];
    // 9301 has no row at all — `getIntervals` answers null for it, exactly as it does
    // for a card id that no longer exists.
    cardsInfoResult = [{ cardId: 9302, interval: 12, queue: 2 }];

    const snapshot = await intervalsForNotes([604]);
    expect(snapshot.entries[0].ivlDays).toBe(12);
    expect(snapshot.entries[0].suspended).toBeUndefined();
  });
});
