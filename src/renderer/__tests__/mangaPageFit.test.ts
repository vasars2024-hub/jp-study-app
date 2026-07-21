import { describe, expect, it } from 'vitest';
import { mangaPageFitStyles } from '../mangaPageFit';

const STAGE_W = 800;
const STAGE_H = 1000;

describe('mangaPageFitStyles', () => {
  it('limit-all caps both axes to the stage at zoom 1', () => {
    const { wrap, img } = mangaPageFitStyles('limit-all', 1, 100, STAGE_W, STAGE_H);
    expect(img.maxWidth).toBe(STAGE_W);
    expect(img.maxHeight).toBe(STAGE_H);
    expect(wrap.zoom).toBe(1);
  });

  it('applies zoom via CSS zoom on the wrap (fit caps stay at 1×)', () => {
    const { wrap, img } = mangaPageFitStyles('limit-all', 1.5, 80, STAGE_W, STAGE_H);
    expect(wrap.zoom).toBe(1.5);
    // Caps are stage × max-width%, not multiplied by zoom — zoom scales the wrap.
    expect(img.maxWidth).toBe(STAGE_W * 0.8);
    expect(img.maxHeight).toBe(STAGE_H);
  });

  it('limit-width caps width only so tall pages can scroll', () => {
    const { img } = mangaPageFitStyles('limit-width', 1, 100, STAGE_W, STAGE_H);
    expect(img.maxWidth).toBe(STAGE_W);
    expect(img.maxHeight).toBeUndefined();
  });

  it('limit-height caps height (and max page width)', () => {
    const { img } = mangaPageFitStyles('limit-height', 1, 100, STAGE_W, STAGE_H);
    expect(img.maxHeight).toBe(STAGE_H);
    expect(img.maxWidth).toBe(STAGE_W);
  });

  it('stretch-width forces width to stage but stays within height', () => {
    const { img } = mangaPageFitStyles('stretch-width', 1, 100, STAGE_W, STAGE_H);
    expect(img.width).toBe(STAGE_W);
    expect(img.maxHeight).toBe(STAGE_H);
  });

  it('stretch-height forces height to stage with width cap', () => {
    const { img } = mangaPageFitStyles('stretch-height', 1, 100, STAGE_W, STAGE_H);
    expect(img.height).toBe(STAGE_H);
    expect(img.maxWidth).toBe(STAGE_W);
  });

  it('stretch-all fills the stage box on both axes', () => {
    const { wrap, img } = mangaPageFitStyles('stretch-all', 1, 100, STAGE_W, STAGE_H);
    expect(wrap.width).toBe(STAGE_W);
    expect(wrap.height).toBe(STAGE_H);
    expect(img.width).toBe('100%');
    expect(img.height).toBe('100%');
    expect(img.objectFit).toBe('fill');
  });

  it('falls back to % caps when stage is unmeasured', () => {
    const { img } = mangaPageFitStyles('limit-all', 1, 100, 0, 0);
    expect(img.maxWidth).toBe('100%');
    expect(img.maxHeight).toBe('100%');
  });
});
