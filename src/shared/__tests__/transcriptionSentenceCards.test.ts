import { describe, expect, it } from 'vitest';
import { segmentTranscriptSentences } from '../transcriptionSentenceCards';

describe('segmentTranscriptSentences', () => {
  it('joins adjacent unpunctuated cues into a natural Japanese sentence', () => {
    expect(segmentTranscriptSentences([
      { start: 1, end: 2, text: '今日は' },
      { start: 2.05, end: 3.4, text: 'いい天気ですね。' },
    ])).toEqual([
      { start: 1, end: 3.4, text: '今日はいい天気ですね。', cueCount: 2 },
    ]);
  });

  it('splits multiple sentences inside one timestamped Whisper window', () => {
    const result = segmentTranscriptSentences([
      { start: 10, end: 14, text: '行きます。待ってください！' },
    ]);
    expect(result.map((item) => item.text)).toEqual(['行きます。', '待ってください！']);
    expect(result[0].start).toBe(10);
    expect(result[0].end).toBeLessThan(result[1].end);
    expect(result[1].end).toBe(14);
  });

  it('flushes at a speaker pause and drops non-study noise', () => {
    expect(segmentTranscriptSentences([
      { start: 0, end: 1, text: '[music]' },
      { start: 2, end: 3, text: 'はい' },
      { start: 5, end: 6, text: '分かりました。' },
    ], { maxGapSec: 1 })).toEqual([
      { start: 2, end: 3, text: 'はい', cueCount: 1 },
      { start: 5, end: 6, text: '分かりました。', cueCount: 1 },
    ]);
  });
});

