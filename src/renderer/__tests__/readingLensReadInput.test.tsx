// @vitest-environment jsdom
/**
 * The Read sheet has to be able to take the mouse.
 *
 * The lens is one transparent, always-on-top window stretched over the whole
 * display, and it is click-through by default: `setIgnoreMouseEvents(true)` is
 * what lets the application underneath keep working while a few word hotspots
 * float over it. Interactivity is re-armed by a forwarded `mousemove` landing
 * on something with `.lens-interactive`.
 *
 * That trade is right for hotspots and wrong for Read, which is an opaque sheet
 * with its own controls, and the difference is not a DOM one — measured against
 * the OS with the sheet open and the flag set, `WindowFromPoint` over the
 * sheet's own close button returned *another process's window*, so a real click
 * never reached the button no matter how correct the JSX was. A synthetic
 * `.click()` cannot see that: it succeeds either way. What a test can hold is
 * the decision that produces the flag, which is what these assert on.
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
  hash: 'read-input-fixture',
  text: '猫が窓の外を見ている。',
  lines: [
    {
      text: '猫が窓の外を見ている。',
      box: [10, 20, 400, 40] as [number, number, number, number],
      vertical: false,
      confidence: 0.93,
    },
  ],
};

const EMPTY_RESULT = new Proxy({}, { get: () => [] });
const lensClose = vi.fn(async () => undefined);
const lensSetInteractive = vi.fn((_on: boolean) => undefined);

function installApiStub(): void {
  const api: Record<string, unknown> = {
    lensGetInit: async () => ({ bounds: BOUNDS, mode: 'repeat', scaleFactor: 1, region: REGION }),
    lensOcr: async () => OCR_RESULT,
    lensSetInteractive,
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
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  // Null is the honest answer for the point these tests move to: nothing of the
  // lens is under it. Both mousemove listeners call this first.
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (): Element | null => null,
  });
  installApiStub();
  Overlay = (await import('../components/lens/ReadingLensOverlay')).default;
});

beforeEach(() => {
  lensClose.mockClear();
  lensSetInteractive.mockClear();
  localStorage.clear();
});

afterEach(async () => {
  vi.useRealTimers();
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

async function openRead(): Promise<void> {
  const open = host.querySelector<HTMLButtonElement>('.lens-open-read');
  if (!open) throw new Error('missing .lens-open-read');
  await act(async () => open.click());
}

const sheet = (): HTMLElement | null => host.querySelector<HTMLElement>('.lens-read');

/** Move the cursor to a point with nothing of the lens under it. */
async function moveAway(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }));
  });
}

/** The last pass-through decision that actually reached main. */
const lastInteractive = (): boolean | undefined =>
  lensSetInteractive.mock.calls.length === 0
    ? undefined
    : lensSetInteractive.mock.calls[lensSetInteractive.mock.calls.length - 1][0];

describe('Reading Lens — Read takes the mouse', () => {
  it('NEGATIVE CONTROL: with Read closed, wandering off does hand the window back to click-through', async () => {
    await mountReading();
    expect(sheet()).toBeNull();

    await moveAway();

    expect(lastInteractive()).toBe(false);
  });

  it('keeps the window interactive for as long as the Read sheet is open', async () => {
    await mountReading();
    await openRead();
    expect(sheet()).not.toBeNull();

    await moveAway();

    // The whole call history, not the calls since the sheet opened: the bridge
    // only fires on a *change*, so "no call" means "still whatever it was" —
    // which was click-through. Clearing the spy here would turn the defect into
    // a pass. What matters is the standing state, and it must be interactive.
    expect(lastInteractive()).toBe(true);
  });

  it('hands the window back to click-through when the sheet is closed again', async () => {
    await mountReading();
    await openRead();
    await moveAway();
    expect(lastInteractive()).toBe(true);

    const close = sheet()?.querySelector<HTMLButtonElement>('.lens-reader-x');
    if (!close) throw new Error('missing sheet close button');
    await act(async () => close.click());
    expect(sheet()).toBeNull();

    await moveAway();
    expect(lastInteractive()).toBe(false);
  });

  it('suspends the auto-dismiss, so an open sheet is never closed out from under the reader', async () => {
    await mountReading();
    await openRead();
    vi.useFakeTimers();

    await moveAway();
    await act(async () => {
      vi.advanceTimersByTime(9000); // more than double the 3.6 s close
    });

    expect(lensClose).not.toHaveBeenCalled();
    expect(sheet()).not.toBeNull();
    expect(host.querySelector('.lens-root')?.className).not.toContain('lens-dimmed');
  });
});
