/*
 * extension/background.js — `cropDataUrlToRegion` and the OCR capture flow.
 *
 * `chrome.tabs.captureVisibleTab` returns a PNG of the visible tab in *device*
 * pixels. The content script's drag selection is in *CSS* pixels. Everything
 * between those two coordinate systems is 30 lines of arithmetic that runs on
 * every OCR capture and whose only symptom when wrong is "the OCR read the
 * wrong part of the screen" — which reads as a model problem, not a maths
 * problem. That is the argument for pinning it.
 *
 * The function is module-private, but the whole path is reachable through the
 * `ocr` message: query tab → ping content script → /v1/ocr/status → hide the
 * extension UI → captureVisibleTab → crop → POST /v1/ocr → show the result.
 * Stubbing `createImageBitmap` and `OffscreenCanvas` (neither exists in Node)
 * makes the crop rectangle directly observable as the arguments handed to
 * `ctx.drawImage`, so the tests assert the actual pixel box, not a proxy for it.
 *
 * Tests named AUDIT pin behaviour this file believes is wrong.
 */
import { describe, expect, it } from 'vitest';
import { bootBackground, type BackgroundHarness, type StubResponse } from './extensionHarness';

/* ------------------------------ canvas stubs ------------------------------ */

interface DrawCall {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

interface CanvasLog {
  /** `new OffscreenCanvas(w, h)` — the output size the code asked for. */
  created: Array<{ width: number; height: number }>;
  /** `drawImage(bitmap, sx, sy, sw, sh, …)` — the source rectangle it cut. */
  draws: DrawCall[];
  /** How many bitmaps were closed, i.e. whether the `finally` ran. */
  closed: number;
}

const CAPTURE_URL = 'data:image/png;base64,Q0FQVFVSRQ==';
const CROPPED_URL = 'data:image/png;base64,Q1JPUFBFRA==';

interface OcrHarness extends BackgroundHarness {
  canvas: CanvasLog;
}

interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio?: number;
}

interface OcrResult {
  ok?: boolean;
  error?: string;
  available?: boolean;
  selecting?: boolean;
  text?: string;
}

interface BootOcrOptions {
  /** The size of the PNG captureVisibleTab hands back, in device pixels. */
  capture: { width: number; height: number };
  /** Make captureVisibleTab reject, the way a protected page does. */
  captureFails?: boolean;
  /** Make /v1/ocr/status report the models missing. */
  ocrUnavailable?: boolean;
}

function bootOcr(options: BootOcrOptions): OcrHarness {
  const canvas: CanvasLog = { created: [], draws: [], closed: 0 };

  class FakeOffscreenCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {
      canvas.created.push({ width, height });
    }
    getContext(kind: string): { drawImage: (...args: number[]) => void } {
      if (kind !== '2d') throw new Error(`unexpected canvas context: ${kind}`);
      return {
        drawImage: (_bitmap: unknown, ...rect: number[]) => {
          const [sx, sy, sw, sh, dx, dy, dw, dh] = rect as unknown as number[];
          canvas.draws.push({ sx, sy, sw, sh, dx, dy, dw, dh });
        },
      };
    }
    convertToBlob(): Promise<{ size: number; type: string }> {
      return Promise.resolve({ size: 4096, type: 'image/png' });
    }
  }

  class FakeFileReader {
    result = '';
    onloadend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL(): void {
      this.result = CROPPED_URL;
      this.onloadend?.();
    }
  }

  const h = bootBackground({
    responder: (url): StubResponse => {
      if (url.startsWith('data:')) return { status: 200, blob: { size: 8192, type: 'image/png' } };
      if (url.endsWith('/v1/ocr/status')) {
        return options.ocrUnavailable
          ? { status: 200, json: { available: false, message: 'OCR models are not installed.' } }
          : { status: 200, json: { available: true } };
      }
      return { status: 200, json: { ok: true, text: '吾輩は猫である' } };
    },
    globals: {
      // drawImage's first argument is the bitmap; the crop rectangle follows.
      createImageBitmap: () =>
        Promise.resolve({
          width: options.capture.width,
          height: options.capture.height,
          close: () => {
            canvas.closed += 1;
          },
        }),
      OffscreenCanvas: FakeOffscreenCanvas,
      FileReader: FakeFileReader,
    },
  });

  h.chrome.tabs.captureVisibleTab = ((...args: unknown[]) => {
    h.chrome.calls.push({ api: 'tabs.captureVisibleTab', args });
    return options.captureFails
      ? Promise.reject(new Error('Cannot access contents of the page'))
      : Promise.resolve(CAPTURE_URL);
  }) as BackgroundHarness['chrome']['tabs']['captureVisibleTab'];

  return Object.assign(h, { canvas });
}

/** Drive the whole OCR path and return what the popup/content script gets. */
function runOcr(h: OcrHarness, region?: Region): Promise<OcrResult> {
  return h.send({ type: 'ocr', region, category: 'manga', langHint: 'ja' }) as Promise<OcrResult>;
}

/** The source rectangle actually cut out of the screenshot. */
function crop(h: OcrHarness): DrawCall {
  expect(h.canvas.draws).toHaveLength(1);
  return h.canvas.draws[0];
}

/** A 1280x720 CSS viewport — the numbers every case below varies from. */
const REGION = (over: Partial<Region> = {}): Region => ({
  left: 100,
  top: 50,
  width: 400,
  height: 200,
  viewportWidth: 1280,
  viewportHeight: 720,
  devicePixelRatio: 2,
  ...over,
});

/* ========================= the scale it settles on ======================== */

describe('OCR crop — CSS pixels to device pixels', () => {
  it('scales the selection by capture-size over viewport-size', async () => {
    // The ordinary retina case: 1280x720 CSS, 2x screenshot.
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(h, REGION());
    expect(crop(h)).toEqual({ sx: 200, sy: 100, sw: 800, sh: 400, dx: 0, dy: 0, dw: 800, dh: 400 });
    // The output canvas is the device-pixel size, so the app receives the
    // screenshot's own resolution rather than an upscaled CSS-sized crop.
    expect(h.canvas.created).toEqual([{ width: 800, height: 400 }]);
  });

  it('is the identity on a 1x display', async () => {
    const h = bootOcr({ capture: { width: 1280, height: 720 } });
    await runOcr(h, REGION({ devicePixelRatio: 1 }));
    expect(crop(h)).toMatchObject({ sx: 100, sy: 50, sw: 400, sh: 200 });
  });

  it('handles a fractional scale (OS display scaling at 125%)', async () => {
    const h = bootOcr({ capture: { width: 1600, height: 900 } });
    await runOcr(h, REGION({ devicePixelRatio: 1.25 }));
    expect(crop(h)).toMatchObject({ sx: 125, sy: 63, sw: 500, sh: 250 });
  });

  it('rounds to the nearest device pixel, not down', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(h, REGION({ left: 100.4, top: 50.4, width: 400.4, height: 200.4 }));
    // left*2 = 200.8 → 201, not 200. A half-pixel of the neighbouring column
    // can be included; at OCR resolutions that is immaterial, but it means the
    // crop is not a strict subset of the selection.
    expect(crop(h)).toMatchObject({ sx: 201, sy: 101, sw: 801, sh: 401 });
  });

  it('does not need devicePixelRatio at all — the capture ratio is the source of truth', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    const region = REGION();
    delete region.devicePixelRatio;
    await runOcr(h, region);
    // With dpr absent the sanity check is skipped entirely and the raw ratio is
    // used, however wrong it might be. That is safe here because the ratio is
    // right; the next block is about when it is not.
    expect(crop(h)).toMatchObject({ sx: 200, sy: 100, sw: 800, sh: 400 });
  });
});

/* ===================== the devicePixelRatio sanity check ================== */

describe('OCR crop — the devicePixelRatio fallback', () => {
  it('falls back to dpr when the reported viewport is far too small', async () => {
    // What a stale visualViewport reading looks like: the viewport claims 200
    // CSS px wide against a 2560px screenshot, i.e. a 12.8x scale.
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(h, REGION({ viewportWidth: 200, viewportHeight: 100 }));
    // scaleX/dpr = 6.4 is outside [0.5, 2.5], so both axes reset to dpr = 2 —
    // which is the right answer here.
    expect(crop(h)).toMatchObject({ sx: 200, sy: 100, sw: 800, sh: 400 });
  });

  it('AUDIT: the guard band is wide enough to pass a 2x-wrong viewport', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    // A viewport reported at exactly half its true width: scale comes out 4
    // against a dpr of 2, i.e. ratio 2.0, which is inside the [0.5, 2.5] band
    // and so is accepted.
    await runOcr(h, REGION({ viewportWidth: 640, viewportHeight: 360 }));
    // The crop is twice as far right and twice as large as the user's drag:
    // the correct box is sx 200 / sw 800.
    expect(crop(h)).toMatchObject({ sx: 400, sy: 200, sw: 1600, sh: 800 });
    // Fixing this properly means trusting dpr more, which regresses the OS-
    // scaling cases above — hence a guard band rather than an assertion. The
    // test exists to make the tolerance explicit and to fail if it is widened.
  });

  it('applies the fallback per axis, so one bad reading cannot spoil the other', async () => {
    // Windows at 200% OS scaling reports devicePixelRatio 1 while the
    // screenshot is 2x — so a scaleX of 2 against dpr 1 (ratio 2.0) is
    // legitimate and inside the band.
    const good = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(good, REGION({ devicePixelRatio: 1 }));
    expect(crop(good)).toMatchObject({ sx: 200, sy: 100, sw: 800, sh: 400 });

    // Fixed 2026-08-02. Break only the height reading. ratioY goes out of band;
    // the fallback used to overwrite *both* axes with dpr, so scaleX dropped
    // from a correct 2 to a wrong 1 and the crop landed at half the intended
    // offset and half the intended size — the scale-factor error this whole
    // file exists to catch. X now keeps the measurement it had.
    const broken = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(broken, REGION({ devicePixelRatio: 1, viewportHeight: 100 }));
    expect(crop(broken)).toMatchObject({ sx: 200, sw: 800 });
    // Y still falls back to dpr, which is the best guess available once the
    // viewport height is known to be wrong: a 14.4x scale is not usable, and
    // there is nothing else to derive the real one from. Half-right beats the
    // old all-wrong, and this half is the axis the reading actually broke.
    expect(crop(broken)).toMatchObject({ sy: 50, sh: 200 });
  });

  it('accepts the band edges: ratio 2.5 passes, above it falls back', async () => {
    // vw such that scaleX/dpr === 2.5 exactly: 2560/vw = 5 → vw = 512.
    const edge = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(edge, REGION({ viewportWidth: 512, viewportHeight: 288 }));
    expect(crop(edge)).toMatchObject({ sx: 500, sw: 2000 });

    const over = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(over, REGION({ viewportWidth: 500, viewportHeight: 281 }));
    expect(crop(over)).toMatchObject({ sx: 200, sw: 800 });
  });
});

/* ========================= clamping and the floor ======================== */

describe('OCR crop — the edges of the screenshot', () => {
  it('truncates a selection that runs past the right edge instead of failing', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(h, REGION({ left: 1200, width: 200 }));
    // sx 2400, wanted sw 400, only 160 device px of image remain.
    expect(crop(h)).toMatchObject({ sx: 2400, sw: 160 });
  });

  it('AUDIT: a selection starting off the left edge slides right instead of clipping', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(h, REGION({ left: -50, top: -25 }));
    // sx/sy clamp to 0 but sw/sh keep their full scaled size, so the crop is
    // the requested *size* anchored at the corner — it silently includes 50
    // CSS px of content to the right of what the user dragged over. Clipping
    // the width by the same amount would preserve the selected region.
    expect(crop(h)).toMatchObject({ sx: 0, sy: 0, sw: 800, sh: 400 });
  });

  it('refuses a selection under 20 CSS px before it touches the screenshot', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    const res = await runOcr(h, REGION({ width: 19, height: 19 }));
    expect(res).toEqual({ ok: false, error: 'Drag a larger area', available: true });
    expect(h.canvas.draws).toHaveLength(0);
    // The failure is shown on the page, not swallowed.
    expect(h.sentToTab.map((s) => s.type)).toContain('jp-show-ocr');
  });

  it('refuses a region with no viewport size, since the scale would be meaningless', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    const res = await runOcr(h, REGION({ viewportWidth: 0, viewportHeight: 0 }));
    expect(res).toEqual({ ok: false, error: 'Drag a larger area', available: true });
  });

  it('AUDIT: the 20px floor is applied twice, so a zoomed-out page rejects a valid drag', async () => {
    // Chrome at 50% zoom: dpr 0.5, so the screenshot is half the CSS size.
    const h = bootOcr({ capture: { width: 1280, height: 720 } });
    const res = await runOcr(
      h,
      REGION({ width: 30, height: 30, viewportWidth: 2560, viewportHeight: 1440, devicePixelRatio: 0.5 }),
    );
    // 30 CSS px clears the first floor, becomes 15 device px, and trips the
    // second one. The same drag succeeds at 100% zoom, and the message ("Drag
    // a larger area") does not hint that the zoom level is what changed.
    expect(res).toEqual({ ok: false, error: 'Drag a larger area', available: true });
    expect(h.canvas.created).toHaveLength(0);
  });

  it('releases the bitmap on both the success and the too-small paths', async () => {
    const ok = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(ok, REGION());
    expect(ok.canvas.closed).toBe(1);

    const small = bootOcr({ capture: { width: 1280, height: 720 } });
    await runOcr(
      small,
      REGION({ width: 30, height: 30, viewportWidth: 2560, viewportHeight: 1440, devicePixelRatio: 0.5 }),
    );
    expect(small.canvas.closed).toBe(1);
  });
});

/* ============================ the capture flow =========================== */

describe('OCR capture — the order it does things in', () => {
  it('hides the extension UI, captures, restores, then crops and posts', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    const res = await runOcr(h, REGION());
    expect(res).toMatchObject({ ok: true, text: '吾輩は猫である' });

    expect(h.sentToTab.map((s) => s.type)).toEqual([
      'jp-ping', // ensureContentScript
      'jp-ocr-prepare-capture', // hide the FAB so it is not in the screenshot
      'jp-ocr-restore-capture',
      'jp-show-ocr',
    ]);
  });

  it('captures the window, not the tab — captureVisibleTab takes a windowId', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(h, REGION());
    const call = h.chrome.calls.find((c) => c.api === 'tabs.captureVisibleTab');
    // DEFAULT_TAB is id 7 in window 1; passing the tab id here would capture
    // the wrong window on a multi-window setup and is an easy mistake.
    expect(call?.args).toEqual([1, { format: 'png' }]);
  });

  it('sends the cropped image, the category and the language hint to /v1/ocr', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(h, REGION());
    const post = h.fetches.find((f) => f.method === 'POST' && f.url.endsWith('/v1/ocr'));
    expect(JSON.parse(String(post?.body))).toEqual({
      // The crop result, not the raw capture — this is the assertion that the
      // whole crop path is actually wired into the request.
      dataUrl: 'data:image/png;base64,Q1JPUFBFRA==',
      category: 'manga',
      langHint: 'ja',
    });
  });

  it('enters drag-select mode when no region is given, and captures nothing', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    expect(await runOcr(h)).toEqual({ ok: true, selecting: true });
    expect(h.sentToTab.map((s) => s.type)).toEqual(['jp-ping', 'jp-start-ocr-select']);
    expect(h.chrome.calls.some((c) => c.api === 'tabs.captureVisibleTab')).toBe(false);
  });

  it('checks the models before taking a screenshot at all', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 }, ocrUnavailable: true });
    const res = await runOcr(h, REGION());
    expect(res).toEqual({ ok: false, available: false, error: 'OCR models are not installed.' });
    expect(h.chrome.calls.some((c) => c.api === 'tabs.captureVisibleTab')).toBe(false);
    expect(h.sentToTab.map((s) => s.type)).toEqual(['jp-ping', 'jp-show-ocr']);
  });

  it('restores the extension UI when the capture itself throws', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 }, captureFails: true });
    const res = (await h.send({ type: 'ocr', region: REGION() })) as OcrResult;
    expect(res).toMatchObject({
      ok: false,
      error: 'Cannot access contents of the page',
      // The models are fine — this failed at the screenshot. Saying otherwise
      // would send the user to the model-download screen for a protected page.
      available: true,
    });
    // Fixed 2026-08-02. prepare-capture hides the FAB and the popup so they are
    // not in the screenshot; captureVisibleTab then throws on a protected page,
    // and the restore that followed it was skipped, leaving the extension's own
    // UI invisible until the user reloaded the tab.
    expect(h.sentToTab.map((s) => s.type)).toEqual([
      'jp-ping',
      'jp-ocr-prepare-capture',
      'jp-ocr-restore-capture',
      // Reported on the page like every other OCR failure, rather than only as
      // a return value the content script may not be listening for.
      'jp-show-ocr',
    ]);
  });

  it('restores exactly once — the guard does not double-send on the success path', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    await runOcr(h, REGION());
    // The restore is idempotent so it can be called from the throw path, but it
    // must not fire twice on the ordinary one: the content script treats it as a
    // state change, not a level.
    expect(h.sentToTab.filter((s) => s.type === 'jp-ocr-restore-capture')).toHaveLength(1);
  });

  it('reports an OCR request that the app rejects, without losing the crop step', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    h.respond((url) => {
      if (url.startsWith('data:')) return { status: 200, blob: { size: 8192, type: 'image/png' } };
      if (url.endsWith('/v1/ocr/status')) return { status: 200, json: { available: true } };
      return { status: 500, json: { error: 'OCR engine crashed' } };
    });
    const res = await runOcr(h, REGION());
    expect(res).toMatchObject({ ok: false, error: 'OCR engine crashed', available: true });
    // The crop still happened, and the page was restored before the failure.
    expect(h.canvas.draws).toHaveLength(1);
    expect(h.sentToTab.map((s) => s.type)).toContain('jp-ocr-restore-capture');
  });

  it('refuses when there is no tab to capture', async () => {
    const h = bootOcr({ capture: { width: 2560, height: 1440 } });
    h.chrome.tabs.query = (() => Promise.resolve([])) as BackgroundHarness['chrome']['tabs']['query'];
    const res = (await h.send({ type: 'ocr', region: REGION() })) as OcrResult;
    expect(res).toMatchObject({ ok: false, error: 'No active tab' });
  });
});
