/**
 * MASTER_PLAN §8 — Subtitle Quality System (offline scoring).
 *
 * Rates a subtitle release on five stored dimensions — accuracy, sync quality,
 * translation quality, completeness and user rating — and projects them into one
 * deterministic composite score plus a coarse grade band. Every dimension is an
 * optional 0–100 value: a release nobody has rated scores `null` (grade `unrated`)
 * rather than a misleading zero, and a partly-rated release is scored over the
 * dimensions that *are* known, with the weights re-normalized.
 *
 * Deliberately out of scope for this phase (do NOT add here):
 *   - inspecting subtitle file contents to *derive* a rating (no I/O, no parsing),
 *   - networking, provider execution, downloads, authentication,
 *   - clock access — ratings are stored and scored, never timestamped here.
 * Everything below is pure, synchronous, and deterministic. Nothing here does I/O.
 */

export type SubtitleQualityDimension =
  | 'accuracy'
  | 'syncQuality'
  | 'translationQuality'
  | 'completeness'
  | 'userRating';

export const SUBTITLE_QUALITY_DIMENSIONS: SubtitleQualityDimension[] = [
  'accuracy', 'syncQuality', 'translationQuality', 'completeness', 'userRating',
];

/** Each dimension is an optional 0–100 score; `null` means "not rated". */
export type SubtitleQualityRatings = Record<SubtitleQualityDimension, number | null>;

export type SubtitleQualityWeights = Record<SubtitleQualityDimension, number>;

/**
 * Default weighting: how faithful and how well-timed a release is matters most for
 * study use; a raw user rating is the weakest signal because it conflates everything.
 */
export const DEFAULT_SUBTITLE_QUALITY_WEIGHTS: SubtitleQualityWeights = {
  accuracy: 0.3,
  syncQuality: 0.25,
  translationQuality: 0.2,
  completeness: 0.15,
  userRating: 0.1,
};

export type SubtitleQualityGrade = 'unrated' | 'poor' | 'fair' | 'good' | 'excellent';

export interface SubtitleQualityContribution {
  dimension: SubtitleQualityDimension;
  rating: number;
  /** The configured weight for this dimension. */
  weight: number;
  /** The weight after re-normalizing across the rated dimensions only. */
  normalizedWeight: number;
}

export interface SubtitleQualityScore {
  /** Weighted mean of the rated dimensions, 0–100 with one decimal; null when unrated. */
  score: number | null;
  grade: SubtitleQualityGrade;
  ratedDimensions: SubtitleQualityDimension[];
  missingDimensions: SubtitleQualityDimension[];
  contributions: SubtitleQualityContribution[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One decimal place, so scores compare and serialize identically everywhere. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Four decimal places, used for the re-normalized weights. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function rating(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return round1(Math.min(100, Math.max(0, value)));
}

export function createEmptySubtitleQualityRatings(): SubtitleQualityRatings {
  return { accuracy: null, syncQuality: null, translationQuality: null, completeness: null, userRating: null };
}

/** Clamps every known dimension into 0–100 and drops anything unrecognized. */
export function normalizeSubtitleQualityRatings(input: unknown): SubtitleQualityRatings {
  const raw = isRecord(input) ? input : {};
  const ratings = createEmptySubtitleQualityRatings();
  SUBTITLE_QUALITY_DIMENSIONS.forEach((dimension) => {
    ratings[dimension] = rating(raw[dimension]);
  });
  return ratings;
}

/** The grade band for a composite score. `null` (nothing rated) grades as `unrated`. */
export function gradeSubtitleQuality(score: number | null): SubtitleQualityGrade {
  if (score === null) return 'unrated';
  if (score < 40) return 'poor';
  if (score < 60) return 'fair';
  if (score < 80) return 'good';
  return 'excellent';
}

/**
 * Weighted mean over the *rated* dimensions. Weights are re-normalized to the rated
 * subset, so rating only `accuracy` scores exactly that accuracy value. Non-finite or
 * negative weights are treated as 0; if every rated dimension ends up weightless the
 * rated dimensions are averaged evenly instead of collapsing to a divide-by-zero.
 */
export function scoreSubtitleQuality(
  input: unknown,
  weights: SubtitleQualityWeights = DEFAULT_SUBTITLE_QUALITY_WEIGHTS,
): SubtitleQualityScore {
  const ratings = normalizeSubtitleQualityRatings(input);
  const rated = SUBTITLE_QUALITY_DIMENSIONS.filter((dimension) => ratings[dimension] !== null);
  const missing = SUBTITLE_QUALITY_DIMENSIONS.filter((dimension) => ratings[dimension] === null);
  if (rated.length === 0) {
    return { score: null, grade: 'unrated', ratedDimensions: [], missingDimensions: missing, contributions: [] };
  }
  const weightOf = (dimension: SubtitleQualityDimension): number => {
    const value = weights[dimension];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
  };
  const total = rated.reduce((sum, dimension) => sum + weightOf(dimension), 0);
  const contributions: SubtitleQualityContribution[] = rated.map((dimension) => {
    const weight = weightOf(dimension);
    return {
      dimension,
      rating: ratings[dimension] as number,
      weight,
      normalizedWeight: total > 0 ? round4(weight / total) : round4(1 / rated.length),
    };
  });
  const score = total > 0
    ? rated.reduce((sum, dimension) => sum + (ratings[dimension] as number) * (weightOf(dimension) / total), 0)
    : rated.reduce((sum, dimension) => sum + (ratings[dimension] as number), 0) / rated.length;
  const rounded = round1(score);
  return {
    score: rounded,
    grade: gradeSubtitleQuality(rounded),
    ratedDimensions: rated,
    missingDimensions: missing,
    contributions,
  };
}

/**
 * Sort comparator: higher score first, unrated last, ties broken by nothing here —
 * callers add their own stable tiebreak (provider priority, id, …).
 */
export function compareSubtitleQuality(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}
