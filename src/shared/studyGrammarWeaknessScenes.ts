import {
  STUDY_ANALYZER_VERSION,
  type StudyOrchestratorDocument,
  type StudyVocabularyWorkspace,
} from './mediaStudyOrchestrator';
import { grammarSurfaceCore } from './grammarPatternSurface';
import { isJapaneseSubtitleLang } from './subtitleRecord';
import type { StudyReadinessFingerprints } from './studyEpisodeReadiness';
import type { MediaItem } from './types';

export const STUDY_GRAMMAR_FAILURE_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
export const STUDY_GRAMMAR_FAILURE_SESSION_LIMIT = 10;
export const STUDY_GRAMMAR_MIN_FAILED_SESSIONS = 2;
/** One kanji can be safe inside an authored example, but not across arbitrary cues. */
export const STUDY_GRAMMAR_MIN_SURFACE_LENGTH = 2;
export const STUDY_GRAMMAR_CONTEXT_LIMIT = 4;
export const STUDY_GRAMMAR_RESULT_LIMIT = 5;

export interface StudyGrammarFailureSession {
  at: number;
  missed: readonly string[];
}

export interface StudyGrammarPointSignal {
  id: string;
  title: string;
  meaning: string;
  level: string;
  lang: 'ja' | 'zh' | 'ru';
}

export interface StudyGrammarWeaknessContext {
  mediaId: string;
  title: string;
  episode?: number;
  workspaceId: string;
  subtitleRecordId: string;
  cueStartSec: number;
  sentence: string;
}

export interface StudyGrammarWeaknessScene {
  id: string;
  opportunityId: string;
  pointId: string;
  pattern: string;
  meaning: string;
  level: string;
  core: string;
  failedSessions: number;
  latestFailureAt: number;
  contexts: StudyGrammarWeaknessContext[];
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
 * Connects repeated grammar misses to literal matches in current prepared cues.
 *
 * No subtitle bytes are read here and no occurrence index is persisted.
 * Candidate sentences are already exact cue-derived evidence in the prepared
 * workspace. Two separate completed sessions are required before Study calls a
 * point a weakness.
 */
export function studyGrammarWeaknessScenes(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
  sessions: readonly StudyGrammarFailureSession[],
  points: readonly StudyGrammarPointSignal[],
  now = Date.now(),
): StudyGrammarWeaknessScene[] {
  const recentSessions = sessions
    .filter((session) =>
      Number.isFinite(session.at)
      && session.at > 0
      && session.at <= now
      && now - session.at <= STUDY_GRAMMAR_FAILURE_WINDOW_MS)
    .sort((left, right) => right.at - left.at)
    .slice(0, STUDY_GRAMMAR_FAILURE_SESSION_LIMIT);
  const failures = new Map<string, { count: number; latestAt: number }>();
  for (const session of recentSessions) {
    for (const pointId of new Set(session.missed)) {
      const previous = failures.get(pointId);
      failures.set(pointId, {
        count: (previous?.count ?? 0) + 1,
        latestAt: Math.max(previous?.latestAt ?? 0, session.at),
      });
    }
  }

  const cues = items.flatMap((item) => {
    const workspace = currentWorkspace(item, document, fingerprints);
    if (!workspace) return [];
    const readiness = document.readiness[workspace.readinessId];
    if (!readiness?.subtitleRecordId) return [];
    const subtitleRecordId = readiness.subtitleRecordId;
    const seen = new Set<string>();
    return workspace.candidates.flatMap((candidate) => {
      const sentence = candidate.sentence.trim();
      if (!sentence || !Number.isFinite(candidate.timestamp) || candidate.timestamp < 0) return [];
      const key = `${candidate.timestamp}:${sentence}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        mediaId: item.id,
        title: displayTitle(item),
        ...(Number.isFinite(item.episode) ? { episode: item.episode } : {}),
        workspaceId: workspace.id,
        subtitleRecordId,
        cueStartSec: candidate.timestamp,
        sentence,
      }];
    });
  });

  return points.flatMap((point) => {
    const failure = failures.get(point.id);
    if (
      point.lang !== 'ja'
      || !failure
      || failure.count < STUDY_GRAMMAR_MIN_FAILED_SESSIONS
    ) return [];
    const core = grammarSurfaceCore(point.title);
    if (!core || core.length < STUDY_GRAMMAR_MIN_SURFACE_LENGTH) return [];
    const contexts = cues
      .filter((cue) => cue.sentence.includes(core))
      .sort((left, right) =>
        left.title.localeCompare(right.title, 'ja')
        || left.cueStartSec - right.cueStartSec)
      .slice(0, STUDY_GRAMMAR_CONTEXT_LIMIT);
    if (!contexts.length) return [];
    const suffix = stableHash(point.id);
    return [{
      id: `study-grammar-weakness-${suffix}`,
      opportunityId: `study-opportunity-grammar-weakness-${suffix}`,
      pointId: point.id,
      pattern: point.title,
      meaning: point.meaning,
      level: point.level,
      core,
      failedSessions: failure.count,
      latestFailureAt: failure.latestAt,
      contexts,
    }];
  }).sort((left, right) =>
    right.failedSessions - left.failedSessions
    || right.contexts.length - left.contexts.length
    || right.latestFailureAt - left.latestFailureAt
    || left.pattern.localeCompare(right.pattern, 'ja'))
    .slice(0, STUDY_GRAMMAR_RESULT_LIMIT);
}
