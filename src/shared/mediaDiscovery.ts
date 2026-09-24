/**
 * Discovery model + recommendation scoring for the Scraper app.
 *
 * The Scraper app answers one question: "what should I watch next, given what I
 * already study?" Everything needed to answer it deterministically lives here —
 * no network, no clock, no storage. `src/main/mediaDiscovery.ts` fetches
 * candidates from the metadata providers and this module ranks them, so the
 * ranking is unit-testable without a single HTTP request.
 *
 * Deliberately out of scope (do NOT add here):
 *   - provider HTTP, caching, rate limiting — `main/mediaProviderClients.ts`,
 *   - identity resolution across providers — `shared/mediaIdentity.ts`,
 *   - anything that reads localStorage or `Date.now()`.
 *
 * Difficulty estimation is a heuristic, not a claim of truth. It reads the one
 * signal providers reliably supply (genres, format, length) and maps it onto the
 * JLPT band a learner would need to follow the dialogue unaided. It is stated as
 * an estimate everywhere it surfaces in the UI.
 */

export const MEDIA_DISCOVERY_MODEL_VERSION = 1;

export type DiscoveryProviderId = 'jikan' | 'anilist';
export type DiscoveryMediaType = 'anime' | 'manga';

/** JLPT bands, easiest first. Index doubles as the difficulty ordinal. */
export const STUDY_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
export type StudyLevel = (typeof STUDY_LEVELS)[number];

export function isStudyLevel(value: unknown): value is StudyLevel {
  return typeof value === 'string' && (STUDY_LEVELS as readonly string[]).includes(value);
}

/** The feeds the app can pull without the user typing a query. */
export const DISCOVERY_FEEDS = ['seasonal', 'airing', 'top', 'upcoming'] as const;
export type DiscoveryFeedId = (typeof DISCOVERY_FEEDS)[number];

export function isDiscoveryFeed(value: unknown): value is DiscoveryFeedId {
  return typeof value === 'string' && (DISCOVERY_FEEDS as readonly string[]).includes(value);
}

/**
 * One candidate title, normalized across providers. A subset of
 * `main/mediaProviderClients.ts`'s `ProviderWork` — only the fields the console
 * displays or scores, so the wire payload for a 25-item feed stays small.
 */
export interface DiscoveryCandidate {
  provider: DiscoveryProviderId;
  id: number;
  /** Missing on legacy shortlist entries, where it means anime. */
  mediaType?: DiscoveryMediaType;
  title: string;
  nativeTitle?: string;
  synopsis?: string;
  year?: number;
  /** Provider format string: TV, Movie, OVA, ONA, Special, … */
  format?: string;
  status?: string;
  episodeCount?: number;
  chapterCount?: number;
  genres: string[];
  studio?: string;
  /** Provider score on a 0–10 scale. */
  rating?: number;
  /** Provider popularity (member/favourite count); scale differs per provider. */
  popularity?: number;
  posterUrl?: string;
}

/**
 * Which catalogue actually answered a feed request, and what went wrong on the
 * way there.
 *
 * The Discover header used to print "MyAnimeList · AniList" unconditionally, so
 * a MyAnimeList outage — which is what a Jikan 504 is — looked exactly like a
 * healthy MyAnimeList feed, while the rows were AniList's the whole time. This
 * is the signal that stops the header claiming a source that never answered.
 */
export interface DiscoveryFeedProvenance {
  /** The catalogue whose rows these are; `null` when every source failed. */
  servedBy: DiscoveryProviderId | null;
  /** Sources tried and rejected, in the order they were tried. */
  failures: DiscoveryProviderId[];
  /**
   * Only for `seasonal`, and only when the rows are NOT the current season: the
   * season they actually describe. Present means "stop calling this This season".
   */
  fallbackSeason?: { season: string; year: number };
  fetchedAt: number;
}

export interface DiscoveryFeedResult {
  candidates: DiscoveryCandidate[];
  provenance: DiscoveryFeedProvenance;
}

/** What the learner brings to the ranking. Derived, never typed by hand. */
export interface DiscoveryProfile {
  level: StudyLevel;
  /** Normalized genre → affinity 0–1, from what is already in the library. */
  genreAffinity: Record<string, number>;
  /** Normalized title keys already in the library, so owned titles rank down. */
  knownTitleKeys: string[];
  /**
   * `jikan:<malId>` / `anilist:<id>` of titles already tracked — the watch
   * library, MAL imports included — matched against a candidate's own id, so a
   * title is recognised whatever name the feed uses for it.
   */
  knownIds?: string[];
  /** Prefer short runs — the default for lower levels, where finishing matters. */
  preferShort: boolean;
}

/**
 * Why a candidate scored the way it did. Codes, not sentences: the renderer owns
 * the wording so all four UI languages stay in the catalogs.
 */
export type DiscoveryReasonCode =
  | 'level-match'
  | 'level-stretch'
  | 'level-easy'
  | 'genre-affinity'
  | 'short-commitment'
  | 'long-commitment'
  | 'highly-rated'
  | 'widely-watched'
  | 'already-in-library';

export interface DiscoveryReason {
  code: DiscoveryReasonCode;
  /** Contribution to the final score, in points. Negative for penalties. */
  points: number;
  /** Genre name for `genre-affinity`; episode count for the commitment codes. */
  detail?: string;
}

export interface DiscoveryRanking {
  candidate: DiscoveryCandidate;
  /** 0–100. Comparable only within one ranked list. */
  matchScore: number;
  estimatedLevel: StudyLevel;
  reasons: DiscoveryReason[];
  inLibrary: boolean;
}

// ---------------------------------------------------------------------------
// Difficulty heuristics
// ---------------------------------------------------------------------------

/**
 * Genre → linguistic difficulty on the 0–4 JLPT ordinal (0 = N5, 4 = N1).
 *
 * Grounded in register rather than plot: everyday-life shows use the register a
 * beginner is taught, while anything with institutional, historical, or
 * technical vocabulary sits at the far end. Genres absent from this table simply
 * do not vote — the average is taken over matches only.
 */
const GENRE_DIFFICULTY: Record<string, number> = {
  // Everyday register
  'slice of life': 0.6,
  comedy: 1.2,
  'girls love': 1.2,
  'boys love': 1.2,
  romance: 1.4,
  school: 1.2,
  sports: 1.5,
  music: 1.5,
  gourmet: 1.2,
  kids: 0.2,
  'avant garde': 3.2,
  // Mid register
  adventure: 1.8,
  action: 1.9,
  fantasy: 2.2,
  supernatural: 2.3,
  drama: 2.4,
  mystery: 2.8,
  horror: 2.6,
  ecchi: 1.6,
  harem: 1.5,
  isekai: 2.0,
  // Heavy register
  seinen: 3.2,
  josei: 3.0,
  psychological: 3.6,
  'sci-fi': 3.2,
  military: 3.6,
  historical: 3.8,
  'award winning': 3.0,
  thriller: 3.0,
  'martial arts': 2.4,
  mecha: 3.0,
  detective: 3.4,
  medical: 3.8,
  workplace: 3.0,
  politics: 4.0,
  // Demographics that pull the other way
  shounen: 1.8,
  shoujo: 1.6,
};

/** Formats that skew harder than their genres suggest (denser, less repetition). */
const FORMAT_DIFFICULTY_SHIFT: Record<string, number> = {
  movie: 0.3,
  special: 0.1,
  ova: 0.1,
  ona: 0,
  tv: 0,
  'tv special': 0.1,
  music: -0.4,
};

/** Neutral starting point when a title's genres are all unknown to the table. */
const DEFAULT_DIFFICULTY = 2.0;

function normalizeGenre(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Title key used for "do I already have this?" checks. Mirrors the intent of
 * `normalizeMediaTitleKey` but stays local so this module has no imports —
 * discovery titles arrive from providers, not from resolved identities.
 */
export function discoveryTitleKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    // U+3000 (the ideographic space) is a separator in Japanese titles, so it
    // has to fold into a normal space. Written as an escape rather than
    // literally: a bare U+3000 in source is indistinguishable from a stray
    // character, which is exactly what no-irregular-whitespace guards against.
    .replace(/[\u3000\s]+/g, ' ')
    .replace(/[!-/:-@[-`{-~。、「」『』・：；！？]/g, '')
    .trim();
}

/** Difficulty ordinal 0–4 for a candidate, from its genres and format. */
export function estimateDifficulty(candidate: DiscoveryCandidate): number {
  const votes = candidate.genres
    .map((genre) => GENRE_DIFFICULTY[normalizeGenre(genre)])
    .filter((value): value is number => typeof value === 'number');
  const base = votes.length > 0 ? votes.reduce((a, b) => a + b, 0) / votes.length : DEFAULT_DIFFICULTY;
  const shift = FORMAT_DIFFICULTY_SHIFT[normalizeGenre(candidate.format ?? '')] ?? 0;
  return clamp(base + shift, 0, 4);
}

/** The JLPT band a learner needs to follow this title unaided (an estimate). */
export function estimateStudyLevel(candidate: DiscoveryCandidate): StudyLevel {
  return STUDY_LEVELS[Math.round(estimateDifficulty(candidate))] ?? 'N3';
}

function levelOrdinal(level: StudyLevel): number {
  const index = STUDY_LEVELS.indexOf(level);
  return index < 0 ? 2 : index;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** The slice of a library item the profile builder reads. */
export interface DiscoveryLibrarySignal {
  title?: string;
  /** Every other name it goes by (watch-library alternates). */
  altTitles?: string[];
  genres?: string[];
  jlptLevel?: string;
  malId?: number;
  anilistId?: number;
}

/**
 * Builds the ranking profile from the user's own library.
 *
 * `level` is passed in rather than inferred, because the level the learner
 * *studies at* and the level their files happen to sit at are different things —
 * the app asks, and falls back to the library's most common band only when no
 * answer is stored.
 */
export function buildDiscoveryProfile(
  library: readonly DiscoveryLibrarySignal[],
  level: StudyLevel,
): DiscoveryProfile {
  const counts = new Map<string, number>();
  const knownTitleKeys = new Set<string>();
  const knownIds = new Set<string>();
  for (const item of library) {
    for (const name of [item.title, ...(item.altTitles ?? [])]) {
      const key = discoveryTitleKey(name);
      if (key) knownTitleKeys.add(key);
    }
    if (item.malId) knownIds.add(`jikan:${item.malId}`);
    if (item.anilistId) knownIds.add(`anilist:${item.anilistId}`);
    for (const genre of item.genres ?? []) {
      const normalized = normalizeGenre(genre);
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  const peak = Math.max(1, ...counts.values());
  const genreAffinity: Record<string, number> = {};
  for (const [genre, count] of counts) genreAffinity[genre] = count / peak;

  return {
    level,
    genreAffinity,
    knownTitleKeys: [...knownTitleKeys],
    knownIds: [...knownIds],
    preferShort: levelOrdinal(level) <= 1,
  };
}

/** The library's most common JLPT band, for seeding the level selector. */
export function inferLevelFromLibrary(library: readonly DiscoveryLibrarySignal[]): StudyLevel | null {
  const counts = new Map<StudyLevel, number>();
  for (const item of library) {
    const raw = typeof item.jlptLevel === 'string' ? item.jlptLevel.trim().toUpperCase() : '';
    if (!isStudyLevel(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  let best: StudyLevel | null = null;
  let bestCount = 0;
  for (const level of STUDY_LEVELS) {
    const count = counts.get(level) ?? 0;
    if (count > bestCount) {
      best = level;
      bestCount = count;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Weights, in points, summing to 100 before penalties. Level fit dominates on
 * purpose: a masterpiece three bands above the learner is still the wrong
 * recommendation for a study app.
 */
const WEIGHT_LEVEL = 48;
const WEIGHT_GENRE = 24;
const WEIGHT_RATING = 18;
const WEIGHT_COMMITMENT = 10;
/** Owned titles stay visible (the user may want the metadata) but sink. */
const PENALTY_IN_LIBRARY = 35;

/** Episode counts above this read as a long-runner commitment. */
const LONG_RUN_EPISODES = 50;
/** At or below this a title is a weekend, which suits a beginner. */
const SHORT_RUN_EPISODES = 13;

function levelFit(candidate: DiscoveryCandidate, profile: DiscoveryProfile): { points: number; gap: number } {
  const gap = estimateDifficulty(candidate) - levelOrdinal(profile.level);
  // One band above the learner is the sweet spot (comprehensible input plus a
  // stretch); further above falls off twice as fast as falling below, because
  // "too easy" still teaches and "too hard" does not.
  const distance = gap > 1 ? (gap - 1) * 2 : gap < 0 ? -gap : 0;
  return { points: WEIGHT_LEVEL * clamp(1 - distance / 4, 0, 1), gap };
}

function genreFit(
  candidate: DiscoveryCandidate,
  profile: DiscoveryProfile,
): { points: number; topGenre: string | null } {
  let sum = 0;
  let topGenre: string | null = null;
  let topWeight = 0;
  for (const genre of candidate.genres) {
    const weight = profile.genreAffinity[normalizeGenre(genre)] ?? 0;
    sum += weight;
    if (weight > topWeight) {
      topWeight = weight;
      topGenre = genre;
    }
  }
  // Averaged over three genres so a title tagged with a dozen labels cannot
  // out-score a focused match by breadth alone.
  return { points: WEIGHT_GENRE * clamp(sum / 3, 0, 1), topGenre: topWeight > 0 ? topGenre : null };
}

function ratingFit(candidate: DiscoveryCandidate): number {
  if (typeof candidate.rating !== 'number' || !Number.isFinite(candidate.rating)) {
    // No score is not a bad score — award the midpoint rather than a zero, or
    // every newly-listed title would be buried by the back catalogue.
    return WEIGHT_RATING * 0.5;
  }
  // Provider scores cluster between 5 and 9; stretch that band over the range.
  return WEIGHT_RATING * clamp((candidate.rating - 5) / 4, 0, 1);
}

function commitmentFit(
  candidate: DiscoveryCandidate,
  profile: DiscoveryProfile,
): { points: number; length: 'short' | 'long' | 'medium' | 'unknown' } {
  const episodes = candidate.episodeCount;
  if (typeof episodes !== 'number' || episodes <= 0) {
    return { points: WEIGHT_COMMITMENT * 0.5, length: 'unknown' };
  }
  if (episodes >= LONG_RUN_EPISODES) {
    return { points: profile.preferShort ? 0 : WEIGHT_COMMITMENT * 0.6, length: 'long' };
  }
  if (episodes <= SHORT_RUN_EPISODES) {
    return { points: WEIGHT_COMMITMENT, length: 'short' };
  }
  return { points: WEIGHT_COMMITMENT * 0.8, length: 'medium' };
}

/** Scores one candidate against the profile. Pure; same input, same output. */
export function scoreDiscoveryCandidate(
  candidate: DiscoveryCandidate,
  profile: DiscoveryProfile,
): DiscoveryRanking {
  const reasons: DiscoveryReason[] = [];

  const level = levelFit(candidate, profile);
  reasons.push({
    code: level.gap > 1 ? 'level-stretch' : level.gap < -0.5 ? 'level-easy' : 'level-match',
    points: round(level.points),
  });

  const genre = genreFit(candidate, profile);
  if (genre.topGenre) {
    reasons.push({ code: 'genre-affinity', points: round(genre.points), detail: genre.topGenre });
  }

  const rating = ratingFit(candidate);
  if (typeof candidate.rating === 'number' && candidate.rating >= 7.5) {
    reasons.push({ code: 'highly-rated', points: round(rating), detail: candidate.rating.toFixed(2) });
  }

  const commitment = commitmentFit(candidate, profile);
  if (commitment.length === 'short') {
    reasons.push({
      code: 'short-commitment',
      points: round(commitment.points),
      detail: String(candidate.episodeCount),
    });
  } else if (commitment.length === 'long') {
    reasons.push({
      code: 'long-commitment',
      points: round(commitment.points),
      detail: String(candidate.episodeCount),
    });
  }

  const inLibrary = !!profile.knownIds?.includes(`${candidate.provider}:${candidate.id}`)
    || profile.knownTitleKeys.includes(discoveryTitleKey(candidate.title))
    || (!!candidate.nativeTitle && profile.knownTitleKeys.includes(discoveryTitleKey(candidate.nativeTitle)));
  if (inLibrary) reasons.push({ code: 'already-in-library', points: -PENALTY_IN_LIBRARY });

  const total = level.points + genre.points + rating + commitment.points - (inLibrary ? PENALTY_IN_LIBRARY : 0);

  return {
    candidate,
    matchScore: round(clamp(total, 0, 100)),
    estimatedLevel: estimateStudyLevel(candidate),
    reasons,
    inLibrary,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Collapses the same work arriving from both providers into one entry, keeping
 * the record with more filled-in fields. Matching is by normalized title only —
 * genuine cross-provider identity resolution is `shared/mediaIdentity.ts`'s job
 * and needs signals a search hit does not carry.
 */
export function dedupeDiscoveryCandidates(
  candidates: readonly DiscoveryCandidate[],
): DiscoveryCandidate[] {
  const byKey = new Map<string, DiscoveryCandidate>();
  for (const candidate of candidates) {
    const key = discoveryTitleKey(candidate.title) || `${candidate.provider}:${candidate.id}`;
    const existing = byKey.get(key);
    if (!existing || completeness(candidate) > completeness(existing)) byKey.set(key, candidate);
  }
  return [...byKey.values()];
}

function completeness(candidate: DiscoveryCandidate): number {
  let score = 0;
  if (candidate.synopsis) score += 1;
  if (candidate.posterUrl) score += 1;
  if (candidate.genres.length > 0) score += 1;
  if (typeof candidate.episodeCount === 'number') score += 1;
  if (typeof candidate.rating === 'number') score += 1;
  if (candidate.studio) score += 1;
  return score;
}

export interface DiscoveryRankOptions {
  /** Cap the returned list. Omit for everything. */
  limit?: number;
  /** Drop titles already in the library instead of ranking them down. */
  hideInLibrary?: boolean;
  /** Keep only titles whose estimated level is within this many bands. */
  maxLevelGap?: number;
}

/**
 * Ranks candidates best-first. Ties break on provider rating and then title, so
 * two runs over the same data always produce the same order — a stable list is
 * what makes the console feel like a tool rather than a slot machine.
 */
export function rankDiscoveryCandidates(
  candidates: readonly DiscoveryCandidate[],
  profile: DiscoveryProfile,
  options: DiscoveryRankOptions = {},
): DiscoveryRanking[] {
  const ranked = dedupeDiscoveryCandidates(candidates)
    .map((candidate) => scoreDiscoveryCandidate(candidate, profile))
    .filter((entry) => {
      if (options.hideInLibrary && entry.inLibrary) return false;
      if (typeof options.maxLevelGap === 'number') {
        const gap = Math.abs(levelOrdinal(entry.estimatedLevel) - levelOrdinal(profile.level));
        if (gap > options.maxLevelGap) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const ratingGap = (b.candidate.rating ?? 0) - (a.candidate.rating ?? 0);
      if (ratingGap !== 0) return ratingGap;
      return a.candidate.title.localeCompare(b.candidate.title);
    });
  return typeof options.limit === 'number' ? ranked.slice(0, Math.max(0, options.limit)) : ranked;
}

/** Stable per-candidate key for React lists and the shortlist store. */
export function discoveryCandidateId(candidate: DiscoveryCandidate): string {
  const legacyId = `${candidate.provider}:${candidate.id}`;
  return candidate.mediaType === 'manga' ? `manga:${legacyId}` : legacyId;
}
