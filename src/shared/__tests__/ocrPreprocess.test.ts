import { describe, expect, it } from 'vitest';
import {
  chooseOcrScale,
  columnCells,
  connectedComponents,
  detectOrientation,
  furiganaRuns,
  guessPolarity,
  isSpeckled,
  otsuThreshold,
  prepareOcrImage,
  prepToSourceBox,
  projectionRuns,
  removeClutter,
  resizeGray,
  toGray,
  type RgbaImage,
} from '../ocrPreprocess';

// ---- synthetic pages -----------------------------------------------------

function blankMask(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height);
}

function fillRect(mask: Uint8Array, width: number, x: number, y: number, w: number, h: number): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) mask[yy * width + xx] = 1;
}

/** "Glyphs" as solid em-sized squares on a grid. */
function textGrid(opts: {
  width: number;
  height: number;
  em: number;
  lines: number;
  perLine: number;
  vertical: boolean;
  charGap?: number;
  lineGap?: number;
}): Uint8Array {
  const { width, height, em, lines, perLine, vertical } = opts;
  const charGap = opts.charGap ?? Math.round(em * 0.15);
  const lineGap = opts.lineGap ?? Math.round(em * 0.7);
  const mask = blankMask(width, height);
  for (let line = 0; line < lines; line++) {
    for (let i = 0; i < perLine; i++) {
      const along = 10 + i * (em + charGap);
      const across = 10 + line * (em + lineGap);
      if (vertical) fillRect(mask, width, width - 10 - em - across + 10, along, em, em);
      else fillRect(mask, width, along, across, em, em);
    }
  }
  return mask;
}

function rgbaFromMask(mask: Uint8Array, width: number, height: number, ink = 20, paper = 235): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? ink : paper;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

// ---- tests ---------------------------------------------------------------

describe('toGray / otsuThreshold / guessPolarity', () => {
  it('splits a two-tone image between its tones', () => {
    const mask = textGrid({ width: 200, height: 60, em: 20, lines: 1, perLine: 6, vertical: false });
    const gray = toGray(rgbaFromMask(mask, 200, 60));
    const t = otsuThreshold(gray);
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThan(235);
    expect(guessPolarity(gray, t)).toBe('dark');
  });

  it('calls light text on a dark box light ink', () => {
    const mask = textGrid({ width: 200, height: 60, em: 20, lines: 1, perLine: 6, vertical: false });
    const gray = toGray(rgbaFromMask(mask, 200, 60, 240, 25));
    expect(guessPolarity(gray, otsuThreshold(gray))).toBe('light');
  });

  it('composites transparency onto white', () => {
    const gray = toGray({ data: [0, 0, 0, 0], width: 1, height: 1 });
    expect(gray.data[0]).toBe(255);
  });
});

describe('removeClutter', () => {
  it('drops isolated specks but keeps a dakuten-sized mark beside its glyph', () => {
    const width = 120;
    const height = 60;
    const mask = blankMask(width, height);
    fillRect(mask, width, 10, 10, 30, 30); // glyph
    fillRect(mask, width, 42, 8, 3, 3); // dakuten, hugging the glyph
    fillRect(mask, width, 100, 50, 1, 1); // lone speck
    fillRect(mask, width, 90, 5, 2, 2); // far small blob
    removeClutter(mask, width, height);
    const { components } = connectedComponents(mask, width, height);
    // Labelled in scan order: the dakuten's row comes first.
    expect(components.map((c) => [c.x0, c.y0])).toEqual([[42, 8], [10, 10]]);
  });

  it('drops a hollow frame (a bubble outline) and keeps the text inside', () => {
    const width = 200;
    const height = 200;
    const mask = blankMask(width, height);
    fillRect(mask, width, 5, 5, 190, 2);
    fillRect(mask, width, 5, 193, 190, 2);
    fillRect(mask, width, 5, 5, 2, 190);
    fillRect(mask, width, 193, 5, 2, 190);
    fillRect(mask, width, 80, 80, 30, 30);
    removeClutter(mask, width, height);
    const { components } = connectedComponents(mask, width, height);
    expect(components).toHaveLength(1);
    expect(components[0].x0).toBe(80);
  });

  it('drops background bleeding in from three edges around a subtitle band', () => {
    const width = 200;
    const height = 60;
    const mask = blankMask(width, height);
    // Bright surroundings (ink under light polarity) around a dark band.
    fillRect(mask, width, 0, 0, width, 6);
    fillRect(mask, width, 0, 54, width, 6);
    fillRect(mask, width, 0, 0, 6, height);
    fillRect(mask, width, 194, 0, 6, height);
    fillRect(mask, width, 40, 20, 20, 20);
    removeClutter(mask, width, height);
    const { components } = connectedComponents(mask, width, height);
    expect(components).toHaveLength(1);
    expect(components[0].x0).toBe(40);
  });

  it('flags a speckled page and not a clean one', () => {
    expect(isSpeckled({ specks: 300, glyphs: 40 })).toBe(true);
    expect(isSpeckled({ specks: 3, glyphs: 40 })).toBe(false);
    expect(isSpeckled({ specks: 50, glyphs: 60 })).toBe(false);
  });
});

describe('detectOrientation', () => {
  it('reads two grid-aligned horizontal lines as horizontal', () => {
    const mask = textGrid({ width: 400, height: 100, em: 24, lines: 2, perLine: 12, vertical: false });
    const guess = detectOrientation(mask, 400, 100);
    expect(guess.orientation).toBe('horizontal');
    expect(guess.lineRuns).toHaveLength(2);
  });

  it('reads three grid-aligned columns as vertical', () => {
    const mask = textGrid({ width: 140, height: 300, em: 24, lines: 3, perLine: 10, vertical: true });
    const guess = detectOrientation(mask, 140, 300);
    expect(guess.orientation).toBe('vertical');
    expect(guess.lineRuns).toHaveLength(3);
  });

  it('reads a single line with wide character gaps as horizontal (elongation beats spacing)', () => {
    const mask = textGrid({ width: 500, height: 50, em: 24, lines: 1, perLine: 10, vertical: false, charGap: 18 });
    expect(detectOrientation(mask, 500, 50).orientation).toBe('horizontal');
  });

  it('reads a single tall column as vertical', () => {
    const mask = textGrid({ width: 60, height: 320, em: 24, lines: 1, perLine: 10, vertical: true });
    expect(detectOrientation(mask, 60, 320).orientation).toBe('vertical');
  });

  it('is unsure about an empty mask rather than inventing a direction', () => {
    expect(detectOrientation(blankMask(10, 10), 10, 10).confidence).toBe(0);
  });
});

describe('furiganaRuns', () => {
  it('marks a thin band hugging the top of a horizontal line', () => {
    const runs = [{ start: 0, end: 10 }, { start: 13, end: 37 }, { start: 50, end: 60 }, { start: 63, end: 87 }];
    expect(furiganaRuns(runs, 'horizontal')).toEqual([{ start: 0, end: 10 }, { start: 50, end: 60 }]);
  });

  it('marks ruby to the right of a column, never to its left', () => {
    // Columns are in x order: [column 0..24] [ruby 27..37] [column 60..84]
    const runs = [{ start: 0, end: 24 }, { start: 27, end: 37 }, { start: 60, end: 84 }];
    expect(furiganaRuns(runs, 'vertical')).toEqual([{ start: 27, end: 37 }]);
  });

  it('leaves a page of equal lines alone', () => {
    const runs = [{ start: 0, end: 24 }, { start: 40, end: 64 }];
    expect(furiganaRuns(runs, 'horizontal')).toEqual([]);
  });
});

describe('chooseOcrScale / resizeGray', () => {
  it('upscales small glyphs toward the target and never downscales', () => {
    expect(chooseOcrScale(10, 200, 30)).toBe(4);
    expect(chooseOcrScale(20, 200, 30)).toBe(2);
    expect(chooseOcrScale(60, 200, 30)).toBe(1);
    expect(chooseOcrScale(0, 200, 30)).toBe(1);
  });

  it('bounds the upscaled side', () => {
    expect(chooseOcrScale(10, 3000, 100)).toBeLessThanOrEqual(4096 / 3000 + 0.01);
  });

  it('resizes a grey image bilinearly', () => {
    const out = resizeGray({ data: new Uint8Array([0, 255]), width: 2, height: 1 }, 2);
    expect(out.width).toBe(4);
    expect(out.height).toBe(2);
    expect(out.data[0]).toBe(0);
    expect(out.data[3]).toBe(255);
  });
});

describe('columnCells', () => {
  it('cuts touching heavy glyphs at the thinnest rows', () => {
    const width = 40;
    const height = 130;
    const mask = blankMask(width, height);
    // Four 30px glyphs touching through a 2px neck between each.
    for (let i = 0; i < 4; i++) fillRect(mask, width, 5, 2 + i * 31, 30, 30);
    for (let i = 0; i < 3; i++) fillRect(mask, width, 18, 32 + i * 31, 4, 1);
    const cells = columnCells(mask, width, height, { start: 5, end: 35 }, 30);
    expect(cells).toHaveLength(4);
  });

  it('turns a long single stroke back into a bar and keeps a split glyph whole', () => {
    const width = 40;
    const height = 100;
    const mask = blankMask(width, height);
    fillRect(mask, width, 18, 2, 4, 28); // ー in tategaki: a tall thin stroke
    fillRect(mask, width, 5, 40, 30, 4); // 二, top stroke
    fillRect(mask, width, 5, 54, 30, 4); // 二, bottom stroke
    const cells = columnCells(mask, width, height, { start: 5, end: 35 }, 30);
    expect(cells).toHaveLength(2);
    expect(cells[0].bar).toBe(true);
    expect(cells[1].bar).toBe(false);
    expect(cells[1].y0).toBe(40);
    expect(cells[1].y1).toBe(58);
  });
});

describe('prepareOcrImage', () => {
  it('inverts light-on-dark text to black on white and pads it', () => {
    const mask = textGrid({ width: 300, height: 70, em: 40, lines: 1, perLine: 5, vertical: false });
    const prepared = prepareOcrImage(rgbaFromMask(mask, 300, 70, 245, 20));
    expect(prepared.polarity).toBe('light');
    expect(prepared.hasInk).toBe(true);
    // The pad is paper.
    expect(prepared.rgba[0]).toBe(255);
    // A glyph pixel (source 30,30) is ink in the output.
    const x = 30 + prepared.pad;
    const y = 30 + prepared.pad;
    expect(prepared.rgba[(y * prepared.width + x) * 4]).toBe(0);
  });

  it('upscales small text and maps boxes back to source pixels', () => {
    const mask = textGrid({ width: 200, height: 30, em: 10, lines: 1, perLine: 8, vertical: false });
    const prepared = prepareOcrImage(rgbaFromMask(mask, 200, 30));
    expect(prepared.scale).toBeGreaterThan(2);
    const box = prepToSourceBox(
      { x0: prepared.pad + 10 * prepared.scale, y0: prepared.pad + 10 * prepared.scale, x1: prepared.pad + 20 * prepared.scale, y1: prepared.pad + 20 * prepared.scale },
      prepared,
      { width: 200, height: 30 },
    );
    expect(box.map((v) => Math.round(v))).toEqual([10, 10, 10, 10]);
  });

  it('re-lays vertical columns as horizontal lines, right column first, and maps each back', () => {
    const mask = textGrid({ width: 140, height: 300, em: 40, lines: 2, perLine: 6, vertical: true });
    const prepared = prepareOcrImage(rgbaFromMask(mask, 140, 300));
    expect(prepared.orientation).toBe('vertical');
    expect(prepared.model).toBe('jpn');
    expect(prepared.rows).toHaveLength(2);
    const [first, second] = prepared.rows!;
    expect(first.source[0]).toBeGreaterThan(second.source[0]);
    const mapped = prepToSourceBox({ x0: 0, y0: second.y0 + 2, x1: 50, y1: second.y1 - 2 }, prepared, { width: 140, height: 300 });
    expect(mapped[0]).toBeCloseTo(second.source[0]);
  });

  it('reports an empty page as having no ink', () => {
    const prepared = prepareOcrImage(rgbaFromMask(blankMask(50, 50), 50, 50));
    expect(prepared.hasInk).toBe(false);
  });

  it('removes ruby above a horizontal line', () => {
    const width = 300;
    const height = 90;
    const mask = blankMask(width, height);
    for (let i = 0; i < 6; i++) fillRect(mask, width, 10 + i * 46, 40, 40, 40);
    for (let i = 0; i < 4; i++) fillRect(mask, width, 14 + i * 22, 20, 16, 16);
    const prepared = prepareOcrImage(rgbaFromMask(mask, width, height));
    expect(prepared.furiganaRemoved).toBe(1);
    const y = 28 + prepared.pad;
    const x = 20 + prepared.pad;
    expect(prepared.rgba[(y * prepared.width + x) * 4]).toBe(255);
  });

  it('projection runs ignore a row grazed by a stray pixel', () => {
    const width = 400;
    const height = 40;
    const mask = blankMask(width, height);
    fillRect(mask, width, 10, 10, 300, 20);
    mask[2 * width + 5] = 1;
    expect(projectionRuns(mask, width, height, 'rows')).toEqual([{ start: 10, end: 30 }]);
  });
});
