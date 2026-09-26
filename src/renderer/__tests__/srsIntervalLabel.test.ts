// @vitest-environment node
/**
 * One "comes back in" format for every review surface (round-4 journeys audit): the largest
 * whole unit that fits, in the UI language. Grammar review said "< 1 day" for Again and Hard
 * alike; Flashcards said "In 0.5 d".
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import type { UiLang } from '../../shared/i18n/core';
import { srsIntervalLabel } from '../srsIntervalLabel';

const tIn = (lang: UiLang) => (key: string, vars?: Record<string, unknown>): string =>
  String(CATALOGS[lang][key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? ''));

describe('srsIntervalLabel', () => {
  it('reads Again (interval 0) as the relearning step, and picks the largest whole unit', () => {
    const t = tIn('en');
    expect(srsIntervalLabel(0, t)).toBe('10 min');
    expect(srsIntervalLabel(0.5, t)).toBe('12 h');
    expect(srsIntervalLabel(1 / 48, t)).toBe('30 min');
    expect(srsIntervalLabel(1, t)).toBe('1 d');
    expect(srsIntervalLabel(4.4, t)).toBe('4 d');
    expect(srsIntervalLabel(90, t)).toBe('3 mo');
  });

  it('Again and Hard are never the same label for a new card', () => {
    const t = tIn('en');
    expect(srsIntervalLabel(0, t)).not.toBe(srsIntervalLabel(0.5, t));
  });

  it('speaks every UI language', () => {
    expect(srsIntervalLabel(0.5, tIn('ru'))).toBe('12 ч');
    expect(srsIntervalLabel(4, tIn('ja'))).toBe('4日');
    expect(srsIntervalLabel(0, tIn('zh'))).toBe('10 分钟');
  });

  it('never prints a broken number', () => {
    const t = tIn('en');
    expect(srsIntervalLabel(Number.NaN, t)).toBe('10 min');
    expect(srsIntervalLabel(-3, t)).toBe('10 min');
  });
});
