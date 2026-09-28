import { describe, expect, it } from 'vitest';
import {
  evaluateJapaneseDictation,
  normalizeJapaneseDictation,
} from '../listeningTraining';

describe('Japanese listening training', () => {
  it('ignores spacing, punctuation, and width differences', () => {
    expect(normalizeJapaneseDictation('「今日は いい天気！」')).toBe('今日はいい天気');
    expect(evaluateJapaneseDictation('今日はいい天気', '今日は、いい天気。').exact).toBe(true);
  });

  it('scores partial answers by character edit distance', () => {
    expect(evaluateJapaneseDictation('今日は天気', '今日はいい天気')).toMatchObject({
      exact: false,
      score: 71,
    });
  });

  it('counts missing or extra long-vowel marks as dictation mistakes', () => {
    expect(evaluateJapaneseDictation('ビル', 'ビール')).toMatchObject({ exact: false, score: 67 });
    expect(evaluateJapaneseDictation('ビール', 'ビル')).toMatchObject({ exact: false, score: 67 });
    expect(evaluateJapaneseDictation('「ﾋﾞｰﾙ！」', 'ビール')).toMatchObject({
      exact: true, score: 100, answer: 'ビール', expected: 'ビール',
    });
  });

  it('bounds oversized input and handles empty prompts', () => {
    expect(evaluateJapaneseDictation('あ'.repeat(700), 'あ'.repeat(700)).answer).toHaveLength(500);
    expect(evaluateJapaneseDictation('', '').score).toBe(0);
  });

  it('counts supplementary kanji as single characters when scoring mistakes', () => {
    expect(evaluateJapaneseDictation('', '𠮷').score).toBe(0);
    expect(evaluateJapaneseDictation('猫', '𠮷').score).toBe(0);
    expect(evaluateJapaneseDictation('𠮷田', '𠮷野')).toMatchObject({ exact: false, score: 50 });
    expect(evaluateJapaneseDictation('𠮷野', '𠮷田').score).toBe(50);
    expect(evaluateJapaneseDictation('𠮷田', '𠮷田')).toMatchObject({ exact: true, score: 100 });
  });

  it('keeps whole supplementary kanji at the 500-character limit', () => {
    const text = 'あ'.repeat(499) + '𠮷';
    expect(evaluateJapaneseDictation(text + '田', text + '野')).toMatchObject({
      answer: text,
      expected: text,
      exact: true,
      score: 100,
    });
  });
});
