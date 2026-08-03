import { describe, expect, it } from 'vitest';
import {
  staleQueueCleanupOpportunity,
  staleQueueItemsStillValid,
  studyStaleQueueCleanup,
  studyStaleQueueItems,
} from '../studyStaleQueueCleanup';
import {
  createEmptyStudyOrchestratorDocument,
  syncStudyOpportunities,
  type StudyOpportunity,
  type StudyOrchestratorDocument,
  type StudyVocabularyCandidate,
  type StudyVocabularyWorkspace,
} from '../mediaStudyOrchestrator';
import type { MediaItem } from '../types';
import type { SubtitleRecord } from '../subtitleRecord';

const now = 1_700_000_000_000;

const japaneseRecord: SubtitleRecord = {
  id: 'sub-ja',
  lang: 'ja',
  source: 'sidecar',
  format: 'srt',
  path: 'C:/media/the-big-o-01.ja.srt',
  addedAt: now - 90_000_000,
};

function media(patch: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media-1',
    title: 'The Big O',
    fileName: 'the-big-o-01.mkv',
    kind: 'video',
    path: 'C:/media/the-big-o-01.mkv',
    addedAt: now - 100_000_000,
    subtitles: [japaneseRecord],
    ...patch,
  } as MediaItem;
}

function candidate(index: number, patch: Partial<StudyVocabularyCandidate> = {}): StudyVocabularyCandidate {
  return {
    id: `candidate-${index}`,
    word: `単語${index}`,
    surface: `単語${index}`,
    reading: `たんご${index}`,
    occurrences: 2,
    sentence: `単語${index}の文。`,
    timestamp: index * 10,
    jlptLevel: 'N3',
    knowledgeLevel: 0,
    proper: false,
    internalDuplicate: false,
    ankiDuplicate: false,
    ...patch,
  };
}

function workspace(patch: Partial<StudyVocabularyWorkspace> = {}): StudyVocabularyWorkspace {
  const candidates = [candidate(0), candidate(1), candidate(2)];
  return {
    id: 'workspace-media-1',
    context: {
      mediaId: 'media-1',
      subtitleRecordId: 'sub-ja',
      returnTarget: { section: 'video', mediaId: 'media-1', positionSec: 12 },
    },
    readinessId: 'ready-media-1',
    createdAt: now - 80_000_000,
    updatedAt: now - 10_000,
    candidates,
    filters: {
      excludedJlptLevels: [],
      minimumOccurrences: 1,
      excludeKnowledgeAtOrAbove: 2,
      excludeInternalDuplicates: true,
      excludeAnkiDuplicates: true,
      excludeAnkiMatureAtDays: null,
      excludeProperNouns: true,
      maximumCards: null,
      rankingMode: 'frequency-unrated',
    },
    selectionIds: candidates.map((entry) => entry.id),
    history: [],
    exports: [],
    ...patch,
  };
}

function opportunity(patch: Partial<StudyOpportunity> = {}): StudyOpportunity {
  return {
    id: 'study-opportunity-continue-session-media-1',
    type: 'continue-session',
    title: 'Continue The Big O',
    explanation: 'Your prepared session is ready to restore.',
    priority: 100,
    estimatedMinutes: 1,
    context: { mediaId: 'media-1', sessionId: 'session-1' },
    evidence: [{ code: 'unfinished-session', label: 'Unfinished Study session' }],
    actions: ['resume', 'open-context'],
    status: 'active',
    createdAt: now - 90_000_000,
    updatedAt: now - 60_000,
    ...patch,
  };
}

function document(
  entries: readonly StudyOpportunity[],
  workspaces: readonly StudyVocabularyWorkspace[] = [workspace()],
): StudyOrchestratorDocument {
  const value = createEmptyStudyOrchestratorDocument();
  for (const entry of entries) value.opportunities[entry.id] = entry;
  for (const entry of workspaces) value.workspaces[entry.id] = entry;
  return value;
}

describe('studyStaleQueueItems', () => {
  it('retires an item whose media left the library', () => {
    const items = studyStaleQueueItems([media({ id: 'media-2' })], document([opportunity()]));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      opportunityId: 'study-opportunity-continue-session-media-1',
      reason: 'media-removed',
      status: 'active',
    });
    expect(items[0]?.mediaTitle).toBeUndefined();
  });

  it('never treats an unloaded library as removed media', () => {
    expect(studyStaleQueueItems([], document([opportunity()]))).toEqual([]);
  });

  it('retires an item whose exact Japanese subtitle record is gone', () => {
    const stale = studyStaleQueueItems(
      [media({ subtitles: [] })],
      document([opportunity({
        context: { mediaId: 'media-1', subtitleRecordId: 'sub-ja' },
      })]),
    );

    expect(stale).toMatchObject([{
      reason: 'subtitle-removed',
      mediaTitle: 'The Big O',
    }]);
  });

  it('retires an item whose attached record is no longer Japanese', () => {
    const stale = studyStaleQueueItems(
      [media({ subtitles: [{ ...japaneseRecord, lang: 'en' }] })],
      document([opportunity({
        context: { mediaId: 'media-1', subtitleRecordId: 'sub-ja' },
      })]),
    );

    expect(stale).toMatchObject([{ reason: 'subtitle-removed' }]);
  });

  it('retires vocabulary debt once every selected word is exported or learned', () => {
    const prepared = workspace({
      exports: [
        { candidateId: 'candidate-0', status: 'created', localCardId: 'card-0' },
        { candidateId: 'candidate-1', status: 'duplicate' },
      ],
    });
    const stale = studyStaleQueueItems(
      [media()],
      document([opportunity()], [prepared]),
      { 単語2: 3 },
    );

    expect(stale).toMatchObject([{
      reason: 'debt-resolved',
      workspaceId: 'workspace-media-1',
      exportedWords: 2,
      learnedWords: 1,
      mediaTitle: 'The Big O',
    }]);
    expect(stale[0]?.detail).toContain('3 selected words');
  });

  it('keeps debt that is only partly finished', () => {
    const prepared = workspace({
      exports: [
        { candidateId: 'candidate-0', status: 'created', localCardId: 'card-0' },
        { candidateId: 'candidate-1', status: 'failed', error: 'AnkiConnect refused' },
      ],
    });

    expect(studyStaleQueueItems([media()], document([opportunity()], [prepared]))).toEqual([]);
  });

  it('does not count a word known below the mined threshold', () => {
    const prepared = workspace({
      exports: [
        { candidateId: 'candidate-0', status: 'created' },
        { candidateId: 'candidate-1', status: 'created' },
      ],
    });

    expect(studyStaleQueueItems(
      [media()],
      document([opportunity()], [prepared]),
      { 単語2: 1 },
    )).toEqual([]);
  });

  it('never retires a merely stale analysis, because refreshing is the truthful action', () => {
    const value = document([opportunity()]);
    value.readiness['ready-media-1'] = {
      id: 'ready-media-1',
      mediaId: 'media-1',
      analyzerVersion: 0,
      generatedAt: now - 80_000_000,
      sourceFingerprint: 'sub-ja:1:2:3:4',
      knowledgeFingerprint: 'outdated',
      levelListsFingerprint: 'outdated',
      frequencyListsFingerprint: 'outdated',
      subtitleRecordId: 'sub-ja',
      subtitleReady: true,
      contentLevel: 'N2',
      confidence: 0.5,
      knownCoverage: 0.2,
      uniqueKnownCoverage: 0.2,
      totalWordOccurrences: 100,
      knownWordOccurrences: 20,
      unknownUniqueWords: 30,
      recurringUnknownWords: 8,
      category: 'productive-challenge',
      truncated: false,
    };

    expect(studyStaleQueueItems([media()], value)).toEqual([]);
  });

  it('leaves reminders that survive finished vocabulary work', () => {
    const prepared = workspace({
      exports: [
        { candidateId: 'candidate-0', status: 'created' },
        { candidateId: 'candidate-1', status: 'created' },
        { candidateId: 'candidate-2', status: 'created' },
      ],
    });
    const watching = opportunity({
      id: 'study-opportunity-prepared-unwatched-media-1',
      type: 'prepared-unwatched',
      title: 'Watch your prepared The Big O',
    });

    expect(studyStaleQueueItems([media()], document([watching], [prepared]))).toEqual([]);
  });

  it('ignores already dismissed items and the cleanup recommendation itself', () => {
    const dismissed = opportunity({ status: 'dismissed', dismissedAt: now - 1_000 });
    const cleanup = opportunity({
      id: 'study-opportunity-stale-queue-cleanup-abc',
      type: 'stale-queue-cleanup',
      context: { mediaId: 'media-gone' },
      actions: ['preview-queue-cleanup'],
    });

    expect(studyStaleQueueItems([media()], document([dismissed, cleanup]))).toEqual([]);
  });

  it('includes snoozed debt and records its status', () => {
    const snoozed = opportunity({
      status: 'snoozed',
      snoozedUntil: now + 86_400_000,
      context: { mediaId: 'media-gone' },
    });

    expect(studyStaleQueueItems([media()], document([snoozed]))).toMatchObject([{
      reason: 'media-removed',
      status: 'snoozed',
    }]);
  });
});

describe('studyStaleQueueCleanup', () => {
  it('summarizes reasons and anchors to a title that still exists', () => {
    const prepared = workspace({
      exports: [
        { candidateId: 'candidate-0', status: 'created' },
        { candidateId: 'candidate-1', status: 'created' },
        { candidateId: 'candidate-2', status: 'created' },
      ],
    });
    const orphan = opportunity({
      id: 'study-opportunity-continue-session-media-gone',
      title: 'Continue Removed Title',
      context: { mediaId: 'media-gone' },
    });
    const cleanup = studyStaleQueueCleanup(
      [media()],
      document([opportunity(), orphan], [prepared]),
    );

    expect(cleanup).not.toBeNull();
    expect(cleanup?.items).toHaveLength(2);
    expect(cleanup?.debtResolved).toBe(1);
    expect(cleanup?.mediaRemoved).toBe(1);
    expect(cleanup?.anchorContext.mediaId).toBe('media-1');
    expect(cleanup?.opportunityId).toMatch(/^study-opportunity-stale-queue-cleanup-/);
  });

  it('returns nothing when the queue is current', () => {
    expect(studyStaleQueueCleanup([media()], document([opportunity()]))).toBeNull();
  });

  it('keeps its identity stable while the stale set is unchanged', () => {
    const value = document([opportunity({ context: { mediaId: 'media-gone' } })]);
    const first = studyStaleQueueCleanup([media()], value);
    const second = studyStaleQueueCleanup([media()], value);

    expect(first?.opportunityId).toBe(second?.opportunityId);
  });
});

function requireCleanup(value: StudyOrchestratorDocument) {
  const cleanup = studyStaleQueueCleanup([media()], value);
  if (!cleanup) throw new Error('Expected a stale queue cleanup.');
  return cleanup;
}

describe('staleQueueCleanupOpportunity', () => {
  it('previews rather than acts, and carries per-reason evidence', () => {
    const cleanup = requireCleanup(
      document([opportunity({ context: { mediaId: 'media-gone' } })]),
    );
    const candidate = staleQueueCleanupOpportunity(cleanup, now);

    expect(candidate).toMatchObject({
      type: 'stale-queue-cleanup',
      actions: ['preview-queue-cleanup'],
      status: 'active',
      priority: 73,
    });
    expect(candidate.title).toBe('Clear 1 outdated Study item');
    expect(candidate.evidence.map((entry) => entry.code)).toEqual([
      'stale-queue-total',
      'stale-queue-media-removed',
    ]);
  });

  it('is retired by the existing sync once nothing is stale', () => {
    const cleanup = requireCleanup(
      document([opportunity({ context: { mediaId: 'media-gone' } })]),
    );
    const candidate = staleQueueCleanupOpportunity(cleanup, now);
    const { opportunities } = syncStudyOpportunities({}, [candidate], now);

    const retired = syncStudyOpportunities(opportunities, [], now, { retireMissingActive: true });

    expect(opportunities[candidate.id]).toBeDefined();
    expect(retired.opportunities[candidate.id]).toBeUndefined();
    expect(retired.changed).toBe(true);
  });
});

describe('staleQueueItemsStillValid', () => {
  it('is false once an item has been retired, and true beforehand', () => {
    const value = document([opportunity({ context: { mediaId: 'media-gone' } })]);
    const cleanup = requireCleanup(value);
    const [first] = cleanup.items;
    if (!first) throw new Error('Expected one stale item.');
    const retired = value.opportunities[first.opportunityId];
    if (!retired) throw new Error('Expected the stale item to be persisted.');

    expect(staleQueueItemsStillValid(cleanup, value)).toBe(true);

    const applied: StudyOrchestratorDocument = {
      ...value,
      opportunities: {
        ...value.opportunities,
        [first.opportunityId]: { ...retired, status: 'dismissed', dismissedAt: now },
      },
    };

    expect(staleQueueItemsStillValid(cleanup, applied)).toBe(false);
  });
});
