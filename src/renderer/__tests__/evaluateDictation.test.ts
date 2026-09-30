import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateDictation } from '../evaluateDictation';
import { getTokenizer, tokenizeSync } from '../tokenizer';

vi.mock('../tokenizer', () => ({ getTokenizer: vi.fn(), tokenizeSync: vi.fn() }));

describe('reading-aware dictation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(tokenizeSync).mockReturnValue([
      { surface: '今日', reading: 'キョウ' },
      { surface: 'は', reading: 'ハ' },
      { surface: 'いい', reading: 'イイ' },
      { surface: '天気', reading: 'テンキ' },
    ] as ReturnType<typeof tokenizeSync>);
  });

  it('accepts a kana transcription while displaying the original kanji subtitle', async () => {
    expect(await evaluateDictation('きょうはいいてんき', '今日はいい天気')).toEqual({
      exact: true, score: 100, answer: 'きょうはいいてんき', expected: '今日はいい天気',
    });
  });

  it('still penalizes a wrong reading', async () => {
    const result = await evaluateDictation('きょうはいいでんき', '今日はいい天気');
    expect(result.exact).toBe(false);
    expect(result.score).toBe(89);
  });

  it('keeps the better literal score for answers containing kanji', async () => {
    expect(await evaluateDictation('今日は天気', '今日はいい天気')).toMatchObject({ score: 71 });
  });

  it('preserves unknown words when a token has no reading', async () => {
    vi.mocked(tokenizeSync).mockReturnValue([
      { surface: '猫', reading: 'ネコ' }, { surface: 'ABC', reading: '*' },
      { surface: 'です' },
    ] as ReturnType<typeof tokenizeSync>);
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
