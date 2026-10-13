/**
 * The Review tab's typed cloze check. It used to accept only an exact match of the
 * blanked text, so the blank for 〜てしまう (the stem てしま, cut that way so it also
 * matches てしまった) rejected both てしまった and てしまう, katakana was wrong for
 * hiragana, and kana was wrong for a kanji blank whose reading the example gives.
 * Wrong answers (another particle, a missing piece) must still be wrong.
 */
import { describe, expect, it } from 'vitest';
import {
  blankReadings,
  checkCloze,
  checkClozeAnswer,
  clozeForExample,
  type GrammarPointLike,
} from '../grammarReviewPrompt';
import { GRAMMAR } from '../data/grammar';

const SHIMAU: GrammarPointLike = {
  id: 't-shimau',
  title: '〜てしまう',
  lang: 'ja',
  examples: [{ jp: '宿題を 全部 やってしまいました。', reading: 'しゅくだいを ぜんぶ やってしまいました。', en: 'I finished all my homework.' }],
};

const HAJIMERU: GrammarPointLike = {
  id: 't-hajimeru',
  title: '〜始める',
  lang: 'ja',
  examples: [{ jp: '雨が 降り始めた。', reading: 'あめが ふりはじめた。', en: 'It started to rain.' }],
};

const MAE_NI: GrammarPointLike = {
  id: 't-mae-ni',
  title: '〜前に',
  lang: 'ja',
  examples: [{ jp: '寝る前に 歯を 磨きます。', reading: 'ねるまえに はを みがきます。', en: 'I brush my teeth before sleeping.' }],
};

const NI_TOTTE: GrammarPointLike = {
  id: 't-ni-totte',
  title: '〜にとって',
  lang: 'ja',
  examples: [{ jp: '私にとって 大切な 人です。', reading: 'わたしにとって たいせつな ひとです。', en: 'A person important to me.' }],
};

const TEIRU: GrammarPointLike = {
  id: 't-teiru',
  title: '〜ている',
  lang: 'ja',
  examples: [{ jp: '今 本を 読んでいる。', en: 'I am reading a book now.' }, { jp: '今 食べている。', en: 'I am eating now.' }],
};

function clozeOf(point: GrammarPointLike, index = 0) {
  const cloze = clozeForExample(point, point.examples[index]);
  if (!cloze) throw new Error(`no cloze for ${point.id}`);
  return cloze;
}

describe('cloze answers: conjugated and title forms of a dictionary-form ending', () => {
  const cloze = clozeOf(SHIMAU);

  it('blanks the stem', () => {
    expect(cloze.answers).toEqual(['てしま']);
  });

  it.each(['てしま', 'てしまう', '〜てしまう', 'てしまった', 'てしまいました', 'てしまって', 'てしまわない'])('accepts %s', (typed) => {
    expect(checkCloze(typed, cloze)).toBe(true);
  });

  it.each(['しまった', 'てしまる', 'でしまった', 'ちゃった', 'てしまえる？x', 'てまった', 'しまう'])('rejects %s', (typed) => {
    expect(checkCloze(typed, cloze)).toBe(false);
  });
});

describe('cloze answers: kana', () => {
  it('folds katakana to hiragana', () => {
    const cloze = clozeOf(SHIMAU);
    expect(checkCloze('テシマ', cloze)).toBe(true);
    expect(checkCloze('テシマッタ', cloze)).toBe(true);
    expect(checkCloze('ﾃｼﾏｯﾀ', cloze)).toBe(true);
    // Folding is plain katakana → hiragana, not a fuzzy match.
    expect(checkCloze('デシマッタ', cloze)).toBe(false);
  });

  it('accepts kana for a kanji blank, from the example reading', () => {
    const cloze = clozeOf(HAJIMERU);
    expect(cloze.answers).toEqual(['始め']);
    expect(cloze.readings).toEqual(['はじめ']);
    for (const typed of ['始め', 'はじめ', 'ハジメ', '始める', 'はじめる', 'はじめた', '始めました']) {
      expect(checkCloze(typed, cloze), typed).toBe(true);
    }
    for (const typed of ['おわり', 'はじま', 'はじまった', 'ふりはじめた', 'め']) {
      expect(checkCloze(typed, cloze), typed).toBe(false);
    }
  });

  it('accepts kana for a kanji-and-kana blank', () => {
    const cloze = clozeOf(MAE_NI);
    expect(cloze.answers).toEqual(['前に']);
    expect(cloze.readings).toEqual(['まえに']);
    expect(checkCloze('まえに', cloze)).toBe(true);
    expect(checkCloze('マエニ', cloze)).toBe(true);
    // Wrong particle.
    expect(checkCloze('まえで', cloze)).toBe(false);
    expect(checkCloze('前で', cloze)).toBe(false);
    expect(checkCloze('あとに', cloze)).toBe(false);
  });

  it('gives no reading when the example has none or it does not align', () => {
    const segments = [
      { text: '雨が', blank: false },
      { text: '降り', blank: true },
      { text: 'ました', blank: false },
    ];
    expect(blankReadings(segments, undefined)).toEqual([null]);
    expect(blankReadings(segments, 'まったく ちがう よみ')).toEqual([null]);
    // A blank that cuts a kanji run in half has no reading of its own.
    expect(blankReadings([{ text: '日', blank: false }, { text: '本語', blank: true }], 'にほんご')).toEqual([null]);
    expect(blankReadings(segments, 'あめが ふりました')).toEqual(['ふり']);
  });
});

describe('cloze answers: strict where it should be', () => {
  it('rejects a wrong particle', () => {
    const cloze = clozeOf(NI_TOTTE);
    expect(cloze.answers).toEqual(['にとって']);
    expect(checkCloze('にとって', cloze)).toBe(true);
    expect(checkCloze('ニトッテ', cloze)).toBe(true);
    expect(checkCloze('でとって', cloze)).toBe(false);
    expect(checkCloze('にとった', cloze)).toBe(false);
    expect(checkCloze('とって', cloze)).toBe(false);
    expect(checkCloze('にとっては', cloze)).toBe(false);
  });

  it('accepts a conjugated ている only with the title known', () => {
    const cloze = clozeOf(TEIRU, 1);
    expect(cloze.answers).toEqual(['ている']);
    expect(checkCloze('ていた', cloze)).toBe(true);
    expect(checkCloze('ています', cloze)).toBe(true);
    expect(checkCloze('てある', cloze)).toBe(false);
    expect(checkCloze('でいる', cloze)).toBe(false);
    // The bare answers-only check stays an exact (folded) match.
    expect(checkClozeAnswer('ていた', ['ている'])).toBe(false);
    expect(checkClozeAnswer('テイル', ['ている'])).toBe(true);
  });

  it('keeps Chinese and Russian frames exact', () => {
    const zh: GrammarPointLike = { id: 'zh', title: '虽然…但是…', lang: 'zh', examples: [] };
    const cloze = clozeForExample(zh, { jp: '虽然下雨，但是我们去了。', en: 'Although it rained, we went.' })!;
    expect(cloze.readings).toBeUndefined();
    expect(checkCloze('虽然 … 但是', cloze)).toBe(true);
    expect(checkCloze('但是虽然', cloze)).toBe(false);
    expect(checkCloze('虽然', cloze)).toBe(false);
  });
});

describe('every Japanese cloze in the corpus accepts its own blank', () => {
  it('and its blank in kana where the reading is known', () => {
    let checked = 0;
    let kana = 0;
    for (const point of GRAMMAR) {
      if ((point.lang ?? 'ja') !== 'ja') continue;
      for (const example of point.examples) {
        const cloze = clozeForExample(point, example);
        if (!cloze) continue;
        checked += 1;
        expect(checkCloze(cloze.answers.join(''), cloze), `${point.id}: ${cloze.sentence}`).toBe(true);
        const reading = cloze.readings?.[0];
        if (cloze.answers.length === 1 && reading) {
          kana += 1;
          expect(checkCloze(reading, cloze), `${point.id}: ${reading}`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(kana).toBeGreaterThan(1000);
  });
});
