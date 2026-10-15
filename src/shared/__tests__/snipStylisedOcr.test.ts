// @vitest-environment node
/**
 * The basic reader on stylised snips, with pictures generated here (no fonts,
 * no checked-in images) and a stub recognizer that is confident only when it
 * is shown clean glyphs — black, glyph-sized, separate, on white — the way
 * Tesseract is.
 *
 *  - coloured, outlined lettering over a noisy photo-like background (the
 *    owner's thumbnail): the global threshold sees noise; the colour layers
 *    find the lettering;
 *  - light text on a dark, noisy box: found by polarity, as before;
 *  - a preparation the recognizer would refuse (a strip longer than it reads)
 *    is skipped instead of failing the whole snip.
 */
import { describe, expect, it } from 'vitest';
import {
  adaptiveBinarize,
  colourLayers,
  connectedComponents,
  keepGlyphComponents,
  textLikeness,
  toGray,
  type RgbaImage,
} from '../ocrPreprocess';
import { readWithBasicEngine, type BasicRecognizer, type TesseractPageLike } from '../lensBasicOcr';

type Rgb = [number, number, number];

/** Deterministic noise. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function blank(width: number, height: number, bg: (x: number, y: number) => Rgb): RgbaImage & { data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = bg(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

function rect(img: RgbaImage & { data: Uint8ClampedArray }, x0: number, y0: number, w: number, h: number, c: Rgb): void {
  for (let y = Math.max(0, y0); y < Math.min(img.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(img.width, x0 + w); x++) {
      const o = (y * img.width + x) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
    }
  }
}

/** A "工"-shaped glyph of `size` px at (x, y): three connected bars. */
function glyph(img: RgbaImage & { data: Uint8ClampedArray }, x: number, y: number, size: number, c: Rgb, grow = 0): void {
  const t = Math.round(size * 0.18);
  rect(img, x - grow, y - grow, size + grow * 2, t + grow * 2, c);
  rect(img, x + Math.round(size / 2 - t / 2) - grow, y - grow, t + grow * 2, size + grow * 2, c);
  rect(img, x - grow, y + size - t - grow, size + grow * 2, t + grow * 2, c);
}

/** Five glyphs in a row, each filled with `fill` and (optionally) outlined. */
function lettering(img: RgbaImage & { data: Uint8ClampedArray }, fills: Rgb[], outline?: Rgb, size = 48): void {
  fills.forEach((fill, i) => {
    const x = 30 + i * (size + 24);
    if (outline) glyph(img, x, 40, size, outline, 5);
    glyph(img, x, 40, size, fill);
  });
}

/**
 * The stub recognizer: it "reads" one character per clean glyph-sized
 * component, and is confident only when what it is shown is lettering alone.
 */
function stubRecognizer(expected: number): { recognize: BasicRecognizer; passes: number } {
  const state = { passes: 0 };
  const recognize: BasicRecognizer = async (image) => {
    state.passes += 1;
    const gray = toGray({ data: image.rgba, width: image.width, height: image.height });
    const mask = new Uint8Array(gray.data.length);
    for (let i = 0; i < mask.length; i++) mask[i] = gray.data[i] < 128 ? 1 : 0;
    const { components } = connectedComponents(mask, image.width, image.height);
    const largest = Math.max(0, ...components.map((c) => c.area));
    const glyphs = components.filter((c) => c.area >= largest * 0.4).length;
    const noise = components.filter((c) => c.area < largest * 0.4).reduce((n, c) => n + c.area, 0);
    const inkArea = components.reduce((n, c) => n + c.area, 0) || 1;
    const clean = glyphs === expected ? 1 - noise / inkArea : 0.2;
    const confidence = Math.round(Math.max(0, Math.min(1, clean)) * 95);
    const page: TesseractPageLike = {
      blocks: [{ paragraphs: [{ lines: [{ text: '工'.repeat(Math.max(1, glyphs)), confidence, bbox: { x0: 0, y0: 0, x1: image.width, y1: image.height } }] }] }],
    };
    return page;
  };
  return {
    recognize,
    get passes() {
      return state.passes;
    },
  };
}

function noisyPhoto(seed: number): (x: number, y: number) => Rgb {
  const rnd = prng(seed);
  const cells = new Map<number, Rgb>();
  return (x, y) => {
    // Blotches of 3×3 px in mid tones, like fur and foliage in a thumbnail.
    const key = Math.floor(y / 3) * 10_000 + Math.floor(x / 3);
    let c = cells.get(key);
    if (!c) {
      const v = 70 + rnd() * 120;
      c = [v + rnd() * 30, v * 0.8, v * 0.6];
      cells.set(key, c);
    }
    return c;
  };
}

describe('stylised lettering', () => {
  it('colour layers: outlined red, white and green lettering over a noisy photo separates from the photo', () => {
    const img = blank(420, 130, noisyPhoto(7));
    lettering(img, [[220, 30, 40], [240, 240, 240], [30, 160, 60], [220, 30, 40], [30, 160, 60]], [20, 20, 20]);
    const layers = colourLayers(img);
    expect(layers.length).toBeGreaterThan(0);
    // The best layer is lettering-shaped: glyph-sized components, a modest share of the picture.
    expect(textLikeness(layers[0])).toBeGreaterThan(0);
    // The dark outline layer holds all five glyphs as five components once the noise is gone.
    const outlines = layers.map((plane) => {
      const mask = new Uint8Array(plane.data.length);
      for (let i = 0; i < mask.length; i++) mask[i] = plane.data[i] < 128 ? 1 : 0;
      return connectedComponents(mask, plane.width, plane.height).components.filter((c) => c.x1 - c.x0 > 40).length;
    });
    expect(Math.max(...outlines)).toBe(5);
  });

  it('adaptive threshold finds dark ink over an uneven background; glyph filtering drops the specks', () => {
    const img = blank(420, 130, (x) => [120 + x / 4, 120 + x / 4, 120 + x / 4]);
    lettering(img, Array(5).fill([40, 40, 40]) as Rgb[]);
    const rnd = prng(3);
    for (let i = 0; i < 300; i++) rect(img, Math.floor(rnd() * 420), Math.floor(rnd() * 130), 2, 2, [30, 30, 30]);
    const plane = keepGlyphComponents(adaptiveBinarize(toGray(img), { polarity: 'dark' }));
    const mask = new Uint8Array(plane.data.length);
    for (let i = 0; i < mask.length; i++) mask[i] = plane.data[i] < 128 ? 1 : 0;
    const { components } = connectedComponents(mask, plane.width, plane.height);
    expect(components.filter((c) => c.x1 - c.x0 > 20)).toHaveLength(5);
    // Of 300 specks, only the odd clump that happens to reach glyph size survives.
    expect(components.filter((c) => c.x1 - c.x0 <= 20).length).toBeLessThan(5);
  });

  it('the stylised passes read what the plain passes cannot, and stop once the read is good', async () => {
    const img = blank(420, 130, noisyPhoto(11));
    lettering(img, [[220, 30, 40], [240, 240, 240], [30, 160, 60], [220, 30, 40], [30, 160, 60]], [20, 20, 20]);
    const plain = stubRecognizer(5);
    const before = await readWithBasicEngine(img, plain.recognize);
    const stylised = stubRecognizer(5);
    const after = await readWithBasicEngine(img, stylised.recognize, { stylised: true });
    const conf = (lines: Array<{ confidence: number }>) => Math.max(0, ...lines.map((l) => l.confidence));
    expect(conf(after.lines)).toBeGreaterThan(conf(before.lines));
    expect(conf(after.lines)).toBeGreaterThanOrEqual(0.72);
    expect(after.text).toBe('工工工工工');
    expect(stylised.passes).toBeGreaterThan(plain.passes);
  });

  it('the stylised passes keep to their time budget', async () => {
    const img = blank(420, 130, noisyPhoto(5));
    lettering(img, [[220, 30, 40], [30, 160, 60]], [20, 20, 20]);
    let now = 0;
    const slow = stubRecognizer(99);
    const recognize: BasicRecognizer = async (image, model) => {
      now += 4000;
      return slow.recognize(image, model);
    };
    const plainPasses = stubRecognizer(99);
    await readWithBasicEngine(img, plainPasses.recognize);
    await readWithBasicEngine(img, recognize, { stylised: true, budgetMs: 1000, now: () => now });
    // Past the budget after the plain passes: no stylised pass ran.
    expect(slow.passes).toBe(plainPasses.passes);
  });

  it('light text on a dark, noisy box is read by polarity', async () => {
    const rnd = prng(9);
    const img = blank(420, 130, () => {
      const v = 20 + rnd() * 25;
      return [v, v, v];
    });
    lettering(img, Array(5).fill([235, 235, 235]) as Rgb[]);
    const stub = stubRecognizer(5);
    const read = await readWithBasicEngine(img, stub.recognize, { stylised: true });
    expect(read.polarity).toBe('light');
    expect(read.text).toBe('工工工工工');
  });

  it('a preparation larger than the recognizer reads is skipped, never thrown at it', async () => {
    // A tall, thin "column" of hundreds of tiny cells: what laid out a 244 454 px strip before.
    const img = blank(60, 3000, () => [255, 255, 255]);
    for (let y = 0; y < 3000; y += 6) rect(img, 25, y, 10, 3, [0, 0, 0]);
    const sizes: number[] = [];
    const recognize: BasicRecognizer = async (image) => {
      sizes.push(Math.max(image.width, image.height));
      return { blocks: [] };
    };
    const read = await readWithBasicEngine(img, recognize);
    expect(Math.max(0, ...sizes)).toBeLessThanOrEqual(8192);
    expect(read.text).toBe('');
  });
});
