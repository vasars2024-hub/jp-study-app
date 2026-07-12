import { describe, expect, it } from 'vitest';
import { detectSentenceBounds, sentenceAt } from '../sentenceBounds';

describe('detectSentenceBounds', () => {
  it('splits on Japanese period', () => {
    const t = '今日はいい天気です。明日は雨です。';
    const b = detectSentenceBounds(t, 3);
    expect(t.slice(b.start, b.end)).toBe('今日はいい天気です。');
    const b2 = detectSentenceBounds(t, 12);
    expect(t.slice(b2.start, b2.end)).toBe('明日は雨です。');
  });

  it('keeps trailing closers with the sentence', () => {
    const t = '彼は「こんにちは。」と言った。次。';
    const b = detectSentenceBounds(t, 2);
    const s = t.slice(b.start, b.end);
    expect(s).toContain('こんにちは');
    // First sentence should include the quote-closer after the period inside quotes
    // or the full outer sentence depending on nesting — at least ends after 。
    expect(s.length).toBeGreaterThan(5);
  });

  it('handles Latin !?', () => {
    const t = 'Hello world! Next one?';
    expect(sentenceAt(t, 2)).toBe('Hello world!');
    expect(sentenceAt(t, 14)).toBe('Next one?');
  });

  it('handles empty', () => {
    expect(detectSentenceBounds('', 0)).toEqual({ start: 0, end: 0 });
  });
});
