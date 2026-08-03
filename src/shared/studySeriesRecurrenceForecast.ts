import {
  normalizedStudyDuplicateKey,
  STUDY_ANALYZER_VERSION,
  type StudyOrchestratorDocument,
  type StudyVocabularyCandidate,
  type StudyVocabularyWorkspace,
} from './mediaStudyOrchestrator';
import { studyCanonicalTitleIdentity } from './studyCrossTitleReinforcement';
import { isJapaneseSubtitleLang } from './subtitleRecord';
import type { StudyReadinessFingerprints } from './studyEpisodeReadiness';
import type { MediaItem } from './types';

export const STUDY_SERIES_RECURRENCE_LEMMA_LIMIT = 8;
export const STUDY_SERIES_RECURRENCE_CONTEXT_LIMIT = 3;
export const STUDY_SERIES_RECURRENCE_RESULT_LIMIT = 3;

export interface StudySeriesRecurrenceContext {
  mediaId: string;
  title: string;
  season: number;
  episode: number;
  subtitleRecordId: string;
  cueStartSec: number;
  sentence: string;
  occurrences: number;
}

export interface StudySeriesRecurrenceLemma {
  lemmaKey: string;
  candidateId: string;
  word: string;
  reading: string;
  meaning?: string;
  jlptLevel: string | null;
  frequencyRank?: number;
  currentOccurrences: number;
  currentCueStartSec: number;
  currentSentence: string;
  futureEpisodeCount: number;
  futureOccurrences: number;
  contexts: StudySeriesRecurrenceContext[];
}

export interface StudySeriesRecurrenceForecast {
  id: string;
  opportunityId: string;
  seriesIdentity: string;
  seriesTitle: string;
  mediaId: string;
  season: number;
  episode: number;
  workspaceId: string;
  readinessId: string;
  subtitleRecordId: string;
  upcomingPreparedEpisodes: number;
  totalRecurringLemmas: number;
  totalFutureOccurrences: number;
  lemmas: StudySeriesRecurrenceLemma[];
}

interface PreparedEpisode {
  item: MediaItem;
  seriesIdentity: string;
  season: number;
  episode: number;
  workspace: StudyVocabularyWorkspace;
  subtitleRecordId: string;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function isNormalEpisode(item: MediaItem): item is MediaItem & { episode: number } {
  return (item.episodeKind ?? 'episode') === 'episode'
    && Number.isInteger(item.episode)
    && (item.episode ?? 0) > 0;
}

function episodeSeason(item: MediaItem): number {
  const season = item.season;
  return typeof season === 'number' && Number.isInteger(season) && season > 0 ? season : 1;
}

function episodePosition(left: PreparedEpisode, right: PreparedEpisode): number {
  return left.season - right.season || left.episode - right.episode;
}

function displaySeriesTitle(item: MediaItem): string {
  return item.seriesTitle?.trim() || item.title.trim() || item.fileName.trim();
}

function displayEpisodeTitle(item: MediaItem): string {
  const providerTitle = item.episodeTitles?.[String(item.episode)]?.trim();
  return providerTitle || item.title.trim() || item.fileName.trim();
}

function newestCurrentWorkspace(
  item: MediaItem,
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): StudyVocabularyWorkspace | undefined {
  const workspace = Object.values(document.workspaces)
    .filter((candidate) =>
      candidate.context.sourceKind !== 'lookup-history'
      && candidate.context.mediaId === item.id)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (!workspace) return undefined;
  const readiness = document.readiness[workspace.readinessId];
  if (
    !readiness
    || readiness.mediaId !== item.id
    || readiness.analyzerVersion !== STUDY_ANALYZER_VERSION
    || !readiness.subtitleReady
    || !readiness.subtitleRecordId
    || workspace.context.subtitleRecordId !== readiness.subtitleRecordId
    || readiness.knowledgeFingerprint !== fingerprints.knowledgeFingerprint
    || readiness.levelListsFingerprint !== fingerprints.levelListsFingerprint
    || (readiness.frequencyListsFingerprint ?? '') !== fingerprints.frequencyListsFingerprint
  ) return undefined;
  const subtitle = item.subtitles?.find((record) =>
    record.id === readiness.subtitleRecordId && isJapaneseSubtitleLang(record.lang));
  return subtitle
    && readiness.sourceFingerprint.startsWith(`${subtitle.id}:${subtitle.addedAt}:`)
    ? workspace
    : undefined;
}

function validCue(candidate: StudyVocabularyCandidate): boolean {
  return Boolean(candidate.word.trim())
    && Boolean(candidate.sentence.trim())
    && Number.isFinite(candidate.timestamp)
    && candidate.timestamp >= 0;
}

function strongerCandidate(
  left: StudyVocabularyCandidate | undefined,
  right: StudyVocabularyCandidate,
): StudyVocabularyCandidate {
  if (!left || right.occurrences > left.occurrences) return right;
  if (right.occurrences < left.occurrences) return left;
  if (right.timestamp < left.timestamp) return right;
  return left;
}

/**
 * Projects card-worthy lemmas in one prepared episode against later prepared
 * normal episodes of the same canonical series.
 *
 * The map built here is transient and bounded by existing workspace candidates.
 * It is not persisted, and no subtitle bytes are opened. The anchor side uses
 * the user's current selection; future workspaces provide recurrence evidence
 * even when their own card filters differ.
 */
export function studySeriesRecurrenceForecasts(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): StudySeriesRecurrenceForecast[] {
  const prepared = items.flatMap((item): PreparedEpisode[] => {
    if (!isNormalEpisode(item)) return [];
    const seriesIdentity = studyCanonicalTitleIdentity(item);
    if (!seriesIdentity) return [];
    const workspace = newestCurrentWorkspace(item, document, fingerprints);
    const readiness = workspace ? document.readiness[workspace.readinessId] : undefined;
    if (!workspace || !readiness?.subtitleRecordId) return [];
    return [{
      item,
      seriesIdentity,
      season: episodeSeason(item),
      episode: item.episode,
      workspace,
      subtitleRecordId: readiness.subtitleRecordId,
    }];
  });

  // Multiple encodes/releases of one episode are one episode identity. Prefer
  // the most recently prepared workspace rather than inflating future counts.
  const byEpisode = new Map<string, PreparedEpisode>();
  for (const episode of prepared) {
    const key = `${episode.seriesIdentity}\x1f${episode.season}\x1f${episode.episode}`;
    const previous = byEpisode.get(key);
    if (!previous || previous.workspace.updatedAt < episode.workspace.updatedAt) {
      byEpisode.set(key, episode);
    }
  }

  const bySeries = new Map<string, PreparedEpisode[]>();
  for (const episode of byEpisode.values()) {
    const episodes = bySeries.get(episode.seriesIdentity) ?? [];
    episodes.push(episode);
    bySeries.set(episode.seriesIdentity, episodes);
  }

  const forecasts: Array<{
    forecast: StudySeriesRecurrenceForecast;
    lastPlayedAt: number;
  }> = [];
  for (const [seriesIdentity, unordered] of bySeries) {
    const episodes = [...unordered].sort(episodePosition);
    for (let anchorIndex = 0; anchorIndex < episodes.length - 1; anchorIndex += 1) {
      const anchor = episodes[anchorIndex];
      if (!anchor) continue;
      const future = episodes.slice(anchorIndex + 1);
      const selected = new Set(anchor.workspace.selectionIds);
      const anchorByLemma = new Map<string, StudyVocabularyCandidate>();
      for (const candidate of anchor.workspace.candidates) {
        if (
          !selected.has(candidate.id)
          || candidate.proper
          || !validCue(candidate)
        ) continue;
        const lemmaKey = normalizedStudyDuplicateKey(candidate.word, candidate.reading);
        if (!lemmaKey) continue;
        anchorByLemma.set(
          lemmaKey,
          strongerCandidate(anchorByLemma.get(lemmaKey), candidate),
        );
      }
      if (!anchorByLemma.size) continue;

      const futureByLemma = new Map<string, StudySeriesRecurrenceContext[]>();
      for (const episode of future) {
        const bestInEpisode = new Map<string, StudyVocabularyCandidate>();
        for (const candidate of episode.workspace.candidates) {
          if (candidate.proper || !validCue(candidate)) continue;
          const lemmaKey = normalizedStudyDuplicateKey(candidate.word, candidate.reading);
          if (!anchorByLemma.has(lemmaKey)) continue;
          bestInEpisode.set(
            lemmaKey,
            strongerCandidate(bestInEpisode.get(lemmaKey), candidate),
          );
        }
        for (const [lemmaKey, candidate] of bestInEpisode) {
          const contexts = futureByLemma.get(lemmaKey) ?? [];
          contexts.push({
            mediaId: episode.item.id,
            title: displayEpisodeTitle(episode.item),
            season: episode.season,
            episode: episode.episode,
            subtitleRecordId: episode.subtitleRecordId,
            cueStartSec: candidate.timestamp,
            sentence: candidate.sentence.trim(),
            occurrences: candidate.occurrences,
          });
          futureByLemma.set(lemmaKey, contexts);
        }
      }

      const allLemmas = [...anchorByLemma.entries()].flatMap(([lemmaKey, candidate]) => {
        const contexts = futureByLemma.get(lemmaKey);
        if (!contexts?.length) return [];
        const meaning = candidate.meaning?.trim();
        const lemma: StudySeriesRecurrenceLemma = {
          lemmaKey,
          candidateId: candidate.id,
          word: candidate.word.trim(),
          reading: candidate.reading.trim(),
          ...(meaning ? { meaning } : {}),
          jlptLevel: candidate.jlptLevel,
          ...(candidate.frequencyRank != null
            ? { frequencyRank: candidate.frequencyRank }
            : {}),
          currentOccurrences: candidate.occurrences,
          currentCueStartSec: candidate.timestamp,
          currentSentence: candidate.sentence.trim(),
          futureEpisodeCount: contexts.length,
          futureOccurrences: contexts.reduce((sum, context) => sum + context.occurrences, 0),
          contexts: contexts.slice(0, STUDY_SERIES_RECURRENCE_CONTEXT_LIMIT),
        };
        return [lemma];
      }).sort((left, right) =>
        right.futureEpisodeCount - left.futureEpisodeCount
        || right.futureOccurrences - left.futureOccurrences
        || (left.frequencyRank ?? Number.MAX_SAFE_INTEGER)
          - (right.frequencyRank ?? Number.MAX_SAFE_INTEGER)
        || right.currentOccurrences - left.currentOccurrences
        || left.word.localeCompare(right.word, 'ja'));
      if (!allLemmas.length) continue;

      const suffix = stableHash(
        `${seriesIdentity}:${anchor.season}:${anchor.episode}:${anchor.item.id}`,
      );
      forecasts.push({
        forecast: {
          id: `study-series-recurrence-${suffix}`,
          opportunityId: `study-opportunity-series-recurrence-${suffix}`,
          seriesIdentity,
          seriesTitle: displaySeriesTitle(anchor.item),
          mediaId: anchor.item.id,
          season: anchor.season,
          episode: anchor.episode,
          workspaceId: anchor.workspace.id,
          readinessId: anchor.workspace.readinessId,
          subtitleRecordId: anchor.subtitleRecordId,
          upcomingPreparedEpisodes: future.length,
          totalRecurringLemmas: allLemmas.length,
          totalFutureOccurrences: allLemmas.reduce(
            (sum, lemma) => sum + lemma.futureOccurrences,
            0,
          ),
          lemmas: allLemmas.slice(0, STUDY_SERIES_RECURRENCE_LEMMA_LIMIT),
        },
        lastPlayedAt: anchor.item.lastPlayedAt ?? 0,
      });
    }
  }

  return forecasts.sort((left, right) =>
    right.lastPlayedAt - left.lastPlayedAt
    || right.forecast.totalRecurringLemmas - left.forecast.totalRecurringLemmas
    || right.forecast.upcomingPreparedEpisodes - left.forecast.upcomingPreparedEpisodes
    || left.forecast.seriesTitle.localeCompare(right.forecast.seriesTitle, 'ja')
    || left.forecast.season - right.forecast.season
    || left.forecast.episode - right.forecast.episode)
    .slice(0, STUDY_SERIES_RECURRENCE_RESULT_LIMIT)
    .map((entry) => entry.forecast);
}
