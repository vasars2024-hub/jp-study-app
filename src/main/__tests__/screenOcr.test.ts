// @vitest-environment node
/**
 * Reading Lens screen-OCR tests.
 *
 * `screenOcr.ts` runs in the main process behind `lens:ocr`, on a region the
 * renderer computed from a mouse drag. Everything it is handed is untrusted, and
 * a throw here takes the whole main process with it — so the bar these tests
 * hold it to is "a malformed, off-screen or degenerate region returns a result
 * object, never an exception".
 *
 * Nothing real is captured: `desktopCapturer` and `screen` are stubbed, and the
 * OCR engines are stubbed too, so the geometry and the failure paths are what is
 * actually under test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutoOcrLine, AutoOcrResult } from '../ocrAuto';
import { ocrRegion, __screenOcrTestables } from '../screenOcr';

// ---- Electron / engine stubs -------------------------------------------
//
// The stubs live in `vi.hoisted` so a *static* import of the module under test
// works: `vi.mock` factories run during that import, which is before ordinary
// top-level `const`s are initialised. The alternative — `await import()` after
// the consts — is the older idiom in this directory but costs a TS1378
// top-level-await error under this tsconfig, and the point of these tests is
// not to add to that pile.

const h = vi.hoisted(() => {
  interface FakeImage {
    isEmpty: () => boolean;
    getSize: () => { width: number; height: number };
    crop: (r: { x: number; y: number; width: number; height: number }) => FakeImage;
    toDataURL: () => string;
    toBitmap: () => Buffer;
    resize: (o: { width: number; height: number; quality?: string }) => FakeImage;
    toJPEG: (q: number) => Buffer;
  }

  const cropCalls: Array<{ x: number; y: number; width: number; height: number }> = [];
  const resizeCalls: Array<{ width: number; height: number }> = [];

  function fakeImage(width: number, height: number, fill = 0xab): FakeImage {
    return {
      isEmpty: () => width <= 0 || height <= 0,
      getSize: () => ({ width, height }),
      crop: (r) => {
        cropCalls.push({ ...r });
        return fakeImage(r.width, r.height, fill);
      },
      toDataURL: () => `data:image/png;base64,${width}x${height}`,
      toBitmap: () => Buffer.alloc(Math.max(1, width * height), fill),
      resize: (o) => {
        resizeCalls.push({ width: o.width, height: o.height });
        return fakeImage(o.width, o.height, fill);
      },
      toJPEG: () => Buffer.alloc(64, fill),
    };
  }

  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 }, scaleFactor: 2 },
  ];

  const state = {
    thumbnail: fakeImage(1920, 1080),
    sourcesThrow: null as Error | null,
    sources: null as unknown[] | null,
  };
  const engines = { paddle: true, manga: true };
  const ocr = {
    calls: [] as string[],
    impl: null as null | ((dataUrl: string) => unknown),
    throws: null as Error | null,
  };

  return { cropCalls, resizeCalls, fakeImage, displays, state, engines, ocr };
});

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => h.displays,
    getPrimaryDisplay: () => h.displays[0],
  },
  desktopCapturer: {
    getSources: async () => {
      if (h.state.sourcesThrow) throw h.state.sourcesThrow;
      if (h.state.sources) return h.state.sources;
      return [{ display_id: '1', thumbnail: h.state.thumbnail }];
    },
  },
}));

vi.mock('../paddleOcr', () => ({ paddleOcrAvailable: () => h.engines.paddle }));
vi.mock('../mangaOcr', () => ({ mangaOcrAvailable: () => h.engines.manga }));
vi.mock('../ocrAuto', () => ({
  ocrAuto: async (dataUrl: string) => {
    h.ocr.calls.push(dataUrl);
    if (h.ocr.throws) throw h.ocr.throws;
    return h.ocr.impl ? h.ocr.impl(dataUrl) : { engine: 'web', lang: 'ja', lines: [], text: '', mangaConsidered: false };
  },
}));

const { cropCalls, resizeCalls, fakeImage, state, engines, ocr } = h;
const { regionToPixels, decideZoom, scaleLines, betterPass, medianGlyphPx, meanConfidence, totalChars } =
  __screenOcrTestables;

// ---- helpers ------------------------------------------------------------

function line(
  box: [number, number, number, number],
  text = 'あ',
  confidence = 0.9,
  vertical = false,
): AutoOcrLine {
  return { box, text, confidence, vertical };
}

function result(lines: AutoOcrLine[], engine: 'web' | 'manga' = 'web'): AutoOcrResult {
  return {
    engine,
    lang: 'ja',
    lines,
    text: lines.map((l) => l.text).join('\n'),
    mangaConsidered: false,
  };
}

beforeEach(() => {
  cropCalls.length = 0;
  resizeCalls.length = 0;
  ocr.calls.length = 0;
  ocr.impl = null;
  ocr.throws = null;
  engines.paddle = true;
  engines.manga = true;
  state.thumbnail = fakeImage(1920, 1080);
  state.sourcesThrow = null;
  state.sources = null;
});

// ---- regionToPixels: clamping and validation ---------------------------

describe('regionToPixels', () => {
  const size = { width: 1920, height: 1080 };

  it('passes a fully-contained region through, scaled', () => {
    expect(regionToPixels({ x: 100, y: 50, width: 400, height: 200 }, 1, size)).toEqual({
      x: 100,
      y: 50,
      width: 400,
      height: 200,
    });
  });

  it('scales DIP by the display scale factor', () => {
    expect(regionToPixels({ x: 10, y: 20, width: 100, height: 50 }, 2, size)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
  });

  it('clamps a region straddling the right and bottom edges', () => {
    const px = regionToPixels({ x: 1800, y: 1000, width: 400, height: 400 }, 1, size);
    expect(px).toEqual({ x: 1800, y: 1000, width: 120, height: 80 });
  });

  it('clamps a negative origin to zero without shifting the far edge past the thumbnail', () => {
    const px = regionToPixels({ x: -500, y: -20, width: 300, height: 100 }, 1, size);
    expect(px!.x).toBe(0);
    expect(px!.y).toBe(0);
    expect(px!.x + px!.width).toBeLessThanOrEqual(size.width);
  });

  it('rejects a region whose origin is entirely past the thumbnail', () => {
    expect(regionToPixels({ x: 5000, y: 0, width: 100, height: 100 }, 1, size)).toBeNull();
    expect(regionToPixels({ x: 0, y: 5000, width: 100, height: 100 }, 1, size)).toBeNull();
  });

  it('rejects a degenerate region (zero, one-pixel or negative extent)', () => {
    expect(regionToPixels({ x: 0, y: 0, width: 0, height: 0 }, 1, size)).toBeNull();
    expect(regionToPixels({ x: 0, y: 0, width: 1, height: 100 }, 1, size)).toBeNull();
    expect(regionToPixels({ x: 0, y: 0, width: 100, height: -50 }, 1, size)).toBeNull();
  });

  // NaN <= 1 is false, so the dimension check alone lets NaN through to
  // nativeImage.crop. This is the case the explicit finite guard exists for.
  it('rejects non-finite values rather than letting them reach the native crop', () => {
    expect(regionToPixels({ x: NaN, y: 0, width: 100, height: 100 }, 1, size)).toBeNull();
    expect(regionToPixels({ x: 0, y: 0, width: NaN, height: 100 }, 1, size)).toBeNull();
    expect(regionToPixels({ x: 0, y: 0, width: Infinity, height: 100 }, 1, size)).toBeNull();
    expect(regionToPixels({ x: -Infinity, y: 0, width: 100, height: 100 }, 1, size)).toBeNull();
  });

  it('rejects a non-finite or non-positive scale factor', () => {
    expect(regionToPixels({ x: 0, y: 0, width: 100, height: 100 }, NaN, size)).toBeNull();
    expect(regionToPixels({ x: 0, y: 0, width: 100, height: 100 }, 0, size)).toBeNull();
  });
});

// ---- ocrRegion: the main-process crash surface -------------------------

describe('ocrRegion — malformed input must not throw', () => {
  it('returns a capture failure for a NaN region instead of cropping', async () => {
    const res = await ocrRegion({ x: NaN, y: NaN, width: NaN, height: NaN }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('capture-failed');
    expect(cropCalls).toHaveLength(0);
  });

  it('returns a capture failure for an off-screen region', async () => {
    const res = await ocrRegion({ x: 9000, y: 9000, width: 100, height: 100 }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('capture-failed');
    expect(cropCalls).toHaveLength(0);
  });

  it('returns a capture failure for a zero-area region', async () => {
    const res = await ocrRegion({ x: 10, y: 10, width: 0, height: 0 }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('capture-failed');
  });

  it('crops to the clamped rect for a region straddling the edge', async () => {
    ocr.impl = () => result([line([0, 0, 10, 10])]);
    const res = await ocrRegion({ x: 1900, y: 1070, width: 500, height: 500 }, 1);
    expect(cropCalls).toEqual([{ x: 1900, y: 1070, width: 20, height: 10 }]);
    expect(res.ok).toBe(true);
  });

  it('converts a desktopCapturer throw into an error result, not an exception', async () => {
    state.sourcesThrow = new Error('permission denied');
    const res = await ocrRegion({ x: 0, y: 0, width: 100, height: 100 }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('permission denied');
  });

  it('handles desktopCapturer returning no sources at all', async () => {
    state.sources = [];
    const res = await ocrRegion({ x: 0, y: 0, width: 100, height: 100 }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('capture-failed');
  });

  it('handles an empty thumbnail (screen not yet composited)', async () => {
    state.thumbnail = fakeImage(0, 0);
    const res = await ocrRegion({ x: 0, y: 0, width: 100, height: 100 }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('capture-failed');
  });

  it('converts an OCR engine throw into an error result', async () => {
    ocr.throws = new Error('onnx session died');
    const res = await ocrRegion({ x: 0, y: 0, width: 200, height: 200 }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('onnx session died');
    expect(res.hash).not.toBe(''); // capture succeeded; only the read failed
  });
});

describe('ocrRegion — engine availability', () => {
  it('reports manga models missing without calling the engine', async () => {
    engines.manga = false;
    const res = await ocrRegion({ x: 0, y: 0, width: 200, height: 200 }, 1, { engine: 'manga' });
    expect(res).toMatchObject({ ok: false, engine: 'manga', available: false, error: 'manga-models-missing' });
    expect(ocr.calls).toHaveLength(0);
  });

  it('reports web models missing (and downloading) for auto', async () => {
    engines.paddle = false;
    const res = await ocrRegion({ x: 0, y: 0, width: 200, height: 200 }, 1);
    expect(res).toMatchObject({
      ok: false,
      engine: 'web',
      available: false,
      downloading: true,
      error: 'web-models-missing',
    });
    expect(ocr.calls).toHaveLength(0);
  });

  it('still runs manga when only the general engine is missing', async () => {
    engines.paddle = false;
    ocr.impl = () => result([line([0, 0, 10, 10])], 'manga');
    const res = await ocrRegion({ x: 0, y: 0, width: 200, height: 200 }, 1, { engine: 'manga' });
    expect(res.ok).toBe(true);
    expect(ocr.calls).toHaveLength(1);
  });
});

describe('ocrRegion — DIP mapping', () => {
  it('divides crop-pixel boxes by the scale factor and emits width/height', async () => {
    ocr.impl = () => result([line([100, 40, 300, 80])]);
    // display 2 has scaleFactor 2
    const res = await ocrRegion({ x: 0, y: 0, width: 300, height: 200 }, 2);
    expect(res.ok).toBe(true);
    expect(res.lines[0].box).toEqual([50, 20, 100, 20]);
  });

  it('never emits a zero-width or zero-height hotspot', async () => {
    ocr.impl = () => result([line([10, 10, 10, 10])]);
    const res = await ocrRegion({ x: 0, y: 0, width: 200, height: 200 }, 1);
    expect(res.lines[0].box[2]).toBeGreaterThanOrEqual(1);
    expect(res.lines[0].box[3]).toBeGreaterThanOrEqual(1);
  });

  it('hashes the captured bitmap so repeat scans can be skipped', async () => {
    ocr.impl = () => result([line([0, 0, 20, 20])]);
    const a = await ocrRegion({ x: 0, y: 0, width: 200, height: 200 }, 1);
    const b = await ocrRegion({ x: 0, y: 0, width: 200, height: 200 }, 1);
    const c = await ocrRegion({ x: 0, y: 0, width: 400, height: 200 }, 1);
    expect(a.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(b.hash).toBe(a.hash);
    expect(c.hash).not.toBe(a.hash);
  });

  it('omits the screenshot unless it was asked for', async () => {
    ocr.impl = () => result([line([0, 0, 20, 20])]);
    const off = await ocrRegion({ x: 0, y: 0, width: 200, height: 200 }, 1);
    expect(off.screenshotDataUrl).toBeUndefined();
    const on = await ocrRegion({ x: 0, y: 0, width: 200, height: 200 }, 1, { includeScreenshot: true });
    expect(on.screenshotDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });
});

// ---- adaptive zoom ------------------------------------------------------

describe('decideZoom', () => {
  it('retries at 2x when the first pass found nothing', () => {
    expect(decideZoom([])).toBe(2);
  });

  it('skips the retry for large, confident text', () => {
    expect(decideZoom([line([0, 0, 100, 40], 'あ', 0.95)])).toBe(1);
  });

  it('drives small text toward the target glyph size', () => {
    // 8px tall glyphs, target 32 -> 4x, capped at MAX_ZOOM 3
    expect(decideZoom([line([0, 0, 100, 8], 'あ', 0.95)])).toBe(3);
  });

  it('forces at least a modest zoom on low confidence even when glyphs are large', () => {
    const z = decideZoom([line([0, 0, 100, 40], 'あ', 0.5)]);
    expect(z).toBeGreaterThanOrEqual(1.8);
  });

  it('measures vertical lines across their short axis', () => {
    // vertical: thickness is x1-x0, so this is an 8px-wide column of large text
    expect(decideZoom([line([0, 0, 8, 400], 'あ', 0.95, true)])).toBe(3);
  });
});

describe('medianGlyphPx / meanConfidence / totalChars', () => {
  it('take the median thickness, not the mean', () => {
    expect(medianGlyphPx([line([0, 0, 1, 10]), line([0, 0, 1, 20]), line([0, 0, 1, 300])])).toBe(20);
  });

  it('return zero for an empty read rather than NaN', () => {
    expect(medianGlyphPx([])).toBe(0);
    expect(meanConfidence([])).toBe(0);
    expect(totalChars([])).toBe(0);
  });

  it('count characters across all lines', () => {
    expect(totalChars([line([0, 0, 1, 1], 'あい'), line([0, 0, 1, 1], 'うえお')])).toBe(5);
  });
});

describe('scaleLines', () => {
  it('is a no-op at k=1 and returns the same array', () => {
    const lines = [line([10, 20, 30, 40])];
    expect(scaleLines(lines, 1)).toBe(lines);
  });

  it('maps boxes back out of the upscaled space', () => {
    expect(scaleLines([line([10, 20, 30, 40])], 0.5)[0].box).toEqual([5, 10, 15, 20]);
  });

  it('leaves text and confidence untouched', () => {
    const out = scaleLines([line([10, 20, 30, 40], 'あい', 0.77, true)], 0.5)[0];
    expect(out.text).toBe('あい');
    expect(out.confidence).toBe(0.77);
    expect(out.vertical).toBe(true);
  });
});

describe('betterPass', () => {
  it('prefers a clearly more confident read', () => {
    const a = result([line([0, 0, 1, 1], 'aaaa', 0.5)]);
    const b = result([line([0, 0, 1, 1], 'b', 0.9)]);
    expect(betterPass(a, b)).toBe(b);
  });

  it('prefers the fuller read when confidence is close', () => {
    const a = result([line([0, 0, 1, 1], 'ab', 0.9)]);
    const b = result([line([0, 0, 1, 1], 'abcd', 0.91)]);
    expect(betterPass(a, b)).toBe(b);
  });

  it('keeps the first pass when it is both confident and fuller', () => {
    const a = result([line([0, 0, 1, 1], 'abcd', 0.9)]);
    const b = result([line([0, 0, 1, 1], 'ab', 0.9)]);
    expect(betterPass(a, b)).toBe(a);
  });
});

describe('ocrRegion — zoom escalation', () => {
  it('does not re-read when the first pass is already good', async () => {
    ocr.impl = () => result([line([0, 0, 200, 40], 'あ', 0.95)]);
    const res = await ocrRegion({ x: 0, y: 0, width: 400, height: 200 }, 1);
    expect(ocr.calls).toHaveLength(1);
    expect(res.zoom).toBe(1);
  });

  it('re-reads upscaled when the first pass found small text', async () => {
    let n = 0;
    ocr.impl = () => {
      n += 1;
      return n === 1
        ? result([line([0, 0, 100, 8], 'あ', 0.6)])
        : result([line([0, 0, 300, 24], 'あいうえお', 0.95)]);
    };
    const res = await ocrRegion({ x: 0, y: 0, width: 400, height: 200 }, 1);
    expect(ocr.calls).toHaveLength(2);
    expect(resizeCalls[0]).toEqual({ width: 1200, height: 600 }); // 3x, under MAX_SIDE
    expect(res.zoom).toBe(3);
    // boxes come back in ORIGINAL crop space, so /3 of the second pass
    expect(res.lines[0].box[2]).toBeCloseTo(100, 5);
  });

  it('never upscales past the 4096px side bound', async () => {
    let n = 0;
    ocr.impl = () => {
      n += 1;
      return n === 1 ? result([line([0, 0, 100, 4], 'あ', 0.5)]) : result([line([0, 0, 100, 12], 'あ', 0.95)]);
    };
    await ocrRegion({ x: 0, y: 0, width: 1800, height: 900 }, 1);
    expect(Math.max(resizeCalls[0].width, resizeCalls[0].height)).toBeLessThanOrEqual(4096);
  });

  it('does not upscale for manga-ocr, whose input size is fixed', async () => {
    ocr.impl = () => result([line([0, 0, 100, 6], 'あ', 0.4)], 'manga');
    const res = await ocrRegion({ x: 0, y: 0, width: 400, height: 200 }, 1, { engine: 'manga' });
    expect(ocr.calls).toHaveLength(1);
    expect(resizeCalls).toHaveLength(0);
    expect(res.zoom).toBe(1);
  });
});
