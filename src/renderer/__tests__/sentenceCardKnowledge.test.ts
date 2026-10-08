// @vitest-environment jsdom
/**
 * A passing review of a SENTENCE card moves known words along — conservatively.
 * A sentence card with a target word speaks for that word only (and only ever
 * raises it); a pure sentence card nudges content words already at Learning to
 * Familiar, never marks a new word known, and undo takes every change back.
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

const LINE = '猫が魚を食べた';
const tokens: Record<string, Array<{ surface: string; lemma: string; content: boolean }>> = {
  [LINE]: [
    { surface: '猫', lemma: '猫', content: true },
    { surface: 'が', lemma: 'が', content: false },
    { surface: '魚', lemma: '魚', content: true },
    { surface: 'を', lemma: 'を', content: false },
    { surface: '食べ', lemma: '食べる', content: true },
    { surface: 'た', lemma: 'た', content: false },
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
  resetDeckMemoryForTests,
  resetReviewUndoForTests,
  reviewDeckCard,
  sentenceKnowledgeNudges,
  sentenceKnowledgeTarget,
  undoLastReview,
  type DeckFlashcard,
} from '../flashcardDeck';
import { getLevel, resetKnownWordsCacheForTests, setLevel } from '../knownWords';
import { resetReviewLogForTests } from '../reviewLog';

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  resetKnownWordsCacheForTests();
  resetDeckMemoryForTests();
  resetReviewUndoForTests();
  resetReviewLogForTests();
});

function add(word: string, extra: Partial<DeckFlashcard> = {}): DeckFlashcard {
  return addDeckCardsTracked([{ word, reading: '', meaning: 'm', source: 'media', ...extra }])[0];
}

describe('sentenceKnowledgeTarget', () => {
  it('a vocabulary card is not a sentence target', () => {
    expect(sentenceKnowledgeTarget({ word: '猫', sentence: LINE, studyKind: 'vocabulary' })).toBeNull();
    expect(sentenceKnowledgeTarget({ word: '猫', sentence: LINE, studyKind: undefined })).toBeNull();
  });

  it('a sentence card with its own target word speaks for that word', () => {
    expect(sentenceKnowledgeTarget({ word: '魚', sentence: LINE, studyKind: 'sentence' })).toEqual({ kind: 'word', word: '魚' });
  });

  it('a pure sentence card (word is the line) speaks for its text', () => {
    expect(sentenceKnowledgeTarget({ word: LINE, sentence: LINE, studyKind: undefined })).toEqual({ kind: 'sentence', text: LINE });
    expect(sentenceKnowledgeTarget({ word: LINE, sentence: '', studyKind: 'sentence' })).toEqual({ kind: 'sentence', text: LINE });
  });

  it('a card of another study language is left alone', () => {
    expect(sentenceKnowledgeTarget({ word: LINE, sentence: LINE, studyKind: 'sentence', studyLang: 'zh' })).toBeNull();
  });
});

describe('sentenceKnowledgeNudges', () => {
  it('raises only content words at Learning, once each, to Familiar', () => {
    const levels: Record<string, 0 | 1 | 2 | 3> = { 猫: 1, 魚: 0, 食べる: 3 };
    const out = sentenceKnowledgeNudges(
      [...tokens[LINE], { surface: '猫', lemma: '猫', content: true }],
      (w) => levels[w] ?? 0,
      () => false,
    );
    expect(out).toEqual([{ word: '猫', level: 2 }]);
  });

  it('skips a hand-set level and respects the limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ lemma: `w${i}`, content: true }));
    expect(sentenceKnowledgeNudges(many, () => 1, (w) => w === 'w0', 3).map((n) => n.word)).toEqual(['w1', 'w2', 'w3']);
  });
});

describe('reviewDeckCard on sentence cards', () => {
  it('Good on a pure sentence nudges learning words, never marks new words known; undo restores', () => {
    setLevel('猫', 1, false);
    const card = add(LINE, { sentence: LINE, studyKind: 'sentence' });
    reviewDeckCard(card.id, 'good');
    expect(getLevel('猫')).toBe(2);
    expect(getLevel('魚')).toBe(0);
    expect(getLevel('食べる')).toBe(0);
    expect(getLevel(LINE)).toBe(0);
    undoLastReview();
    expect(getLevel('猫')).toBe(1);
  });

  it('Again on a sentence card moves nothing', () => {
    setLevel('猫', 1, false);
    const card = add(LINE, { sentence: LINE, studyKind: 'sentence' });
    reviewDeckCard(card.id, 'again');
    expect(getLevel('猫')).toBe(1);
  });

  it('a sentence card with a target word raises that word only, never lowers it', () => {
    const card = add('魚', { sentence: LINE, studyKind: 'sentence' });
    reviewDeckCard(card.id, 'good');
    expect(getLevel('魚')).toBeGreaterThan(0);
    expect(getLevel('猫')).toBe(0);
    setLevel('魚', 3, false);
    reviewDeckCard(card.id, 'good');
    expect(getLevel('魚')).toBe(3);
  });
});
