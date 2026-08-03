import { describe, expect, it } from 'vitest';
import type { IntervalEntry } from '../anki';
import {
  createEmptyStudyOrchestratorDocument,
  syncStudyOpportunities,
  type StudyOpportunity,
  type StudyOrchestratorDocument,
  type StudyReadinessSnapshot,
  type StudyVocabularyCandidate,
  type StudyVocabularyWorkspace,
} from '../mediaStudyOrchestrator';
import {
  STUDY_ANKI_LEECH_CONTEXT_LIMIT,
  indexAnkiLeechEntries,
  studyAnkiLeechReviews,
} from '../studyAnkiLeech';
import type { StudyReadinessFingerprints } from '../studyEpisodeReadiness';
import type { MediaItem } from '../types';

const fingerprints: StudyReadinessFingerprints = {
  knowledgeFingerprint: 'knowledge',
  levelListsFingerprint: 'levels',
  frequencyListsFingerprint: 'frequency',
};

function candidate(
  id: string,
  patch: Partial<StudyVocabularyCandidate> = {},
): StudyVocabularyCandidate {
  return {
    id,
    word: id,
    surface: id,
    reading: '',
    sentence: `${id}をもう一度聞く。`,
    occurrences: 4,
    timestamp: 30,
    jlptLevel: null,
    knowledgeLevel: 0,
    proper: false,
    internalDuplicate: false,
    ankiDuplicate: true,
    ...patch,
  };
}

function fixture(
  candidates: StudyVocabularyCandidate[] = [
    candidate('魔法', { reading: 'まほう', occurrences: 8, timestamp: 42 }),
    candidate('簡単', { reading: 'かんたん', occurrences: 5, timestamp: 96 }),
  ],
  workspacePatch: Partial<StudyVocabularyWorkspace> = {},
): {
  item: MediaItem;
  document: StudyOrchestratorDocument;
  readiness: StudyReadinessSnapshot;
} {
  const item = {
    id: 'media-1',
    title: 'Prepared drama',
    fileName: 'prepared.mkv',
    episode: 2,
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
    generatedAt: 1_000,
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
  const workspace: StudyVocabularyWorkspace = {
    id: 'workspace-1',
    context: {
      mediaId: item.id,
      episode: item.episode,
      subtitleRecordId: readiness.subtitleRecordId,
    },
    readinessId: readiness.id,
    createdAt: 900,
    updatedAt: 1_000,
    candidates,
    filters: {
      excludedJlptLevels: [],
      minimumOccurrences: 1,
      excludeKnowledgeAtOrAbove: 2,
      excludeInternalDuplicates: true,
      excludeAnkiDuplicates: false,
      excludeAnkiMatureAtDays: null,
      excludeProperNouns: true,
      maximumCards: 30,
      rankingMode: 'frequency-all',
    },
    selectionIds: [],
    history: [],
    exports: [],
    ...workspacePatch,
  };
  const document = createEmptyStudyOrchestratorDocument();
  document.readiness[readiness.id] = readiness;
  document.workspaces[workspace.id] = workspace;
  return { item, document, readiness };
}

function flagged(entries: IntervalEntry[]): ReadonlyMap<string, IntervalEntry> {
  return indexAnkiLeechEntries(entries);
}

describe('indexAnkiLeechEntries', () => {
  it('keeps only current authoritative flags and merges duplicate expressions', () => {
    const index = flagged([
      {
        expression: ' 魔法 ',
        ivlDays: 30,
        noteId: 1,
        modelName: 'Japanese',
        leech: true,
      },
      {
        expression: '魔法',
        ivlDays: 3,
        noteId: 2,
        modelName: 'Japanese',
        suspended: true,
      },
      {
        expression: '簡単',
        ivlDays: 10,
        noteId: 3,
        modelName: 'Japanese',
      },
    ]);

    expect([...index.keys()]).toEqual(['魔法']);
    expect(index.get('魔法')).toMatchObject({
      ivlDays: 30,
      leech: true,
      suspended: true,
    });
  });
});

describe('studyAnkiLeechReviews', () => {
  it('projects exact stored cues for leech and suspended cards', () => {
    const { item, document } = fixture();
    const [review] = studyAnkiLeechReviews(
      [item],
      document,
      fingerprints,
      flagged([
        {
          expression: '魔法',
          ivlDays: 3,
          noteId: 1,
          modelName: 'Japanese',
          leech: true,
        },
        {
          expression: '簡単',
          ivlDays: 0,
          noteId: 2,
          modelName: 'Japanese',
          suspended: true,
        },
      ]),
    );

    expect(review).toMatchObject({
      mediaId: 'media-1',
      episode: 2,
      workspaceId: 'workspace-1',
      readinessId: 'readiness-1',
      subtitleRecordId: 'subtitle-1',
      totalMatches: 2,
      leechCount: 1,
      suspendedCount: 1,
    });
    expect(review?.contexts).toEqual([
      expect.objectContaining({
        expression: '簡単',
        sentence: '簡単をもう一度聞く。',
        cueStartSec: 96,
        suspended: true,
      }),
      expect.objectContaining({
        expression: '魔法',
        sentence: '魔法をもう一度聞く。',
        cueStartSec: 42,
        leech: true,
      }),
    ]);
  });

  it('matches the stored surface when the candidate headword differs', () => {
    const { item, document } = fixture([
      candidate('食べる', {
        surface: '食べた',
        sentence: '昨日は全部食べた。',
        timestamp: 55,
      }),
    ]);
    const [review] = studyAnkiLeechReviews(
      [item],
      document,
      fingerprints,
      flagged([{
        expression: '食べた',
        ivlDays: 1,
        noteId: 1,
        modelName: 'Japanese',
        leech: true,
      }]),
    );
    expect(review?.contexts[0]).toMatchObject({
      expression: '食べた',
      word: '食べる',
      sentence: '昨日は全部食べた。',
      cueStartSec: 55,
    });
  });

  it('uses one strongest prepared cue per affected expression', () => {
    const { item, document } = fixture([
      candidate('weak', {
        word: '魔法',
        surface: '魔法',
        occurrences: 2,
        timestamp: 10,
      }),
      candidate('strong', {
        word: '魔法',
        surface: '魔法',
        occurrences: 9,
        timestamp: 80,
      }),
    ]);
    const [review] = studyAnkiLeechReviews(
      [item],
      document,
      fingerprints,
      flagged([{
        expression: '魔法',
        ivlDays: 4,
        noteId: 1,
        modelName: 'Japanese',
        suspended: true,
      }]),
    );
    expect(review?.totalMatches).toBe(1);
    expect(review?.contexts[0]).toMatchObject({
      candidateId: 'strong',
      occurrences: 9,
      cueStartSec: 80,
    });
  });

  it('caps the panel while reporting totals from the bounded workspace', () => {
    const candidates = Array.from(
      { length: STUDY_ANKI_LEECH_CONTEXT_LIMIT + 3 },
      (_unused, index) => candidate(`語${index}`, { occurrences: index + 1, timestamp: index }),
    );
    const { item, document } = fixture(candidates);
    const entries = candidates.map((entry, index): IntervalEntry => ({
      expression: entry.word,
      ivlDays: index,
      noteId: index + 1,
      modelName: 'Japanese',
      leech: true,
    }));
    const [review] = studyAnkiLeechReviews(
      [item],
      document,
      fingerprints,
      flagged(entries),
    );
    expect(review?.contexts).toHaveLength(STUDY_ANKI_LEECH_CONTEXT_LIMIT);
    expect(review?.totalMatches).toBe(candidates.length);
    expect(review?.leechCount).toBe(candidates.length);
  });

  it('requires current fingerprints and exact attached Japanese subtitles', () => {
    const entry = flagged([{
      expression: '魔法',
      ivlDays: 3,
      noteId: 1,
      modelName: 'Japanese',
      leech: true,
    }]);
    const stale = fixture();
    stale.readiness.knowledgeFingerprint = 'stale';
    expect(studyAnkiLeechReviews([stale.item], stale.document, fingerprints, entry)).toEqual([]);

    const detached = fixture();
    detached.item.subtitles = [];
    expect(studyAnkiLeechReviews(
      [detached.item],
      detached.document,
      fingerprints,
      entry,
    )).toEqual([]);

    const rebuilt = fixture();
    rebuilt.readiness.sourceFingerprint = 'subtitle-1:999:20:0:1200';
    expect(studyAnkiLeechReviews(
      [rebuilt.item],
      rebuilt.document,
      fingerprints,
      entry,
    )).toEqual([]);
  });

  it('rejects lookup-history workspaces and candidates without real cues', () => {
    const lookup = fixture(
      [candidate('魔法')],
      { context: { mediaId: 'media-1', sourceKind: 'lookup-history' } },
    );
    const entry = flagged([{
      expression: '魔法',
      ivlDays: 3,
      noteId: 1,
      modelName: 'Japanese',
      suspended: true,
    }]);
    expect(studyAnkiLeechReviews(
      [lookup.item],
      lookup.document,
      fingerprints,
      entry,
    )).toEqual([]);

    const invalid = fixture([
      candidate('魔法', { sentence: '  ' }),
      candidate('簡単', { timestamp: -1 }),
    ]);
    expect(studyAnkiLeechReviews(
      [invalid.item],
      invalid.document,
      fingerprints,
      entry,
    )).toEqual([]);
  });

  it('disappears as soon as the current Anki flags clear', () => {
    const { item, document } = fixture();
    expect(studyAnkiLeechReviews(
      [item],
      document,
      fingerprints,
      flagged([{
        expression: '魔法',
        ivlDays: 3,
        noteId: 1,
        modelName: 'Japanese',
      }]),
    )).toEqual([]);
  });
});

describe('Anki leech opportunity retirement', () => {
  it('retires a missing active renderer signal', () => {
    const opportunity: StudyOpportunity = {
      id: 'study-opportunity-anki-leech-abc',
      type: 'anki-leech-context',
      title: 'Anki trouble spot',
      explanation: 'Read-only context.',
      priority: 65,
      estimatedMinutes: 2,
      context: { mediaId: 'media-1' },
      evidence: [],
      actions: ['preview-anki-leech', 'open-context'],
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    };
    expect(syncStudyOpportunities(
      { [opportunity.id]: opportunity },
      [],
      2,
      { retireMissingActive: true },
    )).toEqual({ opportunities: {}, changed: true });
  });
});
