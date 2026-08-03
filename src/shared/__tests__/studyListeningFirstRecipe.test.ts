import { describe, expect, it } from 'vitest';
import {
  createEmptyStudyOrchestratorDocument,
  STUDY_ANALYZER_VERSION,
  type StudyReadinessSnapshot,
  type StudyVocabularyWorkspace,
} from '../mediaStudyOrchestrator';
import type { StudyReadinessFingerprints } from '../studyEpisodeReadiness';
import {
  studyListeningAvailability,
  studyListeningFirstRecipe,
} from '../studyListeningFirstRecipe';
import type { MediaItem } from '../types';

const fingerprints: StudyReadinessFingerprints = {
  knowledgeFingerprint: 'knowledge-current',
  levelListsFingerprint: 'levels-current',
  frequencyListsFingerprint: 'frequency-current',
};

function fixture() {
  const item: MediaItem = {
    id: 'media-1',
    title: 'Prepared drama',
    path: 'C:\\media\\prepared.mkv',
    fileName: 'prepared.mkv',
    addedAt: 1,
    episode: 3,
    positionSec: 42,
    subtitles: [{
      id: 'subtitle-1',
      lang: 'ja',
      source: 'sidecar',
      format: 'srt',
      path: 'prepared.ja.srt',
      addedAt: 100,
    }],
  };
  const readiness: StudyReadinessSnapshot = {
    id: 'readiness-1',
    mediaId: item.id,
    analyzerVersion: STUDY_ANALYZER_VERSION,
    generatedAt: 1_000,
    sourceFingerprint: 'subtitle-1:100:20:0:1200',
    ...fingerprints,
    subtitleRecordId: 'subtitle-1',
    subtitleReady: true,
    contentLevel: 'N3',
    confidence: 0.9,
    knownCoverage: 0.9,
    uniqueKnownCoverage: 0.82,
    totalWordOccurrences: 500,
    knownWordOccurrences: 450,
    unknownUniqueWords: 20,
    recurringUnknownWords: 6,
    category: 'ready-now',
    truncated: false,
  };
  const workspace: StudyVocabularyWorkspace = {
    id: 'workspace-1',
    context: {
      mediaId: item.id,
      episode: item.episode,
      subtitleRecordId: readiness.subtitleRecordId,
    },
    readinessId: readiness.id,
    createdAt: 1_000,
    updatedAt: 1_000,
    candidates: [],
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
    selectionIds: [],
    history: [],
    exports: [],
  };
  const document = createEmptyStudyOrchestratorDocument();
  document.readiness[readiness.id] = readiness;
  document.workspaces[workspace.id] = workspace;
  const availability = studyListeningAvailability({
    mediaId: item.id,
    readyState: 3,
    capturedAudioTrackCount: 1,
  });
  return { item, readiness, workspace, document, availability };
}

describe('studyListeningAvailability', () => {
  it('requires decoded media plus direct track or decoded-audio evidence', () => {
    expect(studyListeningAvailability({
      mediaId: 'media-1',
      readyState: 1,
      browserAudioTrackCount: 1,
    }).usable).toBe(false);
    expect(studyListeningAvailability({
      mediaId: 'media-1',
      readyState: 3,
    }).usable).toBe(false);
    expect(studyListeningAvailability({
      mediaId: 'media-1',
      readyState: 2,
      capturedAudioTrackCount: 1,
    })).toMatchObject({
      usable: true,
      evidence: 'captured-audio-track',
      audioTrackCount: 1,
    });
    expect(studyListeningAvailability({
      mediaId: 'media-1',
      readyState: 4,
      decodedAudioBytes: 1_204_401,
    })).toMatchObject({
      usable: true,
      evidence: 'decoded-audio-bytes',
      audioTrackCount: 1,
    });
  });
});

describe('studyListeningFirstRecipe', () => {
  it('links proven player audio to exact current high-coverage preparation', () => {
    const { item, document, availability } = fixture();
    expect(studyListeningFirstRecipe(
      [item],
      document,
      fingerprints,
      availability,
    )).toMatchObject({
      mediaId: item.id,
      title: item.title,
      episode: 3,
      subtitleRecordId: 'subtitle-1',
      readinessId: 'readiness-1',
      workspaceId: 'workspace-1',
      positionSec: 42,
      knownCoverage: 0.9,
      audioEvidence: 'captured-audio-track',
    });
  });

  it('rejects unproven audio and audio proven for a different item', () => {
    const { item, document, availability } = fixture();
    expect(studyListeningFirstRecipe(
      [item],
      document,
      fingerprints,
      { ...availability, usable: false, evidence: undefined },
    )).toBeNull();
    expect(studyListeningFirstRecipe(
      [item],
      document,
      fingerprints,
      { ...availability, mediaId: 'other-media' },
    )).toBeNull();
  });

  it('requires ready-now coverage from a complete current analysis', () => {
    const low = fixture();
    low.readiness.knownCoverage = 0.849;
    low.readiness.category = 'short-preview';
    expect(studyListeningFirstRecipe(
      [low.item],
      low.document,
      fingerprints,
      low.availability,
    )).toBeNull();

    const truncated = fixture();
    truncated.readiness.truncated = true;
    expect(studyListeningFirstRecipe(
      [truncated.item],
      truncated.document,
      fingerprints,
      truncated.availability,
    )).toBeNull();
  });

  it('rejects stale fingerprints, detached subtitles, and mismatched workspaces', () => {
    const stale = fixture();
    stale.readiness.knowledgeFingerprint = 'knowledge-stale';
    expect(studyListeningFirstRecipe(
      [stale.item],
      stale.document,
      fingerprints,
      stale.availability,
    )).toBeNull();

    const detached = fixture();
    detached.item.subtitles = [];
    expect(studyListeningFirstRecipe(
      [detached.item],
      detached.document,
      fingerprints,
      detached.availability,
    )).toBeNull();

    const mismatched = fixture();
    mismatched.workspace.context.subtitleRecordId = 'subtitle-other';
    expect(studyListeningFirstRecipe(
      [mismatched.item],
      mismatched.document,
      fingerprints,
      mismatched.availability,
    )).toBeNull();
  });
});
