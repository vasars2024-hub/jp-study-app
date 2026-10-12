// @vitest-environment node
/**
 * The deterministic halves of the grammar, statistics, planning, onboarding and
 * Blanc AI helpers — what the learner gets with AI off, not ready or failing.
 */
import { describe, expect, it } from 'vitest';
import {
  consistentGrammarRating,
  grammarExplainFallback,
  grammarPatternFragments,
  grammarProductionFallback,
  sentenceShowsGrammarPattern,
} from '../aiGrammarTutor';
import { buildStatsDigest, normalizeStatsDigest, statsRuleTips, type StatsDigest } from '../aiStatsCoach';
import {
  eventDraftExtraDates,
  goalHistoryFrom,
  parseEventText,
  snapGoalTarget,
  suggestDailyGoalTargets,
  type GoalHistory,
} from '../aiStudyPlanner';
import { gradePlacementQuiz, placementBandFromExamLevel, placementLevelIndex, type PlacementItem } from '../aiOnboarding';
import { blancMistakeDiff } from '../aiBlancTutor';
import { studyDataCloudGate } from '../aiTutorCommon';
import type { ReviewLogEntry } from '../reviewLog';

describe('grammar fallbacks', () => {
  it('reads a pattern title for its fixed parts and where it attaches', () => {
    expect(grammarPatternFragments('も〜ば〜も', 'ja')).toEqual(['も', 'ば', 'も']);
    expect(grammarExplainFallback({ title: '〜てください', lang: 'ja' })).toEqual({ attach: 'after', fragments: ['てください'] });
    expect(grammarExplainFallback({ title: 'お〜になる', lang: 'ja' }).attach).toBe('frame');
    expect(grammarExplainFallback({ title: 'お〜', lang: 'ja' }).attach).toBe('before');
    expect(grammarExplainFallback({ title: '是…的', lang: 'zh' })).toEqual({ attach: 'frame', fragments: ['是', '的'] });
    expect(grammarExplainFallback({ title: 'だから', lang: 'ja' }).attach).toBe('standalone');
  });

  it('accepts a conjugated pattern and rejects a sentence without it', () => {
    expect(sentenceShowsGrammarPattern('早く寝るようにしています。', '〜ようにする', 'ja')).toBe(true);
    expect(sentenceShowsGrammarPattern('座ってください。', '〜てください', 'ja')).toBe(true);
    expect(sentenceShowsGrammarPattern('今日は暑い。', '〜ようにする', 'ja')).toBe(false);
    expect(sentenceShowsGrammarPattern('我是坐火车来的。', '是…的', 'zh')).toBe(true);
    expect(sentenceShowsGrammarPattern('Если бы я знал!', 'Если бы + past', 'ru')).toBe(true);
  });

  it('production without AI: pattern present → Okay, missing → Hard', () => {
    const p = { title: '〜ようにする', lang: 'ja' as const };
    expect(grammarProductionFallback('野菜を食べるようにする。', p, false)).toEqual({ usesPattern: true, suggestedRating: 'okay' });
    expect(grammarProductionFallback('野菜を食べる。', p, false)).toEqual({ usesPattern: false, suggestedRating: 'hard' });
    expect(grammarProductionFallback('野菜を食べる。', p, true).usesPattern).toBe(true);
  });

  it('a suggested rating can never contradict the verdict', () => {
    expect(consistentGrammarRating({ usesPattern: false, correct: true, natural: true }, 'good')).toBe('hard');
    expect(consistentGrammarRating({ usesPattern: true, correct: false, natural: true }, 'good')).toBe('hard');
    expect(consistentGrammarRating({ usesPattern: true, correct: true, natural: false }, 'good')).toBe('okay');
    expect(consistentGrammarRating({ usesPattern: true, correct: true, natural: true }, 'hard')).toBe('okay');
    expect(consistentGrammarRating({ usesPattern: true, correct: true, natural: true }, 'good')).toBe('good');
  });
});

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 11, 20, 0, 0).getTime();

function review(at: number, correct: boolean, prev = 30, isNew = false): ReviewLogEntry {
  return { at, mode: 'review', correct, prevIntervalDays: prev, isNew } as ReviewLogEntry;
}

describe('stats digest and rule tips', () => {
  it('summarizes the log and deck as numbers only', () => {
    const entries: ReviewLogEntry[] = [];
    for (let d = 0; d < 10; d += 1) {
      for (let i = 0; i < 10; i += 1) entries.push(review(NOW - d * DAY - i * 60_000, i < 7));
    }
    const cards = [
      ...Array.from({ length: 6 }, () => ({ srs: { dueAt: NOW - DAY, lapses: 9 } })),
      { suspended: true, srs: { dueAt: NOW - DAY, lapses: 20 } },
      { srs: { dueAt: NOW + 2 * DAY, lapses: 0 } },
    ];
    const digest = buildStatsDigest({ entries, cards, rangeDays: 30, now: NOW });
    expect(digest).toMatchObject({ reviews: 100, activeDays: 10, retentionPct: 70, leeches: 6 });
    expect(digest.dueNext7[0]).toBe(6);
    expect(digest.dueNext7[2]).toBe(1);
    expect(JSON.stringify(digest)).not.toMatch(/[぀-ヿ一-鿿]/u);
  });

  it('turns the numbers into 3-5 concrete tips, padding only when needed', () => {
    const base: StatsDigest = normalizeStatsDigest({
      rangeDays: 30, reviews: 600, activeDays: 10, reviewsPerActiveDay: 60, newPerDay: 5, retentionPct: 74,
      weeklyRetentionPct: [88, 86, 75], dayparts: [
        { part: 'morning', reviews: 200, passPct: 92 }, { part: 'evening', reviews: 200, passPct: 70 },
      ], avgAnswerSeconds: 20, leeches: 9, dueNext7: [10, 10, 200, 10, 10, 10, 10],
    }) as StatsDigest;
    const ids = statsRuleTips(base).map((tip) => tip.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids.length).toBeLessThanOrEqual(5);
    expect(ids.slice(0, 3)).toEqual(['retentionLow', 'retentionDropping', 'bestTime']);
    const quiet = statsRuleTips(normalizeStatsDigest({ rangeDays: 30, reviews: 20, activeDays: 20, retentionPct: 88 }) as StatsDigest);
    expect(quiet.length).toBe(3);
  });
});

describe('daily goal suggestion', () => {
  const history: GoalHistory = { days: 14, reviewsAvg: 42, newAvg: 8, minutesAvg: 25, activeDays: 12, retentionPct: 85, dueNext7Avg: 51 };
  const current = { reviews: 50, newCards: 10, minutes: 30 };

  it('rounds onto the step grid from the averages', () => {
    const { targets, reasons } = suggestDailyGoalTargets(history, current);
    expect(targets).toEqual({ reviews: 50, newCards: 10, minutes: 30 });
    expect(reasons.map((r) => r.id)).toEqual(['reviewsFromDue', 'newFromPace', 'minutesFromPace']);
  });

  it('fewer new cards while retention is low; keeps the targets with no history', () => {
    expect(suggestDailyGoalTargets({ ...history, retentionPct: 70 }, current).targets.newCards).toBe(5);
    expect(suggestDailyGoalTargets({ ...history, activeDays: 0 }, current).targets).toEqual(current);
    expect(snapGoalTarget('reviews', 3)).toBe(10);
    expect(snapGoalTarget('minutes', 100_000)).toBe(600);
  });

  it('reads the history from the log, the study seconds and the due dates', () => {
    const entries = [review(NOW - DAY, true, 0, true), review(NOW - DAY, true), review(NOW - 2 * DAY, false)];
    const h = goalHistoryFrom({ entries, studySecondsByDay: {}, dueAts: [NOW + DAY, NOW + 30 * DAY], now: NOW });
    expect(h).toMatchObject({ activeDays: 2, retentionPct: 50, dueNext7Avg: 0.1 });
  });
});

describe('event parser', () => {
  const sunday = new Date(2026, 9, 11, 9, 0); // Sunday

  it('reads "every Tue/Thu 7pm for 30 min"', () => {
    const draft = parseEventText('study kanji every Tue/Thu 7pm for 30 min', sunday);
    expect(draft).toEqual({
      title: 'study kanji', date: '2026-10-13', startTime: '19:00', endTime: '19:30', recurrence: 'weekly', weekdays: [2, 4],
    });
    expect(eventDraftExtraDates(draft!)).toEqual(['2026-10-15']);
  });

  it('reads Japanese and Chinese', () => {
    expect(parseEventText('毎週火曜 19時から30分 漢字', sunday)).toMatchObject({
      title: '漢字', startTime: '19:00', endTime: '19:30', recurrence: 'weekly', weekdays: [2],
    });
    expect(parseEventText('明日 午後3時 文法の復習', sunday)).toMatchObject({ date: '2026-10-12', startTime: '15:00', endTime: '16:00' });
    expect(parseEventText('每天晚上8点 听力', sunday)).toMatchObject({ recurrence: 'daily', startTime: '20:00' });
  });

  it('ranges, ISO dates, all-day, and words that only look like weekdays', () => {
    expect(parseEventText('grammar 2026-10-20 9:30-11', sunday)).toMatchObject({ date: '2026-10-20', startTime: '09:30', endTime: '11:00' });
    expect(parseEventText('monster hunter reading club tomorrow', sunday)).toMatchObject({
      title: 'monster hunter reading club', date: '2026-10-12', startTime: null, recurrence: 'none',
    });
    expect(parseEventText('   ', sunday)).toBeNull();
  });
});

describe('placement', () => {
  const items: PlacementItem[] = [0, 0, 1, 1, 2, 2, 3, 4].map((level, i) => ({
    level, word: `w${i}`, prompt: 'p', choices: ['a', 'b', 'c', 'd'], answer: 1,
  }));

  it('suggests the hardest level the learner still mostly passes', () => {
    expect(gradePlacementQuiz(items, [1, 1, 1, 1, 1, 0, 0, 0])).toMatchObject({ right: 5, band: 2 });
    expect(gradePlacementQuiz(items, [1, 1, 1, 1, 1, 1, 1, 1]).band).toBe(4);
    expect(gradePlacementQuiz(items, [0, 0, 0, 0, 0, 0, 0, 0])).toMatchObject({ band: 0, knownWords: [] });
    expect(gradePlacementQuiz(items, [1, 1]).knownWords).toEqual(['w0', 'w1']);
  });

  it('maps level labels and exam estimates onto the five bands', () => {
    expect(placementLevelIndex('n 4', 'ja')).toBe(1);
    expect(placementLevelIndex('HSK 5', 'zh')).toBe(4);
    expect(placementLevelIndex('Z9', 'ru')).toBe(-1);
    expect(placementBandFromExamLevel('jlpt', 5)).toBe(0);
    expect(placementBandFromExamLevel('jlpt', 1)).toBe(4);
    expect(placementBandFromExamLevel('hsk', 3)).toBe(2);
    expect(placementBandFromExamLevel('cefr', 3)).toBeNull();
  });
});

describe('Blanc and the study-data gate', () => {
  it('shows where a wrong answer leaves the right one', () => {
    expect(blancMistakeDiff('かいて', 'かきて')).toEqual({ shared: 'か', expectedTail: 'いて', typedTail: 'きて' });
    expect(blancMistakeDiff('さんぼん', 'さんほん')).toEqual({ shared: 'さん', expectedTail: 'ぼん', typedTail: 'ほん' });
  });

  it('only "allow" lets study statistics reach a cloud provider', () => {
    expect(studyDataCloudGate('allow')).toBeNull();
    for (const share of ['unset', 'local-only', '', undefined]) {
      expect(studyDataCloudGate(share)).toMatchObject({ ok: false, code: 'consent', studyDataWithheld: true });
    }
  });
});
