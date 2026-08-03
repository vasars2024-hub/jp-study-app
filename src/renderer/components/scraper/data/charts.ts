// Tiny SVG path builders for the Scraper's inline charts.
//
// Deliberately not a charting library: the app renders sparklines, meters and
// a stacked bar, all of which are a handful of arithmetic lines. Pulling in a
// dependency for that would cost more bundle than the whole scraper chunk.
//
// Everything here is pure — no DOM, no colour. Colour comes from CSS tokens on
// the elements these paths are handed to.

export interface SparklineOptions {
  width: number;
  height: number;
  /** Leaves room for the stroke so the extremes aren't clipped. */
  padding?: number;
}

function extent(values: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  // A flat series would divide by zero; give it a band so it draws mid-height.
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}

function points(values: number[], opts: SparklineOptions): [number, number][] {
  const pad = opts.padding ?? 1;
  const { min, max } = extent(values);
  const innerW = Math.max(1, opts.width - pad * 2);
  const innerH = Math.max(1, opts.height - pad * 2);
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  return values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + innerH - ((v - min) / (max - min)) * innerH;
    return [x, y];
  });
}

/** Open polyline through the series. */
export function sparklinePath(values: number[], opts: SparklineOptions): string {
  if (!values.length) return '';
  const pts = points(values, opts);
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
}

/** Same series closed to the baseline, for a tinted fill under the line. */
export function sparklineAreaPath(values: number[], opts: SparklineOptions): string {
  if (!values.length) return '';
  const pad = opts.padding ?? 1;
  const pts = points(values, opts);
  const base = opts.height - pad;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const line = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  return `${line} L${last[0].toFixed(2)} ${base.toFixed(2)} L${first[0].toFixed(2)} ${base.toFixed(2)} Z`;
}

export interface DonutGeometry {
  /** Circumference, for stroke-dasharray. */
  circumference: number;
  /** Filled length, for the first dasharray value. */
  filled: number;
  radius: number;
  center: number;
}

/**
 * Ring meter drawn with stroke-dasharray rather than arc paths — arcs need
 * case handling at 0% and 100%, dasharray doesn't.
 */
export function donutGeometry(
  ratio: number,
  size: number,
  strokeWidth: number,
): DonutGeometry {
  const radius = Math.max(1, size / 2 - strokeWidth / 2);
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  return {
    circumference,
    filled: circumference * clamped,
    radius,
    center: size / 2,
  };
}

export interface StackSegment {
  id: string;
  value: number;
}

export interface StackedSegment extends StackSegment {
  /** Percentage width, already normalized across the stack. */
  percent: number;
}

/** Normalizes a stacked bar; an all-zero stack returns zero-width segments. */
export function stackedBar(segments: StackSegment[]): StackedSegment[] {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total <= 0) return segments.map((s) => ({ ...s, percent: 0 }));
  return segments.map((s) => ({ ...s, percent: (Math.max(0, s.value) / total) * 100 }));
}

// Byte sizes and coarse durations already have one implementation each in this
// codebase — shared/assetRegistry.ts's formatBytes and renderer/stats.ts's
// formatDuration. Re-export nothing and add nothing that duplicates them; the
// architecture audit flags a second export of either name.

/**
 * Clock-style countdown (`02:15`), which is what the reference design shows for
 * a scrape ETA. Distinct from stats.ts's formatDuration, which rounds to whole
 * minutes and reads as elapsed time rather than time remaining.
 */
export function formatEtaClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rs = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(rs).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Relative age from a minute offset rather than a timestamp — fixtures store
 * offsets so the app looks identical on every run instead of ageing on disk.
 */
export function formatAgeMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

/** The same offset, pointed forwards — "in 3h". */
export function formatInMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 60) return `in ${Math.round(minutes)}m`;
  if (minutes < 1440) return `in ${Math.round(minutes / 60)}h`;
  return `in ${Math.round(minutes / 1440)}d`;
}
