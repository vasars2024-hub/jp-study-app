import { describe, expect, it } from 'vitest';
import { posCategory, posCategoryClass } from '../posCategory';
import { ANNOTATION_CATEGORIES } from '../sentenceAnalysisCore';

describe('posCategory', () => {
  it('paints the parts of speech a learner reads differently', () => {
    expect(posCategory('名詞', '一般')).toBe('vocabulary');
    expect(posCategory('動詞', '自立')).toBe('grammar');
    expect(posCategory('形容詞', '自立')).toBe('grammar');
    expect(posCategory('助詞', '格助詞')).toBe('particle');
    expect(posCategory('助動詞', '*')).toBe('particle');
    expect(posCategory('副詞', '一般')).toBe('expression');
    expect(posCategory('感動詞', '*')).toBe('idiom');
  });

  it('separates proper nouns from vocabulary', () => {
    // A character name is not a word to study, and the palette already has a
    // colour that says so.
    expect(posCategory('名詞', '固有名詞')).toBe('name');
    expect(posCategory('名詞', '一般')).toBe('vocabulary');
  });

  it('treats structural nouns as grammar rather than vocabulary', () => {
    expect(posCategory('名詞', '数')).toBe('grammar');
    expect(posCategory('名詞', '非自立')).toBe('grammar');
  });

  it('gives punctuation no colour at all', () => {
    expect(posCategory('記号', '句点')).toBe('none');
    expect(posCategoryClass('記号', '句点')).toBe('');
  });

  it('never invents a category the analysis palette cannot paint', () => {
    // The class names are shared with sentenceAnalysis.css, which defines a hue
    // for exactly these six. A seventh would silently render uncoloured.
    const produced = new Set([
      posCategory('名詞', '一般'),
      posCategory('名詞', '固有名詞'),
      posCategory('動詞', '自立'),
      posCategory('助詞', '格助詞'),
      posCategory('副詞', '一般'),
      posCategory('感動詞', '*'),
      posCategory('接続詞', '*'),
      posCategory('連体詞', '*'),
      posCategory('接頭詞', '*'),
      posCategory('記号', '句点'),
      posCategory('なにか未知の品詞', ''),
    ]);
    produced.delete('none');
    for (const category of produced) {
      expect(ANNOTATION_CATEGORIES).toContain(category);
    }
  });

  it('falls back to no colour for an unknown tag instead of throwing', () => {
    expect(posCategory('', '')).toBe('none');
    expect(posCategory('未知', 'なし')).toBe('none');
  });

  it('emits the class the stylesheet keys its hue off', () => {
    expect(posCategoryClass('名詞', '一般')).toBe('sa-cat-vocabulary');
    expect(posCategoryClass('助詞', '格助詞')).toBe('sa-cat-particle');
  });
});
