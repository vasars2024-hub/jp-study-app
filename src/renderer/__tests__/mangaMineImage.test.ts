// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MokuroPage } from '../../shared/mokuroTypes';

vi.mock('../mangaOcrOrientation', () => ({
  cropPageImage: vi.fn(async () => 'data:image/png;base64,QUJD'),
}));

import { blockForLookup, mangaMineImage, paddedBox } from '../mangaMineImage';
import { cropPageImage } from '../mangaOcrOrientation';

const PAGE: MokuroPage = {
  version: '1.01',
  img_width: 1000,
  img_height: 1500,
  blocks: [
    { box: [100, 100, 200, 400], vertical: true, lines: ['ちょっと', '待って'], kind: 'text' },
    { box: [600, 900, 700, 1200], vertical: true, lines: ['猫だ'], kind: 'text' },
    { box: [0, 0, 50, 50], vertical: false, lines: ['ドン'], kind: 'ignore' },
  ],
};

afterEach(() => {
  delete (window as { api?: unknown }).api;
  vi.mocked(cropPageImage).mockClear();
});

describe('blockForLookup', () => {
  it('finds the bubble by its own text first, then by the word', () => {
    expect(blockForLookup(PAGE, 'ちょっと待って', '待って')?.box).toEqual([100, 100, 200, 400]);
    expect(blockForLookup(PAGE, undefined, '猫')?.box).toEqual([600, 900, 700, 1200]);
    expect(blockForLookup(PAGE, 'not on this page', 'ドン')).toBeNull();
    expect(blockForLookup(null, 'x', 'x')).toBeNull();
  });
});

describe('paddedBox', () => {
  it('grows the box with some art around it and stays on the page', () => {
    expect(paddedBox([100, 100, 200, 400], 1000, 1500)).toEqual([65, 0, 235, 505]);
    expect(paddedBox([950, 1450, 1000, 1500], 1000, 1500)).toEqual([926, 1426, 1000, 1500]);
  });
});

describe('mangaMineImage', () => {
  it('crops the padded bubble out of the page and names the file after the page', async () => {
    (window as unknown as { api: unknown }).api = { readMangaPage: async () => 'data:image/jpeg;base64,PAGE' };
    const image = await mangaMineImage('media://item/001.jpg', PAGE, '猫だ', '猫', 'item-1', 4);
    expect(image).toEqual({ base64: 'QUJD', filename: 'item-1-p5.png' });
    expect(cropPageImage).toHaveBeenCalledWith('data:image/jpeg;base64,PAGE', paddedBox([600, 900, 700, 1200], 1000, 1500));
  });

  it('gives no picture rather than a wrong one', async () => {
    (window as unknown as { api: unknown }).api = { readMangaPage: async () => null };
    expect(await mangaMineImage('media://item/001.jpg', PAGE, '猫だ', '猫', 'item-1', 0)).toBeUndefined();
    expect(await mangaMineImage('media://item/001.jpg', PAGE, 'absent', 'absent', 'item-1', 0)).toBeUndefined();
  });
});
