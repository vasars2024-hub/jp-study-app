import { describe, expect, it } from 'vitest';
import { findDeckSentences } from '../data/grammar/deckSentences';

const cards = [
  { id: 'a', word: '食べる', sentence: '毎日ご飯を食べないではいられない。' },
  { id: 'b', word: '飲む', sentence: '水を飲む。' },
  { id: 'c', word: '重複', sentence: '毎日ご飯を食べないではいられない。' },
  { id: 'd', word: '空' },
  { id: 'e', word: '注ぐ', sentence: '水を注ぐ。' },
];

describe('findDeckSentences', () => {
  it('finds deck sentences containing the pattern once each', () => {
    const hits = findDeckSentences(cards, 'ないではいられない');
    expect(hits.map((h) => h.id)).toEqual(['a']);
  });
  it('ignores one-character fragments', () => {
    expect(findDeckSentences(cards, 'を')).toEqual([]);
  });
  it('honours the limit', () => {
    expect(findDeckSentences(cards, '水を', 2)).toHaveLength(2);
    expect(findDeckSentences(cards, '水を', 1)).toHaveLength(1);
  });
});
