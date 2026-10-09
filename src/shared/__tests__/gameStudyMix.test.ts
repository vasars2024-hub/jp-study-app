import { describe, expect, it } from 'vitest';
import {
  adaptiveTuning,
  DEFAULT_TUNING,
  iPlusOneScore,
  isStudyTarget,
  pickWarmUp,
  studyMixSlots,
  studyWordStatus,
  summarizeArenaProgress,
} from '../gameStudyMix';

const NOW = new Date(2026, 9, 8, 12).getTime();
const DAY = 86_400_000;

describe('where a word stands', () => {
  it('reads the card schedule first, then the known-word level', () => {
    expect(studyWordStatus({ dueAt: NOW - 1, intervalDays: 30 }, 3, NOW)).toBe('due');
    expect(studyWordStatus({ dueAt: NOW + DAY, intervalDays: 2 }, 0, NOW)).toBe('learning');
    expect(studyWordStatus({ dueAt: NOW + 10 * DAY, intervalDays: 21 }, 0, NOW)).toBe('known');
    expect(studyWordStatus(undefined, 3, NOW)).toBe('known');
    expect(studyWordStatus(undefined, 1, NOW)).toBe('learning');
    expect(studyWordStatus(null, 0, NOW)).toBe('new');
    expect(isStudyTarget('due')).toBe(true);
    expect(isStudyTarget('learning')).toBe(true);
    expect(isStudyTarget('known')).toBe(false);
  });
});

describe('i+1 mixing', () => {
  it('deals a target word about one round in `every`, from the first round', () => {
    expect(studyMixSlots(6, 3, true, true)).toEqual([true, false, false, true, false, false]);
    // Nothing known to surround them: every round is a target.
    expect(studyMixSlots(3, 3, true, false)).toEqual([true, true, true]);
    // Nothing to study: no target rounds at all.
    expect(studyMixSlots(3, 3, false, true)).toEqual([false, false, false]);
  });

  it('prefers sentences whose other words are known', () => {
    expect(iPlusOneScore(0)).toBeGreaterThan(iPlusOneScore(1));
    expect(iPlusOneScore(1)).toBeGreaterThan(iPlusOneScore(2));
    expect(iPlusOneScore(5)).toBe(0);
  });
});

describe('adaptive difficulty', () => {
  const session = (accuracy: number, ago: number, gameId = 'cloze-blitz') => ({ gameId, accuracy, createdAt: NOW - ago });

  it('needs two sessions of this game before it moves anything', () => {
    expect(adaptiveTuning([session(1, 1)], 'cloze-blitz')).toEqual(DEFAULT_TUNING);
    expect(adaptiveTuning([session(1, 1, 'word-match'), session(1, 2, 'word-match')], 'cloze-blitz')).toEqual(DEFAULT_TUNING);
  });

  it('steps up after aced games and down after hard ones, judging only the last three', () => {
    const up = adaptiveTuning([session(0.95, 1), session(1, 2), session(0.92, 3), session(0.1, 4)], 'cloze-blitz');
    expect(up).toMatchObject({ levelDelta: 1, reason: 'up' });
    expect(up.targetEvery).toBeLessThan(DEFAULT_TUNING.targetEvery);
    expect(up.secondsPerRound).toBeLessThan(DEFAULT_TUNING.secondsPerRound);
    const down = adaptiveTuning([session(0.4, 1), session(0.6, 2), session(0.5, 3)], 'cloze-blitz');
    expect(down).toMatchObject({ levelDelta: -1, reason: 'down' });
    expect(down.secondsPerRound).toBeGreaterThan(DEFAULT_TUNING.secondsPerRound);
    expect(adaptiveTuning([session(0.8, 1), session(0.7, 2)], 'cloze-blitz')).toEqual(DEFAULT_TUNING);
  });
});

describe("today's warm-up", () => {
  const base = { studyLang: 'ja' as const, dueCloze: 0, dueReadable: 0, dueVocab: 0, deckCards: 0, canListen: false };

  it('picks the game that exercises what is due', () => {
    expect(pickWarmUp({ ...base, dueCloze: 5, dueReadable: 5, dueVocab: 5 }, 1)).toMatchObject({ gameId: 'cloze-blitz', material: 'due' });
    // Listening on alternate days when it can be heard.
    expect(pickWarmUp({ ...base, dueCloze: 5, canListen: true }, 2)).toMatchObject({ gameId: 'listening-flash', reason: 'due-listening' });
    expect(pickWarmUp({ ...base, dueReadable: 3, dueVocab: 3 })).toMatchObject({ gameId: 'kanji-reading' });
    expect(pickWarmUp({ ...base, dueVocab: 3 })).toMatchObject({ gameId: 'reverse-recall' });
    expect(pickWarmUp({ ...base, deckCards: 10 })).toMatchObject({ gameId: 'word-match', material: 'auto' });
    expect(pickWarmUp(base)).toMatchObject({ gameId: 'kana-sprint', reason: 'starter' });
    expect(pickWarmUp({ ...base, studyLang: 'ru' })).toMatchObject({ gameId: 'sentence-builder' });
    expect(pickWarmUp(base).rounds).toBe(5);
  });
});

describe('Arena progress for Statistics', () => {
  const now = new Date(2026, 9, 8, 12);
  const recent = (accuracies: number[]) => accuracies.map((accuracy, i) => ({
    gameId: 'cloze-blitz', score: 50, accuracy, createdAt: now.getTime() - i * DAY,
  }));

  it('ends a play streak whose last day is before yesterday', () => {
    expect(summarizeArenaProgress({ xp: 10, streak: 4, lastPlayedDay: '2026-10-07', recent: [], highScores: [] }, now).streak).toBe(4);
    expect(summarizeArenaProgress({ xp: 10, streak: 4, lastPlayedDay: '2026-10-05', recent: [], highScores: [] }, now).streak).toBe(0);
  });

  it('counts the week, averages recent accuracy, reads the trend and ranks best scores', () => {
    const summary = summarizeArenaProgress({
      xp: 120,
      streak: 2,
      lastPlayedDay: '2026-10-08',
      recent: recent([1, 1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5]),
      highScores: [
        { gameId: 'word-match', score: 70, accuracy: 0.7, level: 2 },
        { gameId: 'cloze-blitz', score: 90, accuracy: 0.9, level: 3 },
        { gameId: 'cloze-blitz', score: 60, accuracy: 0.6, level: 1 },
      ],
    }, now);
    expect(summary.sessionsThisWeek).toBe(7);
    expect(summary.recentAccuracy).toBeCloseTo(0.75);
    expect(summary.trend).toBe('up');
    expect(summary.best.map((b) => [b.gameId, b.score])).toEqual([['cloze-blitz', 90], ['word-match', 70]]);
    expect(summarizeArenaProgress({ xp: 0, streak: 0, recent: [], highScores: [] }, now)).toMatchObject({
      recentAccuracy: null, trend: null, best: [],
    });
  });
});
