/**
 * Interval fuzz and load balancing.
 *
 * Without fuzz, every card added on the same day and answered the same way
 * comes back on the same day forever after — a 300-card import becomes a
 * 300-review wall every few weeks. Anki breaks those clumps by jittering each
 * interval inside a small range; this uses Anki's ranges (15% of the part of
 * the interval between 2.5 and 7 days, 10% between 7 and 20, 5% beyond, plus
 * one day) and its 2.5-day floor below which nothing moves.
 *
 * Load balancing picks, inside that same range, the day with the fewest reviews
 * already due, so the jitter flattens the forecast instead of only scattering
 * it. Ties go to the day nearest the random pick.
 *
 * Deterministic: the "random" pick is a hash of a caller-supplied seed (the
 * card id and the review time), so the same review always lands on the same
 * day and tests can pin exact answers.
 */

interface FuzzRange {
  start: number;
  end: number;
  factor: number;
}

const FUZZ_RANGES: readonly FuzzRange[] = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Number.POSITIVE_INFINITY, factor: 0.05 },
];

/** The inclusive whole-day range an interval may be moved within. */
export function fuzzBounds(intervalDays: number, maximumIntervalDays = 36_500): [number, number] {
  if (!Number.isFinite(intervalDays) || intervalDays < 2.5) {
    const kept = Number.isFinite(intervalDays) ? intervalDays : 1;
    return [kept, kept];
  }
  let delta = 1;
  for (const range of FUZZ_RANGES) {
    delta += range.factor * Math.max(0, Math.min(intervalDays, range.end) - range.start);
  }
  const ceiling = Math.max(1, Math.floor(maximumIntervalDays));
  const lower = Math.min(ceiling, Math.max(2, Math.round(intervalDays - delta)));
  const upper = Math.min(ceiling, Math.max(lower, Math.round(intervalDays + delta)));
  return [lower, upper];
}

/** FNV-1a, then one mulberry32 round: a stable float in [0, 1) from a string. */
export function seededUnit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface FuzzOptions {
  seed: string;
  maximumIntervalDays?: number;
  /** Reviews already due `dayOffset` days from now. Without it: plain fuzz. */
  dueLoad?: (dayOffset: number) => number;
}

/** The interval, in whole days, after fuzz and (when possible) load balancing. */
export function fuzzedInterval(intervalDays: number, options: FuzzOptions): number {
  const [lower, upper] = fuzzBounds(intervalDays, options.maximumIntervalDays);
  if (lower === upper) return lower;
  const target = lower + Math.floor(seededUnit(options.seed) * (upper - lower + 1));
  if (!options.dueLoad) return target;
  let best = target;
  let bestLoad = Number.POSITIVE_INFINITY;
  for (let day = lower; day <= upper; day += 1) {
    const raw = Number(options.dueLoad(day));
    const load = Number.isFinite(raw) && raw > 0 ? raw : 0;
    const closer = Math.abs(day - target) < Math.abs(best - target);
    if (load < bestLoad || (load === bestLoad && closer)) {
      best = day;
      bestLoad = load;
    }
  }
  return best;
}
