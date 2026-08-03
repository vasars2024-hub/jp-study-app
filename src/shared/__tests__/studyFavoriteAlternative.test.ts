import { describe, expect, it } from 'vitest';
import {
  createEmptyStudyOrchestratorDocument,
  readinessCategory,
  STUDY_ANALYZER_VERSION,
  type StudyReadinessSnapshot,
} from '../mediaStudyOrchestrator';
import {
  STUDY_FAVORITE_ALTERNATIVE_RESULT_LIMIT,
  studyFavoriteAlternatives,
} from '../studyFavoriteAlternative';
import type { StudyReadinessFingerprints } from '../studyEpisodeReadiness';
import type { MediaItem } from '../types';

const fingerprints: StudyReadinessFingerprints = {
  knowledgeFingerprint: 'known-current',
  levelListsFingerprint: 'levels-current',
  frequencyListsFingerprint: 'frequency-current',
};

function media(
  id: string,
  patch: Partial<MediaItem> = {},
): MediaItem {
  return {
    id,
    title: id,
    path: `C:\\media\\${id}.mkv`,
    fileName: `${id}.mkv`,
    addedAt: 1,
    favorite: true,
    subtitles: [{
      id: `subtitle-${id}`,
      lang: 'ja',
      source: 'sidecar',
      format: 'srt',
      path: `${id}.srt`,
      addedAt: 100,
    }],
    ...patch,
  };
}

function readiness(
  item: MediaItem,
  knownCoverage: number,
  patch: Partial<StudyReadinessSnapshot> = {},
): StudyReadinessSnapshot {
  const subtitle = item.subtitles?.[0];
  return {
    id: `readiness-${item.id}`,
    mediaId: item.id,
    analyzerVersion: STUDY_ANALYZER_VERSION,
    generatedAt: 1_000,
    sourceFingerprint: `${subtitle?.id}:${subtitle?.addedAt}:20:0:1200`,
    ...fingerprints,
    subtitleRecordId: subtitle?.id,
    subtitleReady: true,
    contentLevel: 'N3',
    confidence: 0.9,
    knownCoverage,
    uniqueKnownCoverage: knownCoverage,
    totalWordOccurrences: 100,
    knownWordOccurrences: Math.round(knownCoverage * 100),
    unknownUniqueWords: 20,
    recurringUnknownWords: 6,
    category: readinessCategory(knownCoverage),
    truncated: false,
    ...patch,
  };
}

function project(items: MediaItem[], snapshots: StudyReadinessSnapshot[]) {
  const document = createEmptyStudyOrchestratorDocument();
  document.readiness = Object.fromEntries(snapshots.map((snapshot) => [
    snapshot.id,
    snapshot,
  ]));
  return studyFavoriteAlternatives(items, document, fingerprints);
}

it('opens the easiest current favorite instead of an overwhelming favorite', () => {
  const harder = media('harder', { title: 'Hard favorite', positionSec: 48 });
  const preview = media('preview', { title: 'Preview favorite' });
  const easiest = media('easiest', {
    title: 'Easy favorite',
    episode: 2,
    positionSec: 91,
  });

  const [suggestion] = project(
    [harder, preview, easiest],
    [
      readiness(harder, 0.42),
      readiness(preview, 0.74),
      readiness(easiest, 0.9),
    ],
  );

  expect(suggestion).toMatchObject({
    harder: {
      mediaId: 'harder',
      title: 'Hard favorite',
      knownCoverage: 0.42,
      category: 'save-for-later',
    },
    easier: {
      mediaId: 'easiest',
      title: 'Easy favorite',
      episode: 2,
      positionSec: 91,
      subtitleRecordId: 'subtitle-easiest',
      readinessId: 'readiness-easiest',
      knownCoverage: 0.9,
      category: 'ready-now',
    },
  });
  expect(suggestion?.coverageDelta).toBeCloseTo(0.48);
  expect(suggestion?.opportunityId).toMatch(
    /^study-opportunity-easier-favorite-alternative-/,
  );
});

it('uses snapshots without requiring a prepared vocabulary workspace', () => {
  const harder = media('harder');
  const easier = media('easier');

  expect(project(
    [harder, easier],
    [readiness(harder, 0.4), readiness(easier, 0.72)],
  )).toHaveLength(1);
});

it('excludes non-favorites on either side of the comparison', () => {
  const harder = media('harder');
  const easier = media('easier', { favorite: false });

  expect(project(
    [harder, easier],
    [readiness(harder, 0.4), readiness(easier, 0.9)],
  )).toEqual([]);

  harder.favorite = false;
  easier.favorite = true;
  expect(project(
    [harder, easier],
    [readiness(harder, 0.4), readiness(easier, 0.9)],
  )).toEqual([]);
});

describe('current-cache guard', () => {
  it('recommends nothing when the overwhelming favorite merely needs a refresh', () => {
    const harder = media('harder');
    const easier = media('easier');

    expect(project(
      [harder, easier],
      [
        readiness(harder, 0.4, { knowledgeFingerprint: 'known-stale' }),
        readiness(easier, 0.9),
      ],
    )).toEqual([]);
  });

  it('does not use a stale easier favorite as the alternative', () => {
    const harder = media('harder');
    const easier = media('easier');
    const easierReadiness = readiness(easier, 0.9);
    const subtitle = easier.subtitles?.[0];
    if (!subtitle) throw new Error('subtitle fixture missing');
    easier.subtitles = [{ ...subtitle, addedAt: 101 }];

    expect(project(
      [harder, easier],
      [readiness(harder, 0.4), easierReadiness],
    )).toEqual([]);
  });

  it('requires the current analyzer and all list fingerprints', () => {
    const harder = media('harder');
    const easier = media('easier');

    expect(project(
      [harder, easier],
      [
        readiness(harder, 0.4),
        readiness(easier, 0.9, {
          analyzerVersion: STUDY_ANALYZER_VERSION - 1,
          frequencyListsFingerprint: 'frequency-stale',
        }),
      ],
    )).toEqual([]);
  });
});

it('requires a save-for-later target and a short-preview-or-easier alternative', () => {
  const productive = media('productive');
  const tooHard = media('too-hard');
  const alternative = media('alternative');

  expect(project(
    [productive, alternative],
    [readiness(productive, 0.55), readiness(alternative, 0.9)],
  )).toEqual([]);
  expect(project(
    [tooHard, alternative],
    [readiness(tooHard, 0.4), readiness(alternative, 0.699)],
  )).toEqual([]);
  expect(project(
    [tooHard, alternative],
    [
      readiness(tooHard, 0.9, { category: 'save-for-later' }),
      readiness(alternative, 0.91),
    ],
  )).toEqual([]);
});

it('prioritizes queued hard favorites and keeps the result bounded', () => {
  const easier = media('easier');
  const hard = Array.from(
    { length: STUDY_FAVORITE_ALTERNATIVE_RESULT_LIMIT + 2 },
    (_, index) => media(`hard-${index}`, {
      studyQueue: index === STUDY_FAVORITE_ALTERNATIVE_RESULT_LIMIT + 1,
    }),
  );
  const suggestions = project(
    [easier, ...hard],
    [readiness(easier, 0.9), ...hard.map((item, index) => readiness(item, 0.3 + index * 0.01))],
  );

  expect(suggestions).toHaveLength(STUDY_FAVORITE_ALTERNATIVE_RESULT_LIMIT);
  expect(suggestions[0]?.harder.mediaId).toBe(
    `hard-${STUDY_FAVORITE_ALTERNATIVE_RESULT_LIMIT + 1}`,
  );
});
