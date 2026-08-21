// @vitest-environment jsdom
/**
 * The engine swap that costs no second OCR pass.
 *
 * `ocrAuto` runs BOTH recognizers whenever the routing heuristic fires and used
 * to throw the loser away, so a reader who disagreed with the pick paid for a
 * whole second read of pixels that had already been read twice. Main now carries
 * the loser back as `alternate`, and this overlay swaps it in from state.
 *
 * The claim under test is "no re-scan", and the only honest instrument for it is
 * the `lensOcr` CALL COUNT — a swap that looked instant on screen while quietly
 * firing a second IPC would pass any text assertion. So every case below asserts
 * the count, and the negative control is the same click on a read that has no
 * alternate: it MUST reach `lensOcr` a second time. Without that control a
 * component that never rescans at all would score identically.
 *
 * Reversibility is the second claim: swapping parks the outgoing read as the new
 * alternate, so the control is its own undo. A one-way swap would strand the read
 * the routing actually preferred behind a real re-scan.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };
const REGION = { x: 400, y: 300, width: 600, height: 200 };

const WEB_TEXT = '猫が窓の外を見ている';
const MANGA_TEXT = '猫が窓の外を見てる';

/** The winning read: the general engine, with manga-ocr's losing read carried. */
const WITH_ALTERNATE = {
  available: true,
  ok: true,
  lang: 'ja',
  engine: 'web',
  hash: 'abc123',
  text: WEB_TEXT,
  lines: [
    { text: WEB_TEXT, box: [10, 20, 400, 40] as [number, number, number, number], vertical: false, confidence: 0.93 },
  ],
  alternate: {
    engine: 'manga',
    lang: 'ja',
    text: MANGA_TEXT,
    lines: [
      { text: MANGA_TEXT, box: [10, 20, 400, 40] as [number, number, number, number], vertical: false, confidence: 0.88 },
    ],
  },
};

/** The same read with only one engine behind it — the negative control. */
const WITHOUT_ALTERNATE = { ...WITH_ALTERNATE, alternate: undefined };

const EMPTY_RESULT = new Proxy({}, { get: () => [] });

let ocrResult: Record<string, unknown> = WITH_ALTERNATE;
const lensOcr = vi.fn(async () => ocrResult);
const lensHistoryRecord = vi.fn(async () => null);

function installApiStub(): void {
  const api: Record<string, unknown> = {
    lensGetInit: async () => ({ bounds: BOUNDS, mode: 'repeat', scaleFactor: 1, region: REGION }),
    lensOcr,
    lensHistoryRecord,
    lensSetInteractive: () => undefined,
    lensClose: async () => undefined,
    ankiStatus: async () => ({ ok: false, decks: [], models: [] }),
    lookupTerm: async () => ({ entries: [] }),
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): void => undefined;
      return async (): Promise<unknown> => EMPTY_RESULT;
    },
  });
}

let Overlay: typeof import('../components/lens/ReadingLensOverlay').default;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom never paints, and the scan effect waits two animation frames. Running
  // the callback synchronously is what lets the read under test happen at all.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (): Element | null => null,
  });
  installApiStub();
  Overlay = (await import('../components/lens/ReadingLensOverlay')).default;
});

beforeEach(() => {
  lensOcr.mockClear();
  lensHistoryRecord.mockClear();
  ocrResult = WITH_ALTERNATE;
  Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const flush = async (): Promise<void> => {
  await Promise.resolve();
};

async function mountReading(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Overlay />);
  });
  for (let i = 0; i < 8; i += 1) await act(flush);
}

function swapButton(): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>('.lens-engine-swap');
  if (!el) throw new Error('missing .lens-engine-swap');
  return el;
}

async function clickSwap(): Promise<void> {
  const button = swapButton();
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  for (let i = 0; i < 6; i += 1) await act(flush);
}

/** The passage as painted, with the token spans' whitespace collapsed out. */
function painted(): string {
  return (host.querySelector('.lens-lines') ?? host).textContent ?? '';
}

describe('Reading Lens alternate read', () => {
  it('marks the swap as ready and swaps with no second OCR call', async () => {
    await mountReading();
    expect(lensOcr).toHaveBeenCalledTimes(1);
    expect(painted()).toContain(WEB_TEXT);

    const button = swapButton();
    expect(button.className).toContain('ready');
    // The tooltip must say the swap is free. Comparing against the raw key
    // catches a key that is missing from the English catalog, which is the one
    // failure `tools/i18n-check.cjs` cannot see.
    expect(button.title).not.toBe('lens.action.alternateReady');
    expect(button.title).toMatch(/re-scan|scan/i);

    await clickSwap();

    expect(lensOcr).toHaveBeenCalledTimes(1);
    // The swap REPLACES the read; both texts on screen at once would satisfy a
    // bare `toContain` while the passage said two different things.
    expect(painted()).toContain(MANGA_TEXT);
    expect(painted()).not.toContain(WEB_TEXT);
  });

  it('is its own undo: swapping back restores the first read, still with no OCR', async () => {
    await mountReading();
    await clickSwap();
    expect(painted()).toContain(MANGA_TEXT);

    await clickSwap();

    expect(painted()).toContain(WEB_TEXT);
    expect(painted()).not.toContain(MANGA_TEXT);
    expect(lensOcr).toHaveBeenCalledTimes(1);
  });

  it('re-records history under the SAME hash, so the swap replaces the entry', async () => {
    await mountReading();
    lensHistoryRecord.mockClear();

    await clickSwap();

    expect(lensHistoryRecord).toHaveBeenCalledTimes(1);
    const recorded = lensHistoryRecord.mock.calls[0][0] as { hash: string; text: string; engine: string };
    expect(recorded.text).toBe(MANGA_TEXT);
    expect(recorded.engine).toBe('manga');
    // Same pixels, same hash — `recordReadingLensHistory` matches on it, so this
    // is what makes the swap replace the row instead of adding a second one.
    expect(recorded.hash).toBe('abc123');
  });

  it('NEGATIVE CONTROL: with no alternate the same click really does re-scan', async () => {
    ocrResult = WITHOUT_ALTERNATE;
    await mountReading();
    expect(lensOcr).toHaveBeenCalledTimes(1);

    const button = swapButton();
    expect(button.className).not.toContain('ready');

    await clickSwap();

    expect(lensOcr).toHaveBeenCalledTimes(2);
    expect(lensOcr.mock.calls[1][0]).toMatchObject({ engine: 'manga' });
  });
});
