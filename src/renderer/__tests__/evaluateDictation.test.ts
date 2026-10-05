import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateDictation } from '../evaluateDictation';
import { getTokenizer, tokenizeSync } from '../tokenizer';
import { markMissedDictation } from '../../shared/listeningTraining';

vi.mock('../tokenizer', () => ({ getTokenizer: vi.fn(), tokenizeSync: vi.fn() }));

// A longest-match stand-in for kuromoji: the answer and the subtitle are
// tokenized separately, so the fake has to read each text it is given.
const LEXICON: Record<string, string | undefined> = {
  今日: 'キョウ', は: 'ハ', いい: 'イイ', 天気: 'テンキ', 猫: 'ネコ', ABC: '*', です: undefined,
  機会: 'キカイ', 機械: 'キカイ', が: 'ガ', ある: 'アル',
};
function fakeTokenize(text: string): ReturnType<typeof tokenizeSync> {
  const tokens: { surface: string; reading?: string }[] = [];
  for (let i = 0; i < text.length;) {
    const surface = Object.keys(LEXICON).find((word) => text.startsWith(word, i)) ?? text[i];
    tokens.push({ surface, reading: LEXICON[surface] });
    i += surface.length;
  }
  return tokens as ReturnType<typeof tokenizeSync>;
}

describe('reading-aware dictation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(tokenizeSync).mockImplementation(fakeTokenize);
  });

  it('accepts a kana transcription while displaying the original kanji subtitle', async () => {
    expect(await evaluateDictation('きょうはいいてんき', '今日はいい天気')).toEqual({
      exact: true, score: 100, answer: 'きょうはいいてんき', expected: '今日はいい天気',
      comparison: { answer: 'きょうはいいてんき', expected: 'キョウハイイテンキ' },
    });
  });

  it('still penalizes a wrong reading', async () => {
    const result = await evaluateDictation('きょうはいいでんき', '今日はいい天気');
    expect(result.exact).toBe(false);
    expect(result.score).toBe(89);
  });

  it('accepts an answer the IME only partly converted to kanji', async () => {
    expect(await evaluateDictation('今日はいいてんき', '今日はいい天気')).toEqual({
      exact: true, score: 100, answer: '今日はいいてんき', expected: '今日はいい天気',
      comparison: { answer: 'キョウハイイてんき', expected: 'キョウハイイテンキ' },
    });
    expect(await evaluateDictation('きょうはいい天気', '今日はいい天気')).toMatchObject({ exact: true });
  });

  it('does not score a wrong kanji with the same reading as exact', async () => {
    const result = await evaluateDictation('機械がある', '機会がある');
    expect(result.exact).toBe(false);
    expect(result.score).toBeLessThan(100);
    expect(await evaluateDictation('きかいがある', '機会がある')).toMatchObject({ exact: true });
  });

  it('still penalizes a missing word in an answer containing kanji', async () => {
    const result = await evaluateDictation('今日は天気', '今日はいい天気');
    expect(result.exact).toBe(false);
    expect(result.score).toBe(78);
  });

  it.each(['きょうはいいでんき', '今日はいいでんき'])(
    'highlights only the missed kana in %s using the scored comparison', async (answer) => {
      const result = await evaluateDictation(answer, '今日はいい天気');
      expect(result.score).toBe(89);
      expect(result.expected).toBe('今日はいい天気');
      expect(result.comparison).toBeDefined();
      expect(markMissedDictation(result.comparison!.answer, result.comparison!.expected)).toEqual([
        { text: 'キョウハイイ', missed: false },
        { text: 'テ', missed: true },
        { text: 'ンキ', missed: false },
      ]);
    },
  );

  it('keeps the literal comparison when its score wins', async () => {
    const result = await evaluateDictation('今日はいい天', '今日はいい天気');
    expect(result.comparison).toBeUndefined();
    expect(markMissedDictation(result.answer, result.expected)).toEqual([
      { text: '今日はいい天', missed: false }, { text: '気', missed: true },
    ]);
  });

  it('preserves unknown words when a token has no reading', async () => {
    expect(await evaluateDictation('ねこABCです', '猫ABCです')).toMatchObject({ exact: true });
  });

  it('falls back to literal scoring when dictionary loading fails', async () => {
    vi.mocked(getTokenizer).mockRejectedValue(new Error('unavailable'));
    expect(await evaluateDictation('今日は天気', '今日はいい天気')).toMatchObject({ score: 71 });
  });

  it('does not load the dictionary for an exact or empty answer', async () => {
    expect((await evaluateDictation('今日はいい天気', '今日はいい天気')).exact).toBe(true);
    expect((await evaluateDictation('', '今日はいい天気')).score).toBe(0);
    expect(getTokenizer).not.toHaveBeenCalled();
  });
});
