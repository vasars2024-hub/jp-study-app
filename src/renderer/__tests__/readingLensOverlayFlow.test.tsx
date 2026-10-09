// @vitest-environment jsdom
/**
 * The Reading Lens overlay, driven end to end at the renderer level (KI-6):
 * the hotkey opens it in SELECT mode, the reader drags a region, the region is
 * read, the passage is painted as clickable words, a word opens the dictionary
 * glance, Mine forwards a companion card with the scanned picture, and Escape
 * closes the lens.
 *
 * The other overlay suites each pin one behaviour starting from a region the
 * init already carried. Nothing drove the first step — the drag — or followed a
 * read all the way to a mined card, so a break between the steps (a drag that
 * never reaches `lensOcr`, a word span with no handler, a popup that mines
 * without its image) passed every suite. Only `window.api` and the tokenizer are
 * stubbed; the overlay, its chrome and the word panel are the real components.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanionMineRequest } from '../../shared/companion';

vi.mock('../tokenizer', () => ({
  tokenizerReady: () => true,
  getTokenizer: async () => ({}),
  lemmaOf: async (surface: string) => surface,
  // One word per character: enough to tell "clickable words" from "one blob".
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

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };
const TEXT = '猫犬';
const SHOT = 'data:image/png;base64,iVBORw0KGgo=';

type OcrRequest = Record<string, unknown>;
const lensOcr = vi.fn<(req: OcrRequest) => Promise<Record<string, unknown>>>(async () => ({
  available: true,
  ok: true,
  lang: 'ja',
  engine: 'web',
  hash: 'flow-1',
  text: TEXT,
  screenshotDataUrl: SHOT,
  lines: [{ text: TEXT, box: [0, 0, 200, 40] as [number, number, number, number], vertical: false, confidence: 0.95 }],
}));
const lensClose = vi.fn(async () => undefined);
const lookupTerm = vi.fn(async (query: string) => ({
  entries: [{
    word: query,
    reading: 'ねこ',
    isCommon: true,
    jlpt: ['N5'],
    senses: [{ partsOfSpeech: ['noun'], definitions: ['cat'], tags: [] }],
  }],
}));
const forwarded: CompanionMineRequest[] = [];

function installApiStub(): void {
  const api: Record<string, unknown> = {
    // SELECT mode with no region: what the global hotkey opens.
    lensGetInit: async () => ({ bounds: BOUNDS, mode: 'select', scaleFactor: 1 }),
    lensOcr,
    lensClose,
    lensSetInteractive: () => undefined,
    lensHistoryRecord: async () => null,
    lookupTerm,
    lookupChinese: lookupTerm,
    companionMine: async (req: CompanionMineRequest) => {
      forwarded.push(req);
      return { status: 'added', anki: 'local' };
    },
    companionNoteLookup: async () => undefined,
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): void => undefined;
      return async (): Promise<unknown> => ({});
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
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: (): Element | null => null });
  installApiStub();
  Overlay = (await import('../components/lens/ReadingLensOverlay')).default;
}, 60_000);

beforeEach(() => {
  lensOcr.mockClear();
  lensClose.mockClear();
  lookupTerm.mockClear();
  forwarded.length = 0;
  Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

const settle = async (turns = 8): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await act(async () => { await Promise.resolve(); });
};

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Overlay />);
  });
  await settle();
}

async function drag(from: [number, number], to: [number, number]): Promise<void> {
  const layer = host.querySelector<HTMLElement>('.lens-select-layer');
  if (!layer) throw new Error('missing .lens-select-layer — the lens did not open in select mode');
  const at = (type: string, [x, y]: [number, number]) =>
    layer.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
  await act(async () => at('mousedown', from));
  await act(async () => at('mousemove', to));
  await act(async () => at('mouseup', to));
  await settle();
}

describe('Reading Lens overlay, end to end', () => {
  it('drag -> read -> words -> glance -> mine -> Escape', async () => {
    await mount();
    expect(host.querySelector('.lens-select-hint')).not.toBeNull();
    expect(lensOcr).not.toHaveBeenCalled();

    await drag([100, 100], [500, 300]);

    // The region the reader dragged is the region that was read.
    expect(lensOcr).toHaveBeenCalledTimes(1);
    expect(lensOcr.mock.calls[0][0]).toMatchObject({ x: 100, y: 100, width: 400, height: 200 });

    // The passage is painted as words, one span per token, each one clickable.
    const words = [...host.querySelectorAll<HTMLElement>('.lens-word')];
    expect(words.map((w) => w.textContent)).toEqual(['猫', '犬']);

    await act(async () => {
      words[0].dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 110 }));
    });
    await settle();
    expect(lookupTerm).toHaveBeenCalled();
    expect(lookupTerm.mock.calls[0][0]).toBe('猫');
    expect(host.querySelector('.lens-reader-gloss')?.textContent).toContain('cat');

    const mine = host.querySelector<HTMLButtonElement>('.lens-reader-mine');
    expect(mine).not.toBeNull();
    await act(async () => mine?.click());
    await settle();
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0].draft).toMatchObject({ word: '猫', sentence: TEXT, origin: 'lens', imageDataUrl: SHOT });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    // Escape always dismisses the lens, open glance or not.
    expect(lensClose).toHaveBeenCalledTimes(1);
  });

  it('NEGATIVE CONTROL: a stray click (no real drag) reads nothing', async () => {
    await mount();
    await drag([100, 100], [103, 102]);
    expect(lensOcr).not.toHaveBeenCalled();
    expect(host.querySelector('.lens-select-layer')).not.toBeNull();
  });
});
