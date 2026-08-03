import { describe, expect, it } from 'vitest';
import type { MediaLanguageProfile } from '../mediaStudyDatabase';
import { createVisualNovelEntry, type VisualNovelSourceResult } from '../visualNovel';
import {
  buildVisualNovelLearnerContext,
  rankVisualNovelEntries,
  rankVisualNovelSourceResults,
} from '../visualNovelRecommendations';

const profile = (
  mediaId: string,
  score: number,
  knownRatio: number,
): MediaLanguageProfile => ({
  mediaId,
  title: mediaId,
  updatedAt: 1,
  analyzedCharacters: 1000,
  truncated: false,
  difficulty: {
    score,
    band: 'intermediate',
    jlptLevel: 'N3',
    confidence: 0.8,
    knownRatio,
    unknownRatio: 1 - knownRatio,
    recommendation: '',
  },
  vocabulary: {
    totalOccurrences: 0,
    uniqueWords: 0,
    knownWordsEstimate: 0,
    unknownWordsEstimate: 0,
    jlptDistribution: {},
    top: [],
  },
  kanji: { totalOccurrences: 0, uniqueKanji: 0, jlptDistribution: {}, top: [] },
  grammar: { totalPoints: 0, jlptDistribution: {}, points: [] },
  sentences: { total: 0, sample: [] },
});

describe('visual novel recommendations', () => {
  it('infers ability and interests from analyzed and completed titles', () => {
    const completed = {
      ...createVisualNovelEntry({ title: 'Completed' }, 'done', 1),
      status: 'completed' as const,
      genres: ['Mystery'],
      tags: ['Science fiction'],
    };
    const context = buildVisualNovelLearnerContext(
      [completed],
      { 'vn:done': profile('vn:done', 58, 0.86) },
    );

    expect(context).toMatchObject({
      targetJlpt: 'N3',
      knownCoverage: 0.86,
      preferredTags: ['Mystery', 'Science fiction'],
      analyzedTitles: 1,
    });
  });

  it('ranks a suitably difficult interest match above an unprofiled mismatch', () => {
    const preferred = {
      ...createVisualNovelEntry({ title: 'Preferred' }, 'preferred', 1),
      genres: ['Mystery'],
      communityRating: 8.8,
      communityVoteCount: 5000,
    };
    const mismatch = {
      ...createVisualNovelEntry({ title: 'Mismatch' }, 'mismatch', 1),
      genres: ['Sports'],
    };
    const history = {
      ...createVisualNovelEntry({ title: 'History' }, 'history', 1),
      status: 'completed' as const,
      genres: ['Mystery'],
    };
    const ranked = rankVisualNovelEntries(
      [preferred, mismatch, history],
      {
        'vn:history': profile('vn:history', 55, 0.84),
        'vn:preferred': profile('vn:preferred', 57, 0.82),
      },
    );

    expect(ranked.recommendations.map((item) => item.item.id)).toEqual(['preferred', 'mismatch']);
    expect(ranked.recommendations[0].reasons).toContain('Matches Mystery');
  });

  it('uses interest and community signals for unanalysed source results', () => {
    const context = {
      targetDifficultyScore: 55,
      targetJlpt: 'N3' as const,
      knownCoverage: 0.8,
      preferredTags: ['Mystery'],
      analyzedTitles: 1,
    };
    const base: Omit<
      VisualNovelSourceResult,
      'providerId' | 'title' | 'tags' | 'communityRating'
    > = {
      provider: 'vndb' as const,
      japaneseTitle: '',
      alternativeTitles: [],
      developer: '',
      releaseDate: '',
      platforms: [],
      characters: [],
      synopsis: '',
      estimatedPlaytimeHours: 30,
      coverImageUrl: '',
      screenshotUrls: [],
      communityVoteCount: 1000,
      sourceUrl: '',
    };
    const ranked = rankVisualNovelSourceResults([
      { ...base, providerId: 'v1', title: 'Match', tags: ['Mystery'], communityRating: 8.5 },
      { ...base, providerId: 'v2', title: 'Other', tags: ['Sports'], communityRating: 7 },
    ], context);

    expect(ranked.map((item) => item.item.providerId)).toEqual(['v1', 'v2']);
  });
});
