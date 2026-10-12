// @vitest-environment jsdom
/**
 * The Calendar's "N due" per day must be the deck's own queue, not a raw count of every
 * card: suspended and Anki-owned cards are due nowhere, and never-studied cards count
 * only up to today's new-card allowance.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { deckDueForecast, dueDeckCards, dueLoadEntriesForTests, type DeckFlashcard } from '../flashcardDeck';
import { setAnkiOwnsScheduling } from '../ankiSchedulingOwner';
import { dueByDate } from '../../shared/studyActivityHeatmap';
import type { LocalSrsState } from '../../shared/localSrs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 9, 10, 0, 0).getTime();

function srs(dueAt: number): LocalSrsState {
  return {
    version: 2,
    algorithm: 'sm2',
    dueAt,
    intervalDays: 3,
    ease: 2.5,
    repetitions: 2,
    lapses: 0,
    lastReviewedAt: NOW - DAY,
    lastRating: 'good',
  };
}

let seq = 0;
function card(patch: Partial<DeckFlashcard> = {}): DeckFlashcard {
  seq += 1;
  return { id: `c${seq}`, word: `語${seq}`, reading: '', meaning: 'm', addedAt: NOW - 5 * DAY, ...patch } as DeckFlashcard;
}

afterEach(() => {
  localStorage.clear();
});

describe('deckDueForecast', () => {
  it('leaves out suspended cards and caps new cards at the remaining allowance', () => {
    const cards = [
      card({ srs: srs(NOW - DAY) }), // overdue
      card({ srs: srs(NOW + 2 * 60 * 60 * 1000) }), // later today
      card({ srs: srs(NOW + DAY) }), // tomorrow
      card({ srs: srs(NOW + DAY), suspended: true }), // parked leech: due nowhere
      card(), card(), card(), card(), card(), // five never-studied cards
    ];
    const forecast = deckDueForecast(cards, 7, NOW, 3, 1);
    // 1 overdue + 2 of the 5 new cards (allowance 3, 1 already introduced today).
    expect(forecast.overdue).toBe(3);
    expect(forecast.days[0].due).toBe(1);
    expect(forecast.days[1].due).toBe(1);
    expect(forecast.newWaiting).toBe(3);
    expect(forecast.total).toBe(8);
    // Today's calendar figure equals the review queue now plus what comes due later today.
    const queueNow = dueDeckCards(cards, NOW, 3, 1).length;
    expect(dueByDate(forecast, new Date(NOW))['2026-10-09']).toBe(queueNow + 1);
  });

  it('counts every new card when the profile sets no daily cap', () => {
    const forecast = deckDueForecast([card(), card(), card({ srs: srs(NOW + DAY) })], 3, NOW, undefined, 0);
    expect(forecast.overdue).toBe(2);
    expect(forecast.newWaiting).toBe(0);
  });

  it('drops cards Anki schedules when "Anki owns scheduling" is on', () => {
    const cards = [card({ srs: srs(NOW - DAY), ankiNoteId: 42 }), card({ srs: srs(NOW - DAY) })];
    expect(deckDueForecast(cards, 7, NOW, 10, 0).overdue).toBe(2);
    setAnkiOwnsScheduling(true);
    expect(deckDueForecast(cards, 7, NOW, 10, 0).overdue).toBe(1);
  });
});

describe('review load buckets across a DST change', () => {
  it('puts a card due just after midnight on its own local day', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      // US clocks spring forward on 2026-03-08: that local day is 23 hours long.
      const now = new Date(2026, 2, 7, 12, 0).getTime();
      const due = new Date(2026, 2, 9, 0, 30).getTime();
      const entries = dueLoadEntriesForTests([card({ srs: srs(due) })], now, true);
      expect(entries).toEqual([[2, 1]]);
    } finally {
      process.env.TZ = previous;
    }
  });
});
