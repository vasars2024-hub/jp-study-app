import {
  STUDY_ANALYZER_VERSION,
  type StudyOrchestratorDocument,
  type StudyReadinessSnapshot,
} from './mediaStudyOrchestrator';
import type { StudyReadinessFingerprints } from './studyEpisodeReadiness';
import { isJapaneseSubtitleLang } from './subtitleRecord';
import type { MediaItem } from './types';

export const STUDY_LISTENING_FIRST_MIN_COVERAGE = 0.85;

export type StudyListeningAudioEvidence =
  | 'browser-audio-track'
  | 'captured-audio-track'
  | 'decoded-audio-bytes';

export interface StudyListeningAvailability {
  mediaId: string;
  usable: boolean;
  readyState: number;
  audioTrackCount: number;
  evidence?: StudyListeningAudioEvidence;
}

export interface StudyListeningCapabilitySnapshot {
  mediaId: string;
  readyState: number;
  browserAudioTrackCount?: number;
  capturedAudioTrackCount?: number;
  decodedAudioBytes?: number;
}

export interface StudyListeningFirstRecipe {
  id: string;
  opportunityId: string;
  mediaId: string;
  title: string;
  episode?: number;
  subtitleRecordId: string;
  readinessId: string;
  workspaceId: string;
  positionSec: number;
  knownCoverage: number;
  audioEvidence: StudyListeningAudioEvidence;
  audioTrackCount: number;
}

/**
 * Turns live media-element capability evidence into the small transient signal
 * Study needs. A real exposed/captured track or Chromium's positive decoded
 * audio byte counter is a truthful capability claim; container type, file
 * extension, and video dimensions are deliberately not treated as proof that
 * audio exists.
 */
export function studyListeningAvailability(
  snapshot: StudyListeningCapabilitySnapshot,
): StudyListeningAvailability {
  const readyState = Number.isFinite(snapshot.readyState)
    ? Math.max(0, Math.floor(snapshot.readyState))
    : 0;
  const browserAudioTrackCount = Number.isFinite(snapshot.browserAudioTrackCount)
    ? Math.max(0, Math.floor(snapshot.browserAudioTrackCount ?? 0))
    : 0;
  const capturedAudioTrackCount = Number.isFinite(snapshot.capturedAudioTrackCount)
    ? Math.max(0, Math.floor(snapshot.capturedAudioTrackCount ?? 0))
    : 0;
  const decodedAudioBytes = Number.isFinite(snapshot.decodedAudioBytes)
    ? Math.max(0, Math.floor(snapshot.decodedAudioBytes ?? 0))
    : 0;
  const decoded = readyState >= 2;
  if (decoded && browserAudioTrackCount > 0) {
    return {
      mediaId: snapshot.mediaId,
      usable: true,
      readyState,
      audioTrackCount: browserAudioTrackCount,
      evidence: 'browser-audio-track',
    };
  }
  if (decoded && capturedAudioTrackCount > 0) {
    return {
      mediaId: snapshot.mediaId,
      usable: true,
      readyState,
      audioTrackCount: capturedAudioTrackCount,
      evidence: 'captured-audio-track',
    };
  }
  if (decoded && decodedAudioBytes > 0) {
    return {
      mediaId: snapshot.mediaId,
      usable: true,
      readyState,
      audioTrackCount: 1,
      evidence: 'decoded-audio-bytes',
    };
  }
  return {
    mediaId: snapshot.mediaId,
    usable: false,
    readyState,
    audioTrackCount: Math.max(browserAudioTrackCount, capturedAudioTrackCount),
  };
}

function displayTitle(item: Pick<MediaItem, 'title' | 'fileName'>): string {
  return item.title.trim() || item.fileName.trim() || 'Untitled media';
}

function currentReadiness(
  item: MediaItem,
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): { readiness: StudyReadinessSnapshot; workspaceId: string } | undefined {
  const workspacesByReadiness = new Map(
    Object.values(document.workspaces)
      .filter((workspace) =>
        workspace.context.mediaId === item.id
        && Boolean(workspace.context.subtitleRecordId))
      .map((workspace) => [workspace.readinessId, workspace]),
  );
  return Object.values(document.readiness)
    .filter((snapshot) =>
      snapshot.mediaId === item.id
      && snapshot.sourceKind !== 'lookup-history')
    .sort((left, right) => right.generatedAt - left.generatedAt)
    .flatMap((snapshot) => {
      if (
        snapshot.analyzerVersion !== STUDY_ANALYZER_VERSION
        || !snapshot.subtitleReady
        || !snapshot.subtitleRecordId
        || snapshot.truncated
        || snapshot.category !== 'ready-now'
        || snapshot.knowledgeFingerprint !== fingerprints.knowledgeFingerprint
        || snapshot.levelListsFingerprint !== fingerprints.levelListsFingerprint
        || (snapshot.frequencyListsFingerprint ?? '') !== fingerprints.frequencyListsFingerprint
        || typeof snapshot.knownCoverage !== 'number'
        || !Number.isFinite(snapshot.knownCoverage)
        || snapshot.knownCoverage < STUDY_LISTENING_FIRST_MIN_COVERAGE
        || snapshot.knownCoverage > 1
        || snapshot.totalWordOccurrences <= 0
      ) return [];
      const subtitle = item.subtitles?.find((record) =>
        record.id === snapshot.subtitleRecordId
        && isJapaneseSubtitleLang(record.lang));
      if (
        !subtitle
        || !snapshot.sourceFingerprint.startsWith(`${subtitle.id}:${subtitle.addedAt}:`)
      ) return [];
      const workspace = workspacesByReadiness.get(snapshot.id);
      if (
        !workspace
        || workspace.context.subtitleRecordId !== subtitle.id
      ) return [];
      return [{ readiness: snapshot, workspaceId: workspace.id }];
    })[0];
}

/**
 * Offers listening-first practice only for the exact item whose mounted player
 * has already proven usable audio. Readiness and subtitle bytes remain cached;
 * this projection never opens media, runs analysis, or probes unopened files.
 */
export function studyListeningFirstRecipe(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
  availability: StudyListeningAvailability | null | undefined,
): StudyListeningFirstRecipe | null {
  if (!availability?.usable || !availability.evidence) return null;
  const item = items.find((candidate) => candidate.id === availability.mediaId);
  if (!item) return null;
  const current = currentReadiness(item, document, fingerprints);
  if (!current?.readiness.subtitleRecordId) return null;
  const positionSec = typeof item.positionSec === 'number' && Number.isFinite(item.positionSec)
    ? Math.max(0, item.positionSec)
    : 0;
  return {
    id: `study-listening-first-${item.id}`,
    opportunityId: `study-opportunity-listening-first-${item.id}`,
    mediaId: item.id,
    title: displayTitle(item),
    ...(Number.isFinite(item.episode) ? { episode: item.episode } : {}),
    subtitleRecordId: current.readiness.subtitleRecordId,
    readinessId: current.readiness.id,
    workspaceId: current.workspaceId,
    positionSec,
    knownCoverage: current.readiness.knownCoverage as number,
    audioEvidence: availability.evidence,
    audioTrackCount: availability.audioTrackCount,
  };
}
