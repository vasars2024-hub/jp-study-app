/**
 * Grammar-pattern highlighting on player subtitles for Chinese and Russian, offline, from
 * the Grammar app's own zh (HSK) and ru (CEFR) sets — the same toggle and the same
 * `localSentenceAnalysis` the Japanese highlight uses.
 *
 * Before: Chinese frames were collapsed (虽然…但是… became 虽然但是 and matched nothing),
 * Traditional lines matched nothing, and every Russian title lost its spaces
 * ("У меня есть …" became "Уменяесть"), so a Russian line never highlighted at all.
 */
import { describe, expect, it } from 'vitest';
import { localSentenceAnalysis } from '../../renderer/localGrammarAnalysis';
import { findPatternSpans, patternAlternatives, toSimplifiedForMatch } from '../../shared/grammarPatternMatch';

function spans(line: string, lang: string): string[] {
  const result = localSentenceAnalysis(line, lang);
  return (result?.annotations ?? []).map((a) => result!.sentence.slice(a.start, a.end));
}

function headwords(line: string, lang: string): string[] {
  return (localSentenceAnalysis(line, lang)?.annotations ?? []).map((a) => a.headword ?? '');
}

describe('Chinese subtitle highlighting', () => {
  it('finds a discontinuous frame, both halves, at the right characters', () => {
    const line = '虽然今天下雨，但是我们还是去公园了。';
    expect(spans(line, 'zh')).toEqual(expect.arrayContaining(['虽然', '但是']));
    expect(headwords(line, 'zh')).toContain('虽然…但是…');
  });

  it('matches a Traditional line against the Simplified library, offsets unchanged', () => {
    const line = '雖然今天下雨，但是我們還是去公園了。';
    expect(toSimplifiedForMatch(line)).toHaveLength(line.length);
    const found = spans(line, 'zh');
    expect(found).toEqual(expect.arrayContaining(['雖然', '但是']));
  });

  it('still finds contiguous patterns, and never a lone hanzi or a two-hanzi frame', () => {
    expect(spans('我已经吃饭了。', 'zh')).toContain('已经');
    expect(patternAlternatives('的', 'zh')).toEqual([]);
    expect(patternAlternatives('是…的', 'zh')).toEqual([]);
    expect(patternAlternatives('如果…就…', 'zh')).toEqual([['如果', '就']]);
    expect(patternAlternatives('除了…以外', 'zh')).toEqual([['除了', '以外']]);
    expect(patternAlternatives('正在 / 在…呢', 'zh')).toEqual([['正在']]);
  });

  it('keeps spans in reading order without overlaps', () => {
    const result = localSentenceAnalysis('如果明天不下雨，我们就一边走一边聊。', 'zh');
    const list = result?.annotations ?? [];
    expect(list.length).toBeGreaterThan(1);
    for (let i = 1; i < list.length; i += 1) expect(list[i].start).toBeGreaterThanOrEqual(list[i - 1].end);
  });
});

describe('Russian subtitle highlighting', () => {
  it('reads the pattern out of an English-annotated title', () => {
    expect(patternAlternatives('У меня есть …', 'ru')).toEqual([['У меня есть']]);
    expect(patternAlternatives('чтобы + infinitive (purpose)', 'ru')).toEqual([['чтобы']]);
    expect(patternAlternatives('если бы … , … бы (unreal condition)', 'ru')).toEqual([['если бы', 'бы']]);
    expect(patternAlternatives('Reported speech: сказал, что … / спросил, … ли …', 'ru')).toEqual([
      ['сказал что'],
      ['спросил', 'ли'],
    ]);
    // Short function words and suffix/prefix lists are never claimed on their own.
    expect(patternAlternatives('в / на + prepositional (where?)', 'ru')).toEqual([]);
    expect(patternAlternatives('Prefixed motion verbs: при-, у-, вы-, в-, пере-', 'ru')).toEqual([]);
    expect(patternAlternatives('он / она / оно — noun gender', 'ru')).toEqual([]);
  });

  it('highlights whole words in a subtitle line, case-insensitively', () => {
    expect(spans('У меня есть кошка.', 'ru')).toContain('У меня есть');
    expect(spans('Я пришёл, чтобы помочь.', 'ru')).toContain('чтобы');
    const unreal = spans('Если бы я знал, я бы пришёл.', 'ru');
    expect(unreal).toEqual(expect.arrayContaining(['Если бы', 'бы']));
    expect(headwords('Мне нравится эта песня.', 'ru')).toContain('мне нравится …');
  });

  it('does not match inside another word', () => {
    expect(findPatternSpans('Хочешьчтобы', ['чтобы'], 'ru')).toBeNull();
    expect(findPatternSpans('потомучто', ['потому что'], 'ru')).toBeNull();
    expect(findPatternSpans('Потому, что поздно.', ['потому что'], 'ru')).toEqual([{ start: 0, end: 11 }]);
  });

  it('a line with no library pattern has no highlight', () => {
    expect(localSentenceAnalysis('Он читает книгу.', 'ru')).toBeNull();
  });
});

describe('Japanese is unchanged', () => {
  it('still highlights ましょう', () => {
    expect(spans('公園に行きましょう。', 'ja')).toContain('ましょう');
  });
});
