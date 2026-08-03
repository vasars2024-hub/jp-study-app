import { describe, expect, it } from 'vitest';
import { extractVisualNovelScript } from '../visualNovelScriptExtraction';

describe('visual novel script extraction', () => {
  it('extracts RenPy character definitions, dialogue, narration, and choices', () => {
    const lines = extractVisualNovelScript(`
define e = Character("英梨々")
label start:
    e "今日はいい天気ですね。"
    "静かな朝だった。"
    menu:
        "学校へ行く":
            jump school
`, 'script.rpy', 'renpy');

    expect(lines).toEqual([
      expect.objectContaining({ kind: 'dialogue', speaker: '英梨々', scene: 'start', japanese: '今日はいい天気ですね。' }),
      expect.objectContaining({ kind: 'narration', speaker: '', japanese: '静かな朝だった。' }),
      expect.objectContaining({ kind: 'choice', japanese: '学校へ行く' }),
    ]);
  });

  it('extracts KiriKiri/Tyrano speaker tags and choice links', () => {
    const lines = extractVisualNovelScript(`
*scene1
#紅莉栖
[name text="紅莉栖"]それは実験ではありません。
[glink text="電話に出る" target="call"]
`, 'scene.ks', 'kirikiri');

    expect(lines).toEqual([
      expect.objectContaining({ kind: 'dialogue', speaker: '紅莉栖', scene: 'scene1', japanese: 'それは実験ではありません。' }),
      expect.objectContaining({ kind: 'choice', japanese: '電話に出る' }),
    ]);
  });

  it('extracts generic speaker-prefixed Japanese and removes duplicates', () => {
    const lines = extractVisualNovelScript(`
岡部「これが選択だ。」
岡部「これが選択だ。」
語り手: 夜になった。
`, '0.txt', 'nscripter');

    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ speaker: '語り手', japanese: '夜になった。' });
  });
});
