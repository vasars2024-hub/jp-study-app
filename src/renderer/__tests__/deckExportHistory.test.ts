// @vitest-environment jsdom
/**
 * The .apkg export carries each scheduled card's past answers (only recall
 * reviews) to main, which writes them as Anki's `revlog`; a card without a
 * schedule carries none, and an unreadable log exports the schedules alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ log: [] as unknown[], fail: false }));
vi.mock('../reviewLog', () => ({
  loadFullReviewLog: async () => {
    if (h.fail) throw new Error('idb');
    return h.log;
  },
}));

import { exportHistoryByCard, runDeckAudioExport } from '../deckMediaExport';
import type { LocalSrsState } from '../../shared/localSrs';

const SRS: LocalSrsState = {
  version: 2, algorithm: 'sm2', dueAt: 9, intervalDays: 4, ease: 2.5, repetitions: 2, lapses: 0, lastReviewedAt: 5, lastRating: 'good',
};

const exportDeck = vi.fn(async (request: unknown) => ({ ok: true, written: 0, failed: 0, scheduled: 1, reviews: 2, request }));

beforeEach(() => {
  h.fail = false;
  h.log = [
    { id: 'r1', at: 100, mode: 'review', cardId: 'a', rating: 'good', correct: true, isNew: true, prevIntervalDays: 0, intervalDays: 1, durationMs: 3000 },
    { id: 'r2', at: 200, mode: 'review', cardId: 'a', rating: 'easy', correct: true, prevIntervalDays: 1, intervalDays: 4 },
    { id: 'g1', at: 250, mode: 'review', cardId: 'a', rating: 'good', correct: true, source: 'game' },
    { id: 'p1', at: 260, mode: 'learn', cardId: 'a', correct: true },
    { id: 'r3', at: 300, mode: 'review', cardId: 'b', rating: 'good', correct: true },
  ];
  exportDeck.mockClear();
  (window as unknown as { api: unknown }).api = { flashcardExportDeck: exportDeck };
});

describe('review history in the .apkg export', () => {
  it('takes only recall reviews of the cards asked for', () => {
    const byCard = exportHistoryByCard(h.log as never, new Set(['a']));
    expect([...byCard.keys()]).toEqual(['a']);
    expect(byCard.get('a')).toEqual([
      { at: 100, rating: 'good', isNew: true, prevIntervalDays: 0, intervalDays: 1, durationMs: 3000 },
      { at: 200, rating: 'easy', prevIntervalDays: 1, intervalDays: 4 },
    ]);
  });

  it('sends each scheduled card its history, and none to a card without a schedule', async () => {
    const outcome = await runDeckAudioExport([
      { id: 'a', word: '猫', meaning: 'cat', srs: SRS },
      { id: 'b', word: '犬', meaning: 'dog' },
    ]);
    const request = exportDeck.mock.calls[0][0] as { schedules: Array<{ history?: unknown[] } | null> };
    expect(request.schedules[0]?.history).toHaveLength(2);
    expect(request.schedules[1]).toBeNull();
    expect(outcome).toMatchObject({ ok: true, scheduled: 1, reviews: 2 });
  });

  it('a log that cannot be read exports the schedules without history', async () => {
    h.fail = true;
    await runDeckAudioExport([{ id: 'a', word: '猫', meaning: 'cat', srs: SRS }]);
    const request = exportDeck.mock.calls[0][0] as { schedules: Array<{ srs?: unknown; history?: unknown[] } | null> };
    expect(request.schedules[0]).toEqual({ srs: SRS });
  });
});
