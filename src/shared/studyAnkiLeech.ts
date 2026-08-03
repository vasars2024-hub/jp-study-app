import {
  mergeIntervalEntries,
  type IntervalEntry,
} from './anki';
import {
  STUDY_ANALYZER_VERSION,
  normalizedStudyDuplicateKey,
  type StudyOrchestratorDocument,
  type StudyVocabularyWorkspace,
} from './mediaStudyOrchestrator';
import { isJapaneseSubtitleLang } from './subtitleRecord';
import type { StudyReadinessFingerprints } from './studyEpisodeReadiness';
import type { MediaItem } from './types';

export const STUDY_ANKI_LEECH_CONTEXT_LIMIT = 6;
export const STUDY_ANKI_LEECH_RESULT_LIMIT = 3;

export interface StudyAnkiLeechContext {
  candidateId: string;
  expression: string;
  word: string;
  reading: string;
  sentence: string;
  cueStartSec: number;
  occurrences: number;
  intervalDays: number;
  leech: boolean;
  suspended: boolean;
}

export interface StudyAnkiLeechReview {
  id: string;
  opportunityId: string;
  mediaId: string;
  title: string;
  episode?: number;
  workspaceId: string;
  readinessId: string;
  subtitleRecordId: string;
  /** One exact prepared cue per affected expression, capped for the panel. */
  contexts: StudyAnkiLeechContext[];
  /** Distinct affected expressions before the display cap. */
  totalMatches: number;
  /** Distinct matched expressions carried by at least one leech-tagged note. */
  leechCount: number;
  /** Distinct matched expressions carried by at least one suspended card. */
  suspendedCount: number;
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
  return item.title.trim() || item.fileName.trim();
}

/**
 * Build one lookup over the bounded interval snapshot. Current card state is
 * used directly; there is no recency clock because leech/suspension are states,
 * not review events.
 */
export function indexAnkiLeechEntries(
  entries: readonly IntervalEntry[],
): ReadonlyMap<string, IntervalEntry> {
  const flagged = new Map<string, IntervalEntry>();
  for (const entry of entries) {
    if (entry.leech !== true && entry.suspended !== true) continue;
    const expression = entry.expression.normalize('NFKC').trim();
    if (!expression) continue;
    flagged.set(expression, mergeIntervalEntries(flagged.get(expression), {
      ...entry,
      expression,
    }));
  }
  return flagged;
}

function currentWorkspace(
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

/**
 * Match Anki-owned leech/suspension state to candidates already stored by the
 * newest exact-subtitle Study preparation. No subtitle is opened or scanned.
 */
export function studyAnkiLeechReviews(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
  flaggedByExpression: ReadonlyMap<string, IntervalEntry>,
): StudyAnkiLeechReview[] {
  if (!flaggedByExpression.size) return [];
  return items.flatMap((item) => {
    const workspace = currentWorkspace(item, document, fingerprints);
    if (!workspace) return [];
    const readiness = document.readiness[workspace.readinessId];
    if (!readiness?.subtitleRecordId) return [];

    const byExpression = new Map<string, StudyAnkiLeechContext>();
    for (const candidate of workspace.candidates) {
      if (candidate.internalDuplicate) continue;
      const word = candidate.word.normalize('NFKC').trim();
      const surface = candidate.surface.normalize('NFKC').trim();
      const entry = flaggedByExpression.get(word) ?? flaggedByExpression.get(surface);
      if (!entry) continue;
      const sentence = candidate.sentence.trim();
      if (!sentence || !Number.isFinite(candidate.timestamp) || candidate.timestamp < 0) continue;
      const expression = entry.expression.normalize('NFKC').trim();
      const context: StudyAnkiLeechContext = {
        candidateId: candidate.id,
        expression,
        word: candidate.word.trim(),
        reading: candidate.reading.trim(),
        sentence,
        cueStartSec: candidate.timestamp,
        occurrences: candidate.occurrences,
        intervalDays: entry.ivlDays,
        leech: entry.leech === true,
        suspended: entry.suspended === true,
      };
      const previous = byExpression.get(expression);
      if (
        !previous
        || previous.occurrences < context.occurrences
        || (
          previous.occurrences === context.occurrences
          && previous.cueStartSec > context.cueStartSec
        )
      ) {
        byExpression.set(expression, context);
      }
    }

    const matches = [...byExpression.values()].sort((left, right) =>
      Number(right.suspended) - Number(left.suspended)
      || Number(right.leech) - Number(left.leech)
      || right.occurrences - left.occurrences
      || left.cueStartSec - right.cueStartSec
      || normalizedStudyDuplicateKey(left.word, left.reading)
        .localeCompare(normalizedStudyDuplicateKey(right.word, right.reading), 'ja'));
    if (!matches.length) return [];
    const signature = matches.map((match) => match.expression).sort().join('\x1f');
    const suffix = stableHash(`${workspace.id}:${signature}`);
    return [{
      id: `study-anki-leech-${suffix}`,
      opportunityId: `study-opportunity-anki-leech-${suffix}`,
      mediaId: item.id,
      title: displayTitle(item),
      ...(Number.isFinite(item.episode) ? { episode: item.episode } : {}),
      workspaceId: workspace.id,
      readinessId: workspace.readinessId,
      subtitleRecordId: readiness.subtitleRecordId,
      contexts: matches.slice(0, STUDY_ANKI_LEECH_CONTEXT_LIMIT),
      totalMatches: matches.length,
      leechCount: matches.filter((match) => match.leech).length,
      suspendedCount: matches.filter((match) => match.suspended).length,
    }];
  }).sort((left, right) =>
    right.suspendedCount - left.suspendedCount
    || right.leechCount - left.leechCount
    || right.totalMatches - left.totalMatches
    || left.title.localeCompare(right.title, 'ja'))
    .slice(0, STUDY_ANKI_LEECH_RESULT_LIMIT);
}
