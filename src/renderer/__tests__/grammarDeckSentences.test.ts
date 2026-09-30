import { describe, expect, it } from 'vitest';
import { findCaptureSentences, findDeckSentences } from '../data/grammar/deckSentences';

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

describe('findCaptureSentences', () => {
  const captures = [
    { captureId: 'a', text: '今日は暑い。水を飲む。\n水を注ぐ！' },
    { captureId: 'b', text: '水を飲む。' },
    { captureId: 'c', text: '読書をする。' },
  ];

  it('extracts matching sentences from passages and deduplicates repeated captures', () => {
    expect(findCaptureSentences(captures, '水を').map((hit) => hit.sentence))
      .toEqual(['水を飲む。', '水を注ぐ！']);
  });

  it('ignores single particles and caps the displayed matches', () => {
    expect(findCaptureSentences(captures, 'を')).toEqual([]);
    expect(findCaptureSentences(captures, '水を', 1)).toHaveLength(1);
  });
});
