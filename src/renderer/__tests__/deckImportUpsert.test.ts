// @vitest-environment jsdom
/**
 * Re-importing a deck file keeps review progress (round-2 audit F, CSV item 2).
 *
 * Before: `importDeckFromEntries` went through `replaceImportedDeck`, which
 * deleted the deck's cards and inserted fresh ones: new ids, no `srs`, no
 * `known`. Every re-import — and the CSV editor ran one on each load and each
 * mapping change — reset the deck.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
  kvUpdate: async (key: string, update: (current: unknown) => unknown) => {
    const next = update(idb.get(key));
    if (next !== undefined) idb.set(key, JSON.parse(JSON.stringify(next)));
    return next ?? idb.get(key);
  },
}));

import {
  addDeckCardsTracked,
  importDeckFromEntries,
  loadDeck,
  resetDeckMemoryForTests,
  reviewDeckCard,
} from '../flashcardDeck';
import { resetReviewLogForTests } from '../reviewLog';
import { deckBookId, type ImportDeckEntry } from '../../shared/deckImport';

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  resetDeckMemoryForTests();
  resetReviewLogForTests();
});

function entries(bookId: string, title: string, rows: Array<[string, string]>): ImportDeckEntry[] {
  return rows.map(([word, meaning]) => ({
    word,
    reading: '',
    meaning,
    source: 'csv',
    bookId,
    bookTitle: title,
  }));
}

describe('importDeckFromEntries is an upsert', () => {
  it('keeps ids and review state, updates text, adds new rows, and removes nothing by default', () => {
    const id = deckBookId('Core');
    importDeckFromEntries(entries(id, 'Core', [['猫', 'cat'], ['犬', 'dog']]));
    const cat = loadDeck().find((c) => c.word === '猫')!;
    reviewDeckCard(cat.id, 'good');
    const reviewed = loadDeck().find((c) => c.id === cat.id)!;
    expect(reviewed.srs).toBeTruthy();

    const result = importDeckFromEntries(entries(id, 'Core', [['猫', 'a cat'], ['鳥', 'bird']]));
    expect(result.updated).toBe(1);
    expect(result.added.map((c) => c.word)).toEqual(['鳥']);
    expect(result.missing).toBe(1);
    expect(result.removed).toBe(0);

    const after = loadDeck();
    const cat2 = after.find((c) => c.word === '猫')!;
    expect(cat2.id).toBe(cat.id);
    expect(cat2.meaning).toBe('a cat');
    expect(cat2.srs).toEqual(reviewed.srs);
    expect(after.map((c) => c.word).sort()).toEqual(['犬', '猫', '鳥']);
  });

  it('removes cards the file no longer has only when asked', () => {
    const id = deckBookId('Core');
    importDeckFromEntries(entries(id, 'Core', [['猫', 'cat'], ['犬', 'dog']]));
    const result = importDeckFromEntries(entries(id, 'Core', [['猫', 'cat']]), { removeMissing: true });
    expect(result.removed).toBe(1);
    expect(loadDeck().map((c) => c.word)).toEqual(['猫']);
  });

  it('a renamed deck with the same id updates the same cards instead of adding a second deck', () => {
    const id = deckBookId('Core');
    importDeckFromEntries(entries(id, 'Core', [['猫', 'cat']]));
    const before = loadDeck()[0];
    importDeckFromEntries(entries(id, 'Core 2', [['猫', 'cat']]));
    const after = loadDeck();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].bookTitle).toBe('Core 2');
  });

  it('adopts cards stored under the old ASCII-only id of a Japanese title', () => {
    addDeckCardsTracked([
      { word: '猫', reading: '', meaning: 'cat', source: 'csv', bookId: 'import-deck', bookTitle: '雪国' },
      { word: '猫', reading: '', meaning: 'cat', source: 'csv', bookId: 'import-deck', bookTitle: '別の本' },
    ]);
    const old = loadDeck().find((c) => c.bookTitle === '雪国')!;
    importDeckFromEntries(entries(deckBookId('雪国'), '雪国', [['猫', 'cat']]));
    const deck = loadDeck();
    expect(deck).toHaveLength(2);
    expect(deck.find((c) => c.id === old.id)?.bookId).toBe(deckBookId('雪国'));
    expect(deck.find((c) => c.bookTitle === '別の本')?.bookId).toBe('import-deck');
  });
});
