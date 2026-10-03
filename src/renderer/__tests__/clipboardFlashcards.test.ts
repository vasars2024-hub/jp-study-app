import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/storage', () => ({
  LS_KEYS: { clipboardHistory: 'jp-clipboard-history' },
  IDB_KEYS: { clipboardHistory: 'clipboard-history' },
  mirrorToIdb: vi.fn(),
}));
vi.mock('../flashcardDeck', () => ({ addDeckCardsTracked: vi.fn(() => []) }));
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: vi.fn() }));

import { sendEntriesToFlashcards, type ClipboardEntryType } from '../clipboardHistory';
import { addDeckCardsTracked } from '../flashcardDeck';

beforeEach(() => vi.clearAllMocks());

describe('sending clipboard passages to flashcards', () => {
  it.each<ClipboardEntryType>(['manual', 'text', 'reader', 'word', 'sentence', 'paragraph'])(
    'preserves the ending of a long %s copy in the sentence field',
    (type) => {
      const passage = '日本語の文章を読みます。'.repeat(15) + '最後の文です。';
      sendEntriesToFlashcards([{
        id: 'copy', type, text: passage, createdAt: 1,
        readerMeta: { book: 'My book' },
      }]);

      expect(addDeckCardsTracked).toHaveBeenCalledWith([
        expect.objectContaining({ word: passage.slice(0, 120), sentence: passage, bookTitle: 'My book' }),
      ]);
    },
  );

  it('keeps short words and structured dictionary definitions out of the sentence field', () => {
    const meaning = 'A dictionary definition. '.repeat(10);
    sendEntriesToFlashcards([
      { id: 'word', type: 'manual', text: '猫', createdAt: 1 },
      { id: 'dict', type: 'dictionary', text: `猫 — ねこ — ${meaning}`, createdAt: 2,
        dictMeta: { expression: '猫', reading: 'ねこ', meaning } },
    ]);

    expect(addDeckCardsTracked).toHaveBeenCalledWith([
      expect.objectContaining({ word: '猫', sentence: undefined }),
      expect.objectContaining({ word: '猫', reading: 'ねこ', meaning, sentence: undefined }),
    ]);
  });
});
