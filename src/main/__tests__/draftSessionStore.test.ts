// @vitest-environment node
/**
 * The disk half of draft sessions, and the one property gate 7 turns on: a read
 * that stopped early must never come back looking finished.
 *
 * The crash is simulated the only way it can be without killing a process —
 * write the file exactly as a dying process would have left it (`reading`, with
 * some other pid as owner), drop the in-memory cache, and load again. That is
 * byte-for-byte the state on disk after a kill, so the assertion is about the
 * real recovery path rather than about a mock.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let userDataDir = '';

vi.mock('electron', () => ({
  app: { getPath: (): string => userDataDir },
}));

const store = await import('../anki/draftSessionStore');
const { ANKI_DRAFT_SESSION_VERSION } = await import('../../shared/ankiDraftSession');

const CSV_REQUEST = {
  sourceKind: 'csv' as const,
  label: 'HSK4_deck.txt',
  request: { kind: 'csv' as const, filePath: 'C:/Downloads/HSK4_deck.txt', noteLimit: 500 },
  fingerprint: 'csv:608:1786790000000',
};

function storeFile(): string {
  return path.join(userDataDir, 'anki-draft-sessions.json');
}

/** Reopen the app: forget everything in memory, re-read the file. */
function restart(): void {
  store.resetDraftSessionCache();
}

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anki-draft-sessions-'));
  store.resetDraftSessionCache();
});

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

describe('draft session persistence', () => {
  it('writes a session to disk as soon as it begins', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    expect(session.status).toBe('reading');
    expect(session.ownerPid).toBe(process.pid);

    const onDisk = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    expect(onDisk.version).toBe(ANKI_DRAFT_SESSION_VERSION);
    expect(onDisk.sessions).toHaveLength(1);
    expect(onDisk.sessions[0].id).toBe(session.id);
  });

  it('survives a restart with its pages intact', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    store.recordDraftSessionPage(session.id, { offset: 0, count: 500, totalNotes: 608 });

    restart();
    const loaded = store.getDraftSession(session.id);
    expect(loaded?.pages).toEqual([{ offset: 0, count: 500 }]);
    expect(loaded?.totalNotes).toBe(608);
  });

  it('reaches complete only when the pages are contiguous to the total', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    store.recordDraftSessionPage(session.id, { offset: 0, count: 500, totalNotes: 608 });
    expect(store.getDraftSession(session.id)?.status).toBe('reading');
    const done = store.recordDraftSessionPage(session.id, { offset: 500, count: 108 });
    expect(done?.status).toBe('complete');
  });
});

describe('recovery after a crash', () => {
  /** Rewrite the file as a process that died mid-read would have left it. */
  function killOwner(id: string): void {
    const file = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    for (const s of file.sessions) {
      if (s.id === id) {
        s.status = 'reading';
        s.ownerPid = process.pid + 1;
      }
    }
    fs.writeFileSync(storeFile(), JSON.stringify(file), 'utf8');
    restart();
  }

  it('downgrades a session left reading by a dead process to interrupted', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    store.recordDraftSessionPage(session.id, { offset: 0, count: 500, totalNotes: 608 });
    killOwner(session.id);

    const loaded = store.getDraftSession(session.id);
    expect(loaded?.status).toBe('interrupted');
    expect(loaded?.ownerPid).toBeUndefined();
    // The pages that did land are still there — recovery resumes, not restarts.
    expect(loaded?.pages).toEqual([{ offset: 0, count: 500 }]);
  });

  it('reports the partial read as partial, never as a success', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    store.recordDraftSessionPage(session.id, { offset: 0, count: 500, totalNotes: 608 });
    killOwner(session.id);

    const summary = store.summarizeDraftSessions().find((s) => s.session.id === session.id);
    expect(summary?.progress.status).toBe('interrupted');
    expect(summary?.progress.covered).toBe(500);
    expect(summary?.progress.totalNotes).toBe(608);
    expect(summary?.progress.percent).toBe(82);
    expect(summary?.progress.resumable).toBe(true);
  });

  it('resumes at the first unread note when the source has not moved', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    store.recordDraftSessionPage(session.id, { offset: 0, count: 500, totalNotes: 608 });
    killOwner(session.id);

    const result = store.resumeDraftSession(session.id, CSV_REQUEST.fingerprint);
    expect(result.plan).toEqual({ verdict: 'ok', offset: 500, limit: 500 });
    expect(result.session?.status).toBe('reading');
    expect(result.session?.ownerPid).toBe(process.pid);
  });

  it('refuses to resume across a source that changed, and keeps the session', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    store.recordDraftSessionPage(session.id, { offset: 0, count: 500, totalNotes: 608 });
    killOwner(session.id);

    const result = store.resumeDraftSession(session.id, 'csv:611:1786799999999');
    expect(result.plan.verdict).toBe('source-changed');
    expect(result.plan.offset).toBeUndefined();
    // Not deleted: the surface has to be able to explain what happened.
    expect(store.getDraftSession(session.id)?.status).toBe('interrupted');
  });

  it('reopening the same file finds the interrupted session instead of doubling it', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    store.recordDraftSessionPage(session.id, { offset: 0, count: 500, totalNotes: 608 });
    killOwner(session.id);

    const reopened = store.beginDraftSession(CSV_REQUEST);
    expect(reopened.id).toBe(session.id);
    expect(store.listDraftSessions()).toHaveLength(1);
    expect(reopened.pages).toEqual([{ offset: 0, count: 500 }]);
  });

  it('a session this very process still owns is left alone', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    restart();
    expect(store.getDraftSession(session.id)?.status).toBe('reading');
  });
});

describe('cancellation', () => {
  it('keeps the pages but stops offering to resume', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    store.recordDraftSessionPage(session.id, { offset: 0, count: 500, totalNotes: 608 });
    const cancelled = store.cancelDraftSession(session.id);

    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.pages).toEqual([{ offset: 0, count: 500 }]);
    expect(store.resumeDraftSession(session.id, CSV_REQUEST.fingerprint).plan.verdict).toBe(
      'cancelled-by-user',
    );
  });

  it('a page that arrives after the cancel does not revive the session', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    store.cancelDraftSession(session.id);
    const late = store.recordDraftSessionPage(session.id, { offset: 0, count: 608, totalNotes: 608 });
    expect(late?.status).toBe('cancelled');
    restart();
    expect(store.getDraftSession(session.id)?.status).toBe('cancelled');
  });

  it('a cancelled session is not reused by the next read of the same file', () => {
    const first = store.beginDraftSession(CSV_REQUEST);
    store.cancelDraftSession(first.id);
    const second = store.beginDraftSession(CSV_REQUEST);
    expect(second.id).not.toBe(first.id);
    expect(store.listDraftSessions()).toHaveLength(2);
  });
});

describe('failure', () => {
  it('records why, and still offers to resume what was left', () => {
    const session = store.beginDraftSession({
      ...CSV_REQUEST,
      sourceKind: 'ankiconnect',
      request: { kind: 'ankiconnect', query: 'deck:*', noteLimit: 500 },
    });
    store.recordDraftSessionPage(session.id, { offset: 0, count: 500, totalNotes: 155_383 });
    const failed = store.failDraftSession(session.id, 'anki-unreachable');

    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBe('anki-unreachable');
    restart();
    const summary = store.summarizeDraftSessions()[0];
    expect(summary.progress.error).toBe('anki-unreachable');
    expect(summary.progress.resumable).toBe(true);
    expect(summary.progress.percent).toBe(0);
  });
});

describe('the file itself', () => {
  it('ignores unreadable garbage rather than throwing on startup', () => {
    fs.writeFileSync(storeFile(), 'not json at all', 'utf8');
    restart();
    expect(store.listDraftSessions()).toEqual([]);
  });

  it('drops records written by a version this build cannot interpret', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    const file = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    file.sessions[0].version = ANKI_DRAFT_SESSION_VERSION + 1;
    fs.writeFileSync(storeFile(), JSON.stringify(file), 'utf8');
    restart();
    expect(store.getDraftSession(session.id)).toBeUndefined();
  });

  it('retains only the newest sessions', () => {
    for (let i = 0; i < store.MAX_RETAINED_SESSIONS + 5; i += 1) {
      store.beginDraftSession({
        ...CSV_REQUEST,
        request: { kind: 'csv', filePath: `C:/Downloads/deck-${i}.txt`, noteLimit: 500 },
      });
    }
    expect(store.listDraftSessions()).toHaveLength(store.MAX_RETAINED_SESSIONS);
  });

  it('deletes a session on request and says whether it existed', () => {
    const session = store.beginDraftSession(CSV_REQUEST);
    expect(store.deleteDraftSession(session.id)).toBe(true);
    expect(store.deleteDraftSession(session.id)).toBe(false);
    restart();
    expect(store.listDraftSessions()).toEqual([]);
  });

  it('shows only the latest read of a file and restores all cleared reads', () => {
    const first = store.beginDraftSession(CSV_REQUEST);
    store.cancelDraftSession(first.id);
    const second = store.beginDraftSession(CSV_REQUEST);
    expect(store.listDraftSessions()).toHaveLength(2);
    expect(store.summarizeDraftSessions().map((row) => row.session.id)).toEqual([second.id]);
    const removed = store.clearDraftSessions();
    expect(removed).toHaveLength(2);
    restart();
    expect(store.listDraftSessions()).toEqual([]);
    expect(store.restoreDraftSessions(removed)).toBe(2);
    restart();
    expect(store.summarizeDraftSessions().map((row) => row.session.id)).toEqual([second.id]);
  });
});

/** D26: "Recent reads" listed the same file once per read. */
describe('recent reads are one row per path + fingerprint', () => {
  /** A complete read, so the next begin starts a new session instead of reusing it. */
  function completedRead(filePath: string, fingerprint: string, nowMs: number): string {
    vi.setSystemTime(nowMs);
    const session = store.beginDraftSession({
      ...CSV_REQUEST,
      request: { kind: 'csv', filePath, noteLimit: 500 },
      fingerprint,
    });
    store.recordDraftSessionPage(session.id, { offset: 0, count: 10, totalNotes: 10 });
    return session.id;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('folds repeated reads of the same file, newest first, and counts what it folded', () => {
    vi.useFakeTimers();
    const first = completedRead('C:/Downloads/deck.txt', 'fp-1', 1_000);
    const second = completedRead('C:\\Downloads\\DECK.txt', 'fp-1', 2_000);
    const third = completedRead('C:/Downloads/deck.txt', 'fp-1', 3_000);
    const other = completedRead('C:/Downloads/other.txt', 'fp-9', 2_500);
    expect(store.listDraftSessions()).toHaveLength(4);
    const rows = store.summarizeDraftSessions();
    expect(rows.map((row) => row.session.id)).toEqual([third, other]);
    expect(rows[0].earlierReads).toBe(2);
    expect(rows[1].earlierReads).toBe(0);
    expect([first, second]).not.toContain(rows[0].session.id);
  });

  it('keeps a changed file (same path, new fingerprint) as its own row', () => {
    vi.useFakeTimers();
    completedRead('C:/Downloads/deck.txt', 'fp-1', 1_000);
    const changed = completedRead('C:/Downloads/deck.txt', 'fp-2', 2_000);
    const rows = store.summarizeDraftSessions();
    expect(rows).toHaveLength(2);
    expect(rows[0].session.id).toBe(changed);
  });

  it('discarding the visible row discards the reads folded under it, so none resurfaces', () => {
    vi.useFakeTimers();
    completedRead('C:/Downloads/deck.txt', 'fp-1', 1_000);
    const newest = completedRead('C:/Downloads/deck.txt', 'fp-1', 2_000);
    const other = completedRead('C:/Downloads/other.txt', 'fp-9', 1_500);
    expect(store.deleteDraftSession(newest)).toBe(true);
    restart();
    expect(store.summarizeDraftSessions().map((row) => row.session.id)).toEqual([other]);
    expect(store.listDraftSessions()).toHaveLength(1);
  });

  it('keeps at most a few older reads per file, so one file cannot evict the rest', () => {
    vi.useFakeTimers();
    const kept = completedRead('C:/Downloads/keep.txt', 'fp-k', 500);
    for (let i = 0; i < store.MAX_RETAINED_SESSIONS + 6; i += 1) {
      completedRead('C:/Downloads/deck.txt', 'fp-1', 1_000 + i);
    }
    const ids = store.listDraftSessions().map((s) => s.id);
    expect(ids).toContain(kept);
    expect(ids).toHaveLength(2 + store.MAX_EARLIER_READS_PER_SOURCE);
  });
});
