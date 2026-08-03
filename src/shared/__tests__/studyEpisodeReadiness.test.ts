import { describe, expect, it } from 'vitest';
import {
  createEmptyStudyOrchestratorDocument,
  STUDY_ANALYZER_VERSION,
  type StudyReadinessSnapshot,
  type StudyVocabularyWorkspace,
} from '../mediaStudyOrchestrator';
import {
  studyEpisodeReadinessRail,
  type StudyReadinessFingerprints,
} from '../studyEpisodeReadiness';
import type { MediaItem } from '../types';

const fingerprints: StudyReadinessFingerprints = {
  knowledgeFingerprint: 'known-v2',
  levelListsFingerprint: 'levels-v2',
  frequencyListsFingerprint: 'frequency-v2',
};

function media(
  id: string,
  episode: number,
  subtitleId?: string,
  patch: Partial<MediaItem> = {},
): MediaItem {
  return {
    id,
    title: `Series episode ${episode}`,
    path: `C:\\media\\${id}.mkv`,
    fileName: `${id}.mkv`,
    addedAt: 1,
    seriesKey: 'series',
    seriesTitle: 'Series',
    episode,
    ...(subtitleId ? {
      subtitles: [{
        id: subtitleId,
        lang: 'ja',
        source: 'sidecar',
        format: 'srt',
        path: `${subtitleId}.srt`,
        addedAt: 100 + episode,
      }],
    } : {}),
    ...patch,
  };
}

function readiness(item: MediaItem, patch: Partial<StudyReadinessSnapshot> = {}): StudyReadinessSnapshot {
  const subtitle = item.subtitles?.[0];
  return {
    id: `ready-${item.id}`,
    mediaId: item.id,
    analyzerVersion: STUDY_ANALYZER_VERSION,
    generatedAt: 1_000,
    sourceFingerprint: `${subtitle?.id}:${subtitle?.addedAt}:20:0:1200`,
    ...fingerprints,
    subtitleRecordId: subtitle?.id,
    subtitleReady: true,
    contentLevel: 'N3',
    confidence: 0.8,
    knownCoverage: 0.76,
    uniqueKnownCoverage: 0.7,
    totalWordOccurrences: 100,
    knownWordOccurrences: 76,
    unknownUniqueWords: 20,
    recurringUnknownWords: 6,
    category: 'short-preview',
    truncated: false,
    ...patch,
  };
}

function workspace(snapshot: StudyReadinessSnapshot): StudyVocabularyWorkspace {
  return {
    id: `workspace-${snapshot.mediaId}`,
    context: {
      mediaId: snapshot.mediaId,
      subtitleRecordId: snapshot.subtitleRecordId,
    },
    readinessId: snapshot.id,
    createdAt: 1_000,
    updatedAt: 1_000,
    candidates: [],
    filters: {
      excludedJlptLevels: [],
      minimumOccurrences: 1,
      excludeKnowledgeAtOrAbove: 2,
      excludeInternalDuplicates: true,
      excludeAnkiDuplicates: false,
      excludeAnkiMatureAtDays: null,
      excludeProperNouns: true,
      maximumCards: 30,
      rankingMode: 'frequency-unrated',
    },
    selectionIds: [],
    history: [],
    exports: [],
  };
}

it('shows trustworthy cached episodes in episode order with exact subtitle identity', () => {
  const first = media('episode-1', 1, 'sub-1');
  const second = media('episode-2', 2, 'sub-2', {
    episodeTitles: { 2: 'The second story' },
  });
  const firstReady = readiness(first);
  const secondReady = readiness(second, { knownCoverage: 0.91, category: 'ready-now' });
  const document = createEmptyStudyOrchestratorDocument();
  document.readiness = { [firstReady.id]: firstReady, [secondReady.id]: secondReady };
  document.workspaces = {
    first: workspace(firstReady),
    second: workspace(secondReady),
  };

  const rail = studyEpisodeReadinessRail(
    [second, first],
    document,
    first.id,
    fingerprints,
  );

  expect(rail.map((entry) => [entry.episode, entry.state])).toEqual([
    [1, 'ready'],
    [2, 'ready'],
  ]);
  expect(rail[1]).toMatchObject({
    mediaId: 'episode-2',
    title: 'The second story',
    subtitleRecordId: 'sub-2',
    readiness: { knownCoverage: 0.91 },
  });
});

it('distinguishes missing Japanese subtitles from an attached but unanalyzed track', () => {
  const missing = media('episode-1', 1);
  const englishOnly = media('episode-2', 2, undefined, {
    subtitles: [{
      id: 'sub-en',
      lang: 'en',
      source: 'sidecar',
      format: 'srt',
      path: 'sub-en.srt',
      addedAt: 10,
    }],
  });
  const unanalyzed = media('episode-3', 3, 'sub-ja');

  expect(studyEpisodeReadinessRail(
    [missing, englishOnly, unanalyzed],
    createEmptyStudyOrchestratorDocument(),
    missing.id,
    fingerprints,
  ).map((entry) => entry.state)).toEqual([
    'missing-subtitles',
    'missing-subtitles',
    'unanalyzed',
  ]);
});

it('does not present changed knowledge or detached workspace scores as current', () => {
  const item = media('episode-1', 1, 'sub-1');
  const snapshot = readiness(item, { knowledgeFingerprint: 'known-v1' });
  const document = createEmptyStudyOrchestratorDocument();
  document.readiness = { [snapshot.id]: snapshot };
  document.workspaces = { linked: workspace(snapshot) };

  expect(studyEpisodeReadinessRail(
    [item],
    document,
    item.id,
    fingerprints,
  )[0].state).toBe('stale');

  snapshot.knowledgeFingerprint = fingerprints.knowledgeFingerprint;
  document.workspaces = {};
  expect(studyEpisodeReadinessRail(
    [item],
    document,
    item.id,
    fingerprints,
  )[0].state).toBe('stale');
});

it('invalidates a score when the attached subtitle record version changes', () => {
  const item = media('episode-1', 1, 'sub-1');
  const snapshot = readiness(item);
  const document = createEmptyStudyOrchestratorDocument();
  document.readiness = { [snapshot.id]: snapshot };
  document.workspaces = { linked: workspace(snapshot) };
  const subtitle = item.subtitles?.[0];
  if (!subtitle) throw new Error('test fixture subtitle missing');
  item.subtitles = [{ ...subtitle, addedAt: 999 }];

  expect(studyEpisodeReadinessRail(
    [item],
    document,
    item.id,
    fingerprints,
  )[0].state).toBe('stale');
});

describe('series identity', () => {
  it('requires an authoritative episode anchor and excludes other series and extras', () => {
    const anchor = media('episode-1', 1, 'sub-1');
    const other = media('other-2', 2, 'sub-2', { seriesKey: 'other-series' });
    const opening = media('opening', 0, 'sub-op', { episodeKind: 'special' });
    const noIdentity = media('loose', 3, 'sub-3', { seriesKey: undefined });

    expect(studyEpisodeReadinessRail(
      [anchor, other, opening],
      createEmptyStudyOrchestratorDocument(),
      anchor.id,
      fingerprints,
    ).map((entry) => entry.mediaId)).toEqual(['episode-1']);
    expect(studyEpisodeReadinessRail(
      [noIdentity],
      createEmptyStudyOrchestratorDocument(),
      noIdentity.id,
      fingerprints,
    )).toEqual([]);
  });
});
