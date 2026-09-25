import { describe, expect, it } from 'vitest';
import {
  createEmptyMediaStudyDatabase,
  difficultyBandFromJlpt,
  finishMediaStudySession,
  normalizeMediaStudyDatabase,
  recordMediaStudyAction,
  summarizeMediaStudySessions,
  updateMediaStudySession,
  upsertMediaLanguageProfile,
  type MediaLanguageProfile,
} from '../mediaStudyDatabase';

const profile = (updatedAt = 10): MediaLanguageProfile => ({
  mediaId: 'frieren-1',
  title: 'Frieren',
  updatedAt,
  analyzedCharacters: 1000,
  truncated: false,
  difficulty: {
    score: 56,
    band: 'intermediate',
    jlptLevel: 'N3',
    confidence: 0.86,
    knownRatio: 0.8,
    unknownRatio: 0.2,
    recommendation: 'Challenging but suitable.',
  },
  vocabulary: {
    totalOccurrences: 100,
    uniqueWords: 40,
    knownWordsEstimate: 30,
    unknownWordsEstimate: 10,
    jlptDistribution: { N3: 20, Unknown: 20 },
    top: [],
  },
  kanji: {
    totalOccurrences: 80,
    uniqueKanji: 25,
    jlptDistribution: { N3: 10, Unknown: 15 },
    top: [],
  },
  grammar: {
    totalPoints: 2,
    jlptDistribution: { N3: 2 },
    points: [],
  },
  sentences: { total: 20, sample: [] },
});

describe('media study database', () => {
  it('normalizes malformed input into a versioned safe document', () => {
    const normalized = normalizeMediaStudyDatabase({
      version: 99,
      profiles: {
        valid: { ...profile(), difficulty: { ...profile().difficulty, knownRatio: 4 } },
        invalid: { mediaId: '' },
      },
      sessions: [{ id: '', mediaId: '' }],
    });

    expect(normalized.version).toBe(1);
    expect(Object.keys(normalized.profiles)).toEqual(['frieren-1']);
    expect(normalized.profiles['frieren-1'].difficulty.knownRatio).toBe(1);
    expect(normalized.sessions).toEqual([]);
  });

  it('upserts language profiles and maps JLPT bands', () => {
    const database = upsertMediaLanguageProfile(createEmptyMediaStudyDatabase(), profile());
    expect(database.profiles['frieren-1'].vocabulary.uniqueWords).toBe(40);
    expect(difficultyBandFromJlpt('N5')).toBe('beginner');
    expect(difficultyBandFromJlpt('N2')).toBe('advanced');
    expect(difficultyBandFromJlpt('N1')).toBe('native');
  });

  it('records, updates, finishes, and summarizes study sessions', () => {
    const started = recordMediaStudyAction(createEmptyMediaStudyDatabase(), {
      mediaId: 'frieren-1',
      title: 'Frieren',
      action: 'mine-vocabulary',
      positionSec: 12,
    }, 1000);
    const continued = recordMediaStudyAction(started.database, {
      mediaId: 'frieren-1',
      title: 'Frieren',
      action: 'review-sentences',
      positionSec: 20,
    }, 2000);
    const progressed = updateMediaStudySession(continued.database, continued.session.id, {
      vocabularyMined: 40,
      sentencesReviewed: 2,
      cardsCreated: 5,
      positionSec: 30,
    }, 3000);
    const finished = finishMediaStudySession(progressed, continued.session.id, 35, 6000);
    const summary = summarizeMediaStudySessions(finished.sessions, 'frieren-1');

    expect(finished.sessions[0]).toMatchObject({
      endedAt: 6000,
      durationSec: 5,
      startPositionSec: 12,
      endPositionSec: 35,
      vocabularyMined: 40,
      sentencesReviewed: 2,
      cardsCreated: 5,
    });
    expect(finished.sessions[0].actions.map((event) => event.action)).toEqual([
      'mine-vocabulary',
      'review-sentences',
    ]);
    expect(summary).toMatchObject({
      sessionCount: 1,
      totalDurationSec: 5,
      vocabularyMined: 40,
      sentencesReviewed: 2,
      cardsCreated: 5,
    });
  });

  it('closes a previous active media session when a different title starts', () => {
    const first = recordMediaStudyAction(createEmptyMediaStudyDatabase(), {
      mediaId: 'one',
      title: 'One',
      action: 'study-episode',
    }, 1000);
    const second = recordMediaStudyAction(first.database, {
      mediaId: 'two',
      title: 'Two',
      action: 'study-episode',
    }, 4000);

    expect(second.database.sessions).toHaveLength(2);
    expect(second.database.sessions.find((session) => session.mediaId === 'one')).toMatchObject({
      endedAt: 4000,
      durationSec: 3,
    });
  });
});

describe('difficulty bands on every study language scale', () => {
  it('maps HSK and CEFR levels as well as JLPT', async () => {
    const { difficultyBandFromJlpt } = await import('../mediaStudyDatabase');
    expect(difficultyBandFromJlpt('HSK2')).toBe('beginner');
    expect(difficultyBandFromJlpt('HSK4')).toBe('intermediate');
    expect(difficultyBandFromJlpt('B2')).toBe('advanced');
    expect(difficultyBandFromJlpt('C1')).toBe('native');
    expect(difficultyBandFromJlpt('N3')).toBe('intermediate');
  });
});
