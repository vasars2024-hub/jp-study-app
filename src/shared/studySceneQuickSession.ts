import {
  STUDY_ANALYZER_VERSION,
  type StudyOpportunity,
  type StudyOrchestratorDocument,
  type StudyVocabularyCandidate,
  type StudyVocabularyWorkspace,
} from './mediaStudyOrchestrator';
import { isJapaneseSubtitleLang } from './subtitleRecord';
import type { StudyReadinessFingerprints } from './studyEpisodeReadiness';
import type { MediaItem } from './types';

export const STUDY_SCENE_SESSION_WINDOW_SEC = 3 * 60;
export const STUDY_SCENE_SESSION_MIN_SPAN_SEC = 30;
export const STUDY_SCENE_SESSION_MIN_WORDS = 5;
export const STUDY_SCENE_SESSION_MIN_RECURRING = 3;
export const STUDY_SCENE_SESSION_MIN_OCCURRENCES = 10;
export const STUDY_SCENE_SESSION_RESULT_LIMIT = 6;

export interface StudySceneQuickSession {
  id: string;
  opportunityId: string;
  mediaId: string;
  workspaceId: string;
  title: string;
  episode?: number;
  subtitleRecordId: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  candidateIds: string[];
  words: Array<{
    id: string;
    word: string;
    reading: string;
    sentence: string;
    timestamp: number;
    occurrences: number;
  }>;
  recurringWords: number;
  totalOccurrences: number;
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
  return item.title.trim() || item.fileName.trim() || 'this title';
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

function isHighValue(candidate: StudyVocabularyCandidate): boolean {
  return candidate.occurrences >= 2
    || (candidate.frequencyRank != null && candidate.frequencyRank <= 10_000)
    || /^N[1-5]$/i.test(candidate.jlptLevel ?? '');
}

function candidateScore(candidate: StudyVocabularyCandidate): number {
  const frequencyBonus = candidate.frequencyRank == null
    ? 0
    : Math.max(0, 10_001 - candidate.frequencyRank) / 10_000;
  return candidate.occurrences * 10 + frequencyBonus;
}

/**
 * Finds one short, vocabulary-dense scene per current prepared title.
 *
 * This is a projection over the existing selected candidates; it does not
 * rescan subtitles or persist a second scene index. Exact subtitle identity
 * and all analysis fingerprints must still match before a scene can qualify.
 */
export function studySceneQuickSessions(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): StudySceneQuickSession[] {
  const sessions = items.flatMap((item) => {
    const workspace = currentWorkspace(item, document, fingerprints);
    if (!workspace) return [];
    const readiness = document.readiness[workspace.readinessId];
    if (!readiness?.subtitleRecordId) return [];
    const selected = new Set(workspace.selectionIds);
    const candidates = workspace.candidates
      .filter((candidate) =>
        selected.has(candidate.id)
        && candidate.knowledgeLevel < 2
        && !candidate.proper
        && candidate.word.trim()
        && candidate.sentence.trim()
        && Number.isFinite(candidate.timestamp)
        && candidate.timestamp >= 0
        && isHighValue(candidate))
      .sort((left, right) =>
        left.timestamp - right.timestamp
        || candidateScore(right) - candidateScore(left)
        || left.id.localeCompare(right.id));

    let best: {
      candidates: StudyVocabularyCandidate[];
      recurringWords: number;
      totalOccurrences: number;
      spanSec: number;
      score: number;
    } | null = null;
    for (let startIndex = 0; startIndex < candidates.length; startIndex += 1) {
      const first = candidates[startIndex];
      if (!first) continue;
      const window = candidates.slice(startIndex).filter((candidate) =>
        candidate.timestamp <= first.timestamp + STUDY_SCENE_SESSION_WINDOW_SEC);
      if (window.length < STUDY_SCENE_SESSION_MIN_WORDS) continue;
      const last = window[window.length - 1];
      if (!last) continue;
      const spanSec = last.timestamp - first.timestamp;
      if (spanSec < STUDY_SCENE_SESSION_MIN_SPAN_SEC) continue;
      const recurringWords = window.filter((candidate) => candidate.occurrences >= 2).length;
      const totalOccurrences = window.reduce(
        (sum, candidate) => sum + Math.max(1, candidate.occurrences),
        0,
      );
      if (
        recurringWords < STUDY_SCENE_SESSION_MIN_RECURRING
        || totalOccurrences < STUDY_SCENE_SESSION_MIN_OCCURRENCES
      ) continue;
      const score = recurringWords * 100
        + totalOccurrences * 5
        + window.reduce((sum, candidate) => sum + candidateScore(candidate), 0)
        - spanSec / 60;
      if (
        !best
        || score > best.score
        || (score === best.score && spanSec < best.spanSec)
        || (score === best.score
          && spanSec === best.spanSec
          && first.timestamp < (best.candidates[0]?.timestamp ?? Number.MAX_SAFE_INTEGER))
      ) {
        best = { candidates: window, recurringWords, totalOccurrences, spanSec, score };
      }
    }
    if (!best) return [];

    const first = best.candidates[0];
    const last = best.candidates[best.candidates.length - 1];
    if (!first || !last) return [];
    const startSec = Math.max(0, Math.floor(first.timestamp - 5));
    const endSec = Math.ceil(last.timestamp + 8);
    const durationSec = endSec - startSec;
    const suffix = stableHash(`${workspace.id}:${startSec}:${endSec}`);
    const words = [...best.candidates]
      .sort((left, right) =>
        candidateScore(right) - candidateScore(left)
        || left.timestamp - right.timestamp)
      .slice(0, 8)
      .map((candidate) => ({
        id: candidate.id,
        word: candidate.word,
        reading: candidate.reading,
        sentence: candidate.sentence,
        timestamp: candidate.timestamp,
        occurrences: candidate.occurrences,
      }));
    return [{
      id: `study-scene-session-${suffix}`,
      opportunityId: `study-opportunity-scene-quick-session-${suffix}`,
      mediaId: item.id,
      workspaceId: workspace.id,
      title: displayTitle(item),
      ...(Number.isFinite(item.episode) ? { episode: item.episode } : {}),
      subtitleRecordId: readiness.subtitleRecordId,
      startSec,
      endSec,
      durationSec,
      candidateIds: best.candidates.map((candidate) => candidate.id),
      words,
      recurringWords: best.recurringWords,
      totalOccurrences: best.totalOccurrences,
    }];
  });

  return sessions.sort((left, right) =>
    right.recurringWords - left.recurringWords
    || right.totalOccurrences - left.totalOccurrences
    || left.durationSec - right.durationSec
    || left.title.localeCompare(right.title, 'ja'))
    .slice(0, STUDY_SCENE_SESSION_RESULT_LIMIT);
}

export function sceneQuickSessionOpportunity(
  session: StudySceneQuickSession,
  now = Date.now(),
): StudyOpportunity {
  const minutes = Math.max(1, Math.ceil(session.durationSec / 60));
  return {
    id: session.opportunityId,
    type: 'scene-quick-session',
    title: `Study a ${minutes}-minute scene from ${session.title}`,
    explanation: 'A short prepared scene concentrates several useful unknown words. Preview the range before starting an exact A–B session.',
    priority: 74,
    estimatedMinutes: minutes,
    context: {
      mediaId: session.mediaId,
      episode: session.episode,
      subtitleRecordId: session.subtitleRecordId,
      cueStartSec: session.startSec,
      cueEndSec: session.endSec,
      sentence: session.words[0]?.sentence,
      returnTarget: {
        section: 'video',
        mediaId: session.mediaId,
        subtitleRecordId: session.subtitleRecordId,
        positionSec: session.startSec,
      },
    },
    evidence: [
      {
        code: 'scene-quick-session-words',
        label: `${session.candidateIds.length} selected unknown words`,
        value: session.candidateIds.length,
      },
      {
        code: 'scene-quick-session-recurring',
        label: `${session.recurringWords} recur elsewhere in the title`,
        value: session.recurringWords,
      },
      {
        code: 'scene-quick-session-range',
        label: `${minutes}-minute exact subtitle range`,
        value: session.durationSec,
      },
    ],
    actions: ['preview-scene-session', 'open-context'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}
