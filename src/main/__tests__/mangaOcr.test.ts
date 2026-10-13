// @vitest-environment node
import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MokuroBox, MokuroPage } from '../../shared/mokuroTypes';

// mangaOcr.ts pulls in Electron + the download manager + library paths at
// import time even though these tests only exercise its pure box-math
// helpers (mergeOverlappingRegions / finalizeRegions) and the corrections
// file I/O — stub just enough for the module to load without a live
// Electron process or ONNX runtime, but keep itemDir pointing at a REAL
// temp directory so readCorrections/writeCorrections exercise real fs.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-ocr-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));
vi.mock('../downloads', () => ({
  assetPath: () => null,
  isInstalled: () => false,
  registerAssetUnloadHandler: () => undefined,
}));
vi.mock('../library', () => ({
  itemDir: (id: string) => path.join(tmpRoot, id),
}));

const {
  mergeOverlappingRegions,
  finalizeRegions,
  applyCorrections,
  readCorrections,
  writeCorrections,
  parseDetectionSensitivity,
  scanRequestFromIpc,
  sampleRgbaBilinear,
  cropGray,
  letterboxRgb,
} = await import('../mangaOcr');

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function region(box: MokuroBox, score = 0.9) {
  return {
    box,
    score,
    points: [
      { x: box[0], y: box[1] },
      { x: box[2], y: box[1] },
      { x: box[2], y: box[3] },
      { x: box[0], y: box[3] },
    ],
  };
}

describe('mergeOverlappingRegions', () => {
  it('leaves non-overlapping regions untouched', () => {
    const regions = [region([0, 0, 50, 50]), region([100, 100, 150, 150])];
    const out = mergeOverlappingRegions(regions);
    expect(out).toHaveLength(2);
  });

  it('unions two heavily-overlapping boxes (IoU > 0.5)', () => {
    const regions = [region([0, 0, 100, 100]), region([10, 10, 110, 110])];
    const out = mergeOverlappingRegions(regions);
    expect(out).toHaveLength(1);
    expect(out[0].box).toEqual([0, 0, 110, 110]);
  });

  it('unions a small box mostly contained inside a larger one', () => {
    const regions = [region([0, 0, 200, 200]), region([10, 10, 40, 40])];
    const out = mergeOverlappingRegions(regions);
    expect(out).toHaveLength(1);
    expect(out[0].box).toEqual([0, 0, 200, 200]);
  });

  it('does not merge distant regions', () => {
    const regions = [region([0, 0, 50, 50]), region([200, 200, 250, 250])];
    const out = mergeOverlappingRegions(regions);
    expect(out).toHaveLength(2);
  });

  it('keeps the higher score after a merge', () => {
    const regions = [region([0, 0, 100, 100], 0.4), region([5, 5, 105, 105], 0.95)];
    const out = mergeOverlappingRegions(regions);
    expect(out[0].score).toBe(0.95);
  });

  it('merges lightly-overlapping neighbors via nearby pass in finalize', () => {
    // ~9% overlap — IoU alone keeps them; proximity merge should union them.
    const regions = [region([0, 0, 100, 100]), region([90, 90, 190, 190])];
    const out = finalizeRegions(regions, 1000, 1000);
    expect(out).toHaveLength(1);
    expect(out[0].box).toEqual([0, 0, 190, 190]);
  });

  it('drops tiny / low-score speckles when page size is known', () => {
    const regions = [
      region([0, 0, 200, 200], 0.9),
      region([10, 10, 18, 18], 0.05), // tiny + weak
    ];
    const out = finalizeRegions(regions, 1000, 1500);
    expect(out).toHaveLength(1);
    expect(out[0].box).toEqual([0, 0, 200, 200]);
  });
});

describe('finalizeRegions', () => {
  it('caps to 48 regions, merges duplicates, then sorts into reading order', () => {
    const many = Array.from({ length: 90 }, (_, i) =>
      region([i * 30, 0, i * 30 + 28, 40], 0.9),
    );
    const out = finalizeRegions(many, 4000, 2000);
    expect(out.length).toBeLessThanOrEqual(48);
  });

  it('produces reading-order output, not area-sorted output', () => {
    const regions = [
      region([0, 0, 300, 100], 0.9), // huge top-left region
      region([320, 400, 400, 480], 0.9), // bottom-right region
    ];
    const out = finalizeRegions(regions, 800, 800);
    // Reading order (top tier first) should put the top region first even
    // though it is far larger — confirms area-sort is no longer the final order.
    expect(out[0].box).toEqual([0, 0, 300, 100]);
  });
});

describe('corrections schema (legacy upconvert + mixed-field round-trip)', () => {
  it('upconverts a legacy string[] corrections file transparently', async () => {
    const itemId = 'legacy-item';
    const stem = 'p1';
    const dir = path.join(tmpRoot, itemId, '_ocr');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(
      path.join(dir, `${stem}.corrections.json`),
      JSON.stringify({ 'p1:0,0,10,10': ['legacy corrected text'] }),
      'utf8',
    );
    const map = await readCorrections(itemId, stem);
    expect(map['p1:0,0,10,10']).toEqual({ lines: ['legacy corrected text'] });
  });

  it('round-trips the new object shape with mixed fields', async () => {
    const itemId = 'new-item';
    const stem = 'p1';
    await writeCorrections(itemId, stem, {
      r1: { lines: ['line'], kind: 'ignore' },
      r2: { order: 3 },
    });
    const map = await readCorrections(itemId, stem);
    expect(map.r1).toEqual({ lines: ['line'], kind: 'ignore' });
    expect(map.r2).toEqual({ order: 3 });
  });

  it('ignores malformed entries without throwing', async () => {
    const itemId = 'malformed-item';
    const stem = 'p1';
    const dir = path.join(tmpRoot, itemId, '_ocr');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(
      path.join(dir, `${stem}.corrections.json`),
      JSON.stringify({ good: { lines: ['ok'] }, bad: 42, alsoBad: { lines: [1, 2] } }),
      'utf8',
    );
    const map = await readCorrections(itemId, stem);
    expect(map.good).toEqual({ lines: ['ok'] });
    expect(map.bad).toBeUndefined();
    expect(map.alsoBad).toBeUndefined();
  });

  it('returns {} for a missing corrections file', async () => {
    const map = await readCorrections('never-scanned-item', 'p1');
    expect(map).toEqual({});
  });
});

describe('applyCorrections', () => {
  const page: MokuroPage = {
    version: '1.01',
    img_width: 100,
    img_height: 100,
    blocks: [
      { box: [0, 0, 10, 10], vertical: true, lines: ['original'], regionId: 'r1', kind: 'text' },
      { box: [20, 20, 30, 30], vertical: false, lines: ['untouched'], regionId: 'r2', kind: 'text' },
    ],
  };

  it('applies a kind-only correction without clobbering lines, and leaves other blocks untouched', () => {
    const out = applyCorrections(page, { r1: { kind: 'ignore' } });
    expect(out.blocks[0].lines).toEqual(['original']);
    expect(out.blocks[0].kind).toBe('ignore');
    expect(out.blocks[1]).toEqual(page.blocks[1]);
  });

  it('applies a full correction (lines + kind + vertical + order) in one entry', () => {
    const out = applyCorrections(page, {
      r1: { lines: ['corrected'], kind: 'sfx', vertical: false, order: 5 },
    });
    expect(out.blocks[0]).toMatchObject({
      lines: ['corrected'],
      kind: 'sfx',
      vertical: false,
      order: 5,
    });
  });

  it('is a no-op for an empty correction map', () => {
    expect(applyCorrections(page, {})).toBe(page);
  });
});

describe('mangaOcr:scanPage keeps the detection setting', () => {
  it.each([
    ['low', 'low'],
    ['normal', 'normal'],
    ['high', 'high'],
    ['HIGH', undefined],
    ['max', undefined],
    [3, undefined],
    [null, undefined],
    [undefined, undefined],
  ])('parseDetectionSensitivity(%j) -> %j', (input, expected) => {
    expect(parseDetectionSensitivity(input)).toBe(expected);
  });

  it.each([
    [{ itemId: 'i', mediaUrl: 'media://i/pages/0001.jpg', force: true, detectionSensitivity: 'high' }, 'high'],
    [{ itemId: 'i', mediaUrl: 'media://i/pages/0001.jpg', detectionSensitivity: 'low' }, 'low'],
    [{ itemId: 'i', mediaUrl: 'media://i/pages/0001.jpg', detectionSensitivity: 'normal' }, 'normal'],
  ])('forwards %j', (req, expected) => {
    expect(scanRequestFromIpc(req as never).detectionSensitivity).toBe(expected);
  });

  it.each([
    [{ itemId: 'i', mediaUrl: 'm' }],
    [{ itemId: 'i', mediaUrl: 'm', detectionSensitivity: 'turbo' }],
    [{ itemId: 'i', mediaUrl: 'm', detectionSensitivity: { evil: true } }],
  ])('drops a missing or bogus setting: %j', (req) => {
    const out = scanRequestFromIpc(req as never);
    expect(out).not.toHaveProperty('detectionSensitivity');
    expect(out).toEqual({ itemId: 'i', mediaUrl: 'm', force: false });
  });

  it('copies only the known fields', () => {
    const out = scanRequestFromIpc({ itemId: 'i', mediaUrl: 'm', force: 1, extra: 'x' } as never);
    expect(out).toEqual({ itemId: 'i', mediaUrl: 'm', force: true });
  });
});

/** RGBA buffer from a gray-level function. */
function grayImage(w: number, h: number, at: (x: number, y: number) => number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = at(x, y);
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return out;
}

describe('page resampling is bilinear, not nearest-neighbour', () => {
  // 2×1: black, white.
  const pair = grayImage(2, 1, (x) => (x === 0 ? 0 : 255));

  it.each([
    [0, 0],
    [0.25, 63.75],
    [0.5, 127.5],
    [0.75, 191.25],
    [1, 255],
    [-3, 0],
    [9, 255],
  ])('sampleRgbaBilinear at x=%d -> %d', (x, expected) => {
    const [r, g, b] = sampleRgbaBilinear(pair, 2, 1, x, 0);
    expect(r).toBeCloseTo(expected, 5);
    expect(g).toBeCloseTo(expected, 5);
    expect(b).toBeCloseTo(expected, 5);
  });

  it('interpolates in both axes', () => {
    // 2×2: 0 255 / 255 0 — the centre is the mean.
    const checker = grayImage(2, 2, (x, y) => ((x + y) % 2 ? 255 : 0));
    expect(sampleRgbaBilinear(checker, 2, 2, 0.5, 0.5)[0]).toBeCloseTo(127.5, 5);
    expect(sampleRgbaBilinear(checker, 2, 2, 0, 0)[0]).toBe(0);
    expect(sampleRgbaBilinear(checker, 2, 2, 1, 0)[0]).toBe(255);
  });

  it('upscaling a crop produces a ramp, not two flat halves', () => {
    const crop = cropGray(pair, 2, 1, [0, 0, 2, 1], 8);
    const row = Array.from(crop.slice(0, 8));
    const distinct = new Set(row.map((v) => v.toFixed(3)));
    // nearest-neighbour gave exactly {0, 1}
    expect(distinct.size).toBeGreaterThan(2);
    for (let i = 1; i < row.length; i++) expect(row[i]).toBeGreaterThanOrEqual(row[i - 1]);
    expect(row[0]).toBeCloseTo(0, 5);
    expect(row[7]).toBeCloseTo(1, 5);
  });

  it('a 1 px stroke survives a 4x shrink instead of vanishing between taps', () => {
    // 16×16 white with one black column at x=5. Shrunk to 4×4, nearest-neighbour
    // sampled x = 0, 4, 8, 12 (never 5) and returned pure white.
    const stroke = grayImage(16, 16, (x) => (x === 5 ? 0 : 255));
    const crop = cropGray(stroke, 16, 16, [0, 0, 16, 16], 4);
    const column1 = [crop[1], crop[5], crop[9], crop[13]];
    for (const v of column1) expect(v).toBeLessThan(0.95);
    const column3 = [crop[3], crop[7], crop[11], crop[15]];
    for (const v of column3) expect(v).toBeCloseTo(1, 5);
  });

  it('keeps a flat image flat, rotated or not', () => {
    const flat = grayImage(40, 30, () => 200);
    for (const deg of [0, 90, -90, 7]) {
      const crop = cropGray(flat, 40, 30, [5, 5, 35, 25], 16, deg);
      for (const v of crop) expect(v).toBeCloseTo(200 / 255, 4);
    }
  });

  it('letterboxes with the page centred, gray padding, and an averaged shrink', () => {
    // 8×4 page, columns 0-2 black and 3-7 white, into a 4×4 box: ratio 0.5,
    // 4×2 content with one row of padding above and below.
    const page = grayImage(8, 4, (x) => (x < 3 ? 0 : 255));
    const { data, ratio, padX, padY } = letterboxRgb(page, 8, 4, 4);
    expect(ratio).toBe(0.5);
    expect(padX).toBe(0);
    expect(padY).toBe(1);
    const red = Array.from(data.slice(0, 16));
    expect(red.slice(0, 4)).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(red.slice(12, 16)).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(red[4]).toBeCloseTo(0, 5);
    // output column 1 covers source columns 2 (black) and 3 (white): blended.
    // Nearest-neighbour picked column 3 alone and returned pure white.
    expect(red[5]).toBeCloseTo(0.5, 5);
    expect(red[6]).toBeCloseTo(1, 5);
    expect(red[7]).toBeCloseTo(1, 5);
  });
});
