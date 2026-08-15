import { describe, expect, it } from 'vitest';

import {
  ANKI_DRAFT_SESSION_VERSION,
  cancelSession,
  coveredNoteCount,
  describeSessionProgress,
  failSession,
  mergePageRanges,
  nextResumeOffset,
  planResume,
  recordSessionPage,
  reconcileSessionOnLoad,
  sessionCoversEverything,
  startSession,
  type AnkiDraftSession,
} from '../ankiDraftSession';

const PID = 4242;

function session(overrides: Partial<AnkiDraftSession> = {}): AnkiDraftSession {
  return {
    ...startSession({
      id: 's1',
      sourceKind: 'ankiconnect',
      label: 'User 1',
      request: { kind: 'ankiconnect', query: 'deck:*', noteLimit: 500 },
      fingerprint: 'connect:155383:1464157531',
      ownerPid: PID,
      nowMs: 1_000,
    }),
    ...overrides,
  };
}

describe('mergePageRanges', () => {
  it('sorts, drops empties, and merges overlapping ranges', () => {
    expect(
      mergePageRanges([
        { offset: 100, count: 50 },
        { offset: 0, count: 10 },
        { offset: 120, count: 40 },
        { offset: 5, count: 0 },
      ]),
    ).toEqual([
      { offset: 0, count: 10 },
      { offset: 100, count: 60 },
    ]);
  });

  it('merges ranges that only touch, which is how sequential pages arrive', () => {
    expect(
      mergePageRanges([
        { offset: 0, count: 500 },
        { offset: 500, count: 500 },
      ]),
    ).toEqual([{ offset: 0, count: 1000 }]);
  });

  it('floors and clamps negative input rather than trusting a caller', () => {
    expect(mergePageRanges([{ offset: -5, count: 10.7 }])).toEqual([{ offset: 0, count: 10 }]);
  });
});

describe('nextResumeOffset', () => {
  it('returns a gap in the middle before the end of the collection', () => {
    const s = session({
      totalNotes: 1000,
      pages: [
        { offset: 0, count: 200 },
        { offset: 500, count: 500 },
      ],
    });
    expect(nextResumeOffset(s)).toBe(200);
  });

  it('is null once coverage is contiguous to the total', () => {
    expect(nextResumeOffset(session({ totalNotes: 300, pages: [{ offset: 0, count: 300 }] }))).toBeNull();
  });

  it('keeps going past the last page while the total is still unknown', () => {
    expect(nextResumeOffset(session({ pages: [{ offset: 0, count: 500 }] }))).toBe(500);
  });
});

describe('sessionCoversEverything', () => {
  it('is false with a hole even when the covered count reaches the total', () => {
    const s = session({
      totalNotes: 300,
      pages: [
        { offset: 0, count: 100 },
        { offset: 200, count: 200 },
      ],
    });
    expect(coveredNoteCount(s)).toBe(300);
    expect(sessionCoversEverything(s)).toBe(false);
  });

  it('is false while the total is unknown, and true for an empty source', () => {
    expect(sessionCoversEverything(session({ pages: [{ offset: 0, count: 5 }] }))).toBe(false);
    expect(sessionCoversEverything(session({ totalNotes: 0 }))).toBe(true);
  });
});

describe('recordSessionPage', () => {
  it('does not mutate the session it was given', () => {
    const before = session();
    recordSessionPage(before, { offset: 0, count: 5, totalNotes: 99, nowMs: 2_000 });
    expect(before.pages).toEqual([]);
    expect(before.totalNotes).toBeUndefined();
  });

  it('promotes to complete only when the last gap closes', () => {
    let s = session();
    s = recordSessionPage(s, { offset: 0, count: 500, totalNotes: 1000, nowMs: 2_000 });
    expect(s.status).toBe('reading');
    s = recordSessionPage(s, { offset: 500, count: 500, nowMs: 3_000 });
    expect(s.status).toBe('complete');
    expect(s.ownerPid).toBeUndefined();
  });

  it('accumulates deduped diagnostic codes across pages', () => {
    let s = session();
    s = recordSessionPage(s, {
      offset: 0,
      count: 10,
      totalNotes: 40,
      diagnosticCodes: ['missing-deck', 'unknown-note-type'],
      nowMs: 2_000,
    });
    s = recordSessionPage(s, {
      offset: 10,
      count: 10,
      diagnosticCodes: ['missing-deck'],
      nowMs: 3_000,
    });
    expect(s.diagnosticCodes).toEqual(['missing-deck', 'unknown-note-type']);
  });

  it('ignores a page that lands after the user cancelled', () => {
    const cancelled = cancelSession(session(), 2_000);
    const after = recordSessionPage(cancelled, { offset: 0, count: 500, totalNotes: 500, nowMs: 3_000 });
    expect(after).toBe(cancelled);
    expect(after.status).toBe('cancelled');
  });

  it('ignores a page that lands after the read failed', () => {
    const failed = failSession(session(), 'ECONNREFUSED', 2_000);
    expect(recordSessionPage(failed, { offset: 0, count: 5, nowMs: 3_000 }).status).toBe('failed');
  });
});

describe('reconcileSessionOnLoad', () => {
  it('downgrades a reading session owned by a dead process to interrupted', () => {
    const s = session({ pages: [{ offset: 0, count: 500 }], totalNotes: 1000 });
    const loaded = reconcileSessionOnLoad(s, PID + 1, 9_000);
    expect(loaded.status).toBe('interrupted');
    expect(loaded.ownerPid).toBeUndefined();
    expect(loaded.pages).toEqual(s.pages);
  });

  it('leaves a reading session owned by this very process alone', () => {
    const s = session();
    expect(reconcileSessionOnLoad(s, PID, 9_000).status).toBe('reading');
  });

  it('never revives or re-labels a finished session', () => {
    for (const status of ['complete', 'cancelled', 'failed'] as const) {
      expect(reconcileSessionOnLoad(session({ status }), PID + 1, 9_000).status).toBe(status);
    }
  });

  it('an interrupted read can never come back looking complete', () => {
    let s = session();
    s = recordSessionPage(s, { offset: 0, count: 400, totalNotes: 155_383, nowMs: 2_000 });
    const loaded = reconcileSessionOnLoad(s, PID + 1, 9_000);
    expect(loaded.status).toBe('interrupted');
    expect(sessionCoversEverything(loaded)).toBe(false);
    expect(describeSessionProgress(loaded).percent).toBe(0);
    expect(describeSessionProgress(loaded).resumable).toBe(true);
  });
});

describe('planResume', () => {
  const interrupted = (over: Partial<AnkiDraftSession> = {}): AnkiDraftSession =>
    session({ status: 'interrupted', totalNotes: 1000, pages: [{ offset: 0, count: 500 }], ...over });

  it('resumes at the first unread offset, keeping the page size', () => {
    expect(planResume(interrupted(), 'connect:155383:1464157531')).toEqual({
      verdict: 'ok',
      offset: 500,
      limit: 500,
    });
  });

  it('refuses to splice two collections when the fingerprint moved', () => {
    expect(planResume(interrupted(), 'connect:155400:1464157999')).toEqual({ verdict: 'source-changed' });
  });

  it('resumes when the live fingerprint is simply unknown', () => {
    expect(planResume(interrupted(), undefined).verdict).toBe('ok');
  });

  it('distinguishes a user cancel from a crash', () => {
    expect(planResume(interrupted({ status: 'cancelled' })).verdict).toBe('cancelled-by-user');
  });

  it('reports a complete session as complete, not as nothing to resume', () => {
    expect(planResume(session({ status: 'complete', totalNotes: 10, pages: [{ offset: 0, count: 10 }] })).verdict).toBe(
      'already-complete',
    );
  });

  it('says nothing-to-resume for a failed session that had in fact read it all', () => {
    expect(
      planResume(session({ status: 'failed', totalNotes: 10, pages: [{ offset: 0, count: 10 }] })).verdict,
    ).toBe('nothing-to-resume');
  });
});

describe('describeSessionProgress', () => {
  it('leaves percent absent rather than guessing zero when the total is unknown', () => {
    const p = describeSessionProgress(session({ pages: [{ offset: 0, count: 500 }] }));
    expect(p.percent).toBeUndefined();
    expect(p.covered).toBe(500);
  });

  it('does not offer to resume a cancelled or complete session', () => {
    expect(describeSessionProgress(session({ status: 'cancelled', totalNotes: 10 })).resumable).toBe(false);
    expect(
      describeSessionProgress(session({ status: 'complete', totalNotes: 10, pages: [{ offset: 0, count: 10 }] }))
        .resumable,
    ).toBe(false);
  });

  it('carries the failure reason through so a resumed session can say why it stopped', () => {
    const p = describeSessionProgress(failSession(session({ totalNotes: 10 }), 'anki-unreachable', 5_000));
    expect(p.error).toBe('anki-unreachable');
    expect(p.status).toBe('failed');
  });
});

describe('startSession', () => {
  it('stamps the current version and copies the request', () => {
    const req = { kind: 'csv' as const, filePath: 'C:/x/deck.txt', noteLimit: 500 };
    const s = startSession({
      id: 's2',
      sourceKind: 'csv',
      label: 'deck.txt',
      request: req,
      nowMs: 7,
    });
    expect(s.version).toBe(ANKI_DRAFT_SESSION_VERSION);
    expect(s.status).toBe('reading');
    req.noteLimit = 1;
    expect(s.request.noteLimit).toBe(500);
  });
});
