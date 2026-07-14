import { describe, expect, it } from 'vitest';
import { detectSentenceBounds, isSentencePunct, sentenceAt } from '../sentenceBounds';

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

  it('breaks sentence-by-sentence inside a multi-sentence dialogue quote (does not swallow the whole paragraph)', () => {
    const t = '「本当にこんな馬鹿げた説を唱えてるやつがいるんだぜ。アメリカのユング派の心理学者だ。それにしても、ユング派というのは、どうしてこう馬鹿が多いのかね」';
    const firstIdx = t.indexOf('本当');
    const b1 = detectSentenceBounds(t, firstIdx);
    expect(t.slice(b1.start, b1.end)).toBe('「本当にこんな馬鹿げた説を唱えてるやつがいるんだぜ。');

    const secondIdx = t.indexOf('アメリカ');
    const b2 = detectSentenceBounds(t, secondIdx);
    expect(t.slice(b2.start, b2.end)).toBe('アメリカのユング派の心理学者だ。');

    // Comma-joined clauses stay together as one sentence (they aren't split).
    const lastIdx = t.indexOf('どうして');
    const b3 = detectSentenceBounds(t, lastIdx);
    expect(t.slice(b3.start, b3.end)).toBe('それにしても、ユング派というのは、どうしてこう馬鹿が多いのかね」');
  });

  it('selects the whole enclosing sentence when clicking a mid-sentence comma', () => {
    const t = 'それにしても、ユング派というのは、どうしてこう馬鹿が多いのかね。次の文だ。';
    const commaIdx = t.indexOf('、');
    const b = detectSentenceBounds(t, commaIdx);
    expect(t.slice(b.start, b.end)).toBe('それにしても、ユング派というのは、どうしてこう馬鹿が多いのかね。');
  });

  it('treats an unmatched closing quote (opener in a prior block) as ending the sentence', () => {
    const t = 'させるしかない」\n心の底から死にたいと思っているのだろうか。';
    const closeIdx = t.indexOf('」');
    const b = detectSentenceBounds(t, closeIdx);
    expect(t.slice(b.start, b.end)).toBe('させるしかない」');
  });

  it('starts the next sentence at an opening quote/bracket', () => {
    const t = '彼は言った。「元気ですか。」';
    const openIdx = t.indexOf('「');
    const b = detectSentenceBounds(t, openIdx);
    expect(t.slice(b.start, b.end)).toBe('「元気ですか。」');
  });

  it('classifies sentence-relevant punctuation, including commas', () => {
    expect(isSentencePunct('「')).toBe(true);
    expect(isSentencePunct('(')).toBe(true);
    expect(isSentencePunct('」')).toBe(true);
    expect(isSentencePunct('。')).toBe(true);
    expect(isSentencePunct('、')).toBe(true);
    expect(isSentencePunct('あ')).toBe(false);
  });
});
