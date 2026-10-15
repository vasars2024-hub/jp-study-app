// @vitest-environment jsdom
/**
 * The review-log cap archives instead of deleting (scorecard: "the 50k cap
 * must not silently drop history the optimiser needs").
 *
 * Rows past `REVIEW_LOG_LIMIT` move into `review-log-archive:` chunk records in
 * the same batch that removes them. Statistics keeps reading the live window;
 * the optimiser and the memory replay read everything via `loadFullReviewLog`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ store: new Map<string, unknown>(), batches: 0 }));

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
  // One transaction in the real module.
  kvBatch: async (ops: Array<{ type: 'put' | 'delete'; key: string; value?: unknown }>) => {
    h.batches += 1;
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

function seedRows(count: number): void {
  for (let i = 0; i < count; i += 1) {
    const id = `row-${String(i).padStart(3, '0')}`;
    h.store.set(`review-log-row:${id}`, {
      id, at: 1_000_000 + i * 1000, mode: 'review', cardId: `c${i % 3}`, rating: 'good', correct: true,
      ...(i < 3 ? { isNew: true } : {}),
    });
  }
}

beforeEach(async () => {
  h.store.clear();
  h.batches = 0;
  const log = await import('../reviewLog');
  log.resetReviewLogForTests();
});

describe('review-log archive', () => {
  it('moves the oldest rows past the cap into an archive chunk, in one batch, losing none', async () => {
    const log = await import('../reviewLog');
    seedRows(12);
    const moved = await log.pruneReviewLog(5);
    expect(moved).toBe(7);
    expect(h.batches).toBe(1);
    const rowKeys = [...h.store.keys()].filter((key) => key.startsWith('review-log-row:'));
    const archiveKeys = [...h.store.keys()].filter((key) => key.startsWith(log.REVIEW_LOG_ARCHIVE_PREFIX));
    expect(rowKeys).toHaveLength(5);
    expect(archiveKeys).toHaveLength(1);
    const chunk = h.store.get(archiveKeys[0]) as { entries: Array<{ id: string }> };
    expect(chunk.entries.map((entry) => entry.id)).toEqual(
      Array.from({ length: 7 }, (_, i) => `row-${String(i).padStart(3, '0')}`),
    );

    // Statistics: the live window. The optimiser and replay: everything, in time order.
    const live = await log.loadReviewLog();
    expect(live).toHaveLength(5);
    const full = await log.loadFullReviewLog();
    expect(full).toHaveLength(12);
    expect(full.map((entry) => entry.at)).toEqual([...full.map((entry) => entry.at)].sort((a, b) => a - b));
    expect(full.filter((entry) => entry.isNew)).toHaveLength(3);
  });

  it('archives nothing under the cap, and a second pass adds a second chunk', async () => {
    const log = await import('../reviewLog');
    seedRows(4);
    expect(await log.pruneReviewLog(5)).toBe(0);
    expect(h.batches).toBe(0);
    seedRows(9);
    expect(await log.pruneReviewLog(5)).toBe(4);
    for (let i = 9; i < 12; i += 1) {
      const id = `row-${String(i).padStart(3, '0')}`;
      h.store.set(`review-log-row:${id}`, { id, at: 1_000_000 + i * 1000, mode: 'review', cardId: 'c0', rating: 'good', correct: true });
    }
    expect(await log.pruneReviewLog(5)).toBe(3);
    const archives = [...h.store.keys()].filter((key) => key.startsWith(log.REVIEW_LOG_ARCHIVE_PREFIX));
    expect(archives).toHaveLength(2);
    log.resetReviewLogForTests();
    expect(await log.loadFullReviewLog()).toHaveLength(12);
  });

  it('gives Statistics a range past the live window from the archive, and only then', async () => {
    const log = await import('../reviewLog');
    seedRows(12);
    await log.pruneReviewLog(5);
    // Rows 7..11 are live (at 1_007_000 on); 0..6 are archived.
    const recent = await log.loadReviewLogSince(1_008_000);
    expect(recent.map((entry) => entry.id)).toEqual(['row-007', 'row-008', 'row-009', 'row-010', 'row-011']);
    const long = await log.loadReviewLogSince(1_002_000);
    expect(long.map((entry) => entry.at)).toEqual(Array.from({ length: 10 }, (_, i) => 1_002_000 + i * 1000));
    // The live window is untouched by a long read.
    expect(await log.loadReviewLog()).toHaveLength(5);
  });

  it('reads the archive again after an archive pass, and nothing extra with no archive', async () => {
    const log = await import('../reviewLog');
    seedRows(4);
    expect((await log.loadReviewLogSince(0)).map((entry) => entry.id)).toEqual(['row-000', 'row-001', 'row-002', 'row-003']);
    for (let i = 4; i < 9; i += 1) {
      const id = `row-${String(i).padStart(3, '0')}`;
      h.store.set(`review-log-row:${id}`, { id, at: 1_000_000 + i * 1000, mode: 'review', cardId: 'c0', rating: 'good', correct: true });
    }
    log.resetReviewLogForTests();
    expect(await log.loadReviewLogSince(0)).toHaveLength(9);
    expect(await log.pruneReviewLog(5)).toBe(4);
    log.resetReviewLogForTests();
    expect(await log.loadReviewLogSince(0)).toHaveLength(9);
  });
});
