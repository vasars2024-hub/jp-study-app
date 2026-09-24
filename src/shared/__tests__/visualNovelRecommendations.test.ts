import { describe, expect, it } from 'vitest';
import type { MediaLanguageProfile } from '../mediaStudyDatabase';
import { createVisualNovelEntry, type VisualNovelSourceResult } from '../visualNovel';
import {
  buildVisualNovelLearnerContext,
  estimateVisualNovelDifficultyPrior,
  rankVisualNovelEntries,
  rankVisualNovelSourceResults,
  visualNovelCandidateRequest,
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

  it('ranks VNDB candidates by estimated difficulty against the learner, not only by interest', () => {
    const base: Omit<VisualNovelSourceResult, 'providerId' | 'title' | 'tags'> = {
      provider: 'vndb' as const,
      japaneseTitle: '',
      alternativeTitles: [],
      developer: '',
      releaseDate: '',
      platforms: [],
      characters: [],
      synopsis: '',
      estimatedPlaytimeHours: 20,
      coverImageUrl: '',
      screenshotUrls: [],
      communityRating: 8,
      communityVoteCount: 500,
      sourceUrl: '',
    };
    const beginner = {
      targetDifficultyScore: 40,
      targetJlpt: 'N4' as const,
      knownCoverage: 0.6,
      preferredTags: [],
      analyzedTitles: 1,
    };
    const results = [
      { ...base, providerId: 'v-hard', title: 'Hard', tags: ['Science Fiction', 'Philosophy', 'Mystery'] },
      { ...base, providerId: 'v-easy', title: 'Easy', tags: ['Slice of Life', 'Comedy', 'School Life'] },
    ];
    const forBeginner = rankVisualNovelSourceResults(results, beginner);
    expect(forBeginner.map((item) => item.item.providerId)).toEqual(['v-easy', 'v-hard']);
    expect(forBeginner[0]).toMatchObject({ difficultySource: 'vndb' });
    const forAdvanced = rankVisualNovelSourceResults(results, { ...beginner, targetDifficultyScore: 85, targetJlpt: 'N1' });
    expect(forAdvanced.map((item) => item.item.providerId)).toEqual(['v-hard', 'v-easy']);
    // A title with no Japanese release sinks.
    const noJapanese = rankVisualNovelSourceResults([
      { ...results[1], providerId: 'v-en', languages: ['en'] },
      { ...results[1], providerId: 'v-ja', languages: ['ja', 'en'] },
    ], beginner);
    expect(noJapanese[0].item.providerId).toBe('v-ja');
  });

  it('estimates a difficulty prior from VNDB tags and length alone', () => {
    const easy = estimateVisualNovelDifficultyPrior({ tags: ['Slice of Life', 'Comedy'], estimatedPlaytimeHours: 6 });
    const hard = estimateVisualNovelDifficultyPrior({ tags: ['Science Fiction', 'Time Travel', 'Conspiracy'], estimatedPlaytimeHours: 60 });
    expect(easy.score).toBeLessThan(hard.score);
    expect(hard.jlpt).toBe('N1');
  });

  it('asks VNDB for tags the learner likes and excludes what is already in the library', () => {
    const request = visualNovelCandidateRequest(
      [{ sourceIds: { vndb: 'v2002' } }, { sourceIds: {} }] as unknown as Parameters<typeof visualNovelCandidateRequest>[0],
      { targetDifficultyScore: 55, targetJlpt: 'N3', knownCoverage: null, preferredTags: ['Mystery', 'Time Travel', 'Romance', 'Drama'], analyzedTitles: 0 },
    );
    expect(request).toEqual({ tags: ['Mystery', 'Time Travel', 'Romance'], excludeProviderIds: ['v2002'] });
  });
});
