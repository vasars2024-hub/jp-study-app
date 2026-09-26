// @vitest-environment jsdom
/**
 * The review log is merged into what is stored, never replaced by one
 * window's copy.
 *
 * Before: a `kvGet` that failed at load became [] and the next answer saved
 * that one-row list over the whole history; and every window saved its own
 * cache, so two windows reviewing at once overwrote each other's rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  failNextGet: false,
}));

vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => {
    if (h.failNextGet) {
      h.failNextGet = false;
      throw new DOMException('Internal error opening backing store', 'UnknownError');
    }
    return structuredClone(h.store.get(key));
  },
  kvSet: async (key: string, value: unknown) => {
    h.store.set(key, structuredClone(value));
  },
  // One transaction in the real module: read, merge, write, nothing in between.
  kvUpdate: async (key: string, update: (current: unknown) => unknown) => {
    const next = update(structuredClone(h.store.get(key)));
    if (next !== undefined) h.store.set(key, structuredClone(next));
    return next ?? h.store.get(key);
  },
  kvDelete: async (key: string) => {
    h.store.delete(key);
  },
  kvBatch: async (ops: Array<{ type: 'put' | 'delete'; key: string; value?: unknown }>) => {
    for (const op of ops) {
      if (op.type === 'put') h.store.set(op.key, structuredClone(op.value));
      else h.store.delete(op.key);
    }
  },
  kvScanPrefix: async (prefix: string) =>
    [...h.store.entries()].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, structuredClone(value)]),
}));
vi.mock('../stats', () => ({ recordReviewActivity: () => undefined }));

const KEY = 'review-log-v1';

function history(count: number) {
  return {
    version: 1,
    entries: Array.from({ length: count }, (_, i) => ({ id: `old-${i}`, at: 1_000 + i, mode: 'review', correct: true })),
  };
}

/**
 * Every stored row in time order: the whole-log value older builds wrote plus
 * the rows appended beside it (one record each — appends never rewrite the log).
 */
const storedIds = (): string[] => {
  const legacy = (h.store.get(KEY) as { entries: Array<{ id: string; at: number }> } | undefined)?.entries ?? [];
  const rows = [...h.store.entries()]
    .filter(([key]) => key.startsWith('review-log-row:'))
    .map(([, value]) => value as { id: string; at: number });
  return [...legacy, ...rows].sort((a, b) => a.at - b.at).map((e) => e.id);
};

async function freshWindow() {
  vi.resetModules();
  return import('../reviewLog');
}

beforeEach(() => {
  h.store.clear();
  h.failNextGet = false;
});

describe('review log writes', () => {
  it('a failed read at load never lets the next answer replace the history', async () => {
    h.store.set(KEY, history(3));
    h.failNextGet = true;
    const log = await freshWindow();
    expect(await log.loadReviewLog()).toEqual([]);
    const row = log.appendReviewLog({ mode: 'review', correct: true, at: 5_000 });
    await log.flushReviewLogWrites();
    expect(storedIds()).toEqual(['old-0', 'old-1', 'old-2', row.id]);
  });

  it('two windows answering at once keep both rows', async () => {
    h.store.set(KEY, history(2));
    const a = await freshWindow();
    await a.loadReviewLog();
    const b = await freshWindow();
    await b.loadReviewLog();

    const fromA = a.appendReviewLog({ mode: 'review', correct: true, at: 6_000 });
    const fromB = b.appendReviewLog({ mode: 'review', correct: false, at: 6_001 });
    await Promise.all([a.flushReviewLogWrites(), b.flushReviewLogWrites()]);

    expect(storedIds()).toEqual(['old-0', 'old-1', fromA.id, fromB.id]);
  });

  it('an undo removes only its own row', async () => {
    h.store.set(KEY, history(2));
    const log = await freshWindow();
    await log.loadReviewLog();
    const row = log.appendReviewLog({ mode: 'review', correct: true, at: 7_000 });
    await log.flushReviewLogWrites();
    log.removeReviewLogEntry(row);
    await log.flushReviewLogWrites();
    expect(storedIds()).toEqual(['old-0', 'old-1']);
  });

  it('an answer is one small write: the stored history is never read back or rewritten', async () => {
    h.store.set(KEY, history(20_000));
    const log = await freshWindow();
    await log.loadReviewLog();
    const before = h.store.get(KEY);
    const row = log.appendReviewLog({ mode: 'review', correct: true, at: 9_000_000 });
    await log.flushReviewLogWrites();
    expect(h.store.get(KEY)).toBe(before);
    expect(h.store.get(`review-log-row:${row.id}`)).toMatchObject({ id: row.id });
  });

  it('an undo of a row an older build stored takes it out of that value', async () => {
    h.store.set(KEY, history(3));
    const log = await freshWindow();
    const rows = await log.loadReviewLog();
    log.removeReviewLogEntry(rows[1]);
    await log.flushReviewLogWrites();
    expect(storedIds()).toEqual(['old-0', 'old-2']);
  });

  it('never writes over a stored value that is not a review log', async () => {
    h.store.set(KEY, 'unreadable');
    const log = await freshWindow();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await log.loadReviewLog();
    log.appendReviewLog({ mode: 'review', correct: true, at: 8_000 });
    await log.flushReviewLogWrites();
    expect(h.store.get(KEY)).toBe('unreadable');
  });
});
