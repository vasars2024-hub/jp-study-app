import { describe, expect, it } from 'vitest';
import {
  createEmptyStudyOrchestratorDocument,
  syncStudyOpportunities,
  type StudyOpportunity,
  type StudyOrchestratorDocument,
  type StudyVocabularyCandidate,
} from '../mediaStudyOrchestrator';
import {
  STUDY_SERIES_RECURRENCE_CONTEXT_LIMIT,
  STUDY_SERIES_RECURRENCE_LEMMA_LIMIT,
  studySeriesRecurrenceForecasts,
} from '../studySeriesRecurrenceForecast';
import type { StudyReadinessFingerprints } from '../studyEpisodeReadiness';
import type { MediaItem } from '../types';

const fingerprints: StudyReadinessFingerprints = {
  knowledgeFingerprint: 'knowledge',
  levelListsFingerprint: 'levels',
  frequencyListsFingerprint: 'frequency',
};

function candidate(
  id: string,
  word = '魔法',
  reading = 'まほう',
  patch: Partial<StudyVocabularyCandidate> = {},
): StudyVocabularyCandidate {
  return {
    id,
    word,
    surface: word,
    reading,
    meaning: `${word} meaning`,
    occurrences: 3,
    sentence: `${word}が必要だ。`,
    timestamp: Number(id.replace(/\D/g, '')) || 1,
    jlptLevel: 'N3',
    frequencyRank: 500,
    knowledgeLevel: 0,
    proper: false,
    internalDuplicate: false,
    ankiDuplicate: false,
    ...patch,
  };
}

function episode(
  id: string,
  number: number,
  patch: Partial<MediaItem> = {},
): MediaItem {
  return {
    id,
    title: `The Big O - ${String(number).padStart(2, '0')}`,
    seriesTitle: 'The Big O',
    seriesKey: 'the-big-o',
    path: `C:\\media\\big-o-${number}.mkv`,
    fileName: `big-o-${number}.mkv`,
    addedAt: number,
    season: 1,
    episode: number,
    episodeKind: 'episode',
    subtitles: [{
      id: `sub-${id}`,
      lang: 'ja',
      source: 'sidecar',
      format: 'srt',
      path: `C:\\media\\big-o-${number}.ja.srt`,
      addedAt: 100 + number,
    }],
    ...patch,
  };
}

function preparedDocument(
  items: readonly MediaItem[],
  candidatesByMedia: Readonly<Record<string, StudyVocabularyCandidate[]>>,
  selections: Readonly<Record<string, string[]>> = {},
): StudyOrchestratorDocument {
  const document = createEmptyStudyOrchestratorDocument();
  for (const item of items) {
    const subtitle = item.subtitles?.[0];
    if (!subtitle) continue;
    const readinessId = `ready-${item.id}`;
    const workspaceId = `workspace-${item.id}`;
    document.readiness[readinessId] = {
      id: readinessId,
      mediaId: item.id,
      analyzerVersion: 2,
      generatedAt: 1_000 + item.addedAt,
      sourceFingerprint: `${subtitle.id}:${subtitle.addedAt}:prepared`,
      ...fingerprints,
      subtitleRecordId: subtitle.id,
      subtitleReady: true,
      contentLevel: 'N3',
      confidence: 0.9,
      knownCoverage: 0.75,
      uniqueKnownCoverage: 0.7,
      totalWordOccurrences: 100,
      knownWordOccurrences: 75,
      unknownUniqueWords: 20,
      recurringUnknownWords: 8,
      category: 'short-preview',
      truncated: false,
    };
    const candidates = candidatesByMedia[item.id] ?? [];
    document.workspaces[workspaceId] = {
      id: workspaceId,
      context: {
        mediaId: item.id,
        episode: item.episode,
        subtitleRecordId: subtitle.id,
      },
      readinessId,
      createdAt: 1_000,
      updatedAt: 1_000 + item.addedAt,
      candidates,
      filters: {
        excludedJlptLevels: [],
        minimumOccurrences: 1,
        excludeKnowledgeAtOrAbove: 2,
        excludeInternalDuplicates: true,
        excludeAnkiDuplicates: true,
        excludeAnkiMatureAtDays: 21,
        excludeProperNouns: true,
        maximumCards: 30,
        rankingMode: 'frequency-all',
      },
      selectionIds: selections[item.id] ?? candidates.map((entry) => entry.id),
      history: [],
      exports: [],
    };
  }
  return document;
}

describe('studySeriesRecurrenceForecasts', () => {
  it('ranks selected lemmas by recurrence in later prepared normal episodes', () => {
    const items = [episode('e1', 1), episode('e2', 2), episode('e3', 3)];
    const document = preparedDocument(items, {
      e1: [
        candidate('magic-1', '魔法', 'まほう', { occurrences: 2 }),
        candidate('promise-1', '約束', 'やくそく', { occurrences: 4 }),
      ],
      e2: [
        candidate('magic-2', '魔法', 'まほう', { occurrences: 5, timestamp: 42 }),
        candidate('promise-2', '約束', 'やくそく', { occurrences: 8 }),
      ],
      e3: [candidate('magic-3', '魔法', 'まほう', { occurrences: 3, timestamp: 96 })],
    });

    const forecast = studySeriesRecurrenceForecasts(items, document, fingerprints)
      .find((entry) => entry.episode === 1);

    expect(forecast).toMatchObject({
      seriesTitle: 'The Big O',
      mediaId: 'e1',
      episode: 1,
      subtitleRecordId: 'sub-e1',
      upcomingPreparedEpisodes: 2,
      totalRecurringLemmas: 2,
      totalFutureOccurrences: 16,
    });
    expect(forecast?.lemmas.map((lemma) => lemma.word)).toEqual(['魔法', '約束']);
    expect(forecast?.lemmas[0]).toMatchObject({
      futureEpisodeCount: 2,
      futureOccurrences: 8,
      contexts: [
        { mediaId: 'e2', episode: 2, subtitleRecordId: 'sub-e2', cueStartSec: 42 },
        { mediaId: 'e3', episode: 3, subtitleRecordId: 'sub-e3', cueStartSec: 96 },
      ],
    });
  });

  it('requires an anchor selection but treats all future candidates as recurrence evidence', () => {
    const items = [episode('e1', 1), episode('e2', 2)];
    const document = preparedDocument(items, {
      e1: [candidate('selected', '魔法'), candidate('not-selected', '約束')],
      e2: [candidate('future', '魔法'), candidate('future-other', '約束')],
    }, {
      e1: ['selected'],
      e2: [],
    });

    const [forecast] = studySeriesRecurrenceForecasts(items, document, fingerprints);

    expect(forecast?.lemmas.map((lemma) => lemma.word)).toEqual(['魔法']);
  });

  it('matches normalized lemma and reading rather than surface alone', () => {
    const items = [episode('e1', 1), episode('e2', 2)];
    const document = preparedDocument(items, {
      e1: [candidate('anchor', '生', 'なま')],
      e2: [
        candidate('wrong-reading', '生', 'せい'),
        candidate('right', '生', 'なま', { surface: '生の' }),
      ],
    });

    const [forecast] = studySeriesRecurrenceForecasts(items, document, fingerprints);

    expect(forecast?.lemmas[0]).toMatchObject({
      word: '生',
      reading: 'なま',
      futureEpisodeCount: 1,
    });
    expect(forecast?.lemmas[0].contexts[0]?.sentence).toBe('生が必要だ。');
  });

  it('excludes proper names and candidates without exact stored cue context', () => {
    const items = [episode('e1', 1), episode('e2', 2)];
    const document = preparedDocument(items, {
      e1: [
        candidate('name-1', 'ロジャー', '', { proper: true }),
        candidate('blank-1', '魔法', 'まほう', { sentence: '  ' }),
        candidate('valid-1', '約束', 'やくそく'),
      ],
      e2: [
        candidate('name-2', 'ロジャー', '', { proper: true }),
        candidate('blank-2', '魔法', 'まほう'),
        candidate('invalid-future', '約束', 'やくそく', { timestamp: -1 }),
      ],
    });

    expect(studySeriesRecurrenceForecasts(items, document, fingerprints)).toEqual([]);
  });

  it('rejects specials, OVAs, credits, and other non-normal episode identities', () => {
    const items = [
      episode('e1', 1),
      episode('special', 2, { episodeKind: 'special' }),
      episode('ova', 3, { episodeKind: 'ova' }),
      episode('credits', 0, {
        episode: undefined,
        episodeKind: 'special',
        title: 'The Big O NCED',
      }),
    ];
    const document = preparedDocument(items, Object.fromEntries(items.map((item) => [
      item.id,
      [candidate(`magic-${item.id}`)],
    ])));

    expect(studySeriesRecurrenceForecasts(items, document, fingerprints)).toEqual([]);
  });

  it('collapses duplicate releases of one canonical episode', () => {
    const items = [
      episode('e1', 1),
      episode('e2-old', 2, { addedAt: 2 }),
      episode('e2-new', 2, { addedAt: 200 }),
    ];
    const document = preparedDocument(items, {
      e1: [candidate('magic-1')],
      'e2-old': [candidate('magic-old', '魔法', 'まほう', { occurrences: 20 })],
      'e2-new': [candidate('magic-new', '魔法', 'まほう', { occurrences: 4 })],
    });

    const [forecast] = studySeriesRecurrenceForecasts(items, document, fingerprints);

    expect(forecast).toMatchObject({
      upcomingPreparedEpisodes: 1,
      totalFutureOccurrences: 4,
    });
    expect(forecast?.lemmas[0].contexts).toEqual([
      expect.objectContaining({ mediaId: 'e2-new', occurrences: 4 }),
    ]);
  });

  it('requires current fingerprints and exact attached Japanese subtitle records', () => {
    const items = [episode('e1', 1), episode('e2', 2), episode('e3', 3)];
    const document = preparedDocument(items, {
      e1: [candidate('magic-1')],
      e2: [candidate('magic-2')],
      e3: [candidate('magic-3')],
    });
    document.readiness['ready-e2'].knowledgeFingerprint = 'stale';
    const third = items[2];
    if (third) third.subtitles = [];

    expect(studySeriesRecurrenceForecasts(items, document, fingerprints)).toEqual([]);
  });

  it('does not fall back to an older preparation when the newest workspace is stale', () => {
    const items = [episode('e1', 1), episode('e2', 2)];
    const document = preparedDocument(items, {
      e1: [candidate('magic-1')],
      e2: [candidate('magic-2')],
    });
    const oldReadiness = document.readiness['ready-e2'];
    const oldWorkspace = document.workspaces['workspace-e2'];
    if (!oldReadiness || !oldWorkspace) throw new Error('Missing prepared fixture');
    document.readiness['ready-e2-new'] = {
      ...oldReadiness,
      id: 'ready-e2-new',
      knowledgeFingerprint: 'stale',
    };
    document.workspaces['workspace-e2-new'] = {
      ...oldWorkspace,
      id: 'workspace-e2-new',
      readinessId: 'ready-e2-new',
      updatedAt: 9_000,
    };

    expect(studySeriesRecurrenceForecasts(items, document, fingerprints)).toEqual([]);
  });

  it('keeps series separate and rejects ungrouped episodic files', () => {
    const e1 = episode('e1', 1);
    const other = episode('other', 2, {
      seriesKey: 'other-series',
      seriesTitle: 'Other series',
    });
    const document = preparedDocument([e1, other], {
      e1: [candidate('magic-1')],
      other: [candidate('magic-2')],
    });
    expect(studySeriesRecurrenceForecasts([e1, other], document, fingerprints)).toEqual([]);

    delete e1.seriesKey;
    delete e1.seriesTitle;
    delete other.seriesKey;
    delete other.seriesTitle;
    expect(studySeriesRecurrenceForecasts([e1, other], document, fingerprints)).toEqual([]);
  });

  it('orders upcoming episodes by season before episode number', () => {
    const items = [
      episode('s1e12', 12, { season: 1 }),
      episode('s2e1', 1, { season: 2 }),
    ];
    const document = preparedDocument(items, {
      s1e12: [candidate('magic-1')],
      s2e1: [candidate('magic-2')],
    });

    const [forecast] = studySeriesRecurrenceForecasts(items, document, fingerprints);

    expect(forecast).toMatchObject({ mediaId: 's1e12', season: 1, episode: 12 });
    expect(forecast?.lemmas[0].contexts[0]).toMatchObject({ season: 2, episode: 1 });
  });

  it('caps the preview while retaining honest lemma, episode, and occurrence totals', () => {
    const items = Array.from({ length: STUDY_SERIES_RECURRENCE_CONTEXT_LIMIT + 2 }, (_, index) =>
      episode(`e${index + 1}`, index + 1));
    const lemmas = Array.from({ length: STUDY_SERIES_RECURRENCE_LEMMA_LIMIT + 3 }, (_, index) =>
      candidate(`anchor-${index}`, `語${index}`, `ご${index}`, { occurrences: 1 }));
    const candidatesByMedia = Object.fromEntries(items.map((item, episodeIndex) => [
      item.id,
      episodeIndex === 0
        ? lemmas
        : lemmas.map((entry, index) => candidate(
          `future-${episodeIndex}-${index}`,
          entry.word,
          entry.reading,
          { occurrences: 2 },
        )),
    ]));
    const document = preparedDocument(items, candidatesByMedia);

    const forecast = studySeriesRecurrenceForecasts(items, document, fingerprints)
      .find((entry) => entry.episode === 1);

    expect(forecast?.totalRecurringLemmas).toBe(lemmas.length);
    expect(forecast?.lemmas).toHaveLength(STUDY_SERIES_RECURRENCE_LEMMA_LIMIT);
    expect(forecast?.upcomingPreparedEpisodes).toBe(items.length - 1);
    expect(forecast?.lemmas[0].futureEpisodeCount).toBe(items.length - 1);
    expect(forecast?.lemmas[0].contexts).toHaveLength(STUDY_SERIES_RECURRENCE_CONTEXT_LIMIT);
    expect(forecast?.totalFutureOccurrences).toBe(lemmas.length * (items.length - 1) * 2);
  });
});

describe('series recurrence opportunity retirement', () => {
  it('retires a missing active renderer signal', () => {
    const opportunity: StudyOpportunity = {
      id: 'study-opportunity-series-recurrence-abc',
      type: 'series-recurrence-forecast',
      title: 'Words worth keeping',
      explanation: 'Prepared future recurrence.',
      priority: 64,
      estimatedMinutes: 3,
      context: { mediaId: 'e1' },
      evidence: [],
      actions: ['preview-series-recurrence', 'open-context'],
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
