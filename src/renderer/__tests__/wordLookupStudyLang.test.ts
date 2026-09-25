// @vitest-environment jsdom
/**
 * Immersion lookup follows the study language, not a hard-coded Japanese: the word walk
 * is kuromoji's, so Chinese text used to be cut into Japanese morphemes and Russian clicked
 * down to one letter. (Merged with fix/lang: the per-language span rule is its
 * segmentation, so these pin the behaviour through the one public entry point.)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveWordSpanInText } from '../wordLookup';

beforeEach(() => {
  localStorage.clear();
});

describe('lookup spans per study language', () => {
  it('takes a whole Russian word, not a letter', () => {
    localStorage.setItem('jp-study-dict-lang', 'ru');
    expect(resolveWordSpanInText('Сегодня ветер.', 9)?.query).toBe('ветер');
  });

  it('segments Chinese as Chinese for a Chinese learner', () => {
    localStorage.setItem('jp-study-dict-lang', 'zh');
    const hit = resolveWordSpanInText('我们去图书馆', 3);
    // With CC-CEDICT loaded the max-match gives 图书馆; the ICU fallback used in tests
    // gives 图书. Either way it is a Chinese word starting at the click, never a
    // Japanese morpheme or a single character.
    expect(hit?.start).toBe(3);
    expect(hit?.query.startsWith('图书')).toBe(true);
  });
});
