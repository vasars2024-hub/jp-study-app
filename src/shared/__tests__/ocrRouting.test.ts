import { describe, expect, it } from 'vitest';
import {
  japaneseRatio,
  pickBetterRead,
  shouldTryMangaOcr,
  summarizePaddle,
  isDegenerate,
  type RoutingLine,
} from '../ocrRouting';

/** A long, thin box — the shape a correctly detected text line has. */
const line = (text: string, vertical: boolean, confidence: number): RoutingLine => ({
  text,
  box: vertical ? [0, 0, 24, 300] : [0, 0, 300, 24],
  vertical,
  confidence,
});

/** A squarish box — the shape a bubble whose columns got merged has. */
const blob = (text: string, confidence: number): RoutingLine => ({
  text,
  box: [0, 0, 141, 94],
  vertical: false,
  confidence,
});

describe('summarizePaddle', () => {
  it('reports zeroes for an empty read rather than NaN', () => {
    expect(summarizePaddle([])).toEqual({
      lineCount: 0,
      meanConfidence: 0,
      verticalFraction: 0,
      totalChars: 0,
      blobFraction: 0,
      charDensity: 0,
    });
  });

  it('averages confidence and counts vertical share', () => {
    const q = summarizePaddle([line('あいう', true, 0.8), line('かきくけ', false, 0.6)]);
    expect(q.lineCount).toBe(2);
    expect(q.meanConfidence).toBeCloseTo(0.7);
    expect(q.verticalFraction).toBe(0.5);
    expect(q.totalChars).toBe(7);
  });

  it('separates thin line boxes from squarish merged-bubble boxes', () => {
    expect(summarizePaddle([line('あいう', true, 0.9), line('かき', false, 0.9)]).blobFraction).toBe(0);
    expect(summarizePaddle([blob('の事さ', 0.9), line('あいう', false, 0.9)]).blobFraction).toBe(0.5);
  });

  it('reports character density per megapixel when the image size is known', () => {
    // 50 characters over a 2 MP image.
    const q = summarizePaddle([line('あ'.repeat(50), false, 0.9)], 2_000_000);
    expect(q.charDensity).toBeCloseTo(25);
  });

  it('reports zero density when the image size is unknown', () => {
    expect(summarizePaddle([line('あいう', false, 0.9)]).charDensity).toBe(0);
  });
});

describe('shouldTryMangaOcr', () => {
  it('escalates when the general engine returned nothing', () => {
    // Measured: the red-circled bubble of a One Piece panel yields zero lines.
    expect(shouldTryMangaOcr(summarizePaddle([]))).toBe(true);
  });

  it('escalates on a near-empty read', () => {
    expect(shouldTryMangaOcr(summarizePaddle([line('理', false, 0.9)]))).toBe(true);
  });

  it('escalates on outright low confidence', () => {
    expect(shouldTryMangaOcr(summarizePaddle([line('到事学イ', false, 0.19)]))).toBe(true);
  });

  it('escalates on confident-looking vertical text, which is the interleaving trap', () => {
    // Real measurement: two adjacent tategaki columns read character-by-character
    // as 巨そ大んのな国人でほが at 0.78 mean confidence. High enough to pass a
    // naive confidence gate, which is exactly why the vertical clause exists.
    const q = summarizePaddle([
      line('巨そ大んのな国人でほが', true, 0.78),
      line('ジぁジのイがI?', true, 0.807),
    ]);
    expect(q.verticalFraction).toBe(1);
    expect(shouldTryMangaOcr(q)).toBe(true);
  });

  it('escalates on squarish boxes, the merged-column signature', () => {
    // Measured on a One Piece page: PP-OCR surfaced only isolated single
    // characters at 0.79 confidence, too high for the confidence gate and too
    // horizontal for the vertical gate. Box shape is what catches it.
    const q = summarizePaddle([blob('で', 0.79), blob('の', 0.79), line('ANCHOR', false, 0.79)]);
    expect(q.blobFraction).toBeCloseTo(2 / 3);
    expect(shouldTryMangaOcr(q)).toBe(true);
  });

  it('leaves clean horizontal printed text on the general engine', () => {
    const q = summarizePaddle([
      line('本日のニュースをお伝えします', false, 0.94),
      line('午後の天気は晴れ', false, 0.91),
    ]);
    expect(shouldTryMangaOcr(q)).toBe(false);
  });

  it('leaves confidently-read vertical text alone', () => {
    // A vertical novel scan the recognizer handles well must not be rerouted.
    const q = summarizePaddle([line('吾輩は猫である', true, 0.95)]);
    expect(shouldTryMangaOcr(q)).toBe(false);
  });
});

describe('japaneseRatio', () => {
  it('ignores punctuation and counts kana and kanji', () => {
    expect(japaneseRatio('ああッ！！海賊王！！')).toBe(1);
  });

  it('is low for Latin text', () => {
    expect(japaneseRatio('ONE PIECE vol 1')).toBe(0);
  });

  it('is zero for punctuation-only text rather than dividing by zero', () => {
    expect(japaneseRatio('！！…')).toBe(0);
  });
});

describe('pickBetterRead', () => {
  it('takes manga when the general engine read nothing', () => {
    expect(pickBetterRead('', 'ああッ！！レイリーに並ぶ海賊王の左腕ッ！！')).toBe('manga');
  });

  it('rejects an empty manga read', () => {
    expect(pickBetterRead('なにか', '')).toBe('web');
  });

  it('rejects a manga read that is not Japanese', () => {
    expect(pickBetterRead('なにかの文章', 'ABCDEFG')).toBe('web');
  });

  it('rejects a manga read that lost most of the text', () => {
    const paddle = 'ぜんぜん恐くないんだ連れてってくれよ次の航海';
    expect(pickBetterRead(paddle, 'ぜんぜん')).toBe('web');
  });

  it('prefers manga on a comparable Japanese read', () => {
    expect(pickBetterRead('巨そ大んのな国人でほが', 'そんな人が巨人の国に')).toBe('manga');
  });

  it('rejects a manga read that collapsed into a repetition loop', () => {
    // Measured on a stylised contents page: manga-ocr emitted a 200+ character
    // run of `．` alongside a few real fragments.
    const looped = `登場 ${'．'.repeat(220)} 友達`;
    expect(pickBetterRead('CONTENTS 豊険の夜明はー', looped)).toBe('web');
  });
});

describe('isDegenerate', () => {
  it('accepts ordinary ellipses', () => {
    expect(isDegenerate('ああ！！レイリーに並ぶ．．．')).toBe(false);
  });

  it('flags a long repeated run', () => {
    expect(isDegenerate('あ'.repeat(10))).toBe(true);
  });

  it('does not flag a character repeated non-consecutively', () => {
    expect(isDegenerate('あいあいあいあいあいあいあい')).toBe(false);
  });
});
