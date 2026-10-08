// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/db', () => ({
  kvGet: async () => undefined,
  kvSet: async () => undefined,
  kvUpdate: async () => undefined,
  kvDelete: async () => undefined,
  kvBatch: async () => undefined,
  kvScanPrefix: async () => [],
}));

import { dueDeckCards } from '../flashcardDeck';
import { ankiOwnsScheduling, setAnkiOwnsScheduling } from '../ankiSchedulingOwner';

beforeEach(() => localStorage.clear());

const cards = [
  { id: 'local', srs: undefined },
  { id: 'in-anki', srs: undefined, ankiNoteId: 123 },
  { id: 'queued', srs: undefined, ankiPending: true },
];

describe('Anki owns scheduling', () => {
  it('is off by default: every card is reviewed in Gum', () => {
    expect(ankiOwnsScheduling()).toBe(false);
    expect(dueDeckCards(cards, Date.now(), 50, 0).map((c) => c.id)).toEqual(['local', 'in-anki', 'queued']);
  });

  it('on: cards with an Anki twin leave the built-in queue, the rest stay', () => {
    setAnkiOwnsScheduling(true);
    expect(dueDeckCards(cards, Date.now(), 50, 0).map((c) => c.id)).toEqual(['local']);
    setAnkiOwnsScheduling(false);
    expect(dueDeckCards(cards, Date.now(), 50, 0)).toHaveLength(3);
  });
});
