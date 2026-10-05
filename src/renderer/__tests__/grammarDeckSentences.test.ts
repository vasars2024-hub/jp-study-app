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
  it('finds conjugated uses through the stem and reports the matched span', () => {
    const hits = findDeckSentences([{ id: 'x', word: '食べる', sentence: '全部食べてしまった。' }], 'てしまう');
    expect(hits).toHaveLength(1);
    expect(hits[0].sentence.slice(hits[0].matchStart, hits[0].matchEnd)).toBe('てしま');
  });
  it('ignores one-character fragments', () => {
    expect(findDeckSentences(cards, 'を')).toEqual([]);
  });
  it.each(['食べちゃった。', '飲んじゃった。', '飲んでしまった。', '食べちゃいます。'])('finds completion examples: %s', (sentence) => {
    const hits = findDeckSentences([{ id: 'casual', word: '', sentence }], 'てしまう');
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('casual');
    expect(sentence.slice(hits[0].matchStart, hits[0].matchEnd)).toMatch(/^(ちゃ|じゃ|でしま)/);
  });
  it('does not mistake nouns containing contraction prefixes for completion grammar', () => {
    expect(findDeckSentences([{ id: 'noun', word: '', sentence: 'おもちゃとじゃがいも。' }], 'てしまう')).toEqual([]);
  });
  it.each(['食べちゃいけない。', '飲んじゃいけない。', 'お茶をちゃわんに入れる。'])(
    'does not list "must not" or 茶碗 under てしまう: %s',
    (sentence) => {
      expect(findDeckSentences([{ id: 'x', word: '', sentence }], 'てしまう')).toEqual([]);
    },
  );
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
