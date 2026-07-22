/**
 * Split a merged tategaki box back into its individual columns.
 *
 * DB's unclip step grows each detected region outward, which welds neighbouring
 * columns of vertical text into a single box. Nothing downstream un-welds them,
 * so the box gets read as one unit: it is sliced into horizontal ink rows that
 * alternate between columns, and そんな人が / 巨人の国に comes back as
 * 巨そ大んのな国人でほが — at 0.78 confidence. On a densely-set novel page the
 * same failure produced pure noise at 0.95, high enough that no confidence check
 * can catch it. Splitting the box first is the only fix.
 *
 * This module is the pure half: given a per-column ink profile it returns the
 * column boundaries. Reading pixels is the caller's job, which keeps the
 * decision logic testable against profiles captured from real pages.
 */

/**
 * A column narrower than this share of the body width is ruby, not text.
 *
 * Ruby is conventionally half the base font size, and measured runs bear that
 * out: 8–12 px of ink beside a 23–24 px body column, i.e. ratios of 0.33–0.50.
 * The bar sits well above that band with room to spare.
 *
 * The tradeoff is that a genuinely narrow body column — one holding only thin
 * glyphs — could be dropped. That is rare, because ink width tracks the font's
 * em rather than the individual glyph, and it is far cheaper than the
 * alternative of ruby interleaved into every annotated word.
 */
const FURIGANA_WIDTH_RATIO = 0.65;

/** Columns must be at least this many times taller than wide to be tategaki. */
const MIN_COLUMN_ASPECT = 2.5;

/** Share of a column's height that must carry ink before it counts as inked. */
const INK_HEIGHT_FRACTION = 0.02;

/**
 * Column boundaries within an ink profile, right-to-left, or null when the box
 * is not splittable tategaki.
 *
 * Returns null rather than guessing whenever the evidence is weak. That guard is
 * what keeps horizontal text safe: splitting a horizontal line on its
 * inter-character gaps yields roughly square cells, which fail the aspect test
 * and let the caller fall through to its normal path.
 *
 * @param counts inked pixel count per x, across the full height of the box
 * @param height box height in pixels, used for the ink and aspect thresholds
 */
export function columnsFromInkProfile(
  counts: readonly number[],
  height: number,
): Array<[number, number]> | null {
  if (counts.length < 8 || height < 8) return null;

  const minInk = Math.max(1, Math.floor(height * INK_HEIGHT_FRACTION));

  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let x = 0; x <= counts.length; x++) {
    if (x < counts.length && counts[x] >= minInk) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      runs.push([start, x]);
      start = -1;
    }
  }
  // One run means there is nothing to split.
  if (runs.length < 2) return null;

  // Compare against the 75th percentile rather than the median: fully-annotated
  // text has one ruby column per body column, which drags a median down between
  // the two groups and makes the comparison meaningless.
  const widths = runs.map(([a, b]) => b - a).sort((a, b) => a - b);
  const bodyWidth = widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.75))];
  if (bodyWidth <= 0) return null;

  const kept = runs.filter(([a, b]) => b - a >= bodyWidth * FURIGANA_WIDTH_RATIO);
  if (!kept.length) return null;
  // A single surviving column is still worth taking when ruby was stripped off
  // it — that is the whole point. It is only a no-op, and so a fall-through,
  // when nothing was dropped and there was nothing to split.
  if (kept.length === 1 && kept.length === runs.length) return null;

  // Every surviving column must look like stacked glyphs, not a squat cell.
  const aspects = kept.map(([a, b]) => height / Math.max(1, b - a)).sort((p, q) => p - q);
  if (aspects[Math.floor(aspects.length / 2)] < MIN_COLUMN_ASPECT) return null;

  // Tategaki reads right to left.
  return kept.slice().sort((p, q) => q[0] - p[0]);
}
