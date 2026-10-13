// @vitest-environment node
/**
 * The Library import job: progress, Stop, resume, batching, and the
 * in-flight bookkeeping that lets a crashed import be cleaned up.
 */
import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../../shared/types';
import {
  LibraryImportRunner,
  normalizeImportQueueFile,
  type LibraryImportJobDeps,
  type LibraryImportOutcome,
  type LibraryImportProgress,
  type LibraryImportQueueFile,
} from '../libraryImportJob';

function book(id: string, title: string): LibraryItem {
  return { id, title, kind: 'book', createdAt: 1 };
}

interface Harness {
  runner: LibraryImportRunner;
  committed: LibraryItem[][];
  queues: Array<LibraryImportQueueFile | null>;
  events: LibraryImportProgress[];
  seen: string[];
}

function harness(
  outcome: (filePath: string, id: string) => LibraryImportOutcome | Promise<LibraryImportOutcome>,
  extra: Partial<LibraryImportJobDeps> = {},
): Harness {
  const h: Harness = { runner: null as unknown as LibraryImportRunner, committed: [], queues: [], events: [], seen: [] };
  let clock = 0;
  h.runner = new LibraryImportRunner({
    importOne: async (filePath, id) => {
      h.seen.push(filePath);
      return outcome(filePath, id);
    },
    commit: (items) => h.committed.push(items),
    saveQueue: (q) => h.queues.push(q ? { ...q, remaining: [...q.remaining], inflight: [...q.inflight] } : null),
    emit: (p) => h.events.push(p),
    now: () => (clock += 1),
    yieldToLoop: () => Promise.resolve(),
    commitEvery: 2,
    commitAfterMs: 1_000_000,
    ...extra,
  });
  return h;
}

describe('a job', () => {
  it('imports, counts duplicates and failures, commits in batches, and clears its queue', async () => {
    const h = harness((p, id) => {
      if (p.endsWith('dup.epub')) return { status: 'duplicate', existingId: 'x' };
      if (p.endsWith('bad.cbz')) return { status: 'failed', errorCode: 'no-pages' };
      return { status: 'imported', item: book(id, p) };
    });
    const done = await h.runner.start(['C:/b/1.epub', 'C:/b/dup.epub', 'C:/b/2.epub', 'C:/b/bad.cbz', 'C:/b/3.epub']);
    expect(done).toMatchObject({ state: 'done', total: 5, done: 5, imported: 3, duplicates: 1, failed: 1, remaining: 0 });
    expect(done.failures).toEqual([{ name: 'bad.cbz', errorCode: 'no-pages' }]);
    // commitEvery 2: [1,2] then the tail [3]; newest first within a commit.
    expect(h.committed.map((batch) => batch.map((i) => i.title))).toEqual([
      ['C:/b/2.epub', 'C:/b/1.epub'],
      ['C:/b/3.epub'],
    ]);
    expect(done.addedIds).toHaveLength(3);
    expect(h.queues.at(-1)).toBeNull();
    // Progress went out while it ran, with the file being imported named.
    expect(h.events.some((e) => e.state === 'running' && e.current === '2.epub')).toBe(true);
    expect(h.events.at(-1)?.state).toBe('done');
  });

  it('de-duplicates its own paths (same file twice in one request)', async () => {
    const h = harness((p, id) => ({ status: 'imported', item: book(id, p) }));
    await h.runner.start(['C:/a.epub', 'C:/a.epub']);
    expect(h.seen).toEqual(['C:/a.epub']);
  });

  it('records an id as in flight BEFORE importing it, and clears it on commit', async () => {
    let inflightWhileImporting: string[] = [];
    const h = harness((p, id) => {
      inflightWhileImporting = [...(h.queues.at(-1)?.inflight ?? [])];
      return { status: 'imported', item: book(id, p) };
    });
    const done = await h.runner.start(['C:/one.epub']);
    expect(inflightWhileImporting).toEqual(done.addedIds);
    expect(h.queues.at(-1)).toBeNull();
  });

  it('a failed file is not left in flight (its importer cleaned up)', async () => {
    const snapshots: string[][] = [];
    const h = harness(
      (p, id) => (p.includes('bad') ? { status: 'failed', errorCode: 'bad-file' } : { status: 'imported', item: book(id, p) }),
      { saveQueue: (q) => snapshots.push(q ? [...q.inflight] : []) },
    );
    await h.runner.start(['C:/bad.epub', 'C:/good.epub']);
    // While good.epub imports, only its own id is in flight — bad.epub's was dropped.
    expect(snapshots.some((s) => s.length === 1)).toBe(true);
    expect(snapshots.every((s) => s.length <= 1)).toBe(true);
    expect(snapshots.at(-1)).toEqual([]);
  });

  it('Stop finishes the current file, commits what was done, and keeps the rest for Resume', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const h = harness(async (p, id) => {
      if (p.endsWith('1.epub')) await gate;
      return { status: 'imported', item: book(id, p) };
    });
    const running = h.runner.start(['C:/1.epub', 'C:/2.epub', 'C:/3.epub']);
    await Promise.resolve();
    const jobId = h.runner.status()?.jobId;
    expect(h.runner.cancel('some-other-job')).toBe(false);
    expect(h.runner.cancel(jobId)).toBe(true);
    release();
    const done = await running;
    expect(done).toMatchObject({ state: 'cancelled', done: 1, imported: 1, remaining: 2 });
    expect(h.committed.flat().map((i) => i.title)).toEqual(['C:/1.epub']);
    expect(h.queues.at(-1)).toMatchObject({ remaining: ['C:/2.epub', 'C:/3.epub'], inflight: [] });
    expect(h.runner.isRunning()).toBe(false);
  });

  it('a second request joins the running job instead of racing it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const h = harness(async (p, id) => {
      if (p.endsWith('first.epub')) await gate;
      return { status: 'imported', item: book(id, p) };
    });
    const a = h.runner.start(['C:/first.epub']);
    await Promise.resolve();
    const b = h.runner.start(['C:/second.epub', 'C:/first.epub']);
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.jobId).toBe(rb.jobId);
    expect(ra).toMatchObject({ total: 2, imported: 2 });
    expect(h.seen).toEqual(['C:/first.epub', 'C:/second.epub']);
  });

  it('an importer that throws is a failure for that file, not a dead job', async () => {
    const h = harness((p, id) => {
      if (p.includes('boom')) throw new Error('boom');
      return { status: 'imported', item: book(id, p) };
    });
    const done = await h.runner.start(['C:/boom.epub', 'C:/ok.epub']);
    expect(done).toMatchObject({ state: 'done', failed: 1, imported: 1 });
  });

  it('a commit that throws does not wedge the runner', async () => {
    const h = harness((p, id) => ({ status: 'imported', item: book(id, p) }), {
      commit: () => {
        throw new Error('disk');
      },
    });
    await expect(h.runner.start(['C:/x.epub'])).rejects.toThrow('disk');
    expect(h.runner.isRunning()).toBe(false);
  });
});

describe('the persisted queue', () => {
  it('validates what it reads back', () => {
    expect(normalizeImportQueueFile(null)).toBeNull();
    expect(normalizeImportQueueFile({ remaining: ['a', 3, ''], inflight: 'x', startedAt: 'y' })).toEqual({
      remaining: ['a'],
      inflight: [],
      startedAt: 0,
    });
  });
});
