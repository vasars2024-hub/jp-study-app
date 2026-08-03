import {
  STUDY_ANALYZER_VERSION,
  normalizedStudyDuplicateKey,
  type StudyOrchestratorDocument,
  type StudyVocabularyWorkspace,
} from './mediaStudyOrchestrator';
import { isJapaneseSubtitleLang } from './subtitleRecord';
import type { StudyReadinessFingerprints } from './studyEpisodeReadiness';
import type { MediaItem } from './types';

/** A cluster is worth a review pass only once several names recur. */
export const STUDY_PROPER_NAME_MIN_NAMES = 3;
/** One or two appearances is a passing mention, not a name worth learning. */
export const STUDY_PROPER_NAME_MIN_OCCURRENCES = 3;
/** Names already at Familiar (2) or above need no review. */
export const STUDY_PROPER_NAME_MAX_KNOWLEDGE = 1;
export const STUDY_PROPER_NAME_LIMIT = 8;
export const STUDY_PROPER_NAME_RESULT_LIMIT = 3;

export interface StudyProperNameEntry {
  candidateId: string;
  word: string;
  reading: string;
  occurrences: number;
  sentence: string;
  cueStartSec: number;
  /** True while this name is inside the workspace's current card selection. */
  selected: boolean;
}

export interface StudyProperNameReview {
  id: string;
  opportunityId: string;
  mediaId: string;
  title: string;
  episode?: number;
  workspaceId: string;
  readinessId: string;
  subtitleRecordId: string;
  /** Bounded display set, highest recurrence first. */
  names: StudyProperNameEntry[];
  /** Distinct qualifying names before the display cap. */
  totalNames: number;
  /** Appearances across every qualifying name, not only the displayed ones. */
  totalOccurrences: number;
  /** Qualifying names currently selected as cards — the deck-pollution count. */
  selectedNames: number;
  /** The workspace's own proper-noun filter, reported rather than assumed. */
  excludeProperNouns: boolean;
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
 * Projects a temporary "who is who" review set from proper-noun candidates that
 * the current prepared workspace already produced.
 *
 * The only classification used is the analyzer's own 名詞,固有名詞 tag, which is
 * already stored on every candidate — no speaker identity is consulted, because
 * subtitle and candidate provenance carries none (rank 13's deferral reason).
 * Nothing here is persisted: the set exists for the panel that renders it, and
 * the single optional action goes through the existing reversible filter path.
 */
export function studyProperNameReviews(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): StudyProperNameReview[] {
  return items.flatMap((item) => {
    const workspace = currentWorkspace(item, document, fingerprints);
    if (!workspace) return [];
    const readiness = document.readiness[workspace.readinessId];
    if (!readiness?.subtitleRecordId) return [];
    const subtitleRecordId = readiness.subtitleRecordId;
    const selectionIds = new Set(workspace.selectionIds);

    // One entry per normalized name. `internalDuplicate` candidates are skipped
    // for the same reason the deck skips them, and the key collapses whatever
    // the analyzer still emitted twice.
    const byKey = new Map<string, StudyProperNameEntry>();
    for (const candidate of workspace.candidates) {
      if (!candidate.proper || candidate.internalDuplicate) continue;
      if (candidate.occurrences < STUDY_PROPER_NAME_MIN_OCCURRENCES) continue;
      if (candidate.knowledgeLevel > STUDY_PROPER_NAME_MAX_KNOWLEDGE) continue;
      const word = candidate.word.trim();
      const sentence = candidate.sentence.trim();
      if (!word || !sentence) continue;
      if (!Number.isFinite(candidate.timestamp) || candidate.timestamp < 0) continue;
      const reading = candidate.reading.trim();
      const key = normalizedStudyDuplicateKey(word, reading);
      const selected = selectionIds.has(candidate.id);
      const previous = byKey.get(key);
      if (previous) {
        // Keep the strongest evidence, but never lose the fact that some copy
        // of this name is already going into cards.
        if (selected) previous.selected = true;
        if (candidate.occurrences > previous.occurrences) {
          byKey.set(key, {
            ...previous,
            candidateId: candidate.id,
            occurrences: candidate.occurrences,
            sentence,
            cueStartSec: candidate.timestamp,
          });
        }
        continue;
      }
      byKey.set(key, {
        candidateId: candidate.id,
        word,
        reading,
        occurrences: candidate.occurrences,
        sentence,
        cueStartSec: candidate.timestamp,
        selected,
      });
    }

    const qualifying = [...byKey.values()].sort((left, right) =>
      right.occurrences - left.occurrences
      || left.cueStartSec - right.cueStartSec
      || left.word.localeCompare(right.word, 'ja'));
    if (qualifying.length < STUDY_PROPER_NAME_MIN_NAMES) return [];

    const suffix = stableHash(workspace.id);
    return [{
      id: `study-proper-names-${suffix}`,
      opportunityId: `study-opportunity-proper-names-${suffix}`,
      mediaId: item.id,
      title: displayTitle(item),
      ...(Number.isFinite(item.episode) ? { episode: item.episode } : {}),
      workspaceId: workspace.id,
      readinessId: workspace.readinessId,
      subtitleRecordId,
      names: qualifying.slice(0, STUDY_PROPER_NAME_LIMIT),
      totalNames: qualifying.length,
      totalOccurrences: qualifying.reduce((sum, entry) => sum + entry.occurrences, 0),
      selectedNames: qualifying.filter((entry) => entry.selected).length,
      excludeProperNouns: workspace.filters.excludeProperNouns,
    }];
  }).sort((left, right) =>
    right.selectedNames - left.selectedNames
    || right.totalNames - left.totalNames
    || right.totalOccurrences - left.totalOccurrences
    || left.title.localeCompare(right.title, 'ja'))
    .slice(0, STUDY_PROPER_NAME_RESULT_LIMIT);
}

/**
 * Katakana names read exactly like their surface, so the analyzer stores the
 * name twice and naive furigana renders ドロシー above ドロシー. Only a reading
 * that genuinely differs from the surface is worth showing.
 */
export function properNameFurigana(
  entry: Pick<StudyProperNameEntry, 'word' | 'reading'>,
): string {
  const reading = entry.reading.trim();
  return reading && reading !== entry.word.trim() ? reading : '';
}

/**
 * A cue that contains nothing but the name is not context — repeating the
 * headword underneath itself teaches the reader nothing. Returns the sentence
 * only when something survives removing the name from it.
 */
export function properNameContextLine(
  entry: Pick<StudyProperNameEntry, 'word' | 'sentence'>,
): string {
  const sentence = entry.sentence.trim();
  const word = entry.word.trim();
  if (!sentence || !word) return '';
  // U+3000 is the ideographic space Japanese cues use between clauses. It is
  // written escaped so the source carries no irregular whitespace.
  const remainder = sentence.replace(/[\s\u3000]+/g, '').split(word).join('');
  return remainder ? sentence : '';
}

/**
 * True while the review still describes the stored workspace. The exclude
 * action is refused otherwise, so a refreshed analysis can never be filtered
 * against a stale name list.
 */
export function properNameReviewStillCurrent(
  review: StudyProperNameReview,
  document: StudyOrchestratorDocument,
): boolean {
  const workspace = document.workspaces[review.workspaceId];
  if (!workspace) return false;
  if (workspace.filters.excludeProperNouns !== review.excludeProperNouns) return false;
  const selectionIds = new Set(workspace.selectionIds);
  const candidateIds = new Set(workspace.candidates.map((candidate) => candidate.id));
  return review.names.every((entry) =>
    candidateIds.has(entry.candidateId)
    && selectionIds.has(entry.candidateId) === entry.selected);
}
