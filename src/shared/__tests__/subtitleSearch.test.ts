import { describe, expect, it } from 'vitest';
import {
  findSubtitleMatches,
  normalizeSubtitleSearch,
  wrapSubtitleMatch,
} from '../subtitleSearch';

describe('subtitle search', () => {
  const cues = [
    { text: '今日は　いい天気です。' },
    { text: '明日もいい天気かな。' },
    { text: '雨が降っています。' },
  ];

  it('normalizes width, case, and whitespace', () => {
    expect(normalizeSubtitleSearch('  ＡＢＣ　Test  ')).toBe('abc test');
    expect(findSubtitleMatches(cues, 'いい天気')).toEqual([0, 1]);
  });

  it('bounds result collection', () => {
    expect(findSubtitleMatches(cues, '天気', 1)).toEqual([0]);
    expect(findSubtitleMatches(cues, '')).toEqual([]);
  });

  it('wraps navigation in both directions', () => {
    expect(wrapSubtitleMatch(1, 2, 1)).toBe(0);
    expect(wrapSubtitleMatch(0, 2, -1)).toBe(1);
    expect(wrapSubtitleMatch(0, 0, 1)).toBe(-1);
  });
});
