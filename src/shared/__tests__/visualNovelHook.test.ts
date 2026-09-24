import { describe, expect, it } from 'vitest';
import { parseVisualNovelHookChunk, parseVisualNovelHookLine, parseVisualNovelTextBox } from '../visualNovelHook';

describe('visual novel hook parser', () => {
  it('extracts common speaker prefixes', () => {
    expect(parseVisualNovelHookLine('[12:04:31] 【紅莉栖】それは違うわ。')).toEqual({
      japanese: 'それは違うわ。',
      speaker: '紅莉栖',
      kind: 'dialogue',
    });
    expect(parseVisualNovelHookLine('まゆり: トゥットゥルー')).toEqual({
      japanese: 'トゥットゥルー',
      speaker: 'まゆり',
      kind: 'dialogue',
    });
  });

  it('keeps unlabelled Japanese narration and ignores tool chatter', () => {
    expect(parseVisualNovelHookLine('静かな夜だった。')).toEqual({
      japanese: '静かな夜だった。',
      speaker: '',
      kind: 'narration',
    });
    expect(parseVisualNovelHookLine('Textractor: thread attached')).toBeNull();
    expect(parseVisualNovelHookChunk('ready\n選択肢を選んでください。\n')).toHaveLength(1);
  });
});

describe('speaker parsing on every capture path', () => {
  it('reads a name directly before a quotation, which is how most engines print dialogue', () => {
    // The audit's repro: this line used to come back with the speaker glued into the text.
    expect(parseVisualNovelHookLine('紅莉栖「実験を始めよう。」')).toEqual({
      japanese: '実験を始めよう。',
      speaker: '紅莉栖',
      kind: 'dialogue',
    });
    expect(parseVisualNovelHookLine('まゆり『トゥットゥルー』')).toMatchObject({ speaker: 'まゆり', japanese: 'トゥットゥルー' });
    expect(parseVisualNovelHookLine('岡部（まさか……）')).toMatchObject({ speaker: '岡部', japanese: 'まさか……' });
    expect(parseVisualNovelHookLine('？？？「誰だ」')).toMatchObject({ speaker: '？？？', japanese: '誰だ' });
  });

  it('reads 【name】 and [name] prefixes, with or without a quotation after them', () => {
    expect(parseVisualNovelHookLine('【紅莉栖】「実験を始めよう。」')).toEqual({
      japanese: '実験を始めよう。',
      speaker: '紅莉栖',
      kind: 'dialogue',
    });
    expect(parseVisualNovelHookLine('[ダル] オカリン、それマジ？')).toMatchObject({ speaker: 'ダル' });
    expect(parseVisualNovelHookLine('まゆり：トゥットゥルー')).toMatchObject({ speaker: 'まゆり' });
  });

  it('does not mistake narration that quotes someone for a speaker', () => {
    // A particle before the quote means the prefix is a sentence, not a name.
    expect(parseVisualNovelHookLine('彼は「そうだ」と言った。')).toEqual({
      japanese: '彼は「そうだ」と言った。',
      speaker: '',
      kind: 'narration',
    });
    expect(parseVisualNovelHookLine('彼は「そうだ」')).toMatchObject({ speaker: '' });
  });

  it('treats an unattributed quotation as dialogue and keeps two quotations as printed', () => {
    expect(parseVisualNovelHookLine('「おはよう」')).toEqual({ japanese: 'おはよう', speaker: '', kind: 'dialogue' });
    expect(parseVisualNovelHookLine('「あ」「い」')).toMatchObject({ japanese: '「あ」「い」' });
  });

  it('joins a wrapped text box into one line before parsing it', () => {
    expect(parseVisualNovelTextBox('紅莉栖「実験を\r\n始めよう。」\n')).toEqual({
      japanese: '実験を始めよう。',
      speaker: '紅莉栖',
      kind: 'dialogue',
    });
    expect(parseVisualNovelTextBox('https://example.com')).toBeNull();
  });
});
