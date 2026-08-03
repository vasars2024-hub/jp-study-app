import type { MediaLanguageProfile } from './mediaStudyDatabase';
import type { VisualNovelEntry, VisualNovelSourceResult } from './visualNovel';

export interface VisualNovelLearnerContext {
  targetDifficultyScore: number;
  targetJlpt: 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
  knownCoverage: number | null;
  preferredTags: string[];
  analyzedTitles: number;
}

export interface VisualNovelRecommendation<T> {
  item: T;
  score: number;
  reasons: string[];
  difficultyScore: number | null;
  knownCoverage: number | null;
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
        difficultyScore,
        knownCoverage,
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
    const reasons = [
      ...(interests.matches.length ? [`Matches ${interests.matches.join(', ')}`] : []),
      ...(item.communityRating == null ? [] : [`${item.communityRating}/10 community rating`]),
      ...(item.estimatedPlaytimeHours ? [`About ${Math.round(item.estimatedPlaytimeHours)} hours`] : []),
    ];
    return {
      item,
      score: Math.round(20 + interests.score + community + lengthFit),
      reasons: reasons.length ? reasons : ['Candidate for metadata review'],
      difficultyScore: null,
      knownCoverage: null,
    };
  }).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
}
