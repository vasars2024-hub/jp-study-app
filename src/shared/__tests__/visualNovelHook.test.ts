import { describe, expect, it } from 'vitest';
import { parseVisualNovelHookChunk, parseVisualNovelHookLine } from '../visualNovelHook';

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
