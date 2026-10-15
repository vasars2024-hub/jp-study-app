// @vitest-environment node
// The manga reader's automatic OCR decisions (renderer/mangaAutoOcr.ts): which
// pages to read ahead, and the line under a page scan's progress bar.

import { describe, expect, it } from 'vitest';
import { mangaReadAheadIndices, mangaScanPhase } from '../mangaAutoOcr';
import { MANGA_OCR_UI_EN } from '../../shared/i18n/mangaOcrUi/en';
import { MANGA_OCR_UI_JA } from '../../shared/i18n/mangaOcrUi/ja';
import { MANGA_OCR_UI_ZH } from '../../shared/i18n/mangaOcrUi/zh';
import { MANGA_OCR_UI_RU } from '../../shared/i18n/mangaOcrUi/ru';

describe('mangaReadAheadIndices', () => {
  it('reads the next page in single-page mode', () => {
    expect(mangaReadAheadIndices([4], 1, 20)).toEqual([5]);
  });

  it('reads the whole next spread in two-page mode', () => {
    expect(mangaReadAheadIndices([4, 5], 2, 20)).toEqual([6, 7]);
  });

  it('stops at the last page', () => {
    expect(mangaReadAheadIndices([18, 19], 2, 20)).toEqual([]);
    expect(mangaReadAheadIndices([17, 18], 2, 20)).toEqual([19]);
  });

  it('is empty for an empty spread or book', () => {
    expect(mangaReadAheadIndices([], 1, 20)).toEqual([]);
    expect(mangaReadAheadIndices([0], 1, 0)).toEqual([]);
  });
});

describe('mangaScanPhase', () => {
  it('says the models are starting before the first event', () => {
    expect(mangaScanPhase(null)).toEqual({ key: 'mangaOcrUi.phase.loading' });
  });

  it('says it is finding text, then which bubble it is reading', () => {
    expect(mangaScanPhase({ phase: 'detect', current: 0, total: 0 })).toEqual({ key: 'mangaOcrUi.phase.detect' });
    expect(mangaScanPhase({ phase: 'ocr', current: 0, total: 6 })).toEqual({
      key: 'mangaOcrUi.phase.read',
      vars: { current: 1, total: 6 },
    });
    expect(mangaScanPhase({ phase: 'ocr', current: 6, total: 6 }).vars).toEqual({ current: 6, total: 6 });
  });

  it('names only keys the pack has', () => {
    for (const p of [null, { phase: 'detect', current: 0, total: 0 }, { phase: 'ocr', current: 1, total: 2 }] as const) {
      expect(MANGA_OCR_UI_EN[mangaScanPhase(p).key]).toBeTruthy();
    }
  });
});

describe('mangaOcrUi pack', () => {
  const keys = Object.keys(MANGA_OCR_UI_EN).sort();
  it.each([
    ['ja', MANGA_OCR_UI_JA],
    ['zh', MANGA_OCR_UI_ZH],
    ['ru', MANGA_OCR_UI_RU],
  ])('%s has every key, translated, with the same placeholders', (_lang, pack) => {
    expect(Object.keys(pack).sort()).toEqual(keys);
    for (const key of keys) {
      expect(pack[key], key).not.toBe(MANGA_OCR_UI_EN[key]);
      const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(vars(pack[key]), key).toEqual(vars(MANGA_OCR_UI_EN[key]));
    }
  });
});
