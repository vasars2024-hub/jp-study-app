// @vitest-environment jsdom
/**
 * A deck write whose base could not be trusted never replaces the durable copy.
 *
 * Before: when the localStorage cache was missing (the boot migration used to
 * remove it for containing the text "corrupt"), `readStore` returned an empty
 * deck, the next mine saved a one-card deck with a newer `savedAt`, and the
 * mirror wrote it over the good IndexedDB copy. The same happened across
 * windows when the deck overflowed localStorage: the overflowing window kept
 * the deck in its own memory, every other window read the stale cache and
 * mirrored it over the durable copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
}));

import {
  addDeckCards,
  FLASHCARD_DECK_OVERFLOW_KEY,
  FLASHCARD_DECK_STORAGE_KEY,
  loadDeck,
  mergeDeckOverDurable,
  resetDeckMemoryForTests,
  restoreDeckFromIdb,
  settleDeckWritesForTests,
  type DeckFlashcard,
} from '../flashcardDeck';

function card(id: string, word: string, extra: Partial<DeckFlashcard> = {}): DeckFlashcard {
  return { id, word, reading: '', meaning: 'm', source: 'epub', addedAt: 1, ...extra };
}

const GOOD_DECK = {
  folders: ['N3'],
  cards: [card('fc-1', '汚職', { meaning: 'corruption' }), card('fc-2', '腐敗'), card('fc-3', '犬')],
  savedAt: 1_000,
};

/** Let the held write settle and the debounced IndexedDB mirror land. */
async function settle(): Promise<void> {
  await settleDeckWritesForTests();
  await new Promise((resolve) => setTimeout(resolve, 450));
}

function durableWords(): string[] {
  const deck = idb.get('flashcard-deck') as { cards: DeckFlashcard[] } | undefined;
  return (deck?.cards ?? []).map((c) => c.word).sort();
}

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  resetDeckMemoryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('empty read vs. a durable deck', () => {
  it('a mine after the cache went missing keeps every durable card', async () => {
    idb.set('flashcard-deck', GOOD_DECK);
    // The cache is gone (cleared site data, or the old migration dropping it).
    addDeckCards([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' }]);
    await settle();

    expect(durableWords()).toEqual(['汚職', '犬', '猫', '腐敗'].sort());
    expect(loadDeck().map((c) => c.word).sort()).toEqual(['汚職', '犬', '猫', '腐敗'].sort());
    expect((idb.get('flashcard-deck') as { folders: string[] }).folders).toEqual(['N3']);
    expect(localStorage.getItem(FLASHCARD_DECK_OVERFLOW_KEY)).toBeNull();
  });

  it('an unparseable cache is treated the same way', async () => {
    idb.set('flashcard-deck', GOOD_DECK);
    localStorage.setItem(FLASHCARD_DECK_STORAGE_KEY, '{"cards":[{"id":"fc-1"');
    addDeckCards([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' }]);
    await settle();
    expect(durableWords()).toEqual(['汚職', '犬', '猫', '腐敗'].sort());
  });

  it('a first mine on a fresh profile still reaches IndexedDB', async () => {
    addDeckCards([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' }]);
    expect(loadDeck().map((c) => c.word)).toEqual(['猫']);
    await settle();
    expect(durableWords()).toEqual(['猫']);
  });

  it('boot reconciliation merges an unverified write left by a crash instead of letting it win', async () => {
    idb.set('flashcard-deck', GOOD_DECK);
    // What a window that closed before its durable check leaves behind.
    localStorage.setItem(FLASHCARD_DECK_STORAGE_KEY, JSON.stringify({ folders: [], cards: [card('fc-9', '猫')], savedAt: 5_000 }));
    localStorage.setItem(FLASHCARD_DECK_OVERFLOW_KEY, String(Number.MAX_SAFE_INTEGER));

    await restoreDeckFromIdb();
    await settle();
    expect(durableWords()).toEqual(['汚職', '犬', '猫', '腐敗'].sort());
    expect(loadDeck()).toHaveLength(4);
  });
});

describe('deck overflow across windows', () => {
  it('the overflowing window leaves a marker other windows can see', () => {
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === FLASHCARD_DECK_STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, key, value);
    });
    localStorage.clear();
    idb.set('flashcard-deck', GOOD_DECK);
    addDeckCards([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' }]);
    expect(localStorage.getItem(FLASHCARD_DECK_OVERFLOW_KEY)).not.toBeNull();
  });

  it('a window holding the stale cache reads IndexedDB before its write lands there', async () => {
    // Another window wrote a 3-card deck that did not fit: IndexedDB has it,
    // the cache still holds the one card that did fit, and the marker is set.
    localStorage.setItem(FLASHCARD_DECK_STORAGE_KEY, JSON.stringify({ folders: [], cards: [GOOD_DECK.cards[2]], savedAt: 10 }));
    localStorage.setItem(FLASHCARD_DECK_OVERFLOW_KEY, String(GOOD_DECK.savedAt));
    idb.set('flashcard-deck', GOOD_DECK);

    addDeckCards([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' }]);
    await settle();

    expect(durableWords()).toEqual(['汚職', '犬', '猫', '腐敗'].sort());
  });

  it('the three-way merge keeps deletions and edits the writer made, and cards it never saw', () => {
    const base = { folders: [], cards: [card('a', 'A'), card('b', 'B')] };
    const written = { folders: [], cards: [card('a', 'A2'), card('new', 'N')] }; // edited a, deleted b
    const durable = { folders: ['X'], cards: [card('a', 'A'), card('b', 'B'), card('c', 'C')], savedAt: 7 };
    const merged = mergeDeckOverDurable(base, written, durable);
    expect(merged.cards.map((c) => c.word)).toEqual(['A2', 'N', 'C']);
    expect(merged.folders).toEqual(['X']);
    expect(merged.savedAt).toBe(8);
  });
});
