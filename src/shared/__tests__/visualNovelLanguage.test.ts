import { describe, expect, it } from 'vitest';
import type { VisualNovelTextCapture } from '../visualNovel';
import { analyzeVisualNovelCharacterSpeech } from '../visualNovelLanguage';

const capture = (
  id: string,
  speaker: string,
  japanese: string,
  kind: VisualNovelTextCapture['kind'] = 'dialogue',
): VisualNovelTextCapture => ({
  id,
  visualNovelId: 'vn-1',
  kind,
  japanese,
  translation: '',
  speaker,
  routeId: '',
  chapter: '',
  scene: '',
  screenshotPath: '',
  audioPath: '',
  source: 'manual',
  capturedAt: 1,
});

describe('visual novel character speech analysis', () => {
  it('groups dialogue by speaker and estimates register and markers', () => {
    const profiles = analyzeVisualNovelCharacterSpeech([
      capture('1', '紅莉栖', '私は研究室に戻ります。'),
      capture('2', '紅莉栖', 'それは違います。'),
      capture('3', '岡部', '俺に任せるんだぞ！'),
      capture('4', '岡部', 'そうだろ？'),
      capture('5', '岡部', '選択だぜ。'),
      capture('6', 'system', '保存しました。', 'system'),
    ]);

    expect(profiles.map((profile) => profile.speaker)).toEqual(['岡部', '紅莉栖']);
    expect(profiles[0]).toMatchObject({
      politeness: 'casual',
      pronouns: ['俺'],
      markers: ['assertive'],
    });
    expect(profiles[1].politeness).toBe('formal');
  });

  it('ignores narration and lines without a speaker', () => {
    expect(analyzeVisualNovelCharacterSpeech([
      capture('1', '', '誰もいない。'),
      capture('2', '語り手', '夜になった。', 'narration'),
    ])).toEqual([]);
  });
});
