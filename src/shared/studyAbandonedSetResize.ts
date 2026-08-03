import type { MediaStudySession } from './mediaStudyDatabase';
import type {
  StudyOpportunity,
  StudyOrchestratorDocument,
  StudyVocabularyWorkspace,
} from './mediaStudyOrchestrator';
import type { MediaItem } from './types';

export const STUDY_ABANDONED_SET_MIN_SIZE = 20;
export const STUDY_ABANDONED_SET_MIN_SESSIONS = 2;
export const STUDY_ABANDONED_SET_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const STUDY_ABANDONED_SET_MIN_DURATION_SEC = 30;
export const STUDY_ABANDONED_SET_MAX_DURATION_SEC = 12 * 60;

export interface StudyAbandonedSetResize {
  id: string;
  opportunityId: string;
  mediaId: string;
  workspaceId: string;
  currentSize: number;
  proposedSize: number;
  abandonedSessions: number;
  analyzedCandidateFloor: number;
  latestAbandonedAt: number;
  retainedCandidateIds: string[];
  deferredCandidateIds: string[];
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function isVocabularySession(session: MediaStudySession): boolean {
  return session.actions.some((event) =>
    event.action === 'mine-vocabulary' || event.action === 'create-flashcards');
}

function proposedSetSize(currentSize: number): number {
  return Math.max(10, Math.min(20, Math.ceil(currentSize * 0.6)));
}

/**
 * Finds a bounded, reversible set-size suggestion from the existing media
 * study history. It records no new behavior and never applies the suggestion.
 *
 * A session counts only when it deliberately entered a vocabulary action,
 * lasted 30 seconds to 12 minutes, surfaced at least the current selected set,
 * ended after this workspace was prepared, and produced neither reviewed
 * sentences nor cards. Two such sessions in 30 days are required.
 */
export function studyAbandonedSetResizes(
  document: StudyOrchestratorDocument,
  sessions: readonly MediaStudySession[],
  now = Date.now(),
): StudyAbandonedSetResize[] {
  const latestWorkspaceByMedia = new Map<string, StudyVocabularyWorkspace>();
  for (const workspace of Object.values(document.workspaces)) {
    if (workspace.context.sourceKind === 'lookup-history') continue;
    const previous = latestWorkspaceByMedia.get(workspace.context.mediaId);
    if (!previous || previous.updatedAt < workspace.updatedAt) {
      latestWorkspaceByMedia.set(workspace.context.mediaId, workspace);
    }
  }

  return [...latestWorkspaceByMedia.values()].flatMap((workspace) => {
    const currentSize = workspace.selectionIds.length;
    if (currentSize <= STUDY_ABANDONED_SET_MIN_SIZE) return [];
    const abandoned = sessions.filter((session) => {
      const endedAt = session.endedAt;
      return session.mediaId === workspace.context.mediaId
        && endedAt != null
        && endedAt >= workspace.createdAt
        && endedAt <= now
        && now - endedAt <= STUDY_ABANDONED_SET_WINDOW_MS
        && session.durationSec >= STUDY_ABANDONED_SET_MIN_DURATION_SEC
        && session.durationSec <= STUDY_ABANDONED_SET_MAX_DURATION_SEC
        && session.vocabularyMined >= currentSize
        && session.sentencesReviewed === 0
        && session.cardsCreated === 0
        && isVocabularySession(session);
    }).sort((left, right) => (right.endedAt ?? 0) - (left.endedAt ?? 0));
    if (abandoned.length < STUDY_ABANDONED_SET_MIN_SESSIONS) return [];

    const proposedSize = proposedSetSize(currentSize);
    const suffix = stableHash(workspace.id);
    return [{
      id: `study-set-resize-${suffix}`,
      opportunityId: `study-opportunity-abandoned-set-resize-${suffix}`,
      mediaId: workspace.context.mediaId,
      workspaceId: workspace.id,
      currentSize,
      proposedSize,
      abandonedSessions: abandoned.length,
      analyzedCandidateFloor: Math.min(...abandoned.map((session) => session.vocabularyMined)),
      latestAbandonedAt: abandoned[0]?.endedAt ?? 0,
      retainedCandidateIds: workspace.selectionIds.slice(0, proposedSize),
      deferredCandidateIds: workspace.selectionIds.slice(proposedSize),
    }];
  }).sort((left, right) =>
    right.abandonedSessions - left.abandonedSessions
    || right.currentSize - left.currentSize
    || right.latestAbandonedAt - left.latestAbandonedAt
    || left.workspaceId.localeCompare(right.workspaceId));
}

export function abandonedSetResizeOpportunity(
  resize: StudyAbandonedSetResize,
  item: Pick<MediaItem, 'title' | 'fileName' | 'episode'>,
  workspace: StudyVocabularyWorkspace,
  now = Date.now(),
): StudyOpportunity {
  const title = item.title.trim() || item.fileName.trim() || 'this title';
  return {
    id: resize.opportunityId,
    type: 'abandoned-set-resize',
    title: `Try ${resize.proposedSize} words for ${title}`,
    explanation: 'Recent vocabulary sessions ended before review or card creation. A smaller next set may be easier to finish.',
    priority: 78,
    estimatedMinutes: Math.max(5, Math.ceil(resize.proposedSize / 3)),
    context: {
      ...workspace.context,
      episode: item.episode ?? workspace.context.episode,
    },
    readinessId: workspace.readinessId,
    evidence: [
      {
        code: 'set-resize-ended-sessions',
        label: `${resize.abandonedSessions} recent vocabulary sessions ended early`,
        value: resize.abandonedSessions,
      },
      {
        code: 'set-resize-current-size',
        label: `${resize.currentSize} words in the current prepared set`,
        value: resize.currentSize,
      },
      {
        code: 'set-resize-proposal',
        label: `${resize.proposedSize} kept for the next session; ${resize.currentSize - resize.proposedSize} deferred`,
        value: resize.proposedSize,
      },
    ],
    actions: ['preview-resize', 'inspect-vocabulary'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}
