import { describe, expect, it } from 'vitest';
import {
  compactLevelBadge,
  pageHasChinese,
  pageHasJapanese,
  resolvePageLevelLang,
} from '../pageLevelDetect';

describe('pageLevelDetect', () => {
  it('detects Japanese via kana', () => {
    expect(pageHasJapanese('今日はいい天気です。')).toBe(true);
    expect(pageHasJapanese('今天天气很好')).toBe(false);
    expect(pageHasJapanese('hello')).toBe(false);
  });

  it('detects Chinese as Han without kana', () => {
    expect(pageHasChinese('今天天气很好')).toBe(true);
    expect(pageHasChinese('今日はいい天気です。')).toBe(false);
    expect(pageHasChinese('漢字だけ')).toBe(false);
  });

  it('gates on study language', () => {
    expect(resolvePageLevelLang('今日は', 'ja')).toBe('ja');
    expect(resolvePageLevelLang('今天', 'ja')).toBe(null);
    expect(resolvePageLevelLang('今天', 'zh')).toBe('zh');
    expect(resolvePageLevelLang('今日は', 'zh')).toBe(null);
    expect(resolvePageLevelLang('hello', 'ja')).toBe(null);
    expect(resolvePageLevelLang('hello', 'zh')).toBe(null);
  });

  it('infers from script when study lang is unknown', () => {
    expect(resolvePageLevelLang('今日は', null)).toBe('ja');
    expect(resolvePageLevelLang('今天', null)).toBe('zh');
    expect(resolvePageLevelLang('hello', null)).toBe(null);
  });

  it('compacts HSK labels', () => {
    expect(compactLevelBadge('HSK 4')).toBe('HSK4');
    expect(compactLevelBadge('N3')).toBe('N3');
  });
});
