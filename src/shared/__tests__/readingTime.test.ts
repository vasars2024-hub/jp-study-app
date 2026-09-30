import { describe, expect, it } from 'vitest';
import { chapterCharsRemaining, estimateReadingMinutes } from '../readingTime';

describe('chapter reading estimate', () => {
  const chapters = [1000, 2000, 3000, 4000].map(chars => ({ chars }));
  const toc = [{ chapterIndex: 0 }, { chapterIndex: 2 }];

  it('includes split parts, stopping before the next chapter', () => {
    expect(chapterCharsRemaining(chapters, toc, 0, 0.5)).toBe(2500);
    expect(chapterCharsRemaining(chapters, toc, 1, 0.75)).toBe(500);
    expect(chapterCharsRemaining(chapters, toc, 2, 0)).toBe(7000);
    expect(chapterCharsRemaining(chapters, toc, 3, 1)).toBe(0);
  });

  it('falls back to the current part without a TOC and clamps restored fractions', () => {
    expect(chapterCharsRemaining(chapters, [], 0, 0.5)).toBe(500);
    expect(chapterCharsRemaining(chapters, [], 0, -1)).toBe(1000);
    expect(chapterCharsRemaining(chapters, [], 0, 2)).toBe(0);
    expect(chapterCharsRemaining([], [], 0, 0)).toBe(0);
  });

  it('weights reading speed by time and rounds partial minutes up', () => {
    // 6,600 characters in 11 minutes = 600 chars/min, not the 3,300
    // chars/min produced by averaging the two daily speeds equally.
    const recent = [{ seconds: 600, chars: 600 }, { seconds: 60, chars: 6000 }];
    expect(estimateReadingMinutes(1201, recent)).toBe(3);
    expect(estimateReadingMinutes(0, recent)).toBe(0);
  });

  it('hides the estimate without measured reading and ignores unpaired totals', () => {
    expect(estimateReadingMinutes(1000, [])).toBeNull();
    expect(estimateReadingMinutes(1000, [{ seconds: 59, chars: 500 }])).toBeNull();
    expect(estimateReadingMinutes(1000, [
      { seconds: 3600, chars: 0 },
      { seconds: 0, chars: 2000 },
      { seconds: NaN, chars: 2000 },
      { seconds: 60, chars: 500 },
    ])).toBe(2);
  });
});
