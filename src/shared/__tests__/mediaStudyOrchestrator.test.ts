import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STUDY_FILTERS,
  PREPARED_UNWATCHED_DELAY_MS,
  RECENT_ANKI_CONTEXT_WINDOW_MS,
  applyStudyTranscriptionProgress,
  applyStudyVocabularyFilters,
  createStudyPipelineJob,
  createStudyLookupPack,
  createStudyTranscriptionJob,
  createStudyWorkspace,
  generateStudyOpportunities,
  generateRepeatedLookupOpportunity,
  indexRecentAnkiIntervalEntries,
  normalizedStudyDuplicateKey,
  rankStudyVocabulary,
  recentAnkiMatchesForWorkspace,
  readinessCategory,
  selectJapaneseStudySubtitle,
  selectStudyVocabulary,
  syncStudyOpportunities,
  studyContextSeekPosition,
  studyCoveragePreview,
  studyVocabularyPage,
  undoStudyVocabularyFilter,
  updateStudyPipelineStage,
  type StudyReadinessSnapshot,
  type StudyVocabularyCandidate,
} from '../mediaStudyOrchestrator';

const readiness = (knownCoverage = 0.68): StudyReadinessSnapshot => ({
  id: 'ready-media-1',
  mediaId: 'media-1',
  analyzerVersion: 1,
  generatedAt: 1,
  sourceFingerprint: 'sub',
  knowledgeFingerprint: 'known',
  levelListsFingerprint: 'levels',
  subtitleRecordId: 'sub-ja',
  subtitleSource: 'Japanese sidecar subtitles',
  subtitleReady: true,
  contentLevel: 'N2',
  confidence: 0.9,
  knownCoverage,
  uniqueKnownCoverage: 0.5,
  totalWordOccurrences: 100,
  knownWordOccurrences: Math.round(knownCoverage * 100),
  unknownUniqueWords: 20,
  recurringUnknownWords: 8,
  category: readinessCategory(knownCoverage, 0.9),
  truncated: false,
});

const candidates: StudyVocabularyCandidate[] = [
  {
    id: 'a', word: '簡単', surface: '簡単', reading: 'かんたん', occurrences: 10,
    sentence: '簡単です。', timestamp: 1, jlptLevel: 'N4', knowledgeLevel: 0,
    proper: false, internalDuplicate: false, ankiDuplicate: false,
  },
  {
    id: 'b', word: '魔法', surface: '魔法', reading: 'まほう', occurrences: 8,
    sentence: '魔法を使う。', timestamp: 2, jlptLevel: 'N3', knowledgeLevel: 0,
    proper: false, internalDuplicate: false, ankiDuplicate: false,
  },
  {
    id: 'c', word: '勇者', surface: '勇者', reading: 'ゆうしゃ', occurrences: 5,
    sentence: '勇者です。', timestamp: 3, jlptLevel: 'N2', knowledgeLevel: 2,
    proper: false, internalDuplicate: false, ankiDuplicate: false,
  },
  {
    id: 'd', word: 'ヒンメル', surface: 'ヒンメル', reading: '', occurrences: 4,
    sentence: 'ヒンメルなら。', timestamp: 4, jlptLevel: null, knowledgeLevel: 0,
    proper: true, internalDuplicate: false, ankiDuplicate: false,
  },
  {
    id: 'e', word: '旅', surface: '旅', reading: 'たび', occurrences: 3,
    sentence: '旅に出る。', timestamp: 5, jlptLevel: 'N3', knowledgeLevel: 0,
    proper: false, internalDuplicate: true, ankiDuplicate: true, ankiIntervalDays: 30,
  },
];

describe('Study readiness', () => {
  it('uses the documented deterministic thresholds and preserves incomplete data', () => {
    expect(readinessCategory(0.85)).toBe('ready-now');
    expect(readinessCategory(0.7)).toBe('short-preview');
    expect(readinessCategory(0.55)).toBe('productive-challenge');
    expect(readinessCategory(0.549)).toBe('save-for-later');
    expect(readinessCategory(null)).toBe('incomplete');
    expect(readinessCategory(0.9, 0.1)).toBe('incomplete');
  });
});

describe('Study opportunities', () => {
  it('opens exact prepared subtitle context for a recently strengthened Anki card', () => {
    const changedAt = 10_000;
    const preparedWorkspace = createStudyWorkspace(
      'workspace-media-1',
      { mediaId: 'media-1', subtitleRecordId: 'sub-ja' },
      readiness(),
      candidates,
      1_000,
    );
    const matches = recentAnkiMatchesForWorkspace(preparedWorkspace, indexRecentAnkiIntervalEntries([
      {
        expression: '魔法',
        ivlDays: 3,
        noteId: 10,
        modelName: 'Japanese',
        lastIntervalChangeAt: changedAt,
      },
      {
        expression: '簡単',
        ivlDays: 0,
        noteId: 11,
        modelName: 'Japanese',
        lastIntervalChangeAt: changedAt,
      },
    ], changedAt));
    const opportunities = generateStudyOpportunities({
      media: {
        id: 'media-1',
        title: 'Frieren',
        fileName: 'frieren.mkv',
        favorite: false,
        studyQueue: false,
      },
      readiness: readiness(),
      activeWorkspace: preparedWorkspace,
      recentAnkiMatches: matches,
      now: changedAt,
    });

    expect(matches).toEqual([{
      expression: '魔法',
      intervalDays: 3,
      intervalChangedAt: changedAt,
      sentence: '魔法を使う。',
      timestamp: 2,
    }]);
    expect(opportunities[0]).toMatchObject({
      id: 'study-opportunity-recently-learned-context-media-1',
      type: 'recently-learned-context',
      priority: 87,
      context: {
        mediaId: 'media-1',
        subtitleRecordId: 'sub-ja',
        cueStartSec: 2,
        sentence: '魔法を使う。',
        returnTarget: { mediaId: 'media-1', positionSec: 2 },
      },
      actions: ['open-context', 'inspect-vocabulary'],
    });
  });

  it('expires recent Anki context evidence after seven days', () => {
    const now = 10_000 + RECENT_ANKI_CONTEXT_WINDOW_MS + 1;
    const preparedWorkspace = createStudyWorkspace(
      'workspace-media-1',
      { mediaId: 'media-1' },
      readiness(),
      candidates,
      1_000,
    );

    expect(recentAnkiMatchesForWorkspace(preparedWorkspace, indexRecentAnkiIntervalEntries([{
      expression: '魔法',
      ivlDays: 3,
      noteId: 10,
      modelName: 'Japanese',
      lastIntervalChangeAt: 10_000,
    }], now))).toEqual([]);
  });

  it('offers a prepared title after the grace period when no later playback exists', () => {
    const preparedAt = 1_000;
    const preparedReadiness = { ...readiness(), generatedAt: preparedAt };
    const preparedWorkspace = createStudyWorkspace(
      'workspace-media-1',
      { mediaId: 'media-1' },
      preparedReadiness,
      candidates,
      preparedAt,
    );
    const opportunities = generateStudyOpportunities({
      media: {
        id: 'media-1',
        title: 'Frieren',
        fileName: 'frieren.mkv',
        favorite: false,
        studyQueue: false,
        positionSec: 42,
        lastPlayedAt: preparedAt - 1,
      },
      readiness: preparedReadiness,
      activeWorkspace: preparedWorkspace,
      now: preparedAt + PREPARED_UNWATCHED_DELAY_MS,
    });

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      id: 'study-opportunity-prepared-unwatched-media-1',
      type: 'prepared-unwatched',
      priority: 89,
      context: {
        mediaId: 'media-1',
        subtitleRecordId: 'sub-ja',
        returnTarget: { positionSec: 42 },
      },
      actions: ['open-context', 'inspect-vocabulary'],
    });
    expect(opportunities[0].evidence.map((entry) => entry.code)).toEqual([
      'prepared-workspace',
      'no-playback-after-preparation',
    ]);
  });

  it('does not offer prepared media before the grace period or after later playback', () => {
    const preparedAt = 1_000;
    const preparedReadiness = { ...readiness(), generatedAt: preparedAt };
    const preparedWorkspace = createStudyWorkspace(
      'workspace-media-1',
      { mediaId: 'media-1' },
      preparedReadiness,
      candidates,
      preparedAt,
    );
    const media = {
      id: 'media-1',
      title: 'Frieren',
      fileName: 'frieren.mkv',
      favorite: false,
      studyQueue: false,
    } as const;

    expect(generateStudyOpportunities({
      media,
      readiness: preparedReadiness,
      activeWorkspace: preparedWorkspace,
      now: preparedAt + PREPARED_UNWATCHED_DELAY_MS - 1,
    })).toEqual([]);
    expect(generateStudyOpportunities({
      media: { ...media, lastPlayedAt: preparedAt + 1 },
      readiness: preparedReadiness,
      activeWorkspace: preparedWorkspace,
      now: preparedAt + PREPARED_UNWATCHED_DELAY_MS,
    })).toEqual([]);
  });

  it('prefers an unfinished session over a prepared-but-unwatched reminder', () => {
    const preparedAt = 1_000;
    const preparedReadiness = { ...readiness(), generatedAt: preparedAt };
    const preparedWorkspace = createStudyWorkspace(
      'workspace-media-1',
      { mediaId: 'media-1' },
      preparedReadiness,
      candidates,
      preparedAt,
    );
    const opportunities = generateStudyOpportunities({
      media: {
        id: 'media-1',
        title: 'Frieren',
        fileName: 'frieren.mkv',
        favorite: false,
        studyQueue: false,
      },
      readiness: preparedReadiness,
      activeWorkspace: preparedWorkspace,
      unfinishedSessionId: 'session-1',
      now: preparedAt + PREPARED_UNWATCHED_DELAY_MS,
    });

    expect(opportunities.map((entry) => entry.type)).toEqual(['continue-session']);
  });

  it('retires an active prepared reminder after real playback advances its signal', () => {
    const preparedAt = 1_000;
    const preparedReadiness = { ...readiness(), generatedAt: preparedAt };
    const preparedWorkspace = createStudyWorkspace(
      'workspace-media-1',
      { mediaId: 'media-1' },
      preparedReadiness,
      candidates,
      preparedAt,
    );
    const media = {
      id: 'media-1',
      title: 'Frieren',
      fileName: 'frieren.mkv',
      favorite: false,
      studyQueue: false,
    } as const;
    const [active] = generateStudyOpportunities({
      media,
      readiness: preparedReadiness,
      activeWorkspace: preparedWorkspace,
      now: preparedAt + PREPARED_UNWATCHED_DELAY_MS,
    });
    const afterPlayback = generateStudyOpportunities({
      media: { ...media, lastPlayedAt: preparedAt + 1 },
      readiness: preparedReadiness,
      activeWorkspace: preparedWorkspace,
      now: preparedAt + PREPARED_UNWATCHED_DELAY_MS + 1,
    });
    const synced = syncStudyOpportunities(
      { [active.id]: active },
      afterPlayback,
      preparedAt + PREPARED_UNWATCHED_DELAY_MS + 2,
      { retireMissingActive: true },
    );

    expect(afterPlayback).toEqual([]);
    expect(synced.changed).toBe(true);
    expect(synced.opportunities[active.id]).toBeUndefined();
  });

  it('turns a queued difficult title into an explainable preparation opportunity', () => {
    const opportunities = generateStudyOpportunities({
      media: {
        id: 'media-1',
        title: 'Frieren',
        fileName: 'frieren.mkv',
        studyQueue: true,
        favorite: false,
        episode: 1,
        positionSec: 12,
      },
      readiness: readiness(),
      now: 100,
    });
    expect(opportunities[0]).toMatchObject({
      type: 'queued-preparation',
      priority: 92,
      context: { mediaId: 'media-1', subtitleRecordId: 'sub-ja' },
    });
    expect(opportunities[0].evidence.map((item) => item.code)).toContain('known-coverage');
  });

  it('does not silently queue favorites but suggests ones that are within reach', () => {
    const [suggestion] = generateStudyOpportunities({
      media: {
        id: 'media-1', title: 'Frieren', fileName: 'frieren.mkv',
        favorite: true, studyQueue: false,
      },
      readiness: readiness(0.72),
      now: 100,
    });
    expect(suggestion?.type).toBe('favorite-preparation');
  });

  it('shows missing subtitles and unfinished work before preparation', () => {
    const opportunities = generateStudyOpportunities({
      media: {
        id: 'media-1', title: 'Frieren', fileName: 'frieren.mkv',
        favorite: false, studyQueue: true,
      },
      unfinishedSessionId: 'session-1',
      now: 100,
    });
    expect(opportunities.map((item) => item.type)).toEqual([
      'continue-session',
      'subtitle-required',
    ]);
  });

  it('distinguishes an attached Japanese subtitle from missing subtitle data before analysis', () => {
    const opportunities = generateStudyOpportunities({
      media: {
        id: 'media-1', title: 'The Big O - 01', fileName: 'episode-01.mkv',
        favorite: false, studyQueue: true,
      },
      subtitle: {
        recordId: 'subtitle-ja',
        source: 'Japanese sidecar subtitles',
      },
      now: 100,
    });

    expect(opportunities.map((item) => item.type)).toEqual(['queued-preparation']);
    expect(opportunities[0]).toMatchObject({
      title: 'Analyze The Big O - 01',
      context: { subtitleRecordId: 'subtitle-ja' },
      actions: ['prepare'],
    });
    expect(opportunities[0].evidence.map((item) => item.code)).toContain('subtitle-ready');
  });

  it('keeps a generated recommendation identity stable across renderer refreshes', () => {
    const signals = {
      media: {
        id: 'media-1',
        title: 'Frieren',
        fileName: 'frieren.mkv',
        favorite: false,
        studyQueue: true,
      },
    } as const;
    const [first] = generateStudyOpportunities({ ...signals, now: 100 });
    const [refreshed] = generateStudyOpportunities({ ...signals, now: 200 });

    expect(first.id).toBe('study-opportunity-subtitle-required-media-1');
    expect(refreshed.id).toBe(first.id);
    expect(refreshed.createdAt).not.toBe(first.createdAt);
  });

  it('persists generated recommendations without reviving dismissed state', () => {
    const [candidate] = generateStudyOpportunities({
      media: {
        id: 'media-1',
        title: 'Frieren',
        fileName: 'frieren.mkv',
        favorite: false,
        studyQueue: true,
      },
      now: 100,
    });
    const inserted = syncStudyOpportunities({}, [candidate], 110);
    expect(inserted.changed).toBe(true);
    expect(inserted.opportunities[candidate.id]).toBe(candidate);

    const dismissed = {
      ...candidate,
      status: 'dismissed' as const,
      dismissedAt: 120,
      updatedAt: 120,
    };
    const [regenerated] = generateStudyOpportunities({
      media: {
        id: 'media-1',
        title: 'Frieren — Episode 1',
        fileName: 'frieren.mkv',
        favorite: false,
        studyQueue: true,
      },
      now: 200,
    });
    const updated = syncStudyOpportunities({ [dismissed.id]: dismissed }, [regenerated], 210);

    expect(updated.changed).toBe(true);
    expect(updated.opportunities[dismissed.id]).toMatchObject({
      title: 'Prepare subtitles for Frieren — Episode 1',
      status: 'dismissed',
      createdAt: 100,
      updatedAt: 210,
      dismissedAt: 120,
    });
  });

  it('does not report a change for timestamp-only regeneration', () => {
    const signals = {
      media: {
        id: 'media-1',
        title: 'Frieren',
        fileName: 'frieren.mkv',
        favorite: false,
        studyQueue: true,
      },
    } as const;
    const [existing] = generateStudyOpportunities({ ...signals, now: 100 });
    const [regenerated] = generateStudyOpportunities({ ...signals, now: 200 });
    const result = syncStudyOpportunities({ [existing.id]: existing }, [regenerated], 300);

    expect(result.changed).toBe(false);
    expect(result.opportunities[existing.id]).toBe(existing);
  });

  it('retires a stale active signal without deleting dismissed history', () => {
    const [active] = generateStudyOpportunities({
      media: {
        id: 'media-1',
        title: 'Frieren',
        fileName: 'frieren.mkv',
        favorite: false,
        studyQueue: true,
      },
      now: 100,
    });
    const dismissed = {
      ...active,
      id: `${active.id}-dismissed`,
      status: 'dismissed' as const,
      dismissedAt: 120,
    };
    const result = syncStudyOpportunities(
      { [active.id]: active, [dismissed.id]: dismissed },
      [],
      200,
      { retireMissingActive: true },
    );

    expect(result.changed).toBe(true);
    expect(result.opportunities[active.id]).toBeUndefined();
    expect(result.opportunities[dismissed.id]).toBe(dismissed);
  });
});

describe('Vocabulary workspace', () => {
  it('lets user frequency rank either every word or only JLPT-unrated slots', () => {
    const frequencyCandidates: StudyVocabularyCandidate[] = [
      { ...candidates[0], id: 'rated-a', frequencyRank: 900 },
      { ...candidates[1], id: 'unrated-a', jlptLevel: null, frequencyRank: 500 },
      { ...candidates[2], id: 'rated-b', frequencyRank: 2 },
      { ...candidates[3], id: 'unrated-b', proper: false, frequencyRank: 10 },
    ];

    expect(rankStudyVocabulary(frequencyCandidates, 'frequency-all').map((entry) => entry.id))
      .toEqual(['rated-b', 'unrated-b', 'unrated-a', 'rated-a']);
    expect(rankStudyVocabulary(frequencyCandidates, 'frequency-unrated').map((entry) => entry.id))
      .toEqual(['rated-a', 'unrated-b', 'rated-b', 'unrated-a']);
  });

  it('removes lower-level, known, duplicate, and proper-name candidates deterministically', () => {
    const selected = selectStudyVocabulary(candidates, {
      ...DEFAULT_STUDY_FILTERS,
      excludedJlptLevels: ['n4'],
      maximumCards: null,
    });
    expect(selected.map((entry) => entry.id)).toEqual(['b']);
  });

  it('records reversible filter operations for remove N5 and N4', () => {
    const initial = createStudyWorkspace(
      'workspace-1',
      { mediaId: 'media-1' },
      readiness(),
      candidates,
      100,
    );
    const filtered = applyStudyVocabularyFilters(initial, {
      excludedJlptLevels: ['N5', 'N4'],
      maximumCards: null,
    }, 200);
    expect(filtered.operation.afterFilters.excludedJlptLevels).toEqual(['N5', 'N4']);
    expect(filtered.workspace.selectionIds).toEqual(['b']);
    const undone = undoStudyVocabularyFilter(filtered.workspace, 300);
    expect(undone.workspace.selectionIds).toEqual(initial.selectionIds);
    expect(undone.workspace.filters).toEqual(initial.filters);
  });

  it('counts replaced candidates as removed when the maximum-card cap refills the set', () => {
    const capped = createStudyWorkspace(
      'capped',
      { mediaId: 'media-1' },
      readiness(),
      candidates,
      100,
    );
    const result = applyStudyVocabularyFilters(capped, {
      excludedJlptLevels: ['N4'],
      maximumCards: 2,
      excludeKnowledgeAtOrAbove: 4,
      excludeInternalDuplicates: false,
      excludeProperNouns: false,
    }, 200);
    expect(result.workspace.selectionIds).toHaveLength(2);
    expect(result.operation.removedCount).toBeGreaterThan(0);
  });

  it('calculates an explainable before/after coverage estimate', () => {
    const workspace = createStudyWorkspace(
      'workspace-1',
      { mediaId: 'media-1' },
      readiness(),
      candidates,
      100,
    );
    expect(studyCoveragePreview(readiness(), workspace)).toMatchObject({
      before: 0.68,
      after: 0.86,
      selectedOccurrences: 18,
      selectedUniqueWords: 2,
    });
  });

  it('pages candidates without discarding selection state', () => {
    const workspace = createStudyWorkspace(
      'workspace-1',
      { mediaId: 'media-1' },
      readiness(),
      candidates,
      100,
    );
    const page = studyVocabularyPage(workspace, 0, 2);
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
    expect(page.selected).toBe(2);
  });

  it('normalizes duplicate keys without losing the reading distinction', () => {
    expect(normalizedStudyDuplicateKey(' ＭＡＧＩＣ ', ' マジック ')).toBe('magic\u0000マジック');
    expect(normalizedStudyDuplicateKey('生', 'せい')).not.toBe(normalizedStudyDuplicateKey('生', 'なま'));
  });
});

describe('Study production line', () => {
  it('shows a real subtitle blocker and clamps progress updates', () => {
    const job = createStudyPipelineJob('job-1', 'media-1', { subtitleReady: false }, 100);
    expect(job.stages.find((stage) => stage.id === 'subtitles')?.status).toBe('requires-input');
    const running = updateStudyPipelineStage(job, 'analysis', {
      status: 'active',
      progress: 4,
    }, 200);
    expect(running.stages.find((stage) => stage.id === 'analysis')).toMatchObject({
      status: 'active',
      progress: 1,
      updatedAt: 200,
    });
  });

  it('maps the shared transcription lifecycle into a real persisted subtitle stage', () => {
    const queued = createStudyTranscriptionJob('media-1', 100);
    expect(queued.stages.find((stage) => stage.id === 'subtitles')).toMatchObject({
      status: 'queued',
      progress: 0,
      childJobId: 'transcription:media-1',
    });

    const active = applyStudyTranscriptionProgress(queued, {
      mediaId: 'media-1',
      title: 'Frieren',
      phase: 'transcribing',
      done: 2,
      total: 4,
      startedAt: 100,
    }, 200);
    expect(active.stages.find((stage) => stage.id === 'subtitles')).toMatchObject({
      status: 'active',
      progress: 0.5,
      detail: 'Transcribing audio segment 3 of 4',
    });

    const complete = applyStudyTranscriptionProgress(active, {
      mediaId: 'media-1',
      title: 'Frieren',
      phase: 'done',
      done: 4,
      total: 4,
      startedAt: 100,
    }, 300);
    expect(complete.stages.find((stage) => stage.id === 'subtitles')).toMatchObject({
      status: 'complete',
      progress: 1,
      error: undefined,
    });
  });

  it('preserves truthful transcription failure and ignores unrelated media', () => {
    const queued = createStudyTranscriptionJob('media-1', 100);
    const unrelated = applyStudyTranscriptionProgress(queued, {
      mediaId: 'media-2',
      title: 'Other title',
      phase: 'error',
      done: 0,
      total: 0,
      startedAt: 100,
      error: 'decoder failed',
    }, 200);
    expect(unrelated).toBe(queued);

    const failed = applyStudyTranscriptionProgress(queued, {
      mediaId: 'media-1',
      title: 'Frieren',
      phase: 'error',
      done: 0,
      total: 0,
      startedAt: 100,
      error: 'decoder failed',
    }, 200);
    expect(failed.stages.find((stage) => stage.id === 'subtitles')).toMatchObject({
      status: 'failed',
      error: 'decoder failed',
    });
  });
});

describe('Study subtitle selection', () => {
  it('never fabricates Japanese readiness from a non-Japanese fallback track', () => {
    const records = [
      {
        id: 'en',
        lang: 'en',
        source: 'sidecar' as const,
        format: 'srt' as const,
        path: 'episode.en.srt',
        addedAt: 1,
      },
      {
        id: 'ja',
        lang: 'ja-JP',
        source: 'embedded' as const,
        format: 'ass' as const,
        path: 'episode.ja.ass',
        addedAt: 2,
      },
    ];
    expect(selectJapaneseStudySubtitle(records)?.id).toBe('ja');
    expect(selectJapaneseStudySubtitle(records.slice(0, 1))).toBeUndefined();
  });
});

describe('Study context handoff', () => {
  it('opens a selected vocabulary candidate at its cue instead of the session return point', () => {
    expect(studyContextSeekPosition({
      mediaId: 'media-1',
      cueStartSec: 38.133,
      returnTarget: {
        section: 'video',
        mediaId: 'media-1',
        positionSec: 5.178,
      },
    })).toBe(38.133);
  });
});

describe('Repeated lookup Study pack', () => {
  it('builds a high-priority local opportunity and switches to review when prepared', () => {
    expect(generateRepeatedLookupOpportunity({
      wordCount: 3,
      totalLookups: 8,
      sourceFingerprint: 'lookups-v2',
      workspaceFingerprint: 'lookups-v1',
      now: 100,
    })).toMatchObject({
      type: 'repeated-lookups',
      priority: 98,
      actions: ['build-lookup-pack', 'inspect-vocabulary'],
      context: { sourceKind: 'lookup-history' },
    });

    expect(generateRepeatedLookupOpportunity({
      wordCount: 3,
      totalLookups: 8,
      sourceFingerprint: 'lookups-v2',
      workspaceFingerprint: 'lookups-v2',
      now: 100,
    })?.actions).toEqual(['inspect-vocabulary', 'preview-cards']);
  });

  it('creates a resumable workspace and excludes Anki duplicates by default', () => {
    const result = createStudyLookupPack({
      sourceFingerprint: 'lookups-v1',
      candidates: [
        {
          id: 'lookup-1',
          word: '食べる',
          surface: '食べた',
          reading: 'たべる',
          meaning: 'to eat',
          occurrences: 3,
          sentence: '',
          timestamp: 0,
          jlptLevel: 'N5',
          knowledgeLevel: 0,
          proper: false,
          internalDuplicate: false,
          ankiDuplicate: false,
        },
        {
          id: 'lookup-2',
          word: '見る',
          surface: '見た',
          reading: 'みる',
          occurrences: 2,
          sentence: '',
          timestamp: 0,
          jlptLevel: 'N5',
          knowledgeLevel: 0,
          proper: false,
          internalDuplicate: false,
          ankiDuplicate: true,
        },
      ],
    }, undefined, 100);

    expect(result.readiness).toMatchObject({
      sourceKind: 'lookup-history',
      sourceFingerprint: 'lookups-v1',
      unknownUniqueWords: 2,
    });
    expect(result.workspace.context.sourceKind).toBe('lookup-history');
    expect(result.workspace.selectionIds).toEqual(['lookup-1']);
    expect(result.workspace.filters.excludeAnkiDuplicates).toBe(true);
  });
});
