import { describe, expect, it } from 'vitest';
import {
  BasicOcrCancelledError,
  basicLinesToDip,
  characterAccuracy,
  cleanOcrJapanese,
  linesFromPage,
  readWithBasicEngine,
  scoreBasicRead,
  type BasicRecognizer,
  type TesseractPageLike,
} from '../lensBasicOcr';
import type { RgbaImage } from '../ocrPreprocess';

function page(lines: Array<{ text: string; confidence: number; box: [number, number, number, number] }>): TesseractPageLike {
  return {
    blocks: [{
      paragraphs: [{
        lines: lines.map((l) => ({ text: l.text, confidence: l.confidence, bbox: { x0: l.box[0], y0: l.box[1], x1: l.box[2], y1: l.box[3] } })),
      }],
    }],
  };
}

/** Em-sized squares of `ink` in one horizontal line on `paper`. */
function lineImage(ink = 10, paper = 255, width = 300, height = 60, em = 40): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = paper;
    data[i * 4 + 1] = paper;
    data[i * 4 + 2] = paper;
    data[i * 4 + 3] = 255;
  }
  for (let i = 0; i < 5; i++) {
    for (let y = 10; y < 10 + em; y++) {
      for (let x = 10 + i * (em + 6); x < 10 + i * (em + 6) + em; x++) {
        const o = (y * width + x) * 4;
        data[o] = ink;
        data[o + 1] = ink;
        data[o + 2] = ink;
      }
    }
  }
  return { data, width, height };
}

describe('cleanOcrJapanese', () => {
  it('removes the spaces Tesseract puts between CJK glyphs, keeps Latin word spaces', () => {
    expect(cleanOcrJapanese('今日 は 良い 天気 で すね 。\n')).toBe('今日は良い天気ですね。');
    expect(cleanOcrJapanese('Wi-Fi に 接続 する')).toBe('Wi-Fiに接続する');
    expect(cleanOcrJapanese('hello  world')).toBe('hello world');
    expect(cleanOcrJapanese(' \n  \n')).toBe('');
  });
});

describe('linesFromPage', () => {
  it('maps boxes back through the scale and pad, drops noise lines, orders top to bottom', () => {
    const prepared = { scale: 2, pad: 10, orientation: 'horizontal' as const };
    const lines = linesFromPage(page([
      { text: 'に ほん ご', confidence: 90, box: [30, 110, 230, 150] },
      { text: 'ゴミ', confidence: 10, box: [0, 0, 5, 5] },
      { text: 'き ょう', confidence: 80, box: [30, 30, 130, 70] },
    ]), prepared, { width: 200, height: 100 });
    expect(lines.map((l) => l.text)).toEqual(['きょう', 'にほんご']);
    expect(lines[0].box).toEqual([10, 10, 50, 20]);
    expect(lines[0].confidence).toBeCloseTo(0.8);
  });

  it('joins pieces of one re-laid column and orders columns right to left', () => {
    const prepared = {
      scale: 1,
      pad: 0,
      orientation: 'vertical' as const,
      rows: [
        { y0: 0, y1: 40, source: [100, 0, 30, 200] as [number, number, number, number] },
        { y0: 60, y1: 100, source: [40, 0, 30, 200] as [number, number, number, number] },
      ],
    };
    const lines = linesFromPage(page([
      { text: 'みんなで', confidence: 90, box: [0, 62, 100, 98] },
      { text: '春に', confidence: 90, box: [0, 2, 50, 38] },
      { text: 'なる', confidence: 70, box: [60, 2, 100, 38] },
    ]), prepared, { width: 200, height: 200 });
    expect(lines.map((l) => l.text)).toEqual(['春になる', 'みんなで']);
    expect(lines[0].vertical).toBe(true);
    expect(lines[0].box).toEqual([100, 0, 30, 200]);
    expect(lines[0].confidence).toBeCloseTo(0.8);
  });
});

describe('basicLinesToDip', () => {
  it('maps fallback-image pixels to region DIP per axis and never emits a zero box', () => {
    const lines = [{ text: 'あ', box: [100, 50, 200, 0.2] as [number, number, number, number], vertical: false, confidence: 1 }];
    expect(basicLinesToDip(lines, 0.5, 0.25)[0].box).toEqual([50, 12.5, 100, 1]);
    // A malformed factor falls back to identity rather than NaN hotspots.
    expect(basicLinesToDip(lines, NaN, 0)[0].box).toEqual([100, 50, 200, 1]);
  });
});

describe('scoreBasicRead / characterAccuracy', () => {
  it('weights confidence by how much text came back', () => {
    const one = [{ text: 'あ', box: [0, 0, 1, 1] as [number, number, number, number], vertical: false, confidence: 1 }];
    const many = [{ text: 'あいうえお', box: [0, 0, 1, 1] as [number, number, number, number], vertical: false, confidence: 0.8 }];
    expect(scoreBasicRead(many)).toBeGreaterThan(scoreBasicRead(one));
    expect(scoreBasicRead([])).toBe(0);
  });

  it('scores 1 for an exact read regardless of whitespace, less for errors', () => {
    expect(characterAccuracy('今日は\n晴れ', '今日は 晴れ')).toBe(1);
    expect(characterAccuracy('あいうえ', 'あいうお')).toBeCloseTo(0.75);
    expect(characterAccuracy('あい', '')).toBe(0);
  });
});

describe('readWithBasicEngine', () => {
  it('reads once when the first read is confident and the layout is clear', async () => {
    const calls: string[] = [];
    const recognize: BasicRecognizer = async (_image, model) => {
      calls.push(model);
      return page([{ text: 'こんにちは', confidence: 95, box: [10, 10, 200, 50] }]);
    };
    const read = await readWithBasicEngine(lineImage(), recognize);
    expect(calls).toEqual(['jpn']);
    expect(read.text).toBe('こんにちは');
    expect(read.passes).toBe(1);
    expect(read.orientation).toBe('horizontal');
  });

  it('retries a weak read with the outlined-lettering cut and keeps the better read', async () => {
    let n = 0;
    const recognize: BasicRecognizer = async () => {
      n += 1;
      return n === 2
        ? page([{ text: 'よめた', confidence: 90, box: [10, 10, 200, 50] }])
        : page([{ text: 'ゴ', confidence: 40, box: [10, 10, 30, 50] }]);
    };
    // Light glyphs on a dark band: the flipped polarity is all background (no
    // pass), the near-white cut is the second real pass.
    const read = await readWithBasicEngine(lineImage(250, 20), recognize);
    expect(read.passes).toBe(2);
    expect(read.text).toBe('よめた');
  });

  it('keeps the first read when a retry is no better', async () => {
    const recognize: BasicRecognizer = async () => page([{ text: 'ゴ', confidence: 40, box: [10, 10, 30, 50] }]);
    const read = await readWithBasicEngine(lineImage(250, 20), recognize);
    expect(read.text).toBe('ゴ');
  });

  it('stops between passes once cancelled', async () => {
    const controller = new AbortController();
    const recognize: BasicRecognizer = async () => {
      controller.abort();
      return page([{ text: 'ゴ', confidence: 30, box: [10, 10, 30, 50] }]);
    };
    await expect(readWithBasicEngine(lineImage(), recognize, { signal: controller.signal }))
      .rejects.toBeInstanceOf(BasicOcrCancelledError);
  });

  it('does not call the recognizer for a blank page', async () => {
    const calls: string[] = [];
    const blank = { data: new Uint8ClampedArray(40 * 40 * 4).fill(255), width: 40, height: 40 };
    const read = await readWithBasicEngine(blank, async (_i, model) => {
      calls.push(model);
      return page([]);
    });
    expect(calls).toEqual([]);
    expect(read.lines).toEqual([]);
  });
});
