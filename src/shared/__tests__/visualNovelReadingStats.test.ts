import { describe, expect, it } from 'vitest';
import { visualNovelReadingStats } from '../visualNovelReadingStats';
import { spanCharsPerMinute } from '../readingTime';

const line = (japanese: string, speaker = '', source: 'hook' | 'import' | 'clipboard' = 'hook') => ({ japanese, speaker, source });

describe('visualNovelReadingStats', () => {
  it('counts the lines the player read, their characters and speakers, and the speed over playtime', () => {
    const stats = visualNovelReadingStats({ totalPlaytimeSec: 120 }, [
      line('はい。', '紅莉栖'),
      line('はい。', '紅莉栖'),
      line('それで？', 'まゆり', 'clipboard'),
      line('   '),
      line('未読の台本の行', '', 'import'),
    ], 3);
    expect(stats).toEqual({ lines: 3, chars: 10, speakers: 2, playtimeSec: 120, charsPerMinute: 5, mined: 3 });
  });

  it('has no speed under a minute of play', () => {
    expect(visualNovelReadingStats({ totalPlaytimeSec: 30 }, [line('長い一文です。')]).charsPerMinute).toBeNull();
  });
});

describe('spanCharsPerMinute', () => {
  it('rounds, and waits for a minute of reading', () => {
    expect(spanCharsPerMinute(90, 600)).toBe(400);
    expect(spanCharsPerMinute(59, 600)).toBeNull();
    expect(spanCharsPerMinute(600, 0)).toBeNull();
    expect(spanCharsPerMinute(Number.NaN, 10)).toBeNull();
  });
});
