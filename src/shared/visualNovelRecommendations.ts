import type { MediaLanguageProfile } from './mediaStudyDatabase';
import type { VisualNovelEntry, VisualNovelSourceResult } from './visualNovel';

export interface VisualNovelLearnerContext {
  targetDifficultyScore: number;
  targetJlpt: 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
  knownCoverage: number | null;
  preferredTags: string[];
  analyzedTitles: number;
}

/** A reason in catalog terms, for the UI to translate (`reasons` stays English for agents/logs). */
export interface VisualNovelReasonCode {
  key: string;
  vars?: Record<string, string | number>;
}

export interface VisualNovelRecommendation<T> {
  item: T;
  score: number;
  reasons: string[];
  reasonCodes: VisualNovelReasonCode[];
  difficultyScore: number | null;
  knownCoverage: number | null;
  /** Where `difficultyScore` came from: the learner's own captured text, or VNDB data. */
  difficultySource: 'captured' | 'vndb' | null;
}

/** What the renderer asks main for when it wants recommendations beyond the library. */
export interface VisualNovelCandidateRequest {
  /** Preferred tag NAMES, strongest first (main resolves them to VNDB ids). */
  tags: string[];
  /** VNDB ids already in the library, never recommended again. */
  excludeProviderIds: string[];
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const normalizedTag = (value: string): string => value.trim().toLocaleLowerCase();

function targetJlpt(score: number): VisualNovelLearnerContext['targetJlpt'] {
  if (score < 30) return 'N5';
  if (score < 45) return 'N4';
  if (score < 62) return 'N3';
  if (score < 80) return 'N2';
  return 'N1';
}

export function buildVisualNovelLearnerContext(
  entries: readonly VisualNovelEntry[],
  profiles: Readonly<Record<string, MediaLanguageProfile>>,
): VisualNovelLearnerContext {
  const relevantProfiles = entries.flatMap((entry) => {
    const profile = profiles[`vn:${entry.id}`];
    return profile ? [profile] : [];
  });
  const totalWeight = relevantProfiles.reduce(
    (total, profile) => total + Math.max(1, profile.analyzedCharacters),
    0,
  );
  const knownCoverage = totalWeight
    ? relevantProfiles.reduce(
      (total, profile) => total + profile.difficulty.knownRatio * Math.max(1, profile.analyzedCharacters),
      0,
    ) / totalWeight
    : null;
  const targetDifficultyScore = totalWeight
    ? clamp(relevantProfiles.reduce((total, profile) => {
      const adjusted = profile.difficulty.score + (profile.difficulty.knownRatio - 0.82) * 35;
      return total + adjusted * Math.max(1, profile.analyzedCharacters);
    }, 0) / totalWeight, 15, 95)
    : 50;

  const tagWeights = new Map<string, { label: string; weight: number }>();
  for (const entry of entries) {
    const weight = entry.status === 'completed' ? 3
      : entry.status === 'reading' || entry.status === 'replaying' ? 2
        : entry.status === 'planned' ? 0.4
          : 0;
    for (const tag of [...entry.genres, ...entry.tags]) {
      const key = normalizedTag(tag);
      if (!key) continue;
      const current = tagWeights.get(key);
      tagWeights.set(key, { label: current?.label ?? tag, weight: (current?.weight ?? 0) + weight });
    }
  }
  const preferredTags = [...tagWeights.values()]
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
    .slice(0, 8)
    .map((entry) => entry.label);

  return {
    targetDifficultyScore: Math.round(targetDifficultyScore),
    targetJlpt: targetJlpt(targetDifficultyScore),
    knownCoverage,
    preferredTags,
    analyzedTitles: relevantProfiles.length,
  };
}

/**
 * VNDB tags that reliably move the Japanese up or down. Native VNs sit around
 * N2-N1 as a class; slice-of-life, romance and comedy titles use everyday
 * speech, while science fiction, mystery, historical and philosophical ones
 * carry specialist and literary vocabulary. Matched on lower-cased tag names.
 */
const EASIER_TAGS = [
  'slice of life', 'moege', 'school life', 'comedy', 'romance', 'daily life',
  'iyashikei', 'kinetic novel', 'childhood friend heroine',
];
const HARDER_TAGS = [
  'science fiction', 'philosophy', 'mystery', 'detective', 'historical', 'politics',
  'war', 'psychological', 'chuunibyou', 'military', 'time travel', 'conspiracy',
  'religion', 'literature', 'dystopia', 'cyberpunk', 'horror', 'mythology', 'occult',
];

export function jlptForDifficultyScore(score: number): VisualNovelLearnerContext['targetJlpt'] {
  return targetJlpt(score);
}

/**
 * A difficulty PRIOR from VNDB data alone (tags and length), used before any of
 * the learner's own text has been captured. Deliberately coarse, and always
 * presented as an estimate.
 */
export function estimateVisualNovelDifficultyPrior(input: {
  tags: readonly string[];
  estimatedPlaytimeHours: number;
}): { score: number; jlpt: VisualNovelLearnerContext['targetJlpt'] } {
  const tags = input.tags.map(normalizedTag);
  const hits = (list: readonly string[]): number => Math.min(
    3,
    list.filter((needle) => tags.some((tag) => tag.includes(needle))).length,
  );
  let score = 60 + hits(HARDER_TAGS) * 6 - hits(EASIER_TAGS) * 6;
  const hours = input.estimatedPlaytimeHours;
  if (hours > 0 && hours < 10) score -= 5;
  else if (hours > 50) score += 4;
  const bounded = Math.round(clamp(score, 25, 92));
  return { score: bounded, jlpt: targetJlpt(bounded) };
}

function interestScore(tags: readonly string[], preferredTags: readonly string[]): {
  score: number;
  matches: string[];
} {
  const lookup = new Map(preferredTags.map((tag) => [normalizedTag(tag), tag]));
  const matches = [...new Set(tags.map((tag) => lookup.get(normalizedTag(tag))).filter(Boolean))]
    .slice(0, 3) as string[];
  return { score: Math.min(20, matches.length * 7), matches };
}

function communityScore(rating: number | null, votes: number): number {
  if (rating == null) return 0;
  const confidence = clamp(Math.log10(Math.max(1, votes)) / 4, 0.2, 1);
  return clamp((rating - 5) * 4 * confidence, 0, 20);
}

export function rankVisualNovelEntries(
  entries: readonly VisualNovelEntry[],
  profiles: Readonly<Record<string, MediaLanguageProfile>>,
): {
  context: VisualNovelLearnerContext;
  recommendations: Array<VisualNovelRecommendation<VisualNovelEntry>>;
} {
  const context = buildVisualNovelLearnerContext(entries, profiles);
  const recommendations = entries
    .filter((entry) => entry.status !== 'completed' && entry.status !== 'dropped')
    .map((entry): VisualNovelRecommendation<VisualNovelEntry> => {
      const profile = profiles[`vn:${entry.id}`];
      const interests = interestScore([...entry.genres, ...entry.tags], context.preferredTags);
      const difficultyScore = profile?.difficulty.score ?? null;
      const knownCoverage = profile?.difficulty.knownRatio ?? null;
      const difficultyFit = difficultyScore == null
        ? 15
        : clamp(35 - Math.abs(difficultyScore - context.targetDifficultyScore) * 0.7, 0, 35);
      const coverageFit = knownCoverage == null
        ? 8
        : clamp(28 - Math.abs(knownCoverage - 0.83) * 90, 0, 28);
      const community = communityScore(entry.communityRating, entry.communityVoteCount);
      const statusBoost = entry.status === 'reading' ? 8 : entry.status === 'replaying' ? 4 : 6;
      const prior = difficultyScore == null && (entry.tags.length || entry.estimatedPlaytimeHours)
        ? estimateVisualNovelDifficultyPrior(entry)
        : null;
      const level = profile?.difficulty.jlptLevel ?? profile?.difficulty.band ?? prior?.jlpt ?? '';
      const reasonCodes: VisualNovelReasonCode[] = [
        ...(knownCoverage == null ? [] : [{ key: 'vnRecs.reason.known', vars: { percent: Math.round(knownCoverage * 100) } }]),
        ...(level ? [{ key: prior ? 'vnRecs.reason.estimated' : 'vnRecs.reason.level', vars: { level } }] : []),
        ...(interests.matches.length ? [{ key: 'vnRecs.reason.matches', vars: { tags: interests.matches.join(', ') } }] : []),
        ...(entry.communityRating == null ? [] : [{ key: 'vnRecs.reason.rating', vars: { rating: entry.communityRating } }]),
        ...(entry.status === 'reading' ? [{ key: 'vnRecs.reason.continue' }] : []),
      ];
      const reasons = [
        ...(knownCoverage == null ? [] : [
          `${Math.round(knownCoverage * 100)}% known vocabulary`,
        ]),
        ...(difficultyScore == null ? [] : [
          `${profile?.difficulty.jlptLevel ?? profile?.difficulty.band ?? 'profiled'} difficulty`,
        ]),
        ...(interests.matches.length ? [`Matches ${interests.matches.join(', ')}`] : []),
        ...(entry.communityRating == null ? [] : [
          `${entry.communityRating}/10 community rating`,
        ]),
        ...(entry.status === 'reading' ? ['Continue current reading'] : []),
      ];
      return {
        item: entry,
        score: Math.round(difficultyFit + coverageFit + interests.score + community + statusBoost),
        reasons: reasons.length ? reasons : ['Ready for language analysis'],
        reasonCodes: reasonCodes.length ? reasonCodes : [{ key: 'vnRecs.reason.analyze' }],
        difficultyScore: difficultyScore ?? prior?.score ?? null,
        knownCoverage,
        difficultySource: difficultyScore != null ? 'captured' : prior ? 'vndb' : null,
      };
    })
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, 8);
  return { context, recommendations };
}

export function rankVisualNovelSourceResults(
  results: readonly VisualNovelSourceResult[],
  context: VisualNovelLearnerContext,
): Array<VisualNovelRecommendation<VisualNovelSourceResult>> {
  return results.map((item): VisualNovelRecommendation<VisualNovelSourceResult> => {
    const interests = interestScore(item.tags, context.preferredTags);
    const community = communityScore(item.communityRating, item.communityVoteCount);
    const lengthFit = item.estimatedPlaytimeHours
      ? clamp(12 - Math.abs(item.estimatedPlaytimeHours - 30) / 5, 0, 12)
      : 5;
    // VNDB results used to ignore difficulty entirely. The prior is coarse, so it
    // is weighted to break ties between interesting titles, not to dominate them.
    const prior = estimateVisualNovelDifficultyPrior(item);
    const difficultyFit = clamp(24 - Math.abs(prior.score - context.targetDifficultyScore) * 0.6, 0, 24);
    // A title with no Japanese release cannot be read in Japanese.
    const japaneseAvailable = !item.languages?.length || item.languages.includes('ja');
    const reasons = [
      ...(interests.matches.length ? [`Matches ${interests.matches.join(', ')}`] : []),
      ...(item.communityRating == null ? [] : [`${item.communityRating}/10 community rating`]),
      ...(item.estimatedPlaytimeHours ? [`About ${Math.round(item.estimatedPlaytimeHours)} hours`] : []),
    ];
    const reasonCodes: VisualNovelReasonCode[] = [
      { key: 'vnRecs.reason.estimated', vars: { level: prior.jlpt } },
      ...(interests.matches.length ? [{ key: 'vnRecs.reason.matches', vars: { tags: interests.matches.join(', ') } }] : []),
      ...(item.communityRating == null ? [] : [{ key: 'vnRecs.reason.rating', vars: { rating: item.communityRating } }]),
      ...(item.estimatedPlaytimeHours ? [{ key: 'vnRecs.reason.hours', vars: { hours: Math.round(item.estimatedPlaytimeHours) } }] : []),
    ];
    return {
      item,
      score: Math.round((20 + interests.score + community + lengthFit + difficultyFit) * (japaneseAvailable ? 1 : 0.3)),
      reasons: reasons.length ? reasons : ['Candidate for metadata review'],
      reasonCodes,
      difficultyScore: prior.score,
      knownCoverage: null,
      difficultySource: 'vndb',
    };
  }).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
}

/**
 * The request for VNDB candidates: tags weighted toward what the learner
 * finished or is reading (`buildVisualNovelLearnerContext`), with every VNDB id
 * already in the library excluded.
 */
export function visualNovelCandidateRequest(
  entries: readonly VisualNovelEntry[],
  context: VisualNovelLearnerContext,
): VisualNovelCandidateRequest {
  return {
    tags: context.preferredTags.slice(0, 3),
    excludeProviderIds: entries.flatMap((entry) => (entry.sourceIds.vndb ? [entry.sourceIds.vndb] : [])),
  };
}
