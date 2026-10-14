// @vitest-environment jsdom
/**
 * The renderer half of an .apkg import's history: each card's Anki answers land
 * in the review log under the Gum card they belong to (once, however often the
 * deck is imported), the deck options' FSRS parameters are kept for Settings
 * without moving a single interval, the notice says both, and undoing the
 * import takes the answers back out with the cards.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
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
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: async () => undefined }));

import { DEFAULT_FSRS6_WEIGHTS } from '../../shared/fsrs';
import { apkgHistoryRows, apkgImportNotice, importApkgCards } from '../apkgImport';
import { executeImport, undoImports } from '../fileImportExecute';
import { loadDeck, resetDeckMemoryForTests } from '../flashcardDeck';
import { loadSchedulingConfig } from '../flashcardScheduling';
import { loadFullReviewLog, resetReviewLogForTests } from '../reviewLog';

const DAY = 86_400_000;
const T0 = Date.UTC(2025, 3, 1, 9);

const HISTORY = [
  { id: T0, ease: 3, ivl: -600, lastIvl: 0, factor: 0, time: 7_000, type: 0 },
  { id: T0 + 600_000, ease: 3, ivl: 1, lastIvl: -600, factor: 2500, time: 5_000, type: 0 },
  { id: T0 + DAY, ease: 3, ivl: 4, lastIvl: 1, factor: 2500, time: 4_000, type: 1 },
];

function packageResult() {
  return {
    ok: true,
    fileName: 'core.apkg',
    noteCount: 2,
    cards: [
      { word: '猫', reading: 'ねこ', meaning: 'cat', deck: 'Core', ankiCardId: 11, history: HISTORY },
      { word: '犬', reading: 'いぬ', meaning: 'dog', deck: 'Core', ankiCardId: 12 },
    ],
    report: {
      emptyNotes: 0, duplicateNotes: 0, extraFieldNotes: 0, scheduledCards: 1,
      mediaKept: 0, mediaMissing: 0, mediaSkipped: 0, mediaUnreadable: false, historyReviews: 3,
    },
    fsrs: { weights: [...DEFAULT_FSRS6_WEIGHTS], desiredRetention: 0.88, presetName: 'Japanese', deckName: 'Core' },
  };
}

const api = {
  importApkgCards: vi.fn(async () => packageResult()),
  onApkgImportProgress: vi.fn(() => () => undefined),
};

beforeEach(() => {
  localStorage.clear();
  h.store.clear();
  resetDeckMemoryForTests();
  resetReviewLogForTests();
  (window as unknown as { api: typeof api }).api = api;
  api.importApkgCards.mockImplementation(async () => packageResult());
});

describe('an .apkg import brings its review history', () => {
  it('merges each card\'s answers under the Gum card it landed on, once', async () => {
    const res = await importApkgCards('C:/decks/core.apkg');
    expect(res).toMatchObject({ ok: true, historyAdded: 3, fsrsVersion: 6 });
    const neko = loadDeck().find((card) => card.word === '猫');
    const log = await loadFullReviewLog();
    expect(log.map((row) => [row.id, row.cardId, row.rating, row.isNew === true])).toEqual([
      [`anki-11-${T0}`, neko?.id, 'good', true],
      [`anki-11-${T0 + 600_000}`, neko?.id, 'good', false],
      [`anki-11-${T0 + DAY}`, neko?.id, 'good', false],
    ]);
    expect(apkgImportNotice(res)).toContain('3 past answers from Anki’s review history were added to yours.');
    expect(apkgImportNotice(res)).toContain('1 card kept its Anki interval.');
    expect(apkgImportNotice(res)).not.toContain('is not imported');

    // The same deck again: the cards update in place and no answer is added twice.
    const again = await importApkgCards('C:/decks/core.apkg');
    expect(again.historyAdded).toBeUndefined();
    expect(apkgImportNotice(again)).toContain('3 past answers from Anki were already in your review history.');
    expect(await loadFullReviewLog()).toHaveLength(3);
  });

  it('keeps the deck options\' FSRS parameters for Settings without applying them', async () => {
    const before = loadSchedulingConfig();
    const res = await importApkgCards('C:/decks/core.apkg');
    const config = loadSchedulingConfig();
    expect(config.ankiFsrsImport).toMatchObject({
      weights: [...DEFAULT_FSRS6_WEIGHTS],
      desiredRetention: 0.88,
      presetName: 'Japanese',
      deckName: 'Core',
      fileName: 'core.apkg',
    });
    expect(config.algorithm).toBe(before.algorithm);
    expect(config.fsrsVersion).toBe(5);
    expect(config.fsrsWeights).toBeUndefined();
    expect(apkgImportNotice(res)).toContain('FSRS-6 parameters are waiting in the scheduling settings');
  });

  it('a package with no review log keeps the old schedule sentence and adds no rows', async () => {
    api.importApkgCards.mockImplementation(async () => {
      const result = packageResult();
      return { ...result, cards: result.cards.map(({ history: _h, ...card }) => card), report: { ...result.report, historyReviews: 0 }, fsrs: undefined as never };
    });
    const res = await importApkgCards('C:/decks/core.apkg');
    expect(res.historyAdded).toBeUndefined();
    expect(apkgImportNotice(res)).toContain('Anki interval');
    expect(await loadFullReviewLog()).toEqual([]);
  });

  it('undoing the drop removes the cards and the answers that came with them', async () => {
    const receipt = await executeImport(
      { path: 'C:/decks/core.apkg', name: 'core.apkg', isDirectory: false },
      'anki-cards',
      {},
    );
    expect(receipt?.reviewLogIds).toHaveLength(3);
    expect(await loadFullReviewLog()).toHaveLength(3);
    await undoImports(receipt ? [receipt] : []);
    expect(loadDeck()).toEqual([]);
    expect(await loadFullReviewLog()).toEqual([]);
  });

  it('only cards that landed somewhere get rows', () => {
    const rows = apkgHistoryRows(packageResult().cards, ['', 'dog-id']);
    expect(rows).toEqual([]);
  });
});
