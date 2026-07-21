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

const { mergeOverlappingRegions, finalizeRegions, applyCorrections, readCorrections, writeCorrections } =
  await import('../mangaOcr');

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
