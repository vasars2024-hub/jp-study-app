import { describe, expect, it } from 'vitest';
import {
  postprocessMangaOcrText,
  stripFuriganaFragments,
  classifyRegionKind,
  isJunkMangaOcrText,
  guessVertical,
  lineCurvature,
  shouldDewarp,
  DEWARP_CURVATURE_THRESHOLD,
  halfToFullAscii,
} from '../mangaOcrText';

describe('mangaOcrText', () => {
  it('postprocesses manga-ocr decoder text', () => {
    expect(postprocessMangaOcrText('あ い　う')).toBe(halfToFullAscii('あいう'));
    // … → ... then half→full turns dots into fullwidth ．
    expect(postprocessMangaOcrText('あ…い')).toBe('あ．．．い');
  });

  it('flags punctuation-only and empty OCR as junk', () => {
    expect(isJunkMangaOcrText('')).toBe(true);
    expect(isJunkMangaOcrText('．．．．')).toBe(true);
    expect(isJunkMangaOcrText('....')).toBe(true);
    expect(isJunkMangaOcrText('・')).toBe(true);
    expect(isJunkMangaOcrText('思')).toBe(false);
    expect(isJunkMangaOcrText('これはテスト')).toBe(false);
  });

  it('strips interleaved furigana aggressively for tesseract fallback', () => {
    const raw = '漢かん字じ';
    expect(stripFuriganaFragments(raw, true)).toBe('漢字');
  });

  it('keeps plausible okurigana in non-aggressive mode', () => {
    expect(stripFuriganaFragments('食べる', false)).toBe('食べる');
  });

  it('classifies tiny / extreme-aspect regions as sfx', () => {
    const pageArea = 1000 * 1500;
    expect(classifyRegionKind({ width: 20, height: 20, pageArea }).kind).toBe('sfx');
    expect(classifyRegionKind({ width: 10, height: 200, pageArea }).kind).toBe('sfx');
    expect(classifyRegionKind({ width: 120, height: 200, pageArea }).kind).toBe('text');
  });

  it('guesses vertical from taller-than-wide boxes', () => {
    expect(guessVertical(40, 120)).toBe(true);
    expect(guessVertical(200, 40)).toBe(false);
  });

  it('dewarp threshold is a no-op for straight lines', () => {
    const straight = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ];
    expect(lineCurvature(straight)).toBe(0);
    expect(shouldDewarp(straight)).toBe(false);

    const curved = [
      { x: 0, y: 0 },
      { x: 10, y: 40 },
      { x: 20, y: 0 },
      { x: 30, y: 40 },
      { x: 40, y: 0 },
    ];
    expect(lineCurvature(curved)).toBeGreaterThan(DEWARP_CURVATURE_THRESHOLD);
    expect(shouldDewarp(curved)).toBe(true);
  });
});
