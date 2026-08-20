// @vitest-environment jsdom
/**
 * The Reading Lens region-resize grips, driven through the whole overlay.
 *
 * `readingLensRegion.test.ts` pins the arithmetic; this pins the wiring around
 * it, which is where the failure modes actually live: the grips have to exist
 * on a finished read, a drag has to reach the window listeners after the cursor
 * leaves the 16 px button, the rescan has to carry the *resized* rectangle to
 * `lensOcr`, and — the one that silently destroys a read — a grip that was
 * grabbed and released must not rescan at all.
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
  hash: 'abc123',
  text: '猫が窓の外を見ている',
  lines: [
    { text: '猫が窓の外を見ている', box: [10, 20, 400, 40] as [number, number, number, number], vertical: false, confidence: 0.93 },
  ],
};

const EMPTY_RESULT = new Proxy({}, { get: () => [] });

const lensOcr = vi.fn(async () => OCR_RESULT);
const lensSetInteractive = vi.fn();

function installApiStub(): void {
  const api: Record<string, unknown> = {
    // A `repeat` init lands the overlay straight in `scanning` with a known
    // rectangle, so the read under test is reproducible without a synthetic drag.
    lensGetInit: async () => ({ bounds: BOUNDS, mode: 'repeat', scaleFactor: 1, region: REGION }),
    lensOcr,
    lensSetInteractive,
    lensHistoryRecord: async () => null,
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
  // The scan effect waits two animation frames so the previous overlay has
  // actually painted out before the screenshot. jsdom never paints and its rAF
  // is a ~16 ms timer that `act` does not flush, so the scan would never start
  // here. Running the callback synchronously is the honest stand-in.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  // jsdom has no `elementFromPoint`; the overlay's pass-through listener calls
  // it on every move, and an uncaught throw there is noise that hides real
  // failures in the drags below.
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (): Element | null => null,
  });
  installApiStub();
  Overlay = (await import('../components/lens/ReadingLensOverlay')).default;
});

beforeEach(() => {
  lensOcr.mockClear();
  lensSetInteractive.mockClear();
  // jsdom reports 1024x768; the overlay clamps grips against the viewport, and
  // a 1920-wide region would otherwise be clamped by the harness, not the code.
  Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

/** One React microtask turn: lets an effect's promise settle and re-render. */
const flush = async (): Promise<void> => {
  await Promise.resolve();
};

/** Mount the overlay and let the `repeat` init settle into a finished read. */
async function mountReading(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Overlay />);
  });
  // Two rAFs guard the screenshot, then the OCR promise and its setState.
  for (let i = 0; i < 8; i += 1) await act(flush);
}

function grip(handle: string): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>(`.lens-grip-${handle}`);
  if (!el) throw new Error(`missing .lens-grip-${handle}`);
  return el;
}

function frameBox(): { left: string; top: string; width: string; height: string } {
  const el = host.querySelector<HTMLElement>('.lens-frame');
  if (!el) throw new Error('missing .lens-frame');
  return {
    left: el.style.left,
    top: el.style.top,
    width: el.style.width,
    height: el.style.height,
  };
}

/** mousedown on a grip, then move and release at the window, as the DOM does. */
async function dragGrip(handle: string, dx: number, dy: number): Promise<void> {
  const start = { clientX: 500, clientY: 500 };
  await act(async () => {
    grip(handle).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...start }),
    );
  });
  await act(async () => {
    window.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        clientX: start.clientX + dx,
        clientY: start.clientY + dy,
      }),
    );
  });
  await act(async () => {
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  for (let i = 0; i < 8; i += 1) await act(flush);
}

describe('Reading Lens region resize', () => {
  it('renders one labelled grip per edge and corner on a finished read', async () => {
    await mountReading();

    const grips = [...host.querySelectorAll<HTMLButtonElement>('.lens-grip')];
    expect(grips).toHaveLength(8);
    expect(grips.map((g) => g.className.match(/lens-grip-(\w+)/)?.[1]).sort()).toEqual(
      ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'],
    );
    // Every grip carries a translated accessible name, not a bare key.
    for (const g of grips) {
      const label = g.getAttribute('aria-label') ?? '';
      expect(label).not.toContain('lens.resize');
      expect(label.length).toBeGreaterThan(4);
      expect(g.className).toContain('lens-interactive');
    }
    expect(frameBox()).toEqual({ left: '400px', top: '300px', width: '600px', height: '200px' });
  });

  it('rescans the resized rectangle when the south grip is dragged down', async () => {
    await mountReading();
    expect(lensOcr).toHaveBeenCalledTimes(1);
    expect(lensOcr.mock.calls[0][0]).toMatchObject(REGION);

    await dragGrip('s', 0, 120);

    expect(lensOcr).toHaveBeenCalledTimes(2);
    expect(lensOcr.mock.calls[1][0]).toMatchObject({
      x: 400,
      y: 300,
      width: 600,
      height: 320,
    });
    expect(frameBox()).toEqual({ left: '400px', top: '300px', width: '600px', height: '320px' });
  });

  it('moves both edges of a corner and keeps the read on the same engine', async () => {
    await mountReading();
    await dragGrip('nw', -100, -60);

    expect(lensOcr).toHaveBeenCalledTimes(2);
    expect(lensOcr.mock.calls[1][0]).toMatchObject({
      x: 300,
      y: 240,
      width: 700,
      height: 260,
      engine: 'auto',
    });
  });

  it('does NOT rescan when a grip is grabbed and released without travel', async () => {
    await mountReading();
    await dragGrip('e', 0, 0);

    expect(lensOcr).toHaveBeenCalledTimes(1);
    expect(frameBox()).toEqual({ left: '400px', top: '300px', width: '600px', height: '200px' });
  });

  it('re-docks the chrome to the top once the resized read reaches the bottom band', async () => {
    await mountReading();
    // 400,300 600x200 ends at y=500 on a 1080-tall display: nowhere near the bar.
    expect(host.querySelector('.lens-chrome')?.className).toContain('lens-chrome-bottom');

    await dragGrip('s', 0, 600);

    // Clamped to the display, so 300..1080 — well inside the bottom band, and
    // the bar that was covering it moves out of the way on its own.
    expect(lensOcr.mock.calls[1][0]).toMatchObject({ y: 300, height: 780 });
    expect(host.querySelector('.lens-chrome')?.className).toContain('lens-chrome-top');
  });

  it('clamps at the display edge instead of scanning off-screen', async () => {
    await mountReading();
    await dragGrip('se', 5000, 5000);

    expect(lensOcr).toHaveBeenCalledTimes(2);
    expect(lensOcr.mock.calls[1][0]).toMatchObject({
      x: 400,
      y: 300,
      width: 1520,
      height: 780,
    });
  });

  it('keeps the window interactive for the whole drag, not just over the grip', async () => {
    await mountReading();
    // The finished read went click-through: that is the state a drag starts from.
    expect(lensSetInteractive).toHaveBeenLastCalledWith(false);

    await act(async () => {
      grip('s').dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 500, clientY: 500 }),
      );
    });
    // Without this the mousemove and mouseup below are delivered to the app
    // underneath and the grip sticks to the pointer.
    expect(lensSetInteractive).toHaveBeenLastCalledWith(true);
  });

  it('resizes from the keyboard and commits on Enter', async () => {
    await mountReading();
    const target = grip('s');
    target.focus();

    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        target.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
        );
      });
    }
    // Nudges are live but uncommitted: the frame moved, the scan has not re-run.
    expect(frameBox().height).toBe('212px');
    expect(lensOcr).toHaveBeenCalledTimes(1);

    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    for (let i = 0; i < 8; i += 1) await act(flush);

    expect(lensOcr).toHaveBeenCalledTimes(2);
    expect(lensOcr.mock.calls[1][0]).toMatchObject({ x: 400, y: 300, width: 600, height: 212 });
  });

  it('Escape abandons a pending resize and leaves the read on screen', async () => {
    await mountReading();
    const target = grip('e');
    target.focus();
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(frameBox().width).toBe('616px');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(frameBox()).toEqual({ left: '400px', top: '300px', width: '600px', height: '200px' });
    expect(lensOcr).toHaveBeenCalledTimes(1);
    // The read survived: the lens is still showing its fragments.
    expect(host.querySelectorAll('.lens-line').length).toBeGreaterThan(0);
  });
});
