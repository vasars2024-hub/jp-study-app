// Table-driven deinflection gate: real surface forms a learner meets in text,
// each mapped to the dictionary form and the word type it must resolve to.
//
// This file exists because of SCORECARD work package #1. The old rule tags
// gated multi-step chains on the wrong word type (te-form + いる is ichidan,
// te-form + しまう/おく/ある is godan), so 飲んでいた, 眠っていた, 食べてしまった
// and 勉強していました silently failed to reach a dictionary form. The engine
// now peels the auxiliary back to a te-form state and then the te-form back to
// its verb, the way Yomitan's deinflector does; this table pins that.
//
// A positive case passes only when the expected term is produced AND carries
// the expected word type, so a chain that reaches 帰る as "ichidan" (a
// false positive) fails just like a chain that does not reach it at all.

import { describe, expect, it } from 'vitest';
import { deinflect, posMatchesWordTypes, type WordType } from '../deinflect';
import { DEINFLECT_KNOWN_REASONS } from '../deinflectTrace';

type Case = readonly [surface: string, term: string, type: WordType];

const CASES: readonly Case[] = [
  // ----- te-form + いる / てる (progressive) — the reported failures first ---
  ['飲んでいた', '飲む', 'v5'],
  ['眠っていた', '眠る', 'v5'],
  ['勉強していました', '勉強する', 'vs'],
  ['食べている', '食べる', 'v1'],
  ['飲んでいる', '飲む', 'v5'],
  ['書いている', '書く', 'v5'],
  ['来ている', '来る', 'vk'],
  ['きている', 'くる', 'vk'],
  ['してる', 'する', 'vs'],
  ['食べてる', '食べる', 'v1'],
  ['読んでる', '読む', 'v5'],
  ['飲んでた', '飲む', 'v5'],
  ['食べてた', '食べる', 'v1'],
  ['待っていません', '待つ', 'v5'],
  ['泳いでいる', '泳ぐ', 'v5'],
  ['話している', '話す', 'v5'],
  ['死んでいる', '死ぬ', 'v5'],
  ['遊んでいます', '遊ぶ', 'v5'],
  // ----- te-form + ある / おく / とく ---------------------------------------
  ['書いてある', '書く', 'v5'],
  ['置いてあった', '置く', 'v5'],
  ['準備しておく', '準備する', 'vs'],
  ['買っておいた', '買う', 'v5'],
  ['食べておきます', '食べる', 'v1'],
  ['買っとく', '買う', 'v5'],
  ['読んどいた', '読む', 'v5'],
  ['見ておく', '見る', 'v1'],
  // ----- te-form + しまう / ちゃう / じゃう ----------------------------------
  ['食べてしまった', '食べる', 'v1'],
  ['飲んでしまう', '飲む', 'v5'],
  ['書いてしまった', '書く', 'v5'],
  ['食べちゃう', '食べる', 'v1'],
  ['食べちゃった', '食べる', 'v1'],
  ['飲んじゃった', '飲む', 'v5'],
  ['忘れちゃった', '忘れる', 'v1'],
  ['しちゃった', 'する', 'vs'],
  ['来ちゃった', '来る', 'vk'],
  ['行っちゃった', '行く', 'v5'],
  ['行ってしまった', '行く', 'v5'],
  ['勉強してしまいました', '勉強する', 'vs'],
  // ----- te-form + みる / くる / いく ---------------------------------------
  ['食べてみる', '食べる', 'v1'],
  ['書いてみた', '書く', 'v5'],
  ['読んでみたい', '読む', 'v5'],
  ['持ってきた', '持つ', 'v5'],
  ['帰ってきました', '帰る', 'v5'],
  ['持っていく', '持つ', 'v5'],
  ['持っていった', '持つ', 'v5'],
  ['連れていきます', '連れる', 'v1'],
  ['行っていた', '行く', 'v5'],
  // ----- past ----------------------------------------------------------------
  ['食べた', '食べる', 'v1'],
  ['見た', '見る', 'v1'],
  ['書いた', '書く', 'v5'],
  ['泳いだ', '泳ぐ', 'v5'],
  ['話した', '話す', 'v5'],
  ['死んだ', '死ぬ', 'v5'],
  ['遊んだ', '遊ぶ', 'v5'],
  ['買った', '買う', 'v5'],
  ['待った', '待つ', 'v5'],
  ['帰った', '帰る', 'v5'],
  ['行った', '行く', 'v5'],
  ['来た', '来る', 'vk'],
  ['した', 'する', 'vs'],
  ['勉強した', '勉強する', 'vs'],
  // ----- negative ------------------------------------------------------------
  ['食べない', '食べる', 'v1'],
  ['飲まない', '飲む', 'v5'],
  ['買わない', '買う', 'v5'],
  ['しない', 'する', 'vs'],
  ['来ない', '来る', 'vk'],
  ['こない', 'くる', 'vk'],
  ['食べなかった', '食べる', 'v1'],
  ['書かなかった', '書く', 'v5'],
  ['来なかった', '来る', 'vk'],
  ['食べないで', '食べる', 'v1'],
  ['飲まなければ', '飲む', 'v5'],
  ['しなきゃ', 'する', 'vs'],
  // ----- polite --------------------------------------------------------------
  ['食べます', '食べる', 'v1'],
  ['飲みます', '飲む', 'v5'],
  ['します', 'する', 'vs'],
  ['来ます', '来る', 'vk'],
  ['きました', 'くる', 'vk'],
  ['食べませんでした', '食べる', 'v1'],
  ['行きましょう', '行く', 'v5'],
  ['飲みました', '飲む', 'v5'],
  ['ありません', 'ある', 'v5'],
  ['いらっしゃいます', 'いらっしゃる', 'v5'],
  // ----- potential / passive / causative / causative-passive -----------------
  ['食べられる', '食べる', 'v1'],
  ['飲める', '飲む', 'v5'],
  ['書けなかった', '書く', 'v5'],
  ['できる', 'する', 'vs'],
  ['来られる', '来る', 'vk'],
  ['食べれる', '食べる', 'v1'],
  ['飲まれた', '飲む', 'v5'],
  ['されている', 'する', 'vs'],
  ['食べさせる', '食べる', 'v1'],
  ['飲ませた', '飲む', 'v5'],
  ['させる', 'する', 'vs'],
  ['来させる', '来る', 'vk'],
  ['食べさせられた', '食べる', 'v1'],
  ['飲まされた', '飲む', 'v5'],
  ['書かせられる', '書く', 'v5'],
  ['行かされた', '行く', 'v5'],
  ['勉強させられた', '勉強する', 'vs'],
  // ----- volitional / conditional / imperative -------------------------------
  ['食べよう', '食べる', 'v1'],
  ['飲もう', '飲む', 'v5'],
  ['しよう', 'する', 'vs'],
  ['来よう', '来る', 'vk'],
  ['食べれば', '食べる', 'v1'],
  ['書けば', '書く', 'v5'],
  ['すれば', 'する', 'vs'],
  ['来れば', '来る', 'vk'],
  ['食べたら', '食べる', 'v1'],
  ['飲んだら', '飲む', 'v5'],
  ['行ったら', '行く', 'v5'],
  ['したら', 'する', 'vs'],
  ['食べるなら', '食べる', 'v1'],
  ['行くなら', '行く', 'v5'],
  ['高いなら', '高い', 'adjI'],
  ['食べろ', '食べる', 'v1'],
  ['飲め', '飲む', 'v5'],
  ['しろ', 'する', 'vs'],
  ['来い', '来る', 'vk'],
  ['食べなさい', '食べる', 'v1'],
  ['書きなさい', '書く', 'v5'],
  // ----- たい / たがる / そう / すぎる / ながら / ず / ずに / ぬ ------------------
  ['食べたい', '食べる', 'v1'],
  ['飲みたかった', '飲む', 'v5'],
  ['行きたくない', '行く', 'v5'],
  ['食べたがる', '食べる', 'v1'],
  ['行きたがっている', '行く', 'v5'],
  ['降りそう', '降る', 'v5'],
  ['食べそう', '食べる', 'v1'],
  ['高そう', '高い', 'adjI'],
  ['よさそう', 'いい', 'adjI'],
  ['食べすぎる', '食べる', 'v1'],
  ['飲みすぎた', '飲む', 'v5'],
  ['高すぎる', '高い', 'adjI'],
  ['食べながら', '食べる', 'v1'],
  ['歩きながら', '歩く', 'v5'],
  ['食べず', '食べる', 'v1'],
  ['言わずに', '言う', 'v5'],
  ['せずに', 'する', 'vs'],
  ['知らぬ', '知る', 'v5'],
  // ----- い-adjectives -------------------------------------------------------
  ['高く', '高い', 'adjI'],
  ['高くて', '高い', 'adjI'],
  ['高かった', '高い', 'adjI'],
  ['高くない', '高い', 'adjI'],
  ['高くなかった', '高い', 'adjI'],
  ['高ければ', '高い', 'adjI'],
  ['高さ', '高い', 'adjI'],
  ['おいしくなかった', 'おいしい', 'adjI'],
  // ----- irregulars: 行く / ある / いい・よい --------------------------------
  ['行って', '行く', 'v5'],
  ['いって', 'いく', 'v5'],
  ['あった', 'ある', 'v5'],
  ['なかった', 'ない', 'adjI'],
  ['よかった', 'よい', 'adjI'],
  ['よかった', 'いい', 'adjI'],
  ['よくない', 'いい', 'adjI'],
  ['良かった', '良い', 'adjI'],
];

/**
 * Forms that must NOT resolve to a term, or must not resolve to it with a given
 * word type. `type` omitted means "the term must not be produced at all".
 */
type Negative = readonly [surface: string, term: string, type?: WordType];

const NEGATIVES: readonly Negative[] = [
  // Ichidan and godan stay distinct: an ichidan past is never read as godan …
  ['食べた', '食べる', 'v5'],
  ['見た', '見る', 'v5'],
  ['食べてしまった', '食べる', 'v5'],
  // … and a godan past is never read as ichidan.
  ['帰った', '帰る', 'v1'],
  ['飲んでいた', '飲む', 'v1'],
  ['眠っていた', '眠る', 'v1'],
  // A te-form auxiliary keeps the main verb's own class.
  ['見ている', '見る', 'v5'],
  ['寝ていた', '寝る', 'v5'],
  ['した', 'する', 'v1'],
  // ている is ichidan, so its godan-shaped past った is not a reading of it:
  // 持っていった is ていく past, never "progressive".
  ['持っていった', '持っている', 'v1'],
  // Pre-noun 大きな and na-adjective きれいな are not inflections.
  ['大きな', '大きい'],
  ['きれいな', 'きれい'],
  // しまう on its own is a verb, not する + anything.
  ['しまう', 'する'],
  // Intermediate te-forms are states, not dictionary candidates.
  ['飲んでいる', '飲んで'],
  ['食べてしまう', '食べて'],
  // Bare suffixes do not collapse to a one-character "root".
  ['でる', 'で'],
  ['でる', 'る'],
  ['すぎる', 'す'],
];

/** Surfaces that are already dictionary words and must not grow candidates. */
const IDENTITY_ONLY = ['猫', '大きな', 'きれいな', 'そう', 'ながら', 'さ', 'hello'];

describe('deinflect form table', () => {
  it('has 100+ positive cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(100);
  });

  it.each(CASES)('%s → %s (%s)', (surface, term, type) => {
    const hit = deinflect(surface).find((d) => d.term === term);
    expect(hit, `${surface} did not produce ${term}`).toBeDefined();
    expect(hit?.wordTypes ?? [], `${surface} → ${term} has the wrong word type`).toContain(type);
  });

  it.each(NEGATIVES.map(([surface, term, type]) => [surface, term, type ?? ''] as const))('%s ↛ %s %s', (surface, term, type) => {
    const hit = deinflect(surface).find((d) => d.term === term);
    if (type) expect(hit?.wordTypes ?? []).not.toContain(type);
    else expect(hit).toBeUndefined();
  });

  it.each(IDENTITY_ONLY)('%s resolves only to itself', (surface) => {
    expect(deinflect(surface).map((d) => d.term)).toEqual([surface]);
  });
});

describe('deinflect chains read the way the suffixes stack', () => {
  it.each([
    ['飲んでいた', '飲む', ['progressive (–ている)', 'past']],
    ['勉強していました', '勉強する', ['progressive (–ている)', 'polite past']],
    ['食べてしまった', '食べる', ['completion (–てしまう)', 'past']],
    ['食べちゃった', '食べる', ['completion (–ちゃう)', 'past']],
    ['持っていった', '持つ', ['–ていく', 'past']],
    ['行きたがっている', '行く', ['–たがる', 'progressive (–ている)']],
    ['飲まされた', '飲む', ['causative', 'passive', 'past']],
    ['食べたくない', '食べる', ['–たい', 'negative']],
    ['飲んで', '飲む', ['-te']],
  ] as const)('%s → %s', (surface, term, reasons) => {
    expect(deinflect(surface).find((d) => d.term === term)?.reasons).toEqual(reasons);
  });

  it('names every step it reports, so the trace can label and link it', () => {
    const reasons = new Set(CASES.flatMap(([surface]) => deinflect(surface).flatMap((d) => d.reasons)));
    expect([...reasons].filter((reason) => !DEINFLECT_KNOWN_REASONS.includes(reason))).toEqual([]);
  });

  it('reports no word type for the surface form itself', () => {
    expect(deinflect('食べる')[0]).toEqual({ term: '食べる', reasons: [] });
  });
});

describe('posMatchesWordTypes (Yomitan part-of-speech check)', () => {
  it('accepts an entry whose JMdict tag names a candidate type', () => {
    expect(posMatchesWordTypes(['v5m', 'vt'], ['v5'])).toBe(true);
    expect(posMatchesWordTypes(['v5k-s', 'vi'], ['v5'])).toBe(true); // 行く
    expect(posMatchesWordTypes(['v1-s'], ['v1'])).toBe(true); // くれる
    expect(posMatchesWordTypes(['vs-i'], ['vs'])).toBe(true); // する
    expect(posMatchesWordTypes(['adj-ix'], ['adjI'])).toBe(true); // いい
    expect(posMatchesWordTypes(['vk'], ['v1', 'vk'])).toBe(true); // 来た
  });

  it('rejects an entry whose recognised tags all disagree', () => {
    expect(posMatchesWordTypes(['n'], ['v1'])).toBe(false); // まず → まる (丸)
    expect(posMatchesWordTypes(['v5r', 'vi'], ['v1'])).toBe(false); // ichidan-shaped 帰る
    expect(posMatchesWordTypes(['v1', 'vt'], ['v5'])).toBe(false);
    expect(posMatchesWordTypes(['adj-na', 'n'], ['adjI'])).toBe(false);
  });

  it('is lenient where it cannot tell', () => {
    expect(posMatchesWordTypes([], ['v5'])).toBe(true);
    expect(posMatchesWordTypes(['Godan verb'], ['v5'])).toBe(true); // another dictionary's own vocabulary
    expect(posMatchesWordTypes(['n'], undefined)).toBe(true); // the surface form itself
  });
});
