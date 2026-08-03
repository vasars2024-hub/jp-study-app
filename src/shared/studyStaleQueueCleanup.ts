import {
  type StudyContextRef,
  type StudyOpportunity,
  type StudyOpportunityType,
  type StudyOrchestratorDocument,
  type StudyVocabularyWorkspace,
} from './mediaStudyOrchestrator';
import { isJapaneseSubtitleLang } from './subtitleRecord';
import type { MediaItem } from './types';

export const STUDY_STALE_QUEUE_MIN_ITEMS = 1;
export const STUDY_STALE_QUEUE_RESULT_LIMIT = 12;
export const STUDY_STALE_QUEUE_KNOWN_LEVEL = 2;

/**
 * Opportunity types whose only promise is unfinished vocabulary work.
 *
 * A resolved set retires these truthfully. Reminders about watching, hearing a
 * learned card in context, or repairing a source are deliberately excluded:
 * their value does not disappear when the words are mined.
 */
const DEBT_TYPES: ReadonlySet<StudyOpportunityType> = new Set([
  'continue-session',
  'repeated-lookups',
  'export-pending',
  'abandoned-set-resize',
]);

export type StudyStaleQueueReason =
  | 'media-removed'
  | 'subtitle-removed'
  | 'debt-resolved';

export interface StudyStaleQueueItem {
  opportunityId: string;
  type: StudyOpportunityType;
  title: string;
  status: 'active' | 'snoozed';
  reason: StudyStaleQueueReason;
  detail: string;
  mediaId: string;
  mediaTitle?: string;
  workspaceId?: string;
  exportedWords?: number;
  learnedWords?: number;
  updatedAt: number;
}

export interface StudyStaleQueueCleanup {
  id: string;
  opportunityId: string;
  anchorContext: StudyContextRef;
  items: StudyStaleQueueItem[];
  mediaRemoved: number;
  subtitleRemoved: number;
  debtResolved: number;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedWord(value: string): string {
  return value.normalize('NFKC').trim();
}

function displayTitle(item: Pick<MediaItem, 'title' | 'fileName'>): string {
  return item.title.trim() || item.fileName.trim() || 'this title';
}

function workspaceForOpportunity(
  opportunity: StudyOpportunity,
  document: StudyOrchestratorDocument,
): StudyVocabularyWorkspace | undefined {
  const workspaces = Object.values(document.workspaces);
  if (opportunity.readinessId) {
    const exact = workspaces.find((entry) => entry.readinessId === opportunity.readinessId);
    if (exact) return exact;
  }
  return workspaces
    .filter((entry) =>
      entry.context.mediaId === opportunity.context.mediaId
      && (entry.context.sourceKind ?? 'media') === (opportunity.context.sourceKind ?? 'media'))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

/**
 * Finds Study recommendations that existing authoritative state has already
 * invalidated.
 *
 * Only three truths retire an item: its media left the library, its exact
 * Japanese subtitle record is no longer attached, or every selected word in its
 * workspace has been exported or learned. A merely stale analysis is never a
 * reason — refreshing it is the truthful action, so fingerprints are
 * deliberately not consulted here.
 */
export function studyStaleQueueItems(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  knownWords: Readonly<Record<string, number>> = {},
): StudyStaleQueueItem[] {
  const library = new Map(items.map((item) => [item.id, item]));
  const learned = new Set(
    Object.entries(knownWords)
      .filter(([word, level]) => normalizedWord(word) && level >= STUDY_STALE_QUEUE_KNOWN_LEVEL)
      .map(([word]) => normalizedWord(word)),
  );

  return Object.values(document.opportunities).flatMap((opportunity): StudyStaleQueueItem[] => {
    if (opportunity.status === 'dismissed' || opportunity.status === 'completed') return [];
    // The cleanup recommendation never audits itself; that would churn its own id.
    if (opportunity.type === 'stale-queue-cleanup') return [];
    const status = opportunity.status === 'snoozed' ? 'snoozed' as const : 'active' as const;
    const base = {
      opportunityId: opportunity.id,
      type: opportunity.type,
      title: opportunity.title,
      status,
      mediaId: opportunity.context.mediaId,
      updatedAt: opportunity.updatedAt,
    };
    const isLibraryContext = (opportunity.context.sourceKind ?? 'media') === 'media';
    const item = library.get(opportunity.context.mediaId);

    // An empty library is an unloaded library, never proof that media was removed.
    if (isLibraryContext && !item) {
      return library.size === 0 ? [] : [{
        ...base,
        reason: 'media-removed',
        detail: 'Its media is no longer in the library.',
      }];
    }

    if (item && opportunity.context.subtitleRecordId && item.subtitles) {
      const record = item.subtitles.find(
        (candidate) => candidate.id === opportunity.context.subtitleRecordId,
      );
      if (!record || !isJapaneseSubtitleLang(record.lang)) {
        return [{
          ...base,
          reason: 'subtitle-removed',
          detail: 'Its exact Japanese subtitle record is no longer attached.',
          mediaTitle: displayTitle(item),
        }];
      }
    }

    if (!DEBT_TYPES.has(opportunity.type)) return [];
    const workspace = workspaceForOpportunity(opportunity, document);
    if (!workspace?.selectionIds.length) return [];
    const exported = new Set(
      workspace.exports
        .filter((entry) => entry.status === 'created' || entry.status === 'duplicate')
        .map((entry) => entry.candidateId),
    );
    const byId = new Map(workspace.candidates.map((candidate) => [candidate.id, candidate]));
    let exportedWords = 0;
    let learnedWords = 0;
    for (const candidateId of workspace.selectionIds) {
      const candidate = byId.get(candidateId);
      if (!candidate) return [];
      if (exported.has(candidateId)) {
        exportedWords += 1;
        continue;
      }
      if (
        learned.has(normalizedWord(candidate.word))
        || learned.has(normalizedWord(candidate.surface))
      ) {
        learnedWords += 1;
        continue;
      }
      return [];
    }

    return [{
      ...base,
      reason: 'debt-resolved',
      detail: `All ${workspace.selectionIds.length} selected words are already exported or known.`,
      mediaTitle: item ? displayTitle(item) : undefined,
      workspaceId: workspace.id,
      exportedWords,
      learnedWords,
    }];
  }).sort((left, right) =>
    left.reason.localeCompare(right.reason)
    || right.updatedAt - left.updatedAt
    || left.opportunityId.localeCompare(right.opportunityId))
    .slice(0, STUDY_STALE_QUEUE_RESULT_LIMIT);
}

export function studyStaleQueueCleanup(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  knownWords: Readonly<Record<string, number>> = {},
): StudyStaleQueueCleanup | null {
  const stale = studyStaleQueueItems(items, document, knownWords);
  if (stale.length < STUDY_STALE_QUEUE_MIN_ITEMS) return null;
  const anchor = stale.find((entry) => entry.mediaTitle) ?? stale[0];
  if (!anchor) return null;
  const suffix = stableHash(stale.map((entry) => `${entry.opportunityId}:${entry.reason}`).join('|'));
  return {
    id: `study-stale-queue-${suffix}`,
    opportunityId: `study-opportunity-stale-queue-cleanup-${suffix}`,
    anchorContext: {
      mediaId: anchor.mediaId,
      returnTarget: { section: 'study' },
    },
    items: stale,
    mediaRemoved: stale.filter((entry) => entry.reason === 'media-removed').length,
    subtitleRemoved: stale.filter((entry) => entry.reason === 'subtitle-removed').length,
    debtResolved: stale.filter((entry) => entry.reason === 'debt-resolved').length,
  };
}

export function staleQueueCleanupOpportunity(
  cleanup: StudyStaleQueueCleanup,
  now = Date.now(),
): StudyOpportunity {
  const count = cleanup.items.length;
  const evidence: StudyOpportunity['evidence'] = [{
    code: 'stale-queue-total',
    label: `${count} outdated ${count === 1 ? 'recommendation' : 'recommendations'}`,
    value: count,
  }];
  if (cleanup.debtResolved) {
    evidence.push({
      code: 'stale-queue-debt-resolved',
      label: `${cleanup.debtResolved} already exported or learned`,
      value: cleanup.debtResolved,
    });
  }
  if (cleanup.mediaRemoved) {
    evidence.push({
      code: 'stale-queue-media-removed',
      label: `${cleanup.mediaRemoved} lost their media source`,
      value: cleanup.mediaRemoved,
    });
  }
  if (cleanup.subtitleRemoved) {
    evidence.push({
      code: 'stale-queue-subtitle-removed',
      label: `${cleanup.subtitleRemoved} lost their Japanese subtitle record`,
      value: cleanup.subtitleRemoved,
    });
  }
  return {
    id: cleanup.opportunityId,
    type: 'stale-queue-cleanup',
    title: `Clear ${count} outdated Study ${count === 1 ? 'item' : 'items'}`,
    explanation: 'These recommendations no longer match your library or your finished work. Review each one before retiring it; nothing is deleted.',
    priority: 73,
    estimatedMinutes: 2,
    context: cleanup.anchorContext,
    evidence,
    actions: ['preview-queue-cleanup'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

/** True while every previewed item is still an untouched, retirable record. */
export function staleQueueItemsStillValid(
  cleanup: StudyStaleQueueCleanup,
  document: StudyOrchestratorDocument,
): boolean {
  return cleanup.items.every((entry) => {
    const opportunity = document.opportunities[entry.opportunityId];
    return Boolean(opportunity)
      && opportunity.status !== 'dismissed'
      && opportunity.status !== 'completed';
  });
}
