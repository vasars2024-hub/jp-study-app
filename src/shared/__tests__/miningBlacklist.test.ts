import { describe, expect, it } from 'vitest';
import {
  isBuiltinJunkExpression,
  isSingleKanaJunk,
  shouldDropMiningCandidate,
} from '../miningBlacklist';

describe('miningBlacklist', () => {
  it('drops auxiliaries and copula', () => {
    expect(isBuiltinJunkExpression('する')).toBe(true);
    expect(isBuiltinJunkExpression('いる')).toBe(true);
    expect(isBuiltinJunkExpression('だ')).toBe(true);
    expect(isBuiltinJunkExpression('です')).toBe(true);
  });

  it('keeps content lemmas', () => {
    expect(isBuiltinJunkExpression('人間')).toBe(false);
    expect(isBuiltinJunkExpression('本当')).toBe(false);
    expect(isBuiltinJunkExpression('食べる')).toBe(false);
  });

  it('drops single kana junk', () => {
    expect(isSingleKanaJunk('っ')).toBe(true);
    expect(isSingleKanaJunk('人')).toBe(false);
  });

  it('respects useBuiltinJunkFilter toggle', () => {
    expect(shouldDropMiningCandidate('する', { blacklist: [], useBuiltinJunkFilter: true })).toBe(true);
    expect(shouldDropMiningCandidate('する', { blacklist: [], useBuiltinJunkFilter: false })).toBe(false);
    expect(shouldDropMiningCandidate('する', { blacklist: ['する'], useBuiltinJunkFilter: false })).toBe(true);
  });
});
