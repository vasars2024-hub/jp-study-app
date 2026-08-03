import {
  STUDY_ANALYZER_VERSION,
  selectJapaneseStudySubtitle,
  type StudyOrchestratorDocument,
  type StudyReadinessSnapshot,
} from './mediaStudyOrchestrator';
import type { MediaItem } from './types';

export interface StudyReadinessFingerprints {
  knowledgeFingerprint: string;
  levelListsFingerprint: string;
  frequencyListsFingerprint: string;
}

export type StudyEpisodeReadinessState =
  | 'ready'
  | 'stale'
  | 'unanalyzed'
  | 'missing-subtitles';

export interface StudyEpisodeReadinessEntry {
  mediaId: string;
  title: string;
  episode: number;
  state: StudyEpisodeReadinessState;
  subtitleRecordId?: string;
  readiness?: StudyReadinessSnapshot;
}

function normalSeriesKey(item: MediaItem): string {
  return item.seriesKey?.trim().toLocaleLowerCase() ?? '';
}

function episodeTitle(item: MediaItem): string {
  const episode = item.episode;
  if (episode != null) {
    const providerTitle = item.episodeTitles?.[String(episode)]?.trim();
    if (providerTitle) return providerTitle;
  }
  return item.title;
}

/**
 * Builds the episode comparison rail entirely from existing persisted state.
 *
 * A score is shown only when every cheap cache-invalidation signal still
 * matches: analyzer version, exact attached Japanese subtitle record/version,
 * current knowledge/list/frequency fingerprints, and a workspace linked to the
 * same readiness snapshot. Reading subtitle bytes or opening an episode merely
 * to manufacture a comparison is deliberately outside this projection.
 */
export function studyEpisodeReadinessRail(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  anchorMediaId: string | undefined,
  fingerprints: StudyReadinessFingerprints,
): StudyEpisodeReadinessEntry[] {
  const anchor = items.find((item) => item.id === anchorMediaId);
  const seriesKey = anchor ? normalSeriesKey(anchor) : '';
  if (!anchor || !seriesKey || !Number.isFinite(anchor.episode)) return [];

  const workspacesByReadiness = new Map<string, string>();
  for (const workspace of Object.values(document.workspaces)) {
    workspacesByReadiness.set(workspace.readinessId, workspace.context.mediaId);
  }

  return items
    .filter((item) =>
      normalSeriesKey(item) === seriesKey
      && Number.isFinite(item.episode)
      && (item.episodeKind ?? 'episode') === 'episode')
    .map((item): StudyEpisodeReadinessEntry => {
      const subtitle = selectJapaneseStudySubtitle(item.subtitles);
      if (!subtitle) {
        return {
          mediaId: item.id,
          title: episodeTitle(item),
          episode: item.episode as number,
          state: 'missing-subtitles',
        };
      }

      const history = Object.values(document.readiness)
        .filter((snapshot) =>
          snapshot.mediaId === item.id
          && snapshot.sourceKind !== 'lookup-history')
        .sort((a, b) => b.generatedAt - a.generatedAt);
      const sourcePrefix = `${subtitle.id}:${subtitle.addedAt}:`;
      const current = history.find((snapshot) =>
        snapshot.analyzerVersion === STUDY_ANALYZER_VERSION
        && snapshot.subtitleReady
        && snapshot.subtitleRecordId === subtitle.id
        && snapshot.sourceFingerprint.startsWith(sourcePrefix)
        && snapshot.knowledgeFingerprint === fingerprints.knowledgeFingerprint
        && snapshot.levelListsFingerprint === fingerprints.levelListsFingerprint
        && (snapshot.frequencyListsFingerprint ?? '') === fingerprints.frequencyListsFingerprint
        && typeof snapshot.knownCoverage === 'number'
        && Number.isFinite(snapshot.knownCoverage)
        && workspacesByReadiness.get(snapshot.id) === item.id);

      if (current) {
        return {
          mediaId: item.id,
          title: episodeTitle(item),
          episode: item.episode as number,
          state: 'ready',
          subtitleRecordId: subtitle.id,
          readiness: current,
        };
      }

      return {
        mediaId: item.id,
        title: episodeTitle(item),
        episode: item.episode as number,
        state: history.length ? 'stale' : 'unanalyzed',
        subtitleRecordId: subtitle.id,
      };
    })
    .sort((a, b) => a.episode - b.episode || a.title.localeCompare(b.title));
}
