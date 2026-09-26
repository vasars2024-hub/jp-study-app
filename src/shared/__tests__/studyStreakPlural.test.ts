/**
 * The Study Streak widget read "1 days studied total" on a first day (round-4
 * journeys audit, packaged app, English UI): a count string without plural
 * forms. Russian already avoided the count agreement ("Всего дней с занятиями:
 * {count}"); English needed its one/other forms.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../i18n/catalogs/all';
import { translate } from '../i18n/core';

const say = (count: number): string =>
  translate('widgets.studyStreak.daysStudiedTotal', { count }, { lang: 'en', catalog: CATALOGS.en, fallback: CATALOGS.en });

describe('Study Streak widget total', () => {
  it('agrees with its count in English', () => {
    expect(say(1)).toBe('1 day studied in total');
    expect(say(3)).toBe('3 days studied in total');
  });
});
