import { describe, expect, it } from 'vitest';
import {
  deriveUserLevel,
  slotsForLang,
  tierName,
  ADVANCED_KNOWN_WORDS,
  JA_SLOTS,
  ZH_SLOTS,
} from '../levelScale';

describe('levelScale slots', () => {
  it('JA has 5 JLPT slots at tiers 2..6, ZH has 6 HSK slots at tiers 1..6', () => {
    expect(JA_SLOTS.map((s) => s.tier)).toEqual([2, 3, 4, 5, 6]);
    expect(ZH_SLOTS.map((s) => s.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(slotsForLang('ja')).toBe(JA_SLOTS);
    expect(slotsForLang('zh')).toBe(ZH_SLOTS);
  });

  it('tierName resolves the readable name', () => {
    expect(tierName('ja', 1)).toBe('Beginner');
    expect(tierName('ja', 6)).toBe('N1');
    expect(tierName('ja', 7)).toBe('Advanced');
    expect(tierName('zh', 3)).toBe('HSK 3');
  });
});

describe('deriveUserLevel', () => {
  it('defaults to Beginner (1) with no lists', () => {
    expect(deriveUserLevel('ja', { coverageBySlot: {} }).level).toBe(1);
  });

  it('a cleared N5 list at threshold reads as level 2', () => {
    const r = deriveUserLevel('ja', { coverageBySlot: { 'jlpt-n5': 0.8 } });
    expect(r.level).toBe(2);
    expect(r.reached).toEqual(['jlpt-n5']);
  });

  it('below threshold does not count', () => {
    expect(deriveUserLevel('ja', { coverageBySlot: { 'jlpt-n5': 0.79 } }).level).toBe(1);
  });

  it('takes the highest cleared slot even when lower ones are missing', () => {
    const r = deriveUserLevel('ja', { coverageBySlot: { 'jlpt-n1': 0.85 } });
    expect(r.level).toBe(6);
  });

  it('respects a custom threshold', () => {
    const r = deriveUserLevel('ja', {
      coverageBySlot: { 'jlpt-n4': 0.7 },
      threshold: 0.6,
    });
    expect(r.level).toBe(3);
  });

  it('reaches Advanced (7) when N1 cleared and known-word count is high', () => {
    const r = deriveUserLevel('ja', {
      coverageBySlot: { 'jlpt-n1': 0.9 },
      totalKnown: ADVANCED_KNOWN_WORDS,
    });
    expect(r.level).toBe(7);
    expect(r.advanced).toBe(true);
  });

  it('reaches Advanced (7) via an advanced custom list', () => {
    const r = deriveUserLevel('ja', {
      coverageBySlot: { 'jlpt-n1': 0.9 },
      advancedCoverage: 0.8,
    });
    expect(r.level).toBe(7);
  });

  it('does NOT reach Advanced when N1 is not cleared, even with many known words', () => {
    const r = deriveUserLevel('ja', {
      coverageBySlot: { 'jlpt-n2': 0.9 },
      totalKnown: ADVANCED_KNOWN_WORDS * 2,
    });
    expect(r.level).toBe(5);
    expect(r.advanced).toBe(false);
  });

  it('ZH: clearing HSK6 with high known count reaches Advanced', () => {
    const r = deriveUserLevel('zh', {
      coverageBySlot: { 'hsk-6': 0.82 },
      totalKnown: ADVANCED_KNOWN_WORDS + 1,
    });
    expect(r.level).toBe(7);
  });
});
