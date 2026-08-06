/**
 * Part of speech → the colour a token is painted in the transcript.
 *
 * Deliberately reuses the SIX categories the AI sentence analysis already
 * defines (`AnnotationCategory` in sentenceAnalysisCore) rather than inventing a
 * parallel palette. A learner should not have to learn that amber means
 * "particle" in one panel and something else one pane over — the colour is a
 * code, and a code with two dialects is noise.
 *
 * The mapping is IPADIC's, because that is what the bundled kuromoji dictionary
 * emits. It is offline and instant, which is the whole point: the transcript can
 * colour several hundred lines without spending a single AI call. The AI
 * analysis still says far more about any one line — this only says what each word
 * *is*.
 */

import type { AnnotationCategory } from './sentenceAnalysisCore';

/** Tokens carrying no lexical colour: punctuation, symbols, whitespace. */
export type PosPaint = AnnotationCategory | 'none';

/**
 * IPADIC top-level part of speech, plus the one sub-type that matters.
 *
 * 固有名詞 (proper noun) is split out of 名詞 because a character or place name
 * is not vocabulary a learner should feel obliged to study, and the analysis
 * palette already has a colour that means exactly that.
 */
export function posCategory(pos: string, posDetail = ''): PosPaint {
  switch (pos) {
    case '名詞':
      if (posDetail === '固有名詞') return 'name';
      // 数 (numerals) and 非自立 (bound nouns) are structure, not vocabulary.
      if (posDetail === '数' || posDetail === '非自立') return 'grammar';
      return 'vocabulary';
    case '動詞':
    case '形容詞':
      return 'grammar';
    case '助詞':
    case '助動詞':
      return 'particle';
    case '副詞':
    case '連体詞':
    case '接続詞':
      return 'expression';
    case '感動詞':
      return 'idiom';
    case '接頭詞':
    case '接尾辞':
      return 'grammar';
    case '記号':
    case 'フィラー':
    case 'その他':
      return 'none';
    default:
      return 'none';
  }
}

/** The class a painted token carries, or '' when it takes no colour. */
export function posCategoryClass(pos: string, posDetail = ''): string {
  const paint = posCategory(pos, posDetail);
  return paint === 'none' ? '' : `sa-cat-${paint}`;
}
