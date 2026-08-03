import { normalizeMediaTitleKey } from './mediaIdentity';
import {
  normalizedStudyDuplicateKey,
  STUDY_ANALYZER_VERSION,
  type StudyOpportunity,
  type StudyOrchestratorDocument,
  type StudyVocabularyCandidate,
  type StudyVocabularyWorkspace,
} from './mediaStudyOrchestrator';
import { isJapaneseSubtitleLang } from './subtitleRecord';
import type { StudyReadinessFingerprints } from './studyEpisodeReadiness';
import type { MediaItem } from './types';

export const STUDY_CROSS_TITLE_MIN_TITLES = 3;
export const STUDY_CROSS_TITLE_CONTEXT_LIMIT = 4;
export const STUDY_CROSS_TITLE_RESULT_LIMIT = 8;

export interface StudyCrossTitleContext {
  titleIdentity: string;
  title: string;
  mediaId: string;
  episode?: number;
  subtitleRecordId: string;
  cueStartSec: number;
  sentence: string;
  occurrences: number;
}

export interface StudyCrossTitleReinforcement {
  id: string;
  opportunityId: string;
  lemmaKey: string;
  word: string;
  reading: string;
  meaning?: string;
  jlptLevel: string | null;
  frequencyRank?: number;
  titleCount: number;
  totalOccurrences: number;
  contexts: StudyCrossTitleContext[];
}

interface CandidateContext extends StudyCrossTitleContext {
  candidate: StudyVocabularyCandidate;
  workspaceUpdatedAt: number;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Collapses episodes of one work onto a single identity, preferring the
 * strongest evidence available. Exported so other Study projections group by
 * exactly the same rule instead of re-deriving it and drifting.
 *
 * Returns '' for an episodic file with no series evidence: counting those as
 * separate works would inflate any per-title tally.
 */
export function studyCanonicalTitleIdentity(item: MediaItem): string {
  return titleIdentity(item);
}

function titleIdentity(item: MediaItem): string {
  const seriesKey = normalizeMediaTitleKey(item.seriesKey);
  if (seriesKey) return `series:${seriesKey}`;
  if (Number.isFinite(item.malId)) return `mal:${item.malId}`;
  if (Number.isFinite(item.anilistId)) return `anilist:${item.anilistId}`;
  const seriesTitle = normalizeMediaTitleKey(item.seriesTitle);
  if (seriesTitle) return `title:${seriesTitle}`;
  if (Number.isFinite(item.episode) && (item.episodeKind ?? 'episode') === 'episode') return '';
  const titleKey = normalizeMediaTitleKey(item.title);
  return titleKey ? `title:${titleKey}` : '';
}

function displayTitle(item: MediaItem): string {
  return item.seriesTitle?.trim() || item.title.trim() || item.fileName.trim();
}

function currentWorkspace(
  item: MediaItem,
  workspaces: readonly StudyVocabularyWorkspace[],
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): StudyVocabularyWorkspace | undefined {
  const workspace = workspaces
    .filter((workspace) =>
      workspace.context.sourceKind !== 'lookup-history'
      && workspace.context.mediaId === item.id)
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

function representative(
  left: CandidateContext,
  right: CandidateContext,
): CandidateContext {
  if (left.candidate.occurrences !== right.candidate.occurrences) {
    return left.candidate.occurrences > right.candidate.occurrences ? left : right;
  }
  if (left.workspaceUpdatedAt !== right.workspaceUpdatedAt) {
    return left.workspaceUpdatedAt > right.workspaceUpdatedAt ? left : right;
  }
  if (left.cueStartSec !== right.cueStartSec) {
    return left.cueStartSec < right.cueStartSec ? left : right;
  }
  return left.mediaId.localeCompare(right.mediaId) <= 0 ? left : right;
}

/**
 * Projects comparison sessions from already-prepared vocabulary workspaces.
 *
 * This deliberately reads no subtitle bytes and builds no durable occurrence
 * index. Only the user's selected candidates from current, exact-subtitle
 * workspaces participate. Multiple episodes under one canonical title collapse
 * to one comparison context so a series cannot satisfy the three-title gate by
 * itself.
 */
export function studyCrossTitleReinforcements(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): StudyCrossTitleReinforcement[] {
  const workspaces = Object.values(document.workspaces);
  const grouped = new Map<string, Map<string, CandidateContext & { occurrences: number }>>();

  for (const item of items) {
    const identity = titleIdentity(item);
    if (!identity) continue;
    const workspace = currentWorkspace(item, workspaces, document, fingerprints);
    if (!workspace) continue;
    const selected = new Set(workspace.selectionIds);
    const readiness = document.readiness[workspace.readinessId];
    if (!readiness?.subtitleRecordId) continue;

    for (const candidate of workspace.candidates) {
      if (
        !selected.has(candidate.id)
        || candidate.proper
        || !candidate.word.trim()
        || !candidate.sentence.trim()
        || !Number.isFinite(candidate.timestamp)
      ) continue;
      const lemmaKey = normalizedStudyDuplicateKey(candidate.word, candidate.reading);
      const context: CandidateContext = {
        titleIdentity: identity,
        title: displayTitle(item),
        mediaId: item.id,
        ...(Number.isFinite(item.episode) ? { episode: item.episode } : {}),
        subtitleRecordId: readiness.subtitleRecordId,
        cueStartSec: candidate.timestamp,
        sentence: candidate.sentence,
        occurrences: candidate.occurrences,
        candidate,
        workspaceUpdatedAt: workspace.updatedAt,
      };
      const byTitle = grouped.get(lemmaKey) ?? new Map();
      const existing = byTitle.get(identity);
      if (!existing) {
        byTitle.set(identity, context);
      } else {
        const best = representative(existing, context);
        byTitle.set(identity, {
          ...best,
          occurrences: existing.occurrences + context.occurrences,
        });
      }
      grouped.set(lemmaKey, byTitle);
    }
  }

  return [...grouped.entries()].flatMap(([lemmaKey, byTitle]) => {
    if (byTitle.size < STUDY_CROSS_TITLE_MIN_TITLES) return [];
    const allContexts = [...byTitle.values()].sort((left, right) =>
      right.occurrences - left.occurrences
      || left.title.localeCompare(right.title, 'ja')
      || left.cueStartSec - right.cueStartSec);
    const first = allContexts[0];
    if (!first) return [];
    const suffix = stableHash(lemmaKey);
    const frequencyRanks = allContexts.flatMap((context) =>
      typeof context.candidate.frequencyRank === 'number'
        ? [context.candidate.frequencyRank]
        : []);
    const meaning = allContexts
      .map((context) => context.candidate.meaning?.trim())
      .find(Boolean);
    const result: StudyCrossTitleReinforcement = {
      id: `study-cross-title-${suffix}`,
      opportunityId: `study-opportunity-cross-title-reinforcement-${suffix}`,
      lemmaKey,
      word: first.candidate.word,
      reading: first.candidate.reading,
      ...(meaning ? { meaning } : {}),
      jlptLevel: first.candidate.jlptLevel,
      ...(frequencyRanks.length ? { frequencyRank: Math.min(...frequencyRanks) } : {}),
      titleCount: byTitle.size,
      totalOccurrences: allContexts.reduce((sum, context) => sum + context.occurrences, 0),
      contexts: allContexts.slice(0, STUDY_CROSS_TITLE_CONTEXT_LIMIT).map((context) => ({
        titleIdentity: context.titleIdentity,
        title: context.title,
        mediaId: context.mediaId,
        ...(context.episode != null ? { episode: context.episode } : {}),
        subtitleRecordId: context.subtitleRecordId,
        cueStartSec: context.cueStartSec,
        sentence: context.sentence,
        occurrences: context.occurrences,
      })),
    };
    return [result];
  }).sort((left, right) =>
    right.titleCount - left.titleCount
    || (left.frequencyRank ?? Number.MAX_SAFE_INTEGER)
      - (right.frequencyRank ?? Number.MAX_SAFE_INTEGER)
    || right.totalOccurrences - left.totalOccurrences
    || left.word.localeCompare(right.word, 'ja'))
    .slice(0, STUDY_CROSS_TITLE_RESULT_LIMIT);
}

export function crossTitleReinforcementOpportunity(
  reinforcement: StudyCrossTitleReinforcement,
  now = Date.now(),
): StudyOpportunity {
  const context = reinforcement.contexts[0];
  return {
    id: reinforcement.opportunityId,
    type: 'cross-title-reinforcement',
    title: `Compare ${reinforcement.word} across ${reinforcement.titleCount} titles`,
    explanation: 'The same selected lemma appears in several prepared titles. Compare real lines before deciding whether it needs a card.',
    priority: 79,
    estimatedMinutes: Math.min(8, Math.max(3, reinforcement.titleCount)),
    context: {
      mediaId: context.mediaId,
      episode: context.episode,
      subtitleRecordId: context.subtitleRecordId,
      cueStartSec: context.cueStartSec,
      sentence: context.sentence,
      returnTarget: {
        section: 'video',
        mediaId: context.mediaId,
        subtitleRecordId: context.subtitleRecordId,
        positionSec: context.cueStartSec,
      },
    },
    evidence: [
      {
        code: 'cross-title-count',
        label: `${reinforcement.titleCount} distinct prepared titles`,
        value: reinforcement.titleCount,
      },
      {
        code: 'cross-title-occurrences',
        label: `${reinforcement.totalOccurrences} prepared occurrences`,
        value: reinforcement.totalOccurrences,
      },
      {
        code: 'cross-title-exact-context',
        label: `${reinforcement.contexts.length} exact subtitle contexts ready`,
        value: reinforcement.contexts.length,
      },
    ],
    actions: ['compare-contexts', 'open-context'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}
