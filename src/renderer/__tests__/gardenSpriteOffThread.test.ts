/**
 * The City's Mooncap sprite is keyed and re-lit in a worker.
 *
 * Opening the City ran ~1.1 s (first open) and 0.6-1 s (later opens) of pixel work in the
 * atlas image's onload on the UI thread — one long task each time, in every look (round-4
 * console sweep; CPU profile: `l.onload` 1214 ms self time). The work is now a pure function
 * a worker runs; these tests pin what that function does and that the async entry point
 * hands the pixels to a worker when one exists and grades in place when none can be made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class TestImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
    if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
    else { this.data = a; this.width = b; this.height = c ?? a.length / 4 / b; }
  }
}

/** 40x20: black backdrop, a bright 10x12 blob in the middle, a bright sliver on the right edge. */
function atlasCell(): ImageData {
  const w = 40; const h = 20;
  const img = new TestImageData(w, h) as unknown as ImageData;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const blob = x >= 15 && x < 25 && y >= 4 && y < 16;
    const sliver = x >= 39 && y >= 8 && y < 11;
    const v = blob ? 200 : sliver ? 190 : 3;
    img.data[i] = v; img.data[i + 1] = blob ? 170 : v; img.data[i + 2] = blob ? 220 : v; img.data[i + 3] = 255;
  }
  return img;
}

beforeEach(() => { vi.stubGlobal('ImageData', TestImageData); });
afterEach(async () => {
  const { resetGardenSpriteWorkerForTests } = await import('../components/reading-garden/gardenSpriteAsync');
  resetGardenSpriteWorkerForTests();
  vi.unstubAllGlobals();
});

describe('Mooncap sprite pixels', () => {
  it('keys the backdrop, drops the neighbouring cell sliver and keeps the sprite', async () => {
    const { keyAndGradeStagePixels } = await import('../components/reading-garden/stageSpritePixels');
    const img = atlasCell();
    const graded = keyAndGradeStagePixels(img);
    const alpha = (x: number, y: number) => graded.image.data[(y * 40 + x) * 4 + 3];
    expect(alpha(2, 2)).toBe(0); // backdrop
    expect(alpha(39, 9)).toBe(0); // edge sliver from the next cell
    expect(alpha(20, 8)).toBeGreaterThan(200); // the sprite itself
    expect([graded.minX, graded.maxX]).toEqual([15, 24]);
  });
});

describe('grading off the UI thread', () => {
  it('posts the pixels to a worker (transferred) and rebuilds its answer', async () => {
    const { keyAndGradeStagePixels } = await import('../components/reading-garden/stageSpritePixels');
    const posted: { transfer: unknown[] }[] = [];
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      postMessage(msg: { id: number; width: number; height: number; buffer: ArrayBuffer }, transfer: unknown[]) {
        posted.push({ transfer });
        const g = keyAndGradeStagePixels(new TestImageData(new Uint8ClampedArray(msg.buffer), msg.width, msg.height) as unknown as ImageData);
        queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, ok: true, width: msg.width, height: msg.height, image: g.image.data.buffer, emissive: g.emissive.data.buffer, minX: g.minX, minY: g.minY, maxX: g.maxX, maxY: g.maxY } }));
      }
      terminate() { /* */ }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const { gradeStagePixelsOffThread } = await import('../components/reading-garden/gardenSpriteAsync');
    const offThread = await gradeStagePixelsOffThread(atlasCell());
    const inline = keyAndGradeStagePixels(atlasCell());
    expect(posted).toHaveLength(1);
    expect(posted[0].transfer).toHaveLength(1);
    expect([offThread.minX, offThread.minY, offThread.maxX, offThread.maxY]).toEqual([inline.minX, inline.minY, inline.maxX, inline.maxY]);
    expect(Array.from(offThread.image.data)).toEqual(Array.from(inline.image.data));
  });

  it('grades in place when no worker can be made', async () => {
    vi.stubGlobal('Worker', function NoWorker() { throw new Error('no workers here'); });
    const { gradeStagePixelsOffThread } = await import('../components/reading-garden/gardenSpriteAsync');
    const graded = await gradeStagePixelsOffThread(atlasCell());
    expect([graded.minX, graded.maxX]).toEqual([15, 24]);
  });
});
