// @vitest-environment jsdom
/**
 * The Lens while it scans, and the bundled offline read.
 *
 *  - Nothing is painted while the screen is being captured: the old pill was
 *    in the screenshot itself, so a whole-screen read OCR'd its own label.
 *  - Once main reports the capture taken, the pill says what is happening and
 *    offers Cancel, which stops the scan in main and returns to selection.
 *  - With no downloaded model, the region is read by the bundled recognizer
 *    from main's fallback image, labelled as such, with the model offered
 *    beside the read rather than instead of it.
 *  - A read served from main's cache says so.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };
const REGION = { x: 400, y: 300, width: 600, height: 200 };
const WEB_IDS = ['paddle-ocr-ja', 'paddle-ocr-ja-keys', 'paddle-ocr-det'];
const FALLBACK = { dataUrl: 'data:image/png;base64,AAAA', width: 600, height: 200, dipPerPixelX: 1, dipPerPixelY: 1 };

const MISSING_WITH_FALLBACK = {
  ok: false,
  engine: 'web',
  lines: [],
  text: '',
  available: false,
  downloading: true,
  hash: 'h',
  error: 'web-models-missing',
  missingAssets: { ids: WEB_IDS, startIds: ['paddle-ocr-ja'] },
  fallbackImage: FALLBACK,
};
const READ = {
  ok: true,
  available: true,
  engine: 'web',
  lang: 'ja',
  hash: 'h',
  text: '猫',
  lines: [{ text: '猫', box: [10, 20, 40, 40], vertical: false, confidence: 0.95 }],
};

const { readLensFallbackImage } = vi.hoisted(() => ({
  readLensFallbackImage: vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown>> => ({
    lines: [{ text: '犬がいる', box: [12, 22, 120, 40], vertical: false, confidence: 0.88 }],
    text: '犬がいる',
    orientation: 'horizontal',
    polarity: 'dark',
    scale: 1,
    passes: 1,
    furiganaRemoved: 0,
  })),
}));
vi.mock('../lensOfflineOcr', () => ({ readLensFallbackImage }));

let pending: ((value: Record<string, unknown>) => void) | null = null;
let immediate: Record<string, unknown> | null = null;
const lensOcr = vi.fn((_req: { scanId?: number }) => (immediate
  ? Promise.resolve(immediate)
  : new Promise<Record<string, unknown>>((resolve) => {
    pending = resolve;
  })));
const lensOcrCancel = vi.fn(async () => true);
let progress: ((p: { scanId: number; stage: string }) => void) | null = null;

function installApiStub(): void {
  const api: Record<string, unknown> = {
    lensGetInit: async () => ({ bounds: BOUNDS, mode: 'repeat', scaleFactor: 1, region: REGION }),
    lensOcr,
    lensOcrCancel,
    onLensOcrProgress: (cb: (p: { scanId: number; stage: string }) => void) => {
      progress = cb;
      return () => {
        progress = null;
      };
    },
    lensHistoryRecord: async () => null,
    lensSetInteractive: () => undefined,
    lensClose: async () => undefined,
    assetsList: async () => ({ assets: [], statuses: [] }),
    assetsStart: async () => ({ ok: true }),
    assetsCancel: async () => undefined,
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): void => undefined;
      return async (): Promise<unknown> => null;
    },
  });
}

let Overlay: typeof import('../components/lens/ReadingLensOverlay').default;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
  installApiStub();
  Overlay = (await import('../components/lens/ReadingLensOverlay')).default;
});

beforeEach(() => {
  lensOcr.mockClear();
  lensOcrCancel.mockClear();
  readLensFallbackImage.mockClear();
  pending = null;
  immediate = null;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await act(async () => { await Promise.resolve(); });
}

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Overlay />);
  });
  await settle();
}

describe('Reading Lens scan progress and cancel', () => {
  it('paints nothing while capturing, then shows the stage and a Cancel that stops the scan', async () => {
    await mount();
    expect(lensOcr).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.lens-scanning')).toBeNull();

    const scanId = lensOcr.mock.calls[0][0].scanId!;
    expect(typeof scanId).toBe('number');
    // A stale scan's report is ignored.
    await act(async () => progress?.({ scanId: scanId + 99, stage: 'reading' }));
    expect(host.querySelector('.lens-scanning')).toBeNull();

    await act(async () => progress?.({ scanId, stage: 'reading' }));
    expect(host.querySelector('.lens-scanning')).not.toBeNull();
    await act(async () => progress?.({ scanId, stage: 'refining' }));
    const label = host.querySelector('.lens-scan-label')!.textContent;
    expect(label).toBeTruthy();

    const cancel = host.querySelector<HTMLButtonElement>('.lens-scan-cancel')!;
    await act(async () => cancel.click());
    expect(lensOcrCancel).toHaveBeenCalled();
    expect(host.querySelector('.lens-scanning')).toBeNull();
    expect(host.querySelector('.lens-select-layer')).not.toBeNull();

    // The answer that arrives after a cancel is not shown.
    await act(async () => pending?.(READ));
    await settle();
    expect(host.querySelector('.lens-line')).toBeNull();
  });

  it('labels a read served from the cache', async () => {
    immediate = { ...READ, cached: true };
    await mount();
    expect(host.querySelector('.lens-cached-badge')).not.toBeNull();
    expect(host.querySelector('.lens-basic-badge')).toBeNull();
  });
});

describe('Reading Lens without a downloaded model', () => {
  it('reads with the bundled recognizer, says so, and offers the model beside the read', async () => {
    immediate = MISSING_WITH_FALLBACK;
    await mount();
    expect(readLensFallbackImage).toHaveBeenCalledTimes(1);
    expect((readLensFallbackImage.mock.calls[0] as unknown[])[0]).toEqual(FALLBACK);
    const line = host.querySelector('.lens-line');
    expect(line?.textContent).toBe('犬がいる');
    expect(host.querySelector('.lens-basic-badge')).not.toBeNull();
    const banner = host.querySelector('.lens-basic-banner');
    expect(banner).not.toBeNull();
    expect(banner!.querySelector('.lens-install')).not.toBeNull();
    // No engine swap offered for a basic read: the manga engine is a 550 MB download.
    expect(host.querySelector('.lens-engine-swap')).toBeNull();
  });

  it('falls back to the plain install offer when the bundled read fails', async () => {
    immediate = MISSING_WITH_FALLBACK;
    readLensFallbackImage.mockRejectedValueOnce(new Error('worker died'));
    await mount();
    expect(host.querySelector('.lens-line')).toBeNull();
    expect(host.querySelector('.lens-message .lens-install')).not.toBeNull();
  });

  it('says the bundled read found nothing, still offering the model', async () => {
    immediate = MISSING_WITH_FALLBACK;
    readLensFallbackImage.mockResolvedValueOnce({
      lines: [], text: '', orientation: 'horizontal', polarity: 'dark', scale: 1, passes: 1, furiganaRemoved: 0,
    });
    await mount();
    expect(host.querySelector('.lens-message')).not.toBeNull();
    expect(host.querySelector('.lens-message .lens-install')).not.toBeNull();
  });
});
