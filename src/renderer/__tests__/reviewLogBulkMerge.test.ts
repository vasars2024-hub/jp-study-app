// @vitest-environment jsdom
/**
 * Merging history from elsewhere (an Anki package's review log) into the
 * review log: once, deduplicated against everything kept (the archive too),
 * never counted as today's study, never handed to the Anki sync's row
 * listeners, archived when it is older than the live window, and removable by
 * the import's undo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ store: new Map<string, unknown>(), activity: 0 }));

vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => structuredClone(h.store.get(key)),
  kvSet: async (key: string, value: unknown) => {
    h.store.set(key, structuredClone(value));
  },
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
vi.mock('../stats', () => ({ recordReviewActivity: () => { h.activity += 1; } }));
// A live window of ten rows, so the archive pass is reachable with a handful.
vi.mock('../../shared/reviewLog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/reviewLog')>()),
  REVIEW_LOG_LIMIT: 10,
}));

const row = (id: string, at: number, cardId = 'c1', extra: Record<string, unknown> = {}) => ({
  id, at, mode: 'review', cardId, rating: 'good', correct: true, ...extra,
});

beforeEach(async () => {
  h.store.clear();
  h.activity = 0;
  const log = await import('../reviewLog');
  log.resetReviewLogForTests();
});

describe('mergeReviewLogRows', () => {
  it('writes new rows once, without counting them as today or telling the row listeners', async () => {
    const log = await import('../reviewLog');
    const heard: string[] = [];
    const off = log.onReviewLogEntry({ appended: (entry) => heard.push(entry.id) });
    const first = await log.mergeReviewLogRows([row('anki-1-100', 100, 'c1', { isNew: true }), row('anki-1-200', 200), { nonsense: true }]);
    off();
    expect(first).toMatchObject({ added: 2, duplicates: 0, invalid: 1, ids: ['anki-1-100', 'anki-1-200'] });
    expect([...h.store.keys()].filter((key) => key.startsWith('review-log-row:'))).toHaveLength(2);
    expect(h.activity).toBe(0);
    expect(heard).toEqual([]);
    // The same package again: nothing new.
    const again = await log.mergeReviewLogRows([row('anki-1-100', 100), row('anki-1-200', 200)]);
    expect(again).toMatchObject({ added: 0, duplicates: 2 });
    expect((await log.loadFullReviewLog()).map((entry) => entry.id)).toEqual(['anki-1-100', 'anki-1-200']);
  });

  it('knows an answer it already has under another id (a Gum export coming back)', async () => {
    const log = await import('../reviewLog');
    const own = log.appendReviewLog({ at: 5_000, mode: 'review', cardId: 'c9', rating: 'easy', correct: true });
    await log.flushReviewLogWrites();
    const merged = await log.mergeReviewLogRows([row('anki-9-5000', 5_000, 'c9'), row('anki-9-6000', 6_000, 'c9')]);
    expect(merged).toMatchObject({ added: 1, duplicates: 1, ids: ['anki-9-6000'] });
    expect((await log.loadFullReviewLog()).map((entry) => entry.id)).toEqual([own.id, 'anki-9-6000']);
  });

  it('dedupes against the archive, and archives what is older than the live window', async () => {
    const log = await import('../reviewLog');
    h.store.set('review-log-archive:000000000000001-old', { version: 1, entries: [row('anki-1-1', 1)] });
    for (let i = 0; i < 8; i += 1) h.store.set(`review-log-row:live-${i}`, row(`live-${i}`, 1_000_000 + i, 'c2'));
    const merged = await log.mergeReviewLogRows([
      row('anki-1-1', 1),
      ...Array.from({ length: 5 }, (_, i) => row(`anki-1-${10 + i}`, 10 + i)),
    ]);
    expect(merged).toMatchObject({ added: 5, duplicates: 1 });
    // 8 live + 5 merged = 13 rows against a window of 10: the 3 oldest moved to the archive.
    const live = [...h.store.keys()].filter((key) => key.startsWith('review-log-row:'));
    expect(live).toHaveLength(10);
    const full = await log.loadFullReviewLog();
    expect(full).toHaveLength(14);
    expect(full.slice(0, 4).map((entry) => entry.id)).toEqual(['anki-1-1', 'anki-1-10', 'anki-1-11', 'anki-1-12']);
    expect((await log.loadReviewLog()).length).toBeLessThanOrEqual(10);
  });

  it('the import\'s undo takes the merged rows back out, live or archived', async () => {
    const log = await import('../reviewLog');
    for (let i = 0; i < 9; i += 1) h.store.set(`review-log-row:live-${i}`, row(`live-${i}`, 1_000_000 + i, 'c2'));
    const merged = await log.mergeReviewLogRows([row('anki-1-1', 1), row('anki-1-2', 2), row('anki-1-3', 2_000_000)]);
    expect(merged.added).toBe(3);
    const removed = await log.removeMergedReviewLogRows(merged.ids);
    expect(removed).toBe(3);
    const full = await log.loadFullReviewLog();
    expect(full.map((entry) => entry.id).filter((id) => id.startsWith('anki-'))).toEqual([]);
    expect(full).toHaveLength(9);
  });

  it('a failed write is reported to the caller and does not stop later appends', async () => {
    const db = await import('../storage/db');
    const log = await import('../reviewLog');
    const batch = vi.spyOn(db, 'kvBatch');
    batch.mockRejectedValueOnce(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(log.mergeReviewLogRows([row('anki-1-1', 1)])).rejects.toThrow('disk full');
    batch.mockRestore();
    log.appendReviewLog({ at: 9_000, mode: 'review', cardId: 'c1', rating: 'good', correct: true });
    await log.flushReviewLogWrites();
    expect([...h.store.keys()].filter((key) => key.startsWith('review-log-row:'))).toHaveLength(1);
  });
});
