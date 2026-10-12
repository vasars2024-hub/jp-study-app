// @vitest-environment node
/**
 * The deterministic half of shadowing feedback (docs/AI_AUDIT.md N18): the
 * comparison by SOUND of a subtitle line and Whisper's transcript, with
 * Japanese (morae of the kana reading) and Chinese (toneless pinyin, tone kept
 * aside) examples, the named issues, the pace and the voice span.
 */
import { describe, expect, it } from 'vitest';
import {
  compareShadowing,
  japaneseMorae,
  shadowExtraWords,
  shadowMissedWords,
  shadowTiming,
  speechSpanSeconds,
  splitPinyinTone,
  type ShadowToken,
} from '../shadowingScore';

const kana = (surface: string, reading?: string): ShadowToken => (reading ? { surface, reading } : { surface });
const hanzi = (surface: string, ...syllables: string[]): ShadowToken => ({ surface, syllables });

describe('Japanese units', () => {
  it('splits into morae: small kana join, ー becomes its vowel, punctuation is dropped', () => {
    expect(japaneseMorae('きょう')).toEqual(['きょ', 'う']);
    expect(japaneseMorae('ビール')).toEqual(['び', 'い', 'る']);
    expect(japaneseMorae('キッテ、')).toEqual(['き', 'っ', 'て']);
    expect(japaneseMorae('ほん。')).toEqual(['ほ', 'ん']);
  });
});

describe('Japanese comparison', () => {
  it('a kanji line and a kana transcript match by reading', () => {
    const expected = [kana('東京', 'トウキョウ'), kana('に', 'ニ'), kana('行き', 'イキ'), kana('ます', 'マス')];
    const result = compareShadowing(expected, [kana('とうきょうにいきます')], 'ja');
    expect(result?.score).toBe(100);
    expect(result?.expected.every((token) => token.status === 'match')).toBe(true);
    expect(result?.hints).toEqual([]);
  });

  it('a shortened long vowel: partial word, named as vowel length, score drops by one mora', () => {
    const expected = [kana('ありがとう', 'アリガトウ'), kana('ございます', 'ゴザイマス')];
    const result = compareShadowing(expected, [kana('ありがと', 'アリガト'), kana('ございます', 'ゴザイマス')], 'ja');
    expect(result?.score).toBe(90);
    expect(result?.expected.map((token) => token.status)).toEqual(['partial', 'match']);
    expect(result?.hints).toEqual([{ kind: 'long-vowel', expected: 'とう', heard: 'と', word: 'ありがとう' }]);
    expect(shadowMissedWords(result!)).toEqual(['ありがとう']);
  });

  it('ー counts as the vowel it lengthens (ビール heard as ビル)', () => {
    const result = compareShadowing([kana('ビール', 'ビール')], [kana('ビル', 'ビル')], 'ja');
    expect(result?.hints[0]).toMatchObject({ kind: 'long-vowel' });
  });

  it('names a dropped っ, a dropped ん, a voicing slip and a small kana said in full', () => {
    expect(compareShadowing([kana('切手', 'キッテ')], [kana('きて')], 'ja')?.hints[0]).toMatchObject({ kind: 'sokuon', word: '切手' });
    expect(compareShadowing([kana('本', 'ホン')], [kana('ほ')], 'ja')?.hints[0]).toMatchObject({ kind: 'moraic-n' });
    expect(compareShadowing([kana('学校', 'ガッコウ')], [kana('かっこう')], 'ja')?.hints[0])
      .toMatchObject({ kind: 'voicing', expected: 'が', heard: 'か' });
    expect(compareShadowing([kana('今日', 'キョウ')], [kana('きよう')], 'ja')?.hints.map((hint) => hint.kind)).toContain('small-kana');
  });

  it('a word the learner added is marked extra; a word they skipped is missed', () => {
    const expected = [kana('猫', 'ネコ'), kana('が', 'ガ'), kana('好き', 'スキ')];
    const heard = [kana('猫', 'ネコ'), kana('が', 'ガ'), kana('とても', 'トテモ'), kana('好き', 'スキ')];
    const result = compareShadowing(expected, heard, 'ja')!;
    expect(result.heard.map((token) => token.status)).toEqual(['match', 'match', 'extra', 'match']);
    expect(shadowExtraWords(result)).toEqual(['とても']);
    const skipped = compareShadowing(expected, [kana('猫', 'ネコ'), kana('好き', 'スキ')], 'ja')!;
    expect(skipped.expected.map((token) => token.status)).toEqual(['match', 'miss', 'match']);
    expect(skipped.counts).toMatchObject({ match: 2, miss: 1 });
  });

  it('nothing heard scores 0; a line with no sound is not compared', () => {
    expect(compareShadowing([kana('猫', 'ネコ')], [], 'ja')?.score).toBe(0);
    expect(compareShadowing([kana('。')], [kana('ねこ')], 'ja')).toBeNull();
  });
});

describe('Chinese units and comparison', () => {
  it('splits tone marks and tone digits from the syllable', () => {
    expect(splitPinyinTone('mǎi')).toEqual({ key: 'mai', tone: 3 });
    expect(splitPinyinTone('ma3')).toEqual({ key: 'ma', tone: 3 });
    expect(splitPinyinTone('lǜ')).toEqual({ key: 'lü', tone: 4 });
    expect(splitPinyinTone('lv4')).toEqual({ key: 'lü', tone: 4 });
    expect(splitPinyinTone('de')).toEqual({ key: 'de', tone: 5 });
  });

  it('the same syllables score 100, whatever characters Whisper chose', () => {
    const result = compareShadowing([hanzi('你好', 'nǐ', 'hǎo')], [hanzi('你好', 'nǐ', 'hǎo')], 'zh');
    expect(result?.score).toBe(100);
  });

  it('a same-syllable, other-tone character counts as heard but names the tone (买/卖)', () => {
    const result = compareShadowing([hanzi('我', 'wǒ'), hanzi('买', 'mǎi')], [hanzi('我', 'wǒ'), hanzi('卖', 'mài')], 'zh');
    expect(result?.score).toBe(100);
    expect(result?.hints).toEqual([{ kind: 'tone', expected: 'mai3', heard: 'mai4', word: '买' }]);
  });

  it('names retroflex, nasal-final and l/n swaps', () => {
    expect(compareShadowing([hanzi('是', 'shì')], [hanzi('四', 'sì')], 'zh')?.hints[0]).toMatchObject({ kind: 'retroflex' });
    expect(compareShadowing([hanzi('心', 'xīn')], [hanzi('星', 'xīng')], 'zh')?.hints[0]).toMatchObject({ kind: 'nasal-final' });
    expect(compareShadowing([hanzi('老', 'lǎo')], [hanzi('脑', 'nǎo')], 'zh')?.hints[0]).toMatchObject({ kind: 'l-n' });
  });

  it('a character without a reading falls back to the character itself', () => {
    const result = compareShadowing([{ surface: '你好' }], [{ surface: '你好' }], 'zh');
    expect(result?.score).toBe(100);
    expect(compareShadowing([{ surface: '你好' }], [{ surface: '你' }], 'zh')?.expected[0].status).toBe('partial');
  });
});

describe('timing', () => {
  it('pace against the cue: slow, ok, fast; nonsense is null', () => {
    expect(shadowTiming(2, 3)).toMatchObject({ ratio: 1.5, pace: 'slow' });
    expect(shadowTiming(2, 2.1)).toMatchObject({ pace: 'ok' });
    expect(shadowTiming(2, 1)).toMatchObject({ ratio: 0.5, pace: 'fast' });
    expect(shadowTiming(0, 1)).toBeNull();
    expect(shadowTiming(2, Number.NaN)).toBeNull();
  });

  it('the voice span ignores the silence around it', () => {
    const rate = 16_000;
    const pcm = new Float32Array(rate * 2);
    for (let i = rate * 0.5; i < rate * 1.5; i += 1) pcm[i] = 0.3 * Math.sin(i / 5);
    const span = speechSpanSeconds(pcm, rate);
    expect(span).not.toBeNull();
    expect(Math.abs((span ?? 0) - 1)).toBeLessThan(0.05);
    expect(speechSpanSeconds(new Float32Array(rate), rate)).toBeNull();
  });

  it('the comparison carries the pace when the spoken span is known', () => {
    const result = compareShadowing([kana('猫', 'ネコ')], [kana('ねこ')], 'ja', { cueSec: 1, spokenSec: 2 });
    expect(result?.timing).toMatchObject({ pace: 'slow' });
    expect(compareShadowing([kana('猫', 'ネコ')], [kana('ねこ')], 'ja', { cueSec: 1, spokenSec: null })?.timing).toBeNull();
  });
});
