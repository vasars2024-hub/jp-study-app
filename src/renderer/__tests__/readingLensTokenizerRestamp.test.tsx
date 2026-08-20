// @vitest-environment jsdom
/**
 * A capture can land before the tokenizer has loaded. When it does, both lens
 * capture paths stamp a fallback token carrying the whole line, and that used to
 * be permanent: the words never became clickable and the Read depth's
 * vocabulary harvest — which counts only `content` tokens — stayed empty for the
 * life of the window.
 *
 * Found on the live clipboard path (0 clickable words, 0 harvest rows) and fixed
 * by re-stamping the capture when `getTokenizer()` resolves. This pins that.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let resolveTokenizer: (() => void) | null = null;
let ready = false;

vi.mock('../tokenizer', () => ({
  tokenizerReady: () => ready,
  getTokenizer: () =>
    new Promise<unknown>((resolve) => {
      resolveTokenizer = () => {
        ready = true;
        resolve({});
      };
    }),
  // Just enough of a split to tell "one blob" from "several words" apart.
  tokenizeSync: (text: string) =>
    [...text].map((surface) => ({
      surface,
      lemma: surface,
      content: true,
      proper: false,
      pos: '名詞',
      posDetail: '*',
    })),
}));

const CLIPBOARD_INIT = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  mode: 'clipboard' as const,
  scaleFactor: 1,
  capture: {
    schemaVersion: 1,
    captureId: 'reading-lens:restamp',
    source: 'clipboard',
    sourceLabel: 'clipboard',
    sourceRef: '',
    capturedAt: 1_700_000_000_000,
    language: 'ja',
    engine: 'import',
    hash: 'restamp',
    text: '猫犬鳥',
    lines: [],
  },
};

function installApiStub(): void {
  const api: Record<string, unknown> = {
    lensGetInit: async () => CLIPBOARD_INIT,
    lensSetInteractive: () => undefined,
    lensClose: async () => undefined,
    lensHistoryRecord: async () => null,
    lookupTerm: async () => ({ entries: [] }),
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): void => {};
      return async (): Promise<unknown> => ({});
    },
  });
}

let Overlay: typeof import('../components/lens/ReadingLensOverlay').default;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  Overlay = (await import('../components/lens/ReadingLensOverlay')).default;
});

beforeEach(() => {
  ready = false;
  resolveTokenizer = null;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

describe('the lens re-stamps a capture that beat the tokenizer', () => {
  it('turns the one-blob fallback into real words, and the Read harvest with it', async () => {
    await act(async () => {
      root?.render(<Overlay />);
    });

    // The capture landed first, so the passage is one fallback token: a single
    // hotspot covering the whole line rather than three words.
    expect(host.querySelectorAll('.lens-clipboard-passage')).toHaveLength(1);
    expect(host.querySelectorAll('.lens-clipboard-word')).toHaveLength(1);

    // The Read depth is where that fallback is worst — it carries no `content`
    // flag, so the harvest counts nothing at all.
    const openRead = host.querySelector<HTMLButtonElement>('.lens-open-read');
    expect(openRead).not.toBeNull();
    await act(async () => openRead?.click());
    expect(host.querySelectorAll('.lens-read-para')).toHaveLength(1);
    expect(host.querySelectorAll('.lens-read-harvest-row')).toHaveLength(0);

    await act(async () => {
      resolveTokenizer?.();
      await Promise.resolve();
    });

    expect(host.querySelectorAll('.lens-clipboard-word')).toHaveLength(3);
    // The open sheet survives the re-stamp and fills in, rather than closing:
    // it is the same capture, only better analysed.
    expect(host.querySelectorAll('.lens-read')).toHaveLength(1);
    expect(host.querySelectorAll('.lens-read-harvest-row')).toHaveLength(3);
  });
});
