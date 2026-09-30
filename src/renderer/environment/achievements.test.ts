import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS, en } from '../../shared/i18n/catalogs/all';
import { translate, type UiLang } from '../../shared/i18n/core';
import { checkAchievements } from './achievements';
import { emitCompanionEvent } from './companionEvents';

const state = vi.hoisted(() => ({ lang: 'en' as UiLang, streak: 7, todayChars: 2000 }));
vi.mock('../stats', () => ({ getSummary: () => state, READING_RECORDED_EVENT: 'reading' }));
vi.mock('./companionEvents', () => ({ emitCompanionEvent: vi.fn() }));
vi.mock('./companionTrinkets', () => ({
  STREAK_MILESTONES: [3, 7, 14, 30], unlockTrinketsForStreak: () => [],
}));
vi.mock('../i18n', () => ({
  t: (key: string, vars: Record<string, number>) => translate(key, vars, {
    lang: state.lang, catalog: CATALOGS[state.lang], fallback: en,
  }),
}));

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
  vi.clearAllMocks();
  state.streak = 7;
  state.todayChars = 2000;
});
afterEach(() => vi.unstubAllGlobals());

describe('localized companion milestones', () => {
  it.each([
    ['en', '7-day streak', '7-day study streak', '2,000 characters today'],
    ['ja', '7日連続', '7日連続学習', '今日の読書：2,000文字'],
    ['zh', '连续7天', '连续学习7天', '今天已读2,000字'],
    ['ru', '7 дней подряд', '7 дней учёбы подряд', '2\u00a0000 символов сегодня'],
  ] as const)('emits translated milestone details in %s only once', (lang, streak, study, chars) => {
    state.lang = lang;
    checkAchievements();
    expect(vi.mocked(emitCompanionEvent).mock.calls).toEqual([
      ['streak', streak], ['achievement', study], ['achievement', chars],
    ]);
    checkAchievements();
    expect(emitCompanionEvent).toHaveBeenCalledTimes(3);
  });

  it.each([
    [1, '1 символ сегодня'], [2, '2 символа сегодня'],
    [5, '5 символов сегодня'], [21, '21 символ сегодня'],
  ])('uses Russian plural forms for %s characters', (count, expected) => {
    expect(translate('companion.achievement.dailyChars', { count }, {
      lang: 'ru', catalog: CATALOGS.ru, fallback: en,
    })).toBe(expected);
  });
});
