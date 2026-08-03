import { describe, expect, it } from 'vitest';
import {
  crossTitleReinforcementOpportunity,
  studyCrossTitleReinforcements,
} from '../studyCrossTitleReinforcement';
import {
  STUDY_ANALYZER_VERSION,
  createEmptyStudyOrchestratorDocument,
  syncStudyOpportunities,
  type StudyOrchestratorDocument,
  type StudyVocabularyCandidate,
} from '../mediaStudyOrchestrator';
import type { StudyReadinessFingerprints } from '../studyEpisodeReadiness';
import type { MediaItem } from '../types';

const fingerprints: StudyReadinessFingerprints = {
  knowledgeFingerprint: 'known',
  levelListsFingerprint: 'levels',
  frequencyListsFingerprint: 'frequency',
};

const candidate = (
  id: string,
  word = '魔法',
  reading = 'まほう',
  occurrences = 3,
): StudyVocabularyCandidate => ({
  id,
  word,
  surface: word,
  reading,
  occurrences,
  sentence: `${word}を使う。`,
  timestamp: Number(id.replace(/\D/g, '')) || 1,
  jlptLevel: 'N3',
  frequencyRank: 500,
  knowledgeLevel: 0,
  proper: false,
  internalDuplicate: false,
  ankiDuplicate: false,
});

function item(id: string, seriesKey: string, episode = 1): MediaItem {
  return {
    id,
    title: `${seriesKey} episode ${episode}`,
    seriesTitle: seriesKey,
    seriesKey,
    fileName: `${seriesKey}-${episode}.mkv`,
    path: `C:\\media\\${seriesKey}-${episode}.mkv`,
    addedAt: 1,
    episode,
    subtitles: [{
      id: `sub-${id}`,
      lang: 'ja',
      source: 'sidecar',
      format: 'srt',
      path: `${seriesKey}-${episode}.ja.srt`,
      addedAt: 100,
    }],
  };
}

function preparedDocument(
  items: readonly MediaItem[],
  candidatesByMedia: Readonly<Record<string, StudyVocabularyCandidate[]>>,
): StudyOrchestratorDocument {
  const document = createEmptyStudyOrchestratorDocument();
  for (const media of items) {
    const subtitle = media.subtitles?.[0];
    if (!subtitle) continue;
    const readinessId = `ready-${media.id}`;
    const workspaceId = `workspace-${media.id}`;
    document.readiness[readinessId] = {
      id: readinessId,
      mediaId: media.id,
      analyzerVersion: STUDY_ANALYZER_VERSION,
      generatedAt: 1_000,
      sourceFingerprint: `${subtitle.id}:${subtitle.addedAt}:text`,
      ...fingerprints,
      subtitleRecordId: subtitle.id,
      subtitleReady: true,
      contentLevel: 'N3',
      confidence: 0.9,
      knownCoverage: 0.7,
      uniqueKnownCoverage: 0.6,
      totalWordOccurrences: 100,
      knownWordOccurrences: 70,
      unknownUniqueWords: 10,
      recurringUnknownWords: 3,
      category: 'short-preview',
      truncated: false,
    };
    const candidates = candidatesByMedia[media.id] ?? [];
    document.workspaces[workspaceId] = {
      id: workspaceId,
      context: {
        mediaId: media.id,
        episode: media.episode,
        subtitleRecordId: subtitle.id,
      },
      readinessId,
      createdAt: 1_000,
      updatedAt: 1_000,
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
        rankingMode: 'frequency-unrated',
      },
      selectionIds: candidates.map((entry) => entry.id),
      history: [],
      exports: [],
    };
  }
  return document;
}

describe('studyCrossTitleReinforcements', () => {
  it('creates an exact comparison only after one lemma spans three titles', () => {
    const items = [item('a', 'Alpha'), item('b', 'Beta'), item('c', 'Gamma')];
    const document = preparedDocument(items, {
      a: [candidate('a1', '魔法', 'まほう', 2)],
      b: [candidate('b2', '魔法', 'まほう', 4)],
      c: [candidate('c3', '魔法', 'まほう', 3)],
    });

    const [result] = studyCrossTitleReinforcements(items, document, fingerprints);

    expect(result).toMatchObject({
      word: '魔法',
      reading: 'まほう',
      titleCount: 3,
      totalOccurrences: 9,
    });
    expect(result.contexts.map((context) => context.title)).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(result.contexts.every((context) =>
      context.subtitleRecordId === `sub-${context.mediaId}`
      && context.sentence === '魔法を使う。')).toBe(true);
  });

  it('collapses multiple episodes of the same series to one title and one representative line', () => {
    const items = [
      item('a1', 'Alpha', 1),
      item('a2', 'Alpha', 2),
      item('b', 'Beta'),
      item('c', 'Gamma'),
    ];
    const document = preparedDocument(items, {
      a1: [candidate('a1', '旅', 'たび', 2)],
      a2: [candidate('a2', '旅', 'たび', 5)],
      b: [candidate('b1', '旅', 'たび', 3)],
      c: [candidate('c1', '旅', 'たび', 3)],
    });

    const [result] = studyCrossTitleReinforcements(items, document, fingerprints);

    expect(result.titleCount).toBe(3);
    expect(result.totalOccurrences).toBe(13);
    const alpha = result.contexts.find((context) => context.title === 'Alpha');
    expect(alpha).toMatchObject({ mediaId: 'a2', episode: 2, occurrences: 7 });
  });

  it('does not count unselected, proper, or reading-mismatched candidates', () => {
    const items = [item('a', 'Alpha'), item('b', 'Beta'), item('c', 'Gamma')];
    const document = preparedDocument(items, {
      a: [candidate('a1')],
      b: [{ ...candidate('b1'), proper: true }],
      c: [candidate('c1', '魔法', 'まほ')],
    });
    document.workspaces['workspace-a'].selectionIds = [];

    expect(studyCrossTitleReinforcements(items, document, fingerprints)).toEqual([]);
  });

  it('rejects stale fingerprints and detached subtitle records', () => {
    const items = [item('a', 'Alpha'), item('b', 'Beta'), item('c', 'Gamma')];
    const document = preparedDocument(items, {
      a: [candidate('a1')],
      b: [candidate('b1')],
      c: [candidate('c1')],
    });
    document.readiness['ready-b'].knowledgeFingerprint = 'old';
    items[2].subtitles = [];

    expect(studyCrossTitleReinforcements(items, document, fingerprints)).toEqual([]);
  });

  it('does not fall back to an older workspace when the newest preparation is stale', () => {
    const items = [item('a', 'Alpha'), item('b', 'Beta'), item('c', 'Gamma')];
    const document = preparedDocument(items, {
      a: [candidate('a1')],
      b: [candidate('b1')],
      c: [candidate('c1')],
    });
    document.readiness['ready-a-new'] = {
      ...document.readiness['ready-a'],
      id: 'ready-a-new',
      knowledgeFingerprint: 'old',
    };
    document.workspaces['workspace-a-new'] = {
      ...document.workspaces['workspace-a'],
      id: 'workspace-a-new',
      readinessId: 'ready-a-new',
      updatedAt: 2_000,
    };

    expect(studyCrossTitleReinforcements(items, document, fingerprints)).toEqual([]);
  });

  it('does not treat ungrouped episodic filenames as distinct canonical titles', () => {
    const items = [item('a', 'Alpha'), item('b', 'Beta'), item('c', 'Gamma')];
    for (const media of items) {
      delete media.seriesKey;
      delete media.seriesTitle;
    }
    const document = preparedDocument(items, {
      a: [candidate('a1')],
      b: [candidate('b1')],
      c: [candidate('c1')],
    });

    expect(studyCrossTitleReinforcements(items, document, fingerprints)).toEqual([]);
  });

  it('caps visible contexts while retaining the true title and occurrence totals', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id, id.toUpperCase()));
    const document = preparedDocument(
      items,
      Object.fromEntries(items.map((media, index) => [
        media.id,
        [candidate(`${media.id}${index + 1}`, '見る', 'みる', index + 1)],
      ])),
    );

    const [result] = studyCrossTitleReinforcements(items, document, fingerprints);

    expect(result.titleCount).toBe(5);
    expect(result.totalOccurrences).toBe(15);
    expect(result.contexts).toHaveLength(4);
  });

  it('produces a persisted opportunity that starts a comparison rather than playback', () => {
    const items = [item('a', 'Alpha'), item('b', 'Beta'), item('c', 'Gamma')];
    const [reinforcement] = studyCrossTitleReinforcements(items, preparedDocument(items, {
      a: [candidate('a1')],
      b: [candidate('b1')],
      c: [candidate('c1')],
    }), fingerprints);

    const opportunity = crossTitleReinforcementOpportunity(reinforcement, 5_000);

    expect(opportunity).toMatchObject({
      id: reinforcement.opportunityId,
      type: 'cross-title-reinforcement',
      priority: 79,
      context: {
        subtitleRecordId: 'sub-a',
        cueStartSec: 1,
        returnTarget: { positionSec: 1 },
      },
      actions: ['compare-contexts', 'open-context'],
      createdAt: 5_000,
    });

    const stored = syncStudyOpportunities({}, [opportunity], 5_000, {
      retireMissingActive: true,
    });
    expect(stored.opportunities[opportunity.id]?.type).toBe('cross-title-reinforcement');
    expect(syncStudyOpportunities(stored.opportunities, [], 6_000, {
      retireMissingActive: true,
    }).opportunities[opportunity.id]).toBeUndefined();
  });
});
