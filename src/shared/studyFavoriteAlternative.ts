import {
  STUDY_ANALYZER_VERSION,
  type StudyOrchestratorDocument,
  type StudyReadinessCategory,
  type StudyReadinessSnapshot,
} from './mediaStudyOrchestrator';
import { isJapaneseSubtitleLang } from './subtitleRecord';
import type { StudyReadinessFingerprints } from './studyEpisodeReadiness';
import type { MediaItem } from './types';

export const STUDY_FAVORITE_ALTERNATIVE_MIN_COVERAGE = 0.7;
export const STUDY_FAVORITE_OVERWHELMING_MAX_COVERAGE = 0.55;
export const STUDY_FAVORITE_ALTERNATIVE_RESULT_LIMIT = 3;

export interface StudyFavoriteCoverage {
  mediaId: string;
  title: string;
  episode?: number;
  positionSec: number;
  subtitleRecordId: string;
  readinessId: string;
  generatedAt: number;
  knownCoverage: number;
  category: StudyReadinessCategory;
  studyQueue: boolean;
}

export interface StudyFavoriteAlternative {
  id: string;
  opportunityId: string;
  harder: StudyFavoriteCoverage;
  easier: StudyFavoriteCoverage;
  coverageDelta: number;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function displayTitle(item: Pick<MediaItem, 'title' | 'fileName'>): string {
  return item.title.trim() || item.fileName.trim() || 'Untitled media';
}

function currentFavoriteCoverage(
  item: MediaItem,
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): StudyFavoriteCoverage | undefined {
  if (!item.favorite) return undefined;
  const readiness = Object.values(document.readiness)
    .filter((snapshot) =>
      snapshot.mediaId === item.id
      && snapshot.sourceKind !== 'lookup-history')
    .sort((left, right) => right.generatedAt - left.generatedAt)
    .find((snapshot): snapshot is StudyReadinessSnapshot & { knownCoverage: number } => {
      if (
        snapshot.analyzerVersion !== STUDY_ANALYZER_VERSION
        || !snapshot.subtitleReady
        || !snapshot.subtitleRecordId
        || snapshot.knowledgeFingerprint !== fingerprints.knowledgeFingerprint
        || snapshot.levelListsFingerprint !== fingerprints.levelListsFingerprint
        || (snapshot.frequencyListsFingerprint ?? '') !== fingerprints.frequencyListsFingerprint
        || typeof snapshot.knownCoverage !== 'number'
        || !Number.isFinite(snapshot.knownCoverage)
        || snapshot.knownCoverage < 0
        || snapshot.knownCoverage > 1
      ) return false;
      const subtitle = item.subtitles?.find((record) =>
        record.id === snapshot.subtitleRecordId
        && isJapaneseSubtitleLang(record.lang));
      return Boolean(
        subtitle
        && snapshot.sourceFingerprint.startsWith(`${subtitle.id}:${subtitle.addedAt}:`),
      );
    });
  if (!readiness?.subtitleRecordId) return undefined;
  return {
    mediaId: item.id,
    title: displayTitle(item),
    ...(Number.isFinite(item.episode) ? { episode: item.episode } : {}),
    positionSec: Number.isFinite(item.positionSec) ? Math.max(0, item.positionSec ?? 0) : 0,
    subtitleRecordId: readiness.subtitleRecordId,
    readinessId: readiness.id,
    generatedAt: readiness.generatedAt,
    knownCoverage: readiness.knownCoverage,
    category: readiness.category,
    studyQueue: item.studyQueue === true,
  };
}

/**
 * Suggests an easier current favorite for each overwhelming current favorite.
 *
 * This projection reads only persisted readiness snapshots, current
 * fingerprints, and exact attached Japanese subtitle identity. A stale or
 * unanalyzed favorite is excluded instead of causing an analysis pass.
 */
export function studyFavoriteAlternatives(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): StudyFavoriteAlternative[] {
  const current = items.flatMap((item) => {
    const coverage = currentFavoriteCoverage(item, document, fingerprints);
    return coverage ? [coverage] : [];
  });
  const easier = current
    .filter((entry) =>
      entry.knownCoverage >= STUDY_FAVORITE_ALTERNATIVE_MIN_COVERAGE
      && (entry.category === 'short-preview' || entry.category === 'ready-now'))
    .sort((left, right) =>
      right.knownCoverage - left.knownCoverage
      || right.generatedAt - left.generatedAt
      || left.title.localeCompare(right.title, 'ja')
      || left.mediaId.localeCompare(right.mediaId));

  return current
    .filter((entry) =>
      entry.category === 'save-for-later'
      && entry.knownCoverage < STUDY_FAVORITE_OVERWHELMING_MAX_COVERAGE)
    .flatMap((harder) => {
      const alternative = easier.find((candidate) => candidate.mediaId !== harder.mediaId);
      if (!alternative) return [];
      const suffix = stableHash(harder.mediaId);
      return [{
        id: `study-favorite-alternative-${suffix}`,
        opportunityId: `study-opportunity-easier-favorite-alternative-${suffix}`,
        harder,
        easier: alternative,
        coverageDelta: alternative.knownCoverage - harder.knownCoverage,
      }];
    })
    .sort((left, right) =>
      Number(right.harder.studyQueue) - Number(left.harder.studyQueue)
      || right.coverageDelta - left.coverageDelta
      || left.harder.knownCoverage - right.harder.knownCoverage
      || left.harder.title.localeCompare(right.harder.title, 'ja')
      || left.harder.mediaId.localeCompare(right.harder.mediaId))
    .slice(0, STUDY_FAVORITE_ALTERNATIVE_RESULT_LIMIT);
}
