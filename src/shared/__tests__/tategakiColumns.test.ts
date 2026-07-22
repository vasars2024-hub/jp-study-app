import { describe, expect, it } from 'vitest';
import { columnsFromInkProfile } from '../tategakiColumns';

/**
 * Profiles below marked "measured" were captured from real rendered pages via
 * the OCR harness, so the thresholds are pinned to observed geometry rather than
 * to invented numbers.
 */

/** Build a profile: runs of `ink` separated by gaps, as [width, inked] pairs. */
function profile(segments: Array<[number, number]>): number[] {
  const out: number[] = [];
  for (const [width, ink] of segments) out.push(...new Array<number>(width).fill(ink));
  return out;
}

describe('columnsFromInkProfile', () => {
  it('returns null when the box holds a single unsplittable run', () => {
    expect(columnsFromInkProfile(profile([[6, 0], [24, 90], [6, 0]]), 500)).toBeNull();
  });

  it('returns null for a profile too small to judge', () => {
    expect(columnsFromInkProfile([5, 5, 5], 500)).toBeNull();
    expect(columnsFromInkProfile(profile([[24, 90]]), 4)).toBeNull();
  });

  it('splits a densely-set novel page into columns, right to left', () => {
    // Five 22px columns separated by 6px gaps — the 1.25 leading case that
    // previously read as one interleaved blob at 0.95 confidence.
    const segments: Array<[number, number]> = [];
    for (let i = 0; i < 5; i++) {
      segments.push([22, 120]);
      if (i < 4) segments.push([6, 0]);
    }
    const cols = columnsFromInkProfile(profile(segments), 558);
    expect(cols).not.toBeNull();
    expect(cols).toHaveLength(5);
    // Right to left: each column starts further left than the previous.
    const starts = cols!.map(([a]) => a);
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
    expect(starts[0]).toBe(112);
  });

  it('drops a ruby column and keeps the body column it annotates', () => {
    // Measured: box 52x502, body ink x10-32 (23 px), ruby x37-45 (9 px).
    const counts = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 36, 80, 106, 98, 84, 82, 73, 76, 88, 149, 189, 137, 82, 79, 81,
      93, 118, 92, 70, 96, 107, 55, 11, 0, 0, 0, 6, 31, 34, 33, 39, 32, 33, 32, 17, 13, 1, 0, 0, 0,
      0, 0, 0,
    ];
    expect(columnsFromInkProfile(counts, 503)).toEqual([[10, 33]]);
  });

  it('drops a ruby column sitting right at the width boundary', () => {
    // Measured: box 47x559, body 24 px, ruby 8 px. Ratio 0.33.
    const counts = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 77, 131, 113, 155, 182, 116, 109, 125, 114, 127, 154, 181, 131,
      118, 134, 120, 110, 91, 104, 128, 111, 56, 27, 1, 0, 0, 8, 22, 55, 78, 54, 69, 51, 47, 30, 15,
      9, 1,
    ];
    expect(columnsFromInkProfile(counts, 560)).toEqual([[9, 33]]);
  });

  it('refuses to split horizontal text into per-character cells', () => {
    // A 30px-tall line: inter-character gaps yield squarish cells whose aspect
    // ratio is ~1, far below the tategaki bar. Splitting here would be a
    // catastrophic regression, so this is the single most important guard.
    const segments: Array<[number, number]> = [];
    for (let i = 0; i < 8; i++) {
      segments.push([25, 20]);
      segments.push([5, 0]);
    }
    expect(columnsFromInkProfile(profile(segments), 30)).toBeNull();
  });

  it('keeps every column when the text carries no ruby', () => {
    const cols = columnsFromInkProfile(
      profile([[24, 100], [8, 0], [24, 100], [8, 0], [24, 100]]),
      520,
    );
    expect(cols).toHaveLength(3);
  });

  it('does not treat a modestly narrower column as ruby', () => {
    // 18 px against a 24 px body is 0.75 — a body column, not ruby.
    const cols = columnsFromInkProfile(profile([[24, 100], [8, 0], [18, 100]]), 520);
    expect(cols).toHaveLength(2);
  });
});
