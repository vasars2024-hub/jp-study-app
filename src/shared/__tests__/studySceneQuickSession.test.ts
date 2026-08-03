import { describe, expect, it } from 'vitest';
import {
  sceneQuickSessionOpportunity,
  studySceneQuickSessions,
} from '../studySceneQuickSession';
import {
  createEmptyStudyOrchestratorDocument,
  type StudyReadinessSnapshot,
  type StudyVocabularyCandidate,
  type StudyVocabularyWorkspace,
} from '../mediaStudyOrchestrator';
import type { StudyReadinessFingerprints } from '../studyEpisodeReadiness';
import type { MediaItem } from '../types';

const fingerprints: StudyReadinessFingerprints = {
  knowledgeFingerprint: 'knowledge',
  levelListsFingerprint: 'levels',
  frequencyListsFingerprint: 'frequency',
};

function candidate(
  id: string,
  timestamp: number,
  occurrences = 2,
): StudyVocabularyCandidate {
  return {
    id,
    word: `語${id}`,
    surface: `語${id}`,
    reading: `ご${id}`,
    sentence: `これは語${id}の文です。`,
    occurrences,
    timestamp,
    jlptLevel: 'N3',
    knowledgeLevel: 0,
    proper: false,
    internalDuplicate: false,
    ankiDuplicate: false,
  };
}

function fixture() {
  const item = {
    id: 'media-1',
    title: 'Prepared Show',
    fileName: 'prepared-show.mkv',
    episode: 4,
    subtitles: [{
      id: 'subtitle-1',
      lang: 'ja',
      source: 'local',
      addedAt: 100,
    }],
  } as unknown as MediaItem;
  const readiness: StudyReadinessSnapshot = {
    id: 'readiness-1',
    mediaId: item.id,
    analyzerVersion: 2,
    generatedAt: 200,
    sourceFingerprint: 'subtitle-1:100:6:40:165',
    knowledgeFingerprint: fingerprints.knowledgeFingerprint,
    levelListsFingerprint: fingerprints.levelListsFingerprint,
    frequencyListsFingerprint: fingerprints.frequencyListsFingerprint,
    subtitleRecordId: 'subtitle-1',
    subtitleSource: 'local',
    subtitleReady: true,
    contentLevel: 'N3',
    confidence: 0.9,
    knownCoverage: 0.8,
    uniqueKnownCoverage: 0.7,
    totalWordOccurrences: 100,
    knownWordOccurrences: 80,
    unknownUniqueWords: 20,
    recurringUnknownWords: 8,
    category: 'short-preview',
    truncated: false,
  };
  const candidates = [
    candidate('a', 40, 3),
    candidate('b', 68, 2),
    candidate('c', 94, 2),
    candidate('d', 121, 1),
    candidate('e', 150, 2),
    candidate('outside', 400, 9),
  ];
  const workspace: StudyVocabularyWorkspace = {
    id: 'workspace-1',
    context: {
      mediaId: item.id,
      episode: item.episode,
      subtitleRecordId: 'subtitle-1',
      returnTarget: { section: 'video', mediaId: item.id, positionSec: 0 },
    },
    readinessId: readiness.id,
    createdAt: 200,
    updatedAt: 300,
    candidates,
    filters: {
      excludedJlptLevels: [],
      minimumOccurrences: 1,
      excludeKnowledgeAtOrAbove: 2,
      excludeInternalDuplicates: true,
      excludeAnkiDuplicates: true,
      excludeAnkiMatureAtDays: null,
      excludeProperNouns: true,
      maximumCards: 30,
      rankingMode: 'frequency-all',
    },
    selectionIds: candidates.map((entry) => entry.id),
    history: [],
    exports: [],
  };
  const document = createEmptyStudyOrchestratorDocument();
  document.readiness[readiness.id] = readiness;
  document.workspaces[workspace.id] = workspace;
  return { item, document, workspace };
}

describe('studySceneQuickSessions', () => {
  it('builds one bounded scene from current exact-subtitle selected candidates', () => {
    const { item, document } = fixture();
    const [session] = studySceneQuickSessions([item], document, fingerprints);
    if (!session) throw new Error('Expected a quick-session scene.');

    expect(session).toMatchObject({
      mediaId: 'media-1',
      workspaceId: 'workspace-1',
      subtitleRecordId: 'subtitle-1',
      startSec: 35,
      endSec: 158,
      durationSec: 123,
      recurringWords: 4,
      totalOccurrences: 10,
    });
    expect(session?.candidateIds).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(sceneQuickSessionOpportunity(session, 500)).toMatchObject({
      type: 'scene-quick-session',
      priority: 74,
      estimatedMinutes: 3,
      context: {
        mediaId: 'media-1',
        cueStartSec: 35,
        cueEndSec: 158,
        returnTarget: { positionSec: 35 },
      },
      actions: ['preview-scene-session', 'open-context'],
      createdAt: 500,
    });
  });

  it('rejects sparse, stale, unselected, known, and proper-name evidence', () => {
    const { item, document, workspace } = fixture();
    const second = workspace.candidates[1];
    const third = workspace.candidates[2];
    if (!second || !third) throw new Error('Expected candidate fixture rows.');
    second.knowledgeLevel = 2;
    third.proper = true;
    workspace.selectionIds = workspace.selectionIds.filter((id) => id !== 'd');
    expect(studySceneQuickSessions([item], document, fingerprints)).toEqual([]);

    const restored = fixture();
    const readiness = restored.document.readiness['readiness-1'];
    if (!readiness) throw new Error('Expected readiness fixture.');
    readiness.knowledgeFingerprint = 'stale';
    expect(studySceneQuickSessions(
      [restored.item],
      restored.document,
      fingerprints,
    )).toEqual([]);
  });

  it('does not let an unattached or non-Japanese subtitle satisfy exact provenance', () => {
    const missing = fixture();
    missing.item.subtitles = [];
    expect(studySceneQuickSessions([missing.item], missing.document, fingerprints)).toEqual([]);

    const wrongLanguage = fixture();
    const subtitle = wrongLanguage.item.subtitles?.[0];
    if (!subtitle) throw new Error('Expected subtitle fixture.');
    subtitle.lang = 'en';
    expect(studySceneQuickSessions(
      [wrongLanguage.item],
      wrongLanguage.document,
      fingerprints,
    )).toEqual([]);
  });
});
