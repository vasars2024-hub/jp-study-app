import { describe, expect, it } from 'vitest';
import {
  createEmptyStudyOrchestratorDocument,
  type StudyOrchestratorDocument,
  type StudyReadinessSnapshot,
  type StudyVocabularyCandidate,
  type StudyVocabularyWorkspace,
} from '../mediaStudyOrchestrator';
import {
  STUDY_PROPER_NAME_LIMIT,
  properNameContextLine,
  properNameFurigana,
  properNameReviewStillCurrent,
  studyProperNameReviews,
} from '../studyProperNameReview';
import type { StudyReadinessFingerprints } from '../studyEpisodeReadiness';
import type { MediaItem } from '../types';

const now = 2_000_000_000_000;
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
    sentence: `${id}が来た。`,
    occurrences: 4,
    timestamp: 30,
    jlptLevel: null,
    knowledgeLevel: 0,
    proper: true,
    internalDuplicate: false,
    ankiDuplicate: false,
    ...patch,
  };
}

function fixture(
  candidates: StudyVocabularyCandidate[] = [
    candidate('ロジャー', { reading: 'ロジャー', occurrences: 12, timestamp: 41 }),
    candidate('ドロシー', { reading: 'ドロシー', occurrences: 7, timestamp: 96 }),
    candidate('ノーマン', { reading: 'ノーマン', occurrences: 3, timestamp: 210 }),
  ],
  workspacePatch: Partial<StudyVocabularyWorkspace> = {},
): { item: MediaItem; document: StudyOrchestratorDocument; readiness: StudyReadinessSnapshot } {
  const item = {
    id: 'media-1',
    title: 'Prepared drama',
    fileName: 'prepared.mkv',
    episode: 1,
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

describe('studyProperNameReviews', () => {
  it('projects a bounded recurring-name set from existing proper-noun candidates', () => {
    const { item, document } = fixture();
    const [review] = studyProperNameReviews([item], document, fingerprints);

    expect(review).toMatchObject({
      mediaId: item.id,
      episode: 1,
      workspaceId: 'workspace-1',
      readinessId: 'readiness-1',
      subtitleRecordId: 'subtitle-1',
      totalNames: 3,
      totalOccurrences: 22,
      selectedNames: 0,
      excludeProperNouns: true,
    });
    // Highest recurrence first, with the exact cue that produced it.
    expect(review?.names.map((entry) => [entry.word, entry.occurrences, entry.cueStartSec]))
      .toEqual([
        ['ロジャー', 12, 41],
        ['ドロシー', 7, 96],
        ['ノーマン', 3, 210],
      ]);
    expect(review?.names.every((entry) => !entry.selected)).toBe(true);
  });

  it('requires a cluster of genuinely recurring, still-unknown names', () => {
    expect(studyProperNameReviews(
      [fixture().item],
      fixture([
        candidate('a', { occurrences: 9 }),
        candidate('b', { occurrences: 9 }),
      ]).document,
      fingerprints,
    )).toEqual([]);

    // Two appearances is a passing mention.
    expect(studyProperNameReviews(
      [fixture().item],
      fixture([
        candidate('a', { occurrences: 9 }),
        candidate('b', { occurrences: 9 }),
        candidate('c', { occurrences: 2 }),
      ]).document,
      fingerprints,
    )).toEqual([]);

    // A name the user already knows needs no review.
    expect(studyProperNameReviews(
      [fixture().item],
      fixture([
        candidate('a', { occurrences: 9 }),
        candidate('b', { occurrences: 9 }),
        candidate('c', { occurrences: 9, knowledgeLevel: 2 }),
      ]).document,
      fingerprints,
    )).toEqual([]);
  });

  it('uses the analyzer proper-noun tag only and never ordinary vocabulary', () => {
    const { item, document } = fixture([
      candidate('a', { occurrences: 9 }),
      candidate('b', { occurrences: 9 }),
      candidate('c', { occurrences: 9, proper: false }),
    ]);
    expect(studyProperNameReviews([item], document, fingerprints)).toEqual([]);
  });

  it('collapses internal duplicates without losing the in-cards fact', () => {
    const { item, document } = fixture(
      [
        candidate('one', { word: '十郎', reading: 'じゅうろう', occurrences: 5, timestamp: 12 }),
        candidate('one-dup', {
          word: '十郎',
          reading: 'じゅうろう',
          occurrences: 9,
          timestamp: 80,
        }),
        candidate('two', { word: '花子', reading: 'はなこ', occurrences: 6, timestamp: 33 }),
        candidate('three', { word: '東京', reading: 'とうきょう', occurrences: 4, timestamp: 55 }),
      ],
      {
        filters: {
          excludedJlptLevels: [],
          minimumOccurrences: 1,
          excludeKnowledgeAtOrAbove: 2,
          excludeInternalDuplicates: true,
          excludeAnkiDuplicates: false,
          excludeAnkiMatureAtDays: null,
          excludeProperNouns: false,
          maximumCards: 30,
          rankingMode: 'frequency-all',
        },
        selectionIds: ['one', 'two'],
      },
    );
    const [review] = studyProperNameReviews([item], document, fingerprints);

    expect(review?.totalNames).toBe(3);
    expect(review?.excludeProperNouns).toBe(false);
    expect(review?.selectedNames).toBe(2);
    // The stronger duplicate wins the cue, but the selected copy still counts.
    expect(review?.names[0]).toMatchObject({
      word: '十郎',
      candidateId: 'one-dup',
      occurrences: 9,
      cueStartSec: 80,
      selected: true,
    });
    expect(review?.totalOccurrences).toBe(19);
  });

  it('skips candidates the analysis already marked as internal duplicates', () => {
    const { item, document } = fixture([
      candidate('a', { occurrences: 9 }),
      candidate('b', { occurrences: 9 }),
      candidate('c', { occurrences: 9, internalDuplicate: true }),
    ]);
    expect(studyProperNameReviews([item], document, fingerprints)).toEqual([]);
  });

  it('requires a real cue for every entry', () => {
    const { item, document } = fixture([
      candidate('a', { occurrences: 9 }),
      candidate('b', { occurrences: 9 }),
      candidate('c', { occurrences: 9, sentence: '   ' }),
      candidate('d', { occurrences: 9, timestamp: -1 }),
    ]);
    expect(studyProperNameReviews([item], document, fingerprints)).toEqual([]);
  });

  it('caps the displayed set while reporting the honest totals', () => {
    const many = Array.from({ length: STUDY_PROPER_NAME_LIMIT + 4 }, (_unused, index) =>
      candidate(`name-${index}`, { occurrences: 20 - index, timestamp: index }));
    const { item, document } = fixture(many);
    const [review] = studyProperNameReviews([item], document, fingerprints);

    expect(review?.names).toHaveLength(STUDY_PROPER_NAME_LIMIT);
    expect(review?.totalNames).toBe(many.length);
    expect(review?.totalOccurrences).toBe(
      many.reduce((sum, entry) => sum + entry.occurrences, 0),
    );
  });

  it('rejects stale fingerprints and detached subtitle provenance', () => {
    const stale = fixture();
    stale.readiness.knowledgeFingerprint = 'stale';
    expect(studyProperNameReviews([stale.item], stale.document, fingerprints)).toEqual([]);

    const detached = fixture();
    detached.item.subtitles = [];
    expect(studyProperNameReviews([detached.item], detached.document, fingerprints)).toEqual([]);

    const rebuilt = fixture();
    rebuilt.readiness.sourceFingerprint = 'subtitle-1:999:20:0:1200';
    expect(studyProperNameReviews([rebuilt.item], rebuilt.document, fingerprints)).toEqual([]);
  });
});

describe('properNameFurigana', () => {
  it('withholds a reading that only repeats the surface', () => {
    // Every katakana name in real data does this — ドロシー reads ドロシー.
    expect(properNameFurigana({ word: 'ドロシー', reading: 'ドロシー' })).toBe('');
    expect(properNameFurigana({ word: 'ドロシー', reading: ' ドロシー ' })).toBe('');
    expect(properNameFurigana({ word: 'アンドロイド', reading: '' })).toBe('');
  });

  it('keeps a reading that genuinely differs', () => {
    expect(properNameFurigana({ word: '造幣局', reading: 'ゾウヘイキョク' }))
      .toBe('ゾウヘイキョク');
  });
});

describe('properNameContextLine', () => {
  it('withholds a cue that is nothing but the name', () => {
    expect(properNameContextLine({ word: 'ノーマン', sentence: 'ノーマン' })).toBe('');
    expect(properNameContextLine({ word: 'ドロシー', sentence: 'ドロシー ドロシー' })).toBe('');
    expect(properNameContextLine({ word: 'ドロシー', sentence: 'ドロシー　ドロシー' })).toBe('');
    expect(properNameContextLine({ word: 'アンドロイド', sentence: '   ' })).toBe('');
  });

  it('keeps a cue that says something around the name', () => {
    expect(properNameContextLine({ word: 'ロジャー', sentence: '私の名はロジャー・スミス' }))
      .toBe('私の名はロジャー・スミス');
    expect(properNameContextLine({ word: 'ドロシー', sentence: 'おお ドロシーツー' }))
      .toBe('おお ドロシーツー');
  });
});

describe('properNameReviewStillCurrent', () => {
  it('accepts an unchanged workspace', () => {
    const { item, document } = fixture();
    const [review] = studyProperNameReviews([item], document, fingerprints);
    expect(review && properNameReviewStillCurrent(review, document)).toBe(true);
  });

  it('refuses once the selection, candidates, or proper-noun filter moved', () => {
    const { item, document } = fixture();
    const [review] = studyProperNameReviews([item], document, fingerprints);
    if (!review) throw new Error('expected a review');

    const reselected = fixture();
    reselected.document.workspaces['workspace-1'].selectionIds = [review.names[0].candidateId];
    expect(properNameReviewStillCurrent(review, reselected.document)).toBe(false);

    const refiltered = fixture();
    refiltered.document.workspaces['workspace-1'].filters.excludeProperNouns = false;
    expect(properNameReviewStillCurrent(review, refiltered.document)).toBe(false);

    const reanalyzed = fixture();
    reanalyzed.document.workspaces['workspace-1'].candidates = [];
    expect(properNameReviewStillCurrent(review, reanalyzed.document)).toBe(false);

    expect(properNameReviewStillCurrent(review, createEmptyStudyOrchestratorDocument()))
      .toBe(false);
  });
});
