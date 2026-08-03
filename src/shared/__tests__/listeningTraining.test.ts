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

  it('bounds oversized input and handles empty prompts', () => {
    expect(evaluateJapaneseDictation('あ'.repeat(700), 'あ'.repeat(700)).answer).toHaveLength(500);
    expect(evaluateJapaneseDictation('', '').score).toBe(0);
  });
});
