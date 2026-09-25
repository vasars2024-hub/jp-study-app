// @vitest-environment jsdom
/**
 * Immersion lookup follows the study language (getStudyLang), not a
 * hard-coded Japanese: the word walk is kuromoji's, so Chinese text used to be
 * cut into Japanese morphemes and Russian clicked down to one letter.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveWordSpanInText, studyLangSpanAt } from '../wordLookup';

beforeEach(() => {
  localStorage.clear();
});

describe('lookup spans per study language', () => {
  it('takes a whole Russian word, hyphenated compounds included', () => {
    expect(studyLangSpanAt('Сегодня северо-западный ветер.', 10, 'ru')).toEqual({
      start: 8,
      end: 23,
      query: 'северо-западный',
    });
    expect(studyLangSpanAt('Сегодня ветер.', 7, 'ru')).toBeNull();
  });

  it('takes the Han run from the click for Chinese, capped for the popup to longest-match', () => {
    expect(studyLangSpanAt('我们去图书馆看书吧', 3, 'zh')?.query).toBe('图书馆看书吧');
    expect(studyLangSpanAt('今天天气很好很好很好很好', 0, 'zh')?.query).toHaveLength(8);
  });

  it('routes through the study language the user chose', () => {
    localStorage.setItem('jp-study-dict-lang', 'zh');
    expect(resolveWordSpanInText('我们去图书馆', 3)?.query).toBe('图书馆');
  });
});
