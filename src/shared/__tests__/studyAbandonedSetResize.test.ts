import { describe, expect, it } from 'vitest';
import type { MediaStudySession } from '../mediaStudyDatabase';
import {
  abandonedSetResizeOpportunity,
  STUDY_ABANDONED_SET_WINDOW_MS,
  studyAbandonedSetResizes,
} from '../studyAbandonedSetResize';
import {
  createEmptyStudyOrchestratorDocument,
  type StudyOrchestratorDocument,
  type StudyVocabularyCandidate,
  type StudyVocabularyWorkspace,
} from '../mediaStudyOrchestrator';

const now = 40 * 24 * 60 * 60 * 1000;

const candidate = (index: number): StudyVocabularyCandidate => ({
  id: `candidate-${index}`,
  word: `単語${index}`,
  surface: `単語${index}`,
  reading: `たんご${index}`,
  occurrences: 3,
  sentence: `単語${index}の文。`,
  timestamp: index,
  jlptLevel: 'N3',
  knowledgeLevel: 0,
  proper: false,
  internalDuplicate: false,
  ankiDuplicate: false,
});

function workspace(size = 30): StudyVocabularyWorkspace {
  const candidates = Array.from({ length: size }, (_, index) => candidate(index));
  return {
    id: 'workspace-media-1',
    context: {
      mediaId: 'media-1',
      subtitleRecordId: 'sub-ja',
      returnTarget: { section: 'video', mediaId: 'media-1', positionSec: 10 },
    },
    readinessId: 'ready-media-1',
    createdAt: now - 20 * 24 * 60 * 60 * 1000,
    updatedAt: now - 5_000,
    candidates,
    filters: {
      excludedJlptLevels: ['N5'],
      minimumOccurrences: 2,
      excludeKnowledgeAtOrAbove: 2,
      excludeInternalDuplicates: true,
      excludeAnkiDuplicates: true,
      excludeAnkiMatureAtDays: 21,
      excludeProperNouns: true,
      maximumCards: size,
      rankingMode: 'frequency-unrated',
    },
    selectionIds: candidates.map((entry) => entry.id),
    history: [],
    exports: [],
  };
}

function document(size = 30): StudyOrchestratorDocument {
  const value = createEmptyStudyOrchestratorDocument();
  const prepared = workspace(size);
  value.workspaces[prepared.id] = prepared;
  return value;
}

function session(
  id: string,
  patch: Partial<MediaStudySession> = {},
): MediaStudySession {
  const endedAt = now - Number(id.replace(/\D/g, '') || 1) * 60_000;
  return {
    id,
    mediaId: 'media-1',
    title: 'Title',
    startedAt: endedAt - 120_000,
    updatedAt: endedAt,
    endedAt,
    durationSec: 120,
    startPositionSec: 0,
    endPositionSec: 20,
    vocabularyMined: 40,
    sentencesReviewed: 0,
    cardsCreated: 0,
    actions: [{ action: 'mine-vocabulary', at: endedAt - 120_000 }],
    ...patch,
  };
}

describe('studyAbandonedSetResizes', () => {
  it('offers a smaller bounded set after two deliberate unfinished vocabulary sessions', () => {
    const [resize] = studyAbandonedSetResizes(
      document(),
      [session('session-1'), session('session-2')],
      now,
    );

    expect(resize).toMatchObject({
      workspaceId: 'workspace-media-1',
      currentSize: 30,
      proposedSize: 18,
      abandonedSessions: 2,
      analyzedCandidateFloor: 40,
    });
    expect(resize.retainedCandidateIds).toHaveLength(18);
    expect(resize.deferredCandidateIds).toHaveLength(12);
    expect(resize.retainedCandidateIds[0]).toBe('candidate-0');
  });

  it('requires repeated evidence and a set above twenty words', () => {
    expect(studyAbandonedSetResizes(document(), [session('session-1')], now)).toEqual([]);
    expect(studyAbandonedSetResizes(
      document(20),
      [session('session-1'), session('session-2')],
      now,
    )).toEqual([]);
  });

  it('rejects active, accidental, stale, pre-workspace, and productive sessions', () => {
    const invalid = [
      session('active-1', { endedAt: null }),
      session('short-2', { durationSec: 29 }),
      session('long-3', { durationSec: 12 * 60 + 1 }),
      session('stale-4', { endedAt: now - STUDY_ABANDONED_SET_WINDOW_MS - 1 }),
      session('old-5', { endedAt: now - 25 * 24 * 60 * 60 * 1000 }),
      session('reviewed-6', { sentencesReviewed: 1 }),
      session('cards-7', { cardsCreated: 1 }),
      session('small-8', { vocabularyMined: 29 }),
      session('watch-9', { actions: [{ action: 'study-episode', at: now - 1 }] }),
    ];

    expect(studyAbandonedSetResizes(document(), invalid, now)).toEqual([]);
  });

  it('uses only the newest workspace for a media item', () => {
    const value = document();
    const newer = { ...workspace(18), id: 'workspace-new', updatedAt: now };
    value.workspaces[newer.id] = newer;

    expect(studyAbandonedSetResizes(
      value,
      [session('session-1'), session('session-2')],
      now,
    )).toEqual([]);
  });

  it('builds an explainable preview action without mutating the workspace', () => {
    const value = document();
    const [resize] = studyAbandonedSetResizes(
      value,
      [session('session-1'), session('session-2')],
      now,
    );
    const prepared = value.workspaces[resize.workspaceId];
    const opportunity = abandonedSetResizeOpportunity(
      resize,
      { title: 'The Big O', fileName: 'big-o.mkv', episode: 1 },
      prepared,
      now,
    );

    expect(opportunity).toMatchObject({
      type: 'abandoned-set-resize',
      title: 'Try 18 words for The Big O',
      context: { mediaId: 'media-1', subtitleRecordId: 'sub-ja', episode: 1 },
      actions: ['preview-resize', 'inspect-vocabulary'],
    });
    expect(prepared.selectionIds).toHaveLength(30);
    expect(prepared.filters.maximumCards).toBe(30);
  });
});
