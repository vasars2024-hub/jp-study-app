// @vitest-environment jsdom
/**
 * A scan with no OCR model: the Lens shows the download main actually queued,
 * with its progress, and reads the region once the model lands.
 *
 * It used to say "Downloading OCR models — try again in a moment" whenever the
 * web model was missing, with no download started anywhere, so trying again
 * never helped. Main now queues the pack and reports `downloading` only when
 * it is queued or running (see screenOcr.test.ts); this is the overlay's half.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetStatus } from '../../shared/assetRegistry';

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };
const REGION = { x: 400, y: 300, width: 600, height: 200 };
const WEB_IDS = ['paddle-ocr-ja', 'paddle-ocr-ja-keys', 'paddle-ocr-det'];

const MISSING = {
  ok: false,
  engine: 'web',
  lines: [],
  text: '',
  available: false,
  downloading: true,
  hash: 'h',
  error: 'web-models-missing',
  missingAssets: { ids: WEB_IDS, startIds: ['paddle-ocr-ja'] },
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

let ocrResult: Record<string, unknown> = MISSING;
const lensOcr = vi.fn(async () => ocrResult);
let statuses: AssetStatus[] = [];
const statusListeners = new Set<(s: AssetStatus) => void>();
const assetsStart = vi.fn(async () => ({ ok: true }));

const status = (id: string, patch: Partial<AssetStatus>): AssetStatus => ({
  id, state: 'not-installed', receivedBytes: 0, totalBytes: 1000, bytesPerSecond: 0, ...patch,
});

function installApiStub(): void {
  const api: Record<string, unknown> = {
    lensGetInit: async () => ({ bounds: BOUNDS, mode: 'repeat', scaleFactor: 1, region: REGION }),
    lensOcr,
    lensHistoryRecord: async () => null,
    lensSetInteractive: () => undefined,
    lensClose: async () => undefined,
    assetsList: async () => ({ assets: [], statuses }),
    onAssetStatus: (cb: (s: AssetStatus) => void) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    assetsStart,
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
  assetsStart.mockClear();
  statusListeners.clear();
  ocrResult = MISSING;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Overlay />);
  });
  for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); });
}

describe('Reading Lens with no OCR model', () => {
  it('shows the running download, then reads the region when it lands', async () => {
    statuses = [
      status('paddle-ocr-ja', { state: 'queued' }),
      status('paddle-ocr-ja-keys', { state: 'queued' }),
      status('paddle-ocr-det', { state: 'downloading', receivedBytes: 500 }),
    ];
    await mount();
    expect(lensOcr).toHaveBeenCalledTimes(1);
    const prompt = host.querySelector('.lens-install');
    expect(prompt, 'no install prompt in the error message').not.toBeNull();
    expect(prompt!.getAttribute('data-asset-state')).toBe('busy');
    expect(prompt!.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('17');

    ocrResult = READ;
    await act(async () => {
      for (const id of WEB_IDS) {
        for (const cb of statusListeners) cb(status(id, { state: 'installed', receivedBytes: 1000 }));
      }
    });
    for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); });
    expect(lensOcr).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.lens-install')).toBeNull();
  });

  it('offers the install when the automatic start was refused', async () => {
    ocrResult = { ...MISSING, downloading: false };
    statuses = WEB_IDS.map((id) => status(id, {
      error: id === 'paddle-ocr-ja' ? { key: 'assetError.diskSpace', vars: {} } : undefined,
    }));
    await mount();
    const prompt = host.querySelector('.lens-install')!;
    expect(prompt.getAttribute('data-asset-state')).toBe('failed');
    const button = prompt.querySelector('button')!;
    await act(async () => button.click());
    expect(assetsStart.mock.calls).toEqual([['paddle-ocr-ja']]);
  });
});
