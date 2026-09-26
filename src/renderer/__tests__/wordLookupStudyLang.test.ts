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

describe('Japanese click spans', () => {
  // The tokens kuromoji (IPADIC) really gives for these lines.
  const tok = (surface: string, pos: string, posDetail: string, content: boolean) => ({
    surface, lemma: surface, pos, posDetail, content, proper: false,
  });

  it('looks up おはよう, not the merged "おはようござい", in おはようございます', () => {
    const tokens = [tok('おはよう', '感動詞', '*', false), tok('ござい', '助動詞', '*', false), tok('ます', '助動詞', '*', false)];
    expect(resolveWordSpanInText('おはようございます', 1, tokens, 'ja')?.query).toBe('おはよう');
    const thanks = [tok('ありがとう', '感動詞', '*', false), tok('ござい', '助動詞', '*', false), tok('まし', '助動詞', '*', false), tok('た', '助動詞', '*', false)];
    expect(resolveWordSpanInText('ありがとうございました', 2, thanks, 'ja')?.query).toBe('ありがとう');
  });

  it('still glues a kana word kuromoji splits (う + がい in うがいをする)', () => {
    const tokens = [tok('う', '感動詞', '*', false), tok('がい', '名詞', '非自立', false), tok('を', '助詞', '格助詞', false), tok('する', '動詞', '自立', true)];
    expect(resolveWordSpanInText('うがいをする', 0, tokens, 'ja')?.query).toBe('うがい');
    expect(resolveWordSpanInText('うがいをする', 1, tokens, 'ja')?.query).toBe('うがい');
  });
});
