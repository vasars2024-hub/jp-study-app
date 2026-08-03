import { describe, expect, it } from 'vitest';
import {
  createEmptyStudyOrchestratorDocument,
  type StudyReadinessSnapshot,
  type StudyVocabularyCandidate,
  type StudyVocabularyWorkspace,
} from '../mediaStudyOrchestrator';
import {
  STUDY_GRAMMAR_FAILURE_WINDOW_MS,
  studyGrammarWeaknessScenes,
  type StudyGrammarPointSignal,
} from '../studyGrammarWeaknessScenes';
import type { StudyReadinessFingerprints } from '../studyEpisodeReadiness';
import type { MediaItem } from '../types';

const now = 2_000_000_000_000;
const fingerprints: StudyReadinessFingerprints = {
  knowledgeFingerprint: 'knowledge',
  levelListsFingerprint: 'levels',
  frequencyListsFingerprint: 'frequency',
};
const point: StudyGrammarPointSignal = {
  id: 'n4-koto-ga-aru',
  title: '〜ことがある',
  meaning: 'there are times when',
  level: 'N4',
  lang: 'ja',
};

function candidate(id: string, sentence: string, timestamp: number): StudyVocabularyCandidate {
  return {
    id,
    word: id,
    surface: id,
    reading: '',
    sentence,
    occurrences: 1,
    timestamp,
    jlptLevel: null,
    knowledgeLevel: 0,
    proper: false,
    internalDuplicate: false,
    ankiDuplicate: false,
  };
}

function fixture() {
  const item = {
    id: 'media-1',
    title: 'Prepared drama',
    fileName: 'prepared.mkv',
    episode: 3,
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
    generatedAt: now - 1_000,
    sourceFingerprint: 'subtitle-1:100:20:0:1200',
    knowledgeFingerprint: fingerprints.knowledgeFingerprint,
    levelListsFingerprint: fingerprints.levelListsFingerprint,
    frequencyListsFingerprint: fingerprints.frequencyListsFingerprint,
    subtitleRecordId: 'subtitle-1',
    subtitleReady: true,
    contentLevel: 'N4',
    confidence: 0.9,
    knownCoverage: 0.8,
    uniqueKnownCoverage: 0.7,
    totalWordOccurrences: 100,
    knownWordOccurrences: 80,
    unknownUniqueWords: 20,
    recurringUnknownWords: 5,
    category: 'short-preview',
    truncated: false,
  };
  const candidates = [
    candidate('a', '時々、電車で会うことがある。', 42),
    candidate('b', '時々、電車で会うことがある。', 42),
    candidate('c', 'そんなことがあるなんて信じられない。', 95),
    candidate('d', 'これは別の文です。', 120),
  ];
  const workspace: StudyVocabularyWorkspace = {
    id: 'workspace-1',
    context: {
      mediaId: item.id,
      episode: item.episode,
      subtitleRecordId: readiness.subtitleRecordId,
    },
    readinessId: readiness.id,
    createdAt: now - 2_000,
    updatedAt: now - 1_000,
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
    // Grammar evidence must not depend on an unrelated vocabulary selection.
    selectionIds: [],
    history: [],
    exports: [],
  };
  const document = createEmptyStudyOrchestratorDocument();
  document.readiness[readiness.id] = readiness;
  document.workspaces[workspace.id] = workspace;
  return { item, document, readiness };
}

describe('studyGrammarWeaknessScenes', () => {
  it('links repeated misses to deduplicated exact cues in a current prepared workspace', () => {
    const { item, document } = fixture();
    const [weakness] = studyGrammarWeaknessScenes(
      [item],
      document,
      fingerprints,
      [
        { at: now - 1_000, missed: [point.id, point.id] },
        { at: now - 2_000, missed: [point.id] },
      ],
      [point],
      now,
    );

    expect(weakness).toMatchObject({
      pointId: point.id,
      pattern: point.title,
      core: 'ことがある',
      failedSessions: 2,
      latestFailureAt: now - 1_000,
      contexts: [
        {
          mediaId: item.id,
          workspaceId: 'workspace-1',
          subtitleRecordId: 'subtitle-1',
          cueStartSec: 42,
        },
        {
          cueStartSec: 95,
        },
      ],
    });
    expect(weakness?.contexts).toHaveLength(2);
  });

  it('requires misses in two separate recent completed sessions', () => {
    const { item, document } = fixture();
    expect(studyGrammarWeaknessScenes(
      [item],
      document,
      fingerprints,
      [{ at: now - 1_000, missed: [point.id] }],
      [point],
      now,
    )).toEqual([]);
    expect(studyGrammarWeaknessScenes(
      [item],
      document,
      fingerprints,
      [
        { at: now - 1_000, missed: [point.id] },
        { at: now - STUDY_GRAMMAR_FAILURE_WINDOW_MS - 1, missed: [point.id] },
      ],
      [point],
      now,
    )).toEqual([]);
    expect(studyGrammarWeaknessScenes(
      [item],
      document,
      fingerprints,
      [
        { at: now - 1_000, missed: [point.id] },
        { at: now + 1, missed: [point.id] },
      ],
      [point],
      now,
    )).toEqual([]);
  });

  it('refuses ambiguous short kana and one-kanji surfaces', () => {
    const { item, document } = fixture();
    const short = { ...point, id: 'short', title: '〜に' };
    const oneKanji = { ...point, id: 'one-kanji', title: '〜方' };
    expect(studyGrammarWeaknessScenes(
      [item],
      document,
      fingerprints,
      [
        { at: now - 1_000, missed: [short.id] },
        { at: now - 2_000, missed: [short.id] },
      ],
      [short],
      now,
    )).toEqual([]);
    expect(studyGrammarWeaknessScenes(
      [item],
      document,
      fingerprints,
      [
        { at: now - 1_000, missed: [oneKanji.id] },
        { at: now - 2_000, missed: [oneKanji.id] },
      ],
      [oneKanji],
      now,
    )).toEqual([]);
  });

  it('rejects stale fingerprints and detached subtitle provenance', () => {
    const stale = fixture();
    stale.readiness.knowledgeFingerprint = 'stale';
    const sessions = [
      { at: now - 1_000, missed: [point.id] },
      { at: now - 2_000, missed: [point.id] },
    ];
    expect(studyGrammarWeaknessScenes(
      [stale.item],
      stale.document,
      fingerprints,
      sessions,
      [point],
      now,
    )).toEqual([]);

    const detached = fixture();
    detached.item.subtitles = [];
    expect(studyGrammarWeaknessScenes(
      [detached.item],
      detached.document,
      fingerprints,
      sessions,
      [point],
      now,
    )).toEqual([]);
  });
});
