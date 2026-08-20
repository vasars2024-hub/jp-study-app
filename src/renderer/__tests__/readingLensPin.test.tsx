// @vitest-environment jsdom
/**
 * The Reading Lens pin, and the auto-dismiss it exists to suspend.
 *
 * The dismissal is the reason this needs a test at all: a finished read ghosts
 * out 1.2 s after the cursor wanders off the fragments and closes itself at
 * 3.6 s. That is right for a glance and wrong for a reader who has gone to
 * another window to look something up — and a pin that *looks* pressed while
 * the countdown keeps running would lose the read anyway, silently, exactly
 * when the reader was relying on it. So the negative control is the first test
 * here: the unpinned read must really close.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };
const REGION = { x: 400, y: 300, width: 600, height: 200 };

const OCR_RESULT = {
  available: true,
  ok: true,
  lang: 'ja',
  engine: 'auto',
  hash: 'pin-fixture',
  text: '猫が窓の外を見ている',
  lines: [
    { text: '猫が窓の外を見ている', box: [10, 20, 400, 40] as [number, number, number, number], vertical: false, confidence: 0.93 },
  ],
};

const EMPTY_RESULT = new Proxy({}, { get: () => [] });
const lensClose = vi.fn(async () => undefined);

function installApiStub(): void {
  const api: Record<string, unknown> = {
    lensGetInit: async () => ({ bounds: BOUNDS, mode: 'repeat', scaleFactor: 1, region: REGION }),
    lensOcr: async () => OCR_RESULT,
    lensSetInteractive: () => undefined,
    lensHistoryRecord: async () => null,
    lensClose,
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
  // See readingLensRegionResize.test.tsx: jsdom never paints, so the scan
  // effect's two-frame guard would otherwise never release.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  // jsdom has no `elementFromPoint`, and BOTH mousemove listeners the overlay
  // installs call it first. Without this the pass-through and the auto-dismiss
  // both throw on the very move that is supposed to arm the countdown, and the
  // negative control below "passes" by never running. Null is the honest answer
  // for the point these tests move to: nothing of the lens is under it.
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (): Element | null => null,
  });
  installApiStub();
  Overlay = (await import('../components/lens/ReadingLensOverlay')).default;
});

beforeEach(() => {
  lensClose.mockClear();
  localStorage.clear();
});

afterEach(async () => {
  vi.useRealTimers();
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

/** One React microtask turn: lets an effect's promise settle and re-render. */
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

function pinButton(): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>('.lens-pin');
  if (!el) throw new Error('missing .lens-pin');
  return el;
}

function reading(): boolean {
  return host.querySelectorAll('.lens-line').length > 0;
}

/** Move the cursor far from every fragment and let the countdown run. */
async function wanderAway(ms: number): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }));
  });
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe('Reading Lens pin', () => {
  it('NEGATIVE CONTROL: an unpinned read really does dim and close itself', async () => {
    await mountReading();
    expect(reading()).toBe(true);
    vi.useFakeTimers();

    await wanderAway(1300);
    expect(host.querySelector('.lens-root')?.className).toContain('lens-dimmed');
    expect(lensClose).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(lensClose).toHaveBeenCalledTimes(1);
    expect(reading()).toBe(false);
  });

  it('holds the read on screen for as long as the pin is set', async () => {
    await mountReading();
    await act(async () => {
      pinButton().click();
    });
    expect(pinButton().getAttribute('aria-pressed')).toBe('true');
    vi.useFakeTimers();

    // More than double the 3.6 s the unpinned read closes at.
    await wanderAway(9000);

    expect(lensClose).not.toHaveBeenCalled();
    expect(reading()).toBe(true);
    expect(host.querySelector('.lens-root')?.className).not.toContain('lens-dimmed');
  });

  it('un-pinning hands the read back to the countdown rather than stranding it', async () => {
    await mountReading();
    await act(async () => pinButton().click());
    vi.useFakeTimers();
    await wanderAway(9000);
    expect(reading()).toBe(true);

    await act(async () => pinButton().click());
    expect(pinButton().getAttribute('aria-pressed')).toBe('false');

    await wanderAway(4000);
    expect(lensClose).toHaveBeenCalledTimes(1);
    expect(reading()).toBe(false);
  });

  it('remembers the pin across a fresh open, and the label reports which state it is in', async () => {
    await mountReading();
    expect(pinButton().textContent).toBe('Pin');
    await act(async () => pinButton().click());
    expect(pinButton().textContent).toBe('Pinned');
    expect(localStorage.getItem('jp-study-lens-pinned')).toBe('1');

    await act(async () => root?.unmount());
    root = null;
    document.body.replaceChildren();

    await mountReading();
    expect(pinButton().getAttribute('aria-pressed')).toBe('true');
    expect(pinButton().textContent).toBe('Pinned');
  });

  it('leaves Escape working while pinned, so the pin can never trap the overlay', async () => {
    await mountReading();
    await act(async () => pinButton().click());
    vi.useFakeTimers();
    await wanderAway(9000);
    expect(reading()).toBe(true);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(lensClose).toHaveBeenCalledTimes(1);
    expect(reading()).toBe(false);
  });
});
