/**
 * P3's done-when, from `docs/ACTIVE/READING_LISTS_PLAN.md` §9:
 *
 *   "Done when scrub-to-end does NOT tick (negative control ships with it), the
 *    two-save dwell does, and manual always does."
 *
 * The first clause is the reason the phase exists. Trap 4 in the pin says it in
 * one line: `percent >= 0.98` alone is not a finish signal, because one
 * scrollbar drag to peek at the afterword marks a book read forever. So the
 * scrub cases here are not extra coverage — they are the specification.
 */

import { describe, expect, it } from 'vitest';
import {
  FINISH_DWELL_MS,
  FINISH_PERCENT,
  SUGGEST_IDLE_MS,
  detectReadingFinish,
  parseNovelLocation,
  type ReadingFinishInput,
} from '../readingFinishDetector';

const T = 1_700_000_000_000;
const END = 'p:41:0.997';

function book(overrides: Partial<ReadingFinishInput> = {}): ReadingFinishInput {
  return {
    kind: 'book',
    next: { location: END, percent: 0.995 },
    at: T,
    ...overrides,
  };
}

describe('parseNovelLocation', () => {
  it('reads the reader’s own format', () => {
    expect(parseNovelLocation('p:41:0.997')).toEqual({ part: 41, fraction: 0.997 });
  });

  it('reads a very old bare-number save as a whole-book fraction', () => {
    // `types.ts:11` — "Very old saves are a bare number". Reporting it as part 0
    // is what it means, not a fallback.
    expect(parseNovelLocation('0.994')).toEqual({ part: 0, fraction: 0.994 });
  });

  it('refuses anything it cannot actually read', () => {
    expect(parseNovelLocation(undefined)).toBeNull();
    expect(parseNovelLocation('')).toBeNull();
    expect(parseNovelLocation('epubcfi(/6/14!/4/2)')).toBeNull();
    expect(parseNovelLocation('p:x:y')).toBeNull();
  });
});

describe('NEGATIVE CONTROL — a scrub to the end must not tick', () => {
  it('does not finish on the first save at 100 %', () => {
    // The drag itself: nothing was there before, so nothing has been held.
    const verdict = detectReadingFinish(book({ next: { location: 'p:41:1', percent: 1 } }));
    expect(verdict).toEqual({ verdict: 'none', reason: 'position-not-held' });
  });

  it('does not finish when the reader moved away again', () => {
    // The peek-and-return: two saves, both near the end, different places.
    const verdict = detectReadingFinish(
      book({
        previous: { location: 'p:41:1', percent: 1 },
        previousAt: T - 10 * FINISH_DWELL_MS,
        next: { location: 'p:12:0.4', percent: 0.31 },
      }),
    );
    expect(verdict.verdict).toBe('none');
  });

  it('does not finish when the same position has not held long enough', () => {
    const verdict = detectReadingFinish(
      book({ previous: { location: END, percent: 0.995 }, previousAt: T - (FINISH_DWELL_MS - 1) }),
    );
    expect(verdict).toEqual({ verdict: 'none', reason: 'dwell-too-short' });
  });

  it('does not finish on a high percent whose location is mid-book', () => {
    // The corrupt/stale-percent case §4.1's final-part clause exists for.
    const verdict = detectReadingFinish(
      book({
        previous: { location: 'p:3:0.4', percent: 0.99 },
        previousAt: T - 10 * FINISH_DWELL_MS,
        next: { location: 'p:3:0.4', percent: 0.99 },
      }),
    );
    expect(verdict.verdict).toBe('none');
  });

  it('does not finish a book with no location at all', () => {
    const verdict = detectReadingFinish(
      book({
        previous: { percent: 0.999 },
        previousAt: T - 10 * FINISH_DWELL_MS,
        next: { percent: 0.999 },
      }),
    );
    expect(verdict.verdict).toBe('none');
  });
});

describe('the two-save dwell does tick', () => {
  it('finishes a book held at the end across two saves 60 s apart', () => {
    const verdict = detectReadingFinish(
      book({ previous: { location: END, percent: 0.995 }, previousAt: T - FINISH_DWELL_MS }),
    );
    expect(verdict.verdict).toBe('finished');
    if (verdict.verdict !== 'finished') return;
    expect(verdict.evidence).toEqual({
      percent: 0.995,
      location: END,
      dwellMs: FINISH_DWELL_MS,
      saves: 2,
    });
  });

  it('finishes a very old bare-number save the same way', () => {
    const verdict = detectReadingFinish(
      book({
        previous: { location: '0.995', percent: 0.995 },
        previousAt: T - FINISH_DWELL_MS,
        next: { location: '0.995', percent: 0.995 },
      }),
    );
    expect(verdict.verdict).toBe('finished');
  });

  it('finishes manga on the last page, with the same dwell', () => {
    const held = {
      kind: 'manga',
      pageCount: 180,
      previous: { page: 179 },
      previousAt: T - FINISH_DWELL_MS,
      next: { page: 179 },
      at: T,
    };
    expect(detectReadingFinish(held).verdict).toBe('finished');
    // …and not one page earlier.
    expect(detectReadingFinish({ ...held, previous: { page: 177 }, next: { page: 177 } }).verdict)
      .toBe('none');
    // …and not on the drag to the last page either.
    expect(detectReadingFinish({ ...held, previous: { page: 3 } }).verdict).toBe('none');
  });

  it('holds the line exactly at the percent threshold', () => {
    const at = (percent: number) =>
      detectReadingFinish(
        book({
          previous: { location: END, percent },
          previousAt: T - FINISH_DWELL_MS,
          next: { location: END, percent },
        }),
      ).verdict;
    expect(at(FINISH_PERCENT)).toBe('finished');
    expect(at(FINISH_PERCENT - 0.001)).toBe('none');
  });

  it('ignores a percent drift between two saves at one location', () => {
    // `percent` is a derived display number. If it were part of the position
    // signature the dwell would be unreachable rather than strict.
    const verdict = detectReadingFinish(
      book({
        previous: { location: END, percent: 0.9951 },
        previousAt: T - FINISH_DWELL_MS,
        next: { location: END, percent: 0.9952 },
      }),
    );
    expect(verdict.verdict).toBe('finished');
  });
});

describe('§4.2 soft signals ask, they never tick', () => {
  it('suggests when a book sat near the end untouched for a fortnight', () => {
    const verdict = detectReadingFinish(
      book({
        previous: { location: 'p:38:0.3', percent: 0.93 },
        previousAt: T - SUGGEST_IDLE_MS,
        next: { location: 'p:38:0.3', percent: 0.93 },
      }),
    );
    expect(verdict.verdict).toBe('suggest');
    if (verdict.verdict !== 'suggest') return;
    expect(verdict.reason).toBe('stalled-near-end');
  });

  it('says nothing at all when the same book was read yesterday', () => {
    const verdict = detectReadingFinish(
      book({
        previous: { location: 'p:38:0.3', percent: 0.93 },
        previousAt: T - 24 * 60 * 60 * 1000,
        next: { location: 'p:38:0.3', percent: 0.93 },
      }),
    );
    expect(verdict).toEqual({ verdict: 'none', reason: 'near-end' });
  });

  it('never reports suggest for a book that qualifies as finished', () => {
    // Ordering matters: a hard finish that had also been idle a fortnight must
    // tick, not ask.
    const verdict = detectReadingFinish(
      book({ previous: { location: END, percent: 0.995 }, previousAt: T - SUGGEST_IDLE_MS }),
    );
    expect(verdict.verdict).toBe('finished');
  });
});
