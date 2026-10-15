// @vitest-environment node
/**
 * Snip to cards' bundled reader with a Tesseract stub: the owner's Chinese
 * snip (…过度的崇拜。) read by the bundled Japanese data alone came back as
 * "しJ4". With the optional Chinese data installed both models read it, and
 * the Chinese read wins; the snip's language is Chinese.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('tesseract.js', () => ({ createWorker: async () => ({ recognize: async () => ({ data: {} }) }) }));
vi.mock('../ocr', () => ({ recognizeOcrPage: async () => ({}) }));

import { basicModelsFor, readSnipBasic, type SnipBasicDeps } from '../snipBasicOcr';
import type { BasicRecognizer, TesseractPageLike } from '../../shared/lensBasicOcr';

/** Black "text" on white: enough ink for the preparation to hand something over. */
function pixels(): { data: Uint8ClampedArray; width: number; height: number } {
  const width = 300;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 0; i < 6; i++) {
    for (let y = 20; y < 60; y++) {
      for (let x = 20 + i * 45; x < 50 + i * 45; x++) {
        if (y < 26 || y > 54 || (x - 20 - i * 45) % 14 < 5) {
          const o = (y * width + x) * 4;
          data[o] = data[o + 1] = data[o + 2] = 0;
        }
      }
    }
  }
  return { data, width, height };
}

function page(text: string, confidence: number): TesseractPageLike {
  return { blocks: [{ paragraphs: [{ lines: [{ text, confidence, bbox: { x0: 0, y0: 0, x1: 300, y1: 80 } }] }] }] };
}

function deps(reads: Record<string, [string, number]>, seen: Array<{ model: string; langPath?: string }>): SnipBasicDeps {
  return {
    decode: async () => pixels(),
    recognize: (model, langPath): BasicRecognizer => async () => {
      seen.push({ model, langPath });
      const [text, conf] = reads[model] ?? ['', 0];
      return page(text, conf);
    },
    now: () => 0,
  };
}

describe('which Tesseract data reads a snip', () => {
  it('Japanese always; Chinese only when installed and Chinese is a candidate; the learner\'s own first', () => {
    expect(basicModelsFor(['ja'], {})).toEqual(['jpn']);
    expect(basicModelsFor(['ja'], { chi_sim: 'u' })).toEqual(['jpn']);
    expect(basicModelsFor(['ja', 'zh'], { chi_sim: 'u' })).toEqual(['jpn', 'chi_sim']);
    expect(basicModelsFor(['zh', 'ja'], { chi_sim: 'u', chi_tra: 'v' })).toEqual(['chi_sim', 'chi_tra', 'jpn']);
  });
});

describe('readSnipBasic', () => {
  it('a Chinese snip on a Japanese profile with the Chinese data: the Chinese read wins, in Chinese', async () => {
    const seen: Array<{ model: string; langPath?: string }> = [];
    const read = await readSnipBasic(
      { dataUrl: 'data:', width: 300, height: 80, langs: ['ja', 'zh'], models: { chi_sim: 'localfile://wall/t' } },
      'ja',
      deps({ jpn: ['しJ4', 53], chi_sim: ['过度的崇拜。', 86] }, seen),
    );
    expect(read).toMatchObject({ text: '过度的崇拜。', lang: 'zh', model: 'chi_sim' });
    expect(read.confidence).toBeCloseTo(0.86, 2);
    expect(seen.find((s) => s.model === 'chi_sim')?.langPath).toBe('localfile://wall/t');
  });

  it('without the Chinese data, the Japanese read is what there is, and its language is judged by its text', async () => {
    const seen: Array<{ model: string }> = [];
    const read = await readSnipBasic(
      { dataUrl: 'data:', width: 300, height: 80, langs: ['ja'], models: {} },
      'ja',
      deps({ jpn: ['这度的崇拜。', 70] }, seen),
    );
    expect(seen.every((s) => s.model === 'jpn')).toBe(true);
    // A Simplified-only character in it: the snip is Chinese (main then offers the Chinese reader).
    expect(read).toMatchObject({ lang: 'zh', model: 'jpn' });
  });

  it('a Japanese snip stays Japanese even when the Chinese data also read it', async () => {
    const read = await readSnipBasic(
      { dataUrl: 'data:', width: 300, height: 80, langs: ['ja', 'zh'], models: { chi_sim: 'u' } },
      'ja',
      deps({ jpn: ['魅力を語る', 90], chi_sim: ['魅力', 60] }, []),
    );
    expect(read).toMatchObject({ text: '魅力を語る', lang: 'ja', model: 'jpn' });
  });

  it('every model failing is an error for the pipeline, not an empty success', async () => {
    const failing: SnipBasicDeps = {
      decode: async () => pixels(),
      recognize: () => async () => {
        throw new Error('worker died');
      },
      now: () => 0,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(readSnipBasic({ dataUrl: 'data:', width: 1, height: 1, langs: ['ja'] }, 'ja', failing)).rejects.toThrow(/worker died/);
    warn.mockRestore();
  });
});
