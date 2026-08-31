// @vitest-environment jsdom
/**
 * The local deck read as an Anki workbench draft — source adapter 4's only
 * production caller. `shared/ankiLocalDeck.ts` is unit-tested on literals; what
 * is untested there, and tested here, is that the *live store* is what feeds it:
 * real cards, real folders, and the store's own over-encoding repair.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addDeckCards,
  createDeckFolder,
  FLASHCARD_DECK_EVENT,
  FLASHCARD_DECK_STORAGE_KEY,
  loadDeckAsAnkiDraft,
  parseFlashcardDeckStore,
  setDeckCardFolder,
} from '../flashcardDeck';
import { LOCAL_DECK_NOTE_TYPE_NAME } from '../../shared/ankiLocalDeck';

beforeEach(() => {
  localStorage.clear();
});

describe('loadDeckAsAnkiDraft', () => {
  it('exposes one read-only persistence contract for Files catalogue consumers', () => {
    expect(FLASHCARD_DECK_STORAGE_KEY).toBe('jp-flashcard-deck');
    expect(FLASHCARD_DECK_EVENT).toBe('flashcard-deck-changed');

    const raw = JSON.stringify(JSON.stringify({
      folders: ['Books', 42],
      cards: [
        { id: 'fc-1', word: '本', source: 'epub', addedAt: 1 },
        null,
        { word: 'missing id' },
      ],
    }));
    expect(parseFlashcardDeckStore(raw)).toEqual({
      store: {
        folders: ['Books'],
        cards: [{ id: 'fc-1', word: '本', source: 'epub', addedAt: 1 }],
      },
      layers: 2,
    });
    expect(parseFlashcardDeckStore('not-json')).toEqual({
      store: { folders: [], cards: [] },
      layers: 0,
    });
  });

  it('reads an empty store without inventing anything', () => {
    const { draft, summary } = loadDeckAsAnkiDraft();
    expect(draft.notes).toEqual([]);
    expect(summary.cardsRead).toBe(0);
    expect(draft.source.kind).toBe('local-deck');
  });

  it('turns the live cards into notes under the synthesized note type', () => {
    addDeckCards([
      { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' },
      { word: '犬', reading: 'いぬ', meaning: 'dog', source: 'dictionary' },
    ]);

    const { draft, summary } = loadDeckAsAnkiDraft();
    expect(summary.cardsRead).toBe(2);
    expect(draft.notes).toHaveLength(2);
    expect(draft.noteTypes).toHaveLength(1);
    expect(draft.noteTypes[0].name).toBe(LOCAL_DECK_NOTE_TYPE_NAME);
    expect(draft.notes[0].fields.find((f) => f.name === 'Expression')?.raw).toBe('猫');
  });

  it('carries folders from the same read, including one holding no cards', () => {
    addDeckCards([{ word: '本', reading: 'ほん', meaning: 'book', source: 'epub' }]);
    createDeckFolder('Novels');
    createDeckFolder('Empty shelf');
    const [card] = loadDeckAsAnkiDraft().draft.notes;
    expect(card).toBeDefined();

    const { draft, summary } = loadDeckAsAnkiDraft();
    const names = draft.decks.map((d) => d.name);
    expect(names.some((n) => n.includes('Empty shelf'))).toBe(true);
    expect(summary.folders).toBeGreaterThanOrEqual(2);
  });

  it('files a card into its folder subdeck', () => {
    const [added] = addDeckCards([
      { word: '空', reading: 'そら', meaning: 'sky', source: 'epub' },
    ]);
    createDeckFolder('Novels');
    setDeckCardFolder(added.id, 'Novels');

    const { draft } = loadDeckAsAnkiDraft();
    const deckIds = new Set(draft.cards.map((c) => c.deckId));
    const filed = draft.decks.filter((d) => deckIds.has(d.id));
    expect(filed.some((d) => d.name.includes('Novels'))).toBe(true);
  });

  it('honours an explicit root deck name', () => {
    addDeckCards([{ word: '海', reading: 'うみ', meaning: 'sea', source: 'epub' }]);
    const { draft } = loadDeckAsAnkiDraft({ rootDeckName: 'Mined 2026' });
    expect(draft.source.label).toBe('Mined 2026');
    expect(draft.decks.some((d) => d.name.startsWith('Mined 2026'))).toBe(true);
  });

  it('reads a deck through the store over-encoding repair rather than as empty', () => {
    // The v1.0 audit 5.1 shape: one extra JSON layer over the whole store.
    const store = { folders: [], cards: [{ id: 'fc-1', word: '雨', reading: 'あめ', meaning: 'rain', source: 'epub', addedAt: 1 }] };
    localStorage.setItem(FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(JSON.stringify(store)));

    const { draft, summary } = loadDeckAsAnkiDraft();
    expect(summary.cardsRead).toBe(1);
    expect(draft.notes[0].fields.find((f) => f.name === 'Expression')?.raw).toBe('雨');
  });

  it('normalizes HTML out of a field while keeping the raw value', () => {
    addDeckCards([
      { word: '花', reading: 'はな', meaning: 'flower<br>bloom', source: 'epub' },
    ]);
    const meaning = loadDeckAsAnkiDraft().draft.notes[0].fields.find((f) => f.name === 'Meaning');
    expect(meaning?.raw).toBe('flower<br>bloom');
    expect(meaning?.normalized).toBe('flower bloom');
  });

  it('gives the same fingerprint for the same deck and a different one after a change', () => {
    addDeckCards([{ word: '山', reading: 'やま', meaning: 'mountain', source: 'epub' }]);
    const first = loadDeckAsAnkiDraft().draft.source.fingerprint;
    expect(loadDeckAsAnkiDraft().draft.source.fingerprint).toBe(first);

    addDeckCards([{ word: '川', reading: 'かわ', meaning: 'river', source: 'epub' }]);
    expect(loadDeckAsAnkiDraft().draft.source.fingerprint).not.toBe(first);
  });
});
