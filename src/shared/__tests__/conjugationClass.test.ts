import { describe, expect, it } from 'vitest';
import { allForms, DRILL_WORDS, type WordClass } from '../conjugate';
import {
  analyzeConjugationTokens,
  couldConjugate,
  wordClassFromIpadic,
  type ConjugationToken,
} from '../conjugationClass';

/** One inflecting token, the shape IPADIC gives a dictionary-form verb. */
function verb(surface: string, conjugationType: string, pos = '動詞'): ConjugationToken {
  return { surface, basicForm: surface, pos, conjugationType };
}

/** A token with no conjugation table, e.g. the 勉強 of 勉強する. */
function plain(surface: string, pos = '名詞'): ConjugationToken {
  return { surface, basicForm: surface, pos, conjugationType: '*' };
}

describe('wordClassFromIpadic', () => {
  it('maps every productive IPADIC conjugation family onto a conjugate.ts class', () => {
    const cases: [string, string, WordClass][] = [
      ['動詞', '五段・ラ行', 'godan'],
      ['動詞', '五段・カ行イ音便', 'godan'],
      ['動詞', '五段・ワ行促音便', 'godan'],
      ['動詞', '一段', 'ichidan'],
      ['動詞', '一段・クレル', 'ichidan'],
      ['動詞', 'サ変・スル', 'suru'],
      ['動詞', 'カ変・来ル', 'kuru'],
      ['形容詞', '形容詞・アウオ段', 'i-adj'],
      ['形容詞', '形容詞・イ段', 'i-adj'],
    ];
    for (const [pos, type, expected] of cases) {
      expect(wordClassFromIpadic(pos, type), `${pos}/${type}`).toBe(expected);
    }
  });

  it('refuses auxiliary and classical tables rather than forcing them into a class', () => {
    // 特殊・ダ / 特殊・ナイ are auxiliaries and 文語・* is classical; conjugate.ts
    // has no rules for any of them, so a class here would be an invention.
    expect(wordClassFromIpadic('助動詞', '特殊・ダ')).toBeNull();
    expect(wordClassFromIpadic('助動詞', '特殊・ナイ')).toBeNull();
    expect(wordClassFromIpadic('動詞', '文語・ラ行')).toBeNull();
    expect(wordClassFromIpadic('動詞', '不変化型')).toBeNull();
    expect(wordClassFromIpadic('動詞', '*')).toBeNull();
  });

  it('will not take a conjugation class from a part of speech that has none', () => {
    // The 活用型 alone is not enough: a 名詞 must never be conjugated even if
    // some other field on the token looks like a verb table.
    expect(wordClassFromIpadic('名詞', '五段・ラ行')).toBeNull();
    expect(wordClassFromIpadic('助詞', '一段')).toBeNull();
  });
});

describe('analyzeConjugationTokens', () => {
  it('conjugates a single-token verb from its analyser class', () => {
    const result = analyzeConjugationTokens('食べる', [verb('食べる', '一段')]);
    expect(result.wordClass).toBe('ichidan');
    expect(result.conjugationType).toBe('一段');
    expect(result.rows.find((r) => r.form === 'polite')?.surface).toBe('食べます');
    expect(result.rows.find((r) => r.form === 'te')?.surface).toBe('食べて');
  });

  it('keeps the whole word for a サ変 compound the analyser splits', () => {
    // This is why the rule is "one inflecting token, last" and not "one token":
    // 勉強する is two tokens, and conjugateSuru needs the 勉強 prefix.
    const result = analyzeConjugationTokens('勉強する', [plain('勉強'), verb('する', 'サ変・スル')]);
    expect(result.wordClass).toBe('suru');
    expect(result.rows.find((r) => r.form === 'polite')?.surface).toBe('勉強します');
    expect(result.rows.find((r) => r.form === 'potential')?.surface).toBe('勉強できる');
  });

  it('gets 帰る right, which no suffix rule can', () => {
    // 帰る ends in -eru like the ichidan 食べる but is godan; the analyser's
    // 五段・ラ行 is the only grounded way to tell them apart.
    const result = analyzeConjugationTokens('帰る', [verb('帰る', '五段・ラ行')]);
    expect(result.wordClass).toBe('godan');
    expect(result.rows.find((r) => r.form === 'past')?.surface).toBe('帰った');
    expect(result.rows.find((r) => r.form === 'negative')?.surface).toBe('帰らない');
  });

  it('drops the forms an i-adjective does not have instead of inventing them', () => {
    const result = analyzeConjugationTokens('高い', [verb('高い', '形容詞・アウオ段', '形容詞')]);
    expect(result.wordClass).toBe('i-adj');
    expect(result.rows.map((r) => r.form)).not.toContain('causative');
    expect(result.rows.find((r) => r.form === 'past')?.surface).toBe('高かった');
  });

  it('gives a noun no table at all', () => {
    const result = analyzeConjugationTokens('猫', [plain('猫')]);
    expect(result.wordClass).toBeNull();
    expect(result.conjugationType).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('refuses a word that is not already in its dictionary form', () => {
    // 食べた: the lookup path deinflects and shows the chain itself, and a second
    // half-right answer here would only disagree with it.
    const result = analyzeConjugationTokens('食べた', [
      { surface: '食べ', basicForm: '食べる', pos: '動詞', conjugationType: '一段' },
      { surface: 'た', basicForm: 'た', pos: '助動詞', conjugationType: '特殊・タ' },
    ]);
    expect(result.wordClass).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('refuses a phrase whose inflecting token is not the last one', () => {
    // 読んでいる ends in a perfectly good dictionary-form 一段 verb, so the last
    // token alone says "ichidan" and the generated surfaces would even be valid
    // Japanese. It is still wrong: this is an inflected phrase, the lookup path
    // already deinflects it to 読む and shows that chain, and a table here would
    // present it as a dictionary-form word with a conjugation class of its own.
    const result = analyzeConjugationTokens('読んでいる', [
      { surface: '読ん', basicForm: '読む', pos: '動詞', conjugationType: '五段・マ行' },
      { surface: 'で', basicForm: 'で', pos: '助詞', conjugationType: '*' },
      { surface: 'いる', basicForm: 'いる', pos: '動詞', conjugationType: '一段' },
    ]);
    expect(result.wordClass).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('refuses an inflected adjective phrase', () => {
    const result = analyzeConjugationTokens('高くない', [
      { surface: '高く', basicForm: '高い', pos: '形容詞', conjugationType: '形容詞・アウオ段' },
      { surface: 'ない', basicForm: 'ない', pos: '助動詞', conjugationType: '特殊・ナイ' },
    ]);
    expect(result.wordClass).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('refuses an analysis that does not spell the word back', () => {
    // A misaligned tokenization must not be conjugated as if it were the query.
    const result = analyzeConjugationTokens('食べる', [verb('見る', '一段')]);
    expect(result.wordClass).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('claims no class when the class produces no form', () => {
    // 一段 requires る. A mislabelled 食べた would otherwise be reported as
    // ichidan with an empty table, asserting a class it cannot demonstrate.
    const result = analyzeConjugationTokens('食べた', [verb('食べた', '一段')]);
    expect(result.wordClass).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('treats an empty or unanalysed word as no analysis', () => {
    expect(analyzeConjugationTokens('', []).rows).toEqual([]);
    expect(analyzeConjugationTokens('  ', [plain('  ')]).wordClass).toBeNull();
    expect(analyzeConjugationTokens('食べる', []).wordClass).toBeNull();
  });
});

describe('couldConjugate', () => {
  it('never rejects a word conjugate.ts can actually produce forms for', () => {
    // The prefilter exists to skip an IPC round trip, so it must be a strict
    // superset of what the engine can answer. DRILL_WORDS is the curated list of
    // shapes that catch people out, including 行く and いい.
    for (const word of DRILL_WORDS) {
      expect(allForms(word.dict, word.wordClass).length, word.dict).toBeGreaterThan(0);
      expect(couldConjugate(word.dict), word.dict).toBe(true);
    }
  });

  it('rejects words that could not have produced a row whatever the analyser said', () => {
    expect(couldConjugate('猫')).toBe(false);
    expect(couldConjugate('日本語')).toBe(false);
    expect(couldConjugate('')).toBe(false);
    expect(couldConjugate('る')).toBe(false);
  });

  it('lets non-verbs through rather than pretending to classify them', () => {
    // It is a necessary condition only; the analyser makes the actual decision.
    expect(couldConjugate('くつ')).toBe(true);
    expect(couldConjugate('きれい')).toBe(true);
  });
});
