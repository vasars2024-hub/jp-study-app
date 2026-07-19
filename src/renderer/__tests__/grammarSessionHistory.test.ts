// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  appendSession,
  historyStats,
  parseSessionHistory,
  recentlyMissed,
  HISTORY_VERSION,
  MAX_SESSION_RECORDS,
  type SessionRecord,
} from '../grammarSessionHistory';

function record(partial: Partial<SessionRecord> & Pick<SessionRecord, 'at'>): SessionRecord {
  return {
    requested: 10,
    delivered: 10,
    correct: 7,
    direction: 'mixed',
    types: ['flip'],
    mastered: 'exclude',
    missed: [],
    ...partial,
  };
}

describe('appendSession', () => {
  it('puts the newest first', () => {
    const h = appendSession(appendSession([], record({ at: 1 })), record({ at: 2 }));
    expect(h.map((r) => r.at)).toEqual([2, 1]);
  });

  it('caps the list rather than growing without limit', () => {
    let h: SessionRecord[] = [];
    for (let i = 1; i <= MAX_SESSION_RECORDS + 20; i += 1) h = appendSession(h, record({ at: i }));
    expect(h.length).toBe(MAX_SESSION_RECORDS);
    // The newest survive; the oldest are dropped.
    expect(h[0].at).toBe(MAX_SESSION_RECORDS + 20);
  });

  it('does not mutate the history it is given', () => {
    const before: SessionRecord[] = [record({ at: 1 })];
    appendSession(before, record({ at: 2 }));
    expect(before.length).toBe(1);
  });
});

describe('historyStats', () => {
  it('is zero and not NaN on an empty history', () => {
    const s = historyStats([]);
    expect(s.sessions).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(Number.isNaN(s.accuracy)).toBe(false);
    expect(s.lastAt).toBe(0);
  });

  it('sums across sessions', () => {
    const s = historyStats([
      record({ at: 2, delivered: 10, correct: 8 }),
      record({ at: 1, delivered: 10, correct: 4 }),
    ]);
    expect(s.sessions).toBe(2);
    expect(s.answered).toBe(20);
    expect(s.correct).toBe(12);
    expect(s.accuracy).toBe(0.6);
    expect(s.lastAt).toBe(2);
  });

  it('does not divide by zero when a session delivered nothing', () => {
    const s = historyStats([record({ at: 1, delivered: 0, correct: 0 })]);
    expect(s.accuracy).toBe(0);
  });
});

describe('recentlyMissed', () => {
  it('de-duplicates across sessions, most recent first', () => {
    const h = [
      record({ at: 3, missed: ['b', 'c'] }),
      record({ at: 2, missed: ['a', 'b'] }),
      record({ at: 1, missed: ['z'] }),
    ];
    expect(recentlyMissed(h, 2)).toEqual(['b', 'c', 'a']);
  });

  it('honours the session window', () => {
    const h = [record({ at: 2, missed: ['a'] }), record({ at: 1, missed: ['b'] })];
    expect(recentlyMissed(h, 1)).toEqual(['a']);
  });
});

describe('parseSessionHistory', () => {
  it('reads the envelope it writes', () => {
    const h = [record({ at: 5 })];
    expect(parseSessionHistory(JSON.stringify({ v: HISTORY_VERSION, s: h }))).toEqual(h);
  });

  it('migrates a bare legacy array forward instead of discarding it', () => {
    const h = [record({ at: 5 })];
    expect(parseSessionHistory(JSON.stringify(h))).toEqual(h);
  });

  it('drops records with no usable timestamp', () => {
    expect(parseSessionHistory(JSON.stringify([{ delivered: 5 }, { at: 0 }, { at: -3 }]))).toEqual(
      [],
    );
  });

  it('never reports more correct than delivered', () => {
    // A clamp, not a rejection: a corrupt count must not produce accuracy > 1.
    const parsed = parseSessionHistory(JSON.stringify([{ at: 1, delivered: 5, correct: 99 }]));
    expect(parsed[0].correct).toBe(5);
    expect(historyStats(parsed).accuracy).toBeLessThanOrEqual(1);
  });

  it('survives junk', () => {
    expect(parseSessionHistory(null)).toEqual([]);
    expect(parseSessionHistory('not json')).toEqual([]);
    expect(parseSessionHistory('{"v":1}')).toEqual([]);
    expect(parseSessionHistory('42')).toEqual([]);
  });
});
