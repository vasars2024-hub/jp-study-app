// @vitest-environment jsdom
/**
 * A built-in SRS review speaks for the word's LEMMA (so 食べた lights up as
 * 食べる in the reader), and grammar cards or cards of another study language
 * never write into the known-words store.
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
  kvDelete: async (key: string) => {
    idb.delete(key);
  },
  kvBatch: async () => undefined,
  kvScanPrefix: async () => [],
}));

const tokens: Record<string, Array<{ surface: string; lemma: string; content: boolean }>> = {
  食べた: [
    { surface: '食べ', lemma: '食べる', content: true },
    { surface: 'た', lemma: 'た', content: false },
  ],
  日本語: [
    { surface: '日本', lemma: '日本', content: true },
    { surface: '語', lemma: '語', content: true },
  ],
};
vi.mock('../tokenizer', () => ({
  tokenizerReady: () => true,
  tokenizeSync: (text: string) =>
    (tokens[text] ?? [{ surface: text, lemma: text, content: true }]).map((t) => ({ ...t, proper: false, pos: '', posDetail: '' })),
  getTokenizer: async () => ({}),
}));

import {
  addDeckCardsTracked,
  knowledgeLemma,
  resetDeckMemoryForTests,
  resetReviewUndoForTests,
  reviewDeckCard,
  reviewKnowledgeWord,
  undoLastReview,
  type DeckFlashcard,
} from '../flashcardDeck';
import { getLevel } from '../knownWords';
import { resetReviewLogForTests } from '../reviewLog';

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  resetDeckMemoryForTests();
  resetReviewUndoForTests();
  resetReviewLogForTests();
});

function add(word: string, extra: Partial<DeckFlashcard> = {}): DeckFlashcard {
  return addDeckCardsTracked([{ word, reading: '', meaning: 'm', source: 'epub', ...extra }])[0];
}

describe('SRS review -> known-words lemma', () => {
  it('reduces an inflected single word to its lemma, leaves compounds whole', () => {
    expect(knowledgeLemma('食べた')).toBe('食べる');
    expect(knowledgeLemma('日本語')).toBe('日本語');
  });

  it('a review of 食べた grades 食べる, and undo restores it', () => {
    const card = add('食べた');
    reviewDeckCard(card.id, 'good');
    expect(getLevel('食べる')).toBe(2);
    expect(getLevel('食べた')).toBe(0);
    undoLastReview();
    expect(getLevel('食べる')).toBe(0);
  });
});

describe('grammar and other-language cards are not word evidence', () => {
  it('a grammar card is never graded as a word', () => {
    const card = add('ばかり', { studyKind: 'grammar', studyLang: 'ja' });
    reviewDeckCard(card.id, 'easy');
    expect(getLevel('ばかり')).toBe(0);
  });

  it('an older grammar card without a kind is recognised by its 〜 pattern', () => {
    expect(reviewKnowledgeWord({ word: '〜てしまう', sentence: '', studyKind: undefined })).toBeNull();
  });

  it('a Chinese (HSK) card reviewed while studying Japanese stays out of the store', () => {
    const card = add('喜欢', { studyLang: 'zh' });
    reviewDeckCard(card.id, 'easy');
    expect(getLevel('喜欢')).toBe(0);
  });
});
