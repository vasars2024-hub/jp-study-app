// @vitest-environment jsdom
/**
 * Read is a sheet you can put where you want it.
 *
 * It used to be pinned to the middle of the screen, which is the one place a
 * reader capturing subtitles or a visual novel cannot leave it: the sheet
 * deliberately covers the region it was read from, so a fixed centre covers
 * whatever they were reading next. So it drags by its header, resizes from its
 * edges, and remembers where it was left.
 *
 * The remembering is what needs the negative controls. A frame is stored in
 * `localStorage` and restored into whichever display the lens opened on — and
 * the two displays on the machine this was written for are different sizes, so
 * "restore exactly what was saved" is a way to lose the sheet off-screen with
 * no way to get it back. Every restore is clamped, and the tests below both
 * clear the store and seed it with a deliberately impossible frame.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReadingLensCapture } from '../../shared/readingLens';
import type { ReadingLensReadSourceLine } from '../../shared/readingLensRead';
import {
  READ_FRAME_MIN_HEIGHT,
  READ_FRAME_MIN_WIDTH,
} from '../../shared/readingLensReadFrame';

const FRAME_KEY = 'jp-study-lens-read-frame';

function installApiStub(): void {
  const api: Record<string, unknown> = { lookupTerm: async () => ({ entries: [] }) };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      return async (): Promise<unknown> => ({});
    },
  });
}

let ReadPanel: typeof import('../components/lens/LensReadPanel').default;
let root: Root | null = null;
let host: HTMLDivElement;

const CAPTURE: ReadingLensCapture = {
  schemaVersion: 1,
  captureId: 'reading-lens:test-read-move',
  source: 'screen',
  sourceLabel: 'screen',
  sourceRef: '',
  capturedAt: 1_700_000_000_000,
  language: 'ja',
  engine: 'auto',
  hash: 'test-read-move',
  text: '',
  lines: [],
};

const LINES: ReadingLensReadSourceLine[] = [
  {
    text: '猫が寝る。',
    box: [0, 0, 200, 20],
    vertical: false,
    confidence: 0.95,
    tokens: [
      { surface: '猫', lemma: '猫', content: true, proper: false, pos: '名詞', reading: 'ネコ' },
      { surface: 'が', lemma: 'が', content: false, proper: false, pos: '助詞' },
      { surface: '寝る', lemma: '寝る', content: true, proper: false, pos: '動詞', reading: 'ネル' },
      { surface: '。', lemma: '。', content: false, proper: false, pos: '記号' },
    ],
  },
];

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom implements none of the pointer-capture API, and the panel's gesture
  // begins by calling it. Without these the very first pointerdown throws and
  // every assertion below would "pass" by never having dragged anything.
  const captured = new Set<number>();
  Object.assign(Element.prototype, {
    setPointerCapture(id: number) {
      captured.add(id);
    },
    releasePointerCapture(id: number) {
      captured.delete(id);
    },
    hasPointerCapture(id: number) {
      return captured.has(id);
    },
  });
  installApiStub();
  ReadPanel = (await import('../components/lens/LensReadPanel')).default;
});

beforeEach(() => {
  localStorage.clear();
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

async function render(): Promise<void> {
  await act(async () => {
    root?.render(
      <ReadPanel capture={CAPTURE} lines={LINES} onLookup={() => undefined} onClose={() => undefined} />,
    );
  });
}

const sheet = (): HTMLElement => {
  const el = host.querySelector<HTMLElement>('.lens-read');
  if (!el) throw new Error('missing .lens-read');
  return el;
};

/** The frame the sheet is actually painted at — its inline style, in px. */
function rect(): { x: number; y: number; width: number; height: number } {
  const s = sheet().style;
  return {
    x: parseFloat(s.left),
    y: parseFloat(s.top),
    width: parseFloat(s.width),
    height: parseFloat(s.height),
  };
}

/** jsdom has no PointerEvent constructor; React only reads these fields. */
function pointer(type: string, x: number, y: number): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

async function drag(from: Element, x0: number, y0: number, x1: number, y1: number): Promise<void> {
  await act(async () => from.dispatchEvent(pointer('pointerdown', x0, y0)));
  await act(async () => from.dispatchEvent(pointer('pointermove', x1, y1)));
  await act(async () => from.dispatchEvent(pointer('pointerup', x1, y1)));
}

const headBar = (): Element => {
  const el = host.querySelector('.lens-read-head');
  if (!el) throw new Error('missing .lens-read-head');
  return el;
};

const grip = (handle: string): Element => {
  const el = host.querySelector(`.lens-read-grip-${handle}`);
  if (!el) throw new Error(`missing grip ${handle}`);
  return el;
};

describe('Read sheet — move, resize, remember', () => {
  it('opens centred when nothing has been stored', async () => {
    await render();
    // jsdom's viewport is 1024×768.
    expect(rect()).toEqual({ x: 132, y: 24, width: 760, height: 720 });
  });

  it('moves by exactly the drag delta when the header bar is dragged', async () => {
    // A 600×400 sheet, so there is room in both axes for the delta to land
    // whole. The default sheet is 720 tall in a 768 viewport and can only move
    // 24 px down before the clamp takes over — which is the clamp working, and
    // the wrong thing to measure a delta against.
    localStorage.setItem(FRAME_KEY, JSON.stringify({ x: 200, y: 100, width: 600, height: 400 }));
    await render();
    const before = rect();
    expect(before).toEqual({ x: 200, y: 100, width: 600, height: 400 });

    await drag(headBar(), 500, 140, 380, 290);

    const after = rect();
    expect(after.x - before.x).toBe(-120);
    expect(after.y - before.y).toBe(150);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });

  it('NEGATIVE CONTROL: a drag that starts on a header button moves nothing', async () => {
    await render();
    const before = rect();
    const furigana = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Furigana');
    if (!furigana) throw new Error('missing Furigana button');

    await drag(furigana, 500, 40, 380, 190);

    expect(rect()).toEqual(before);
  });

  it('resizes from a corner grip, both dimensions at once', async () => {
    await render();
    const before = rect();

    await drag(grip('se'), 892, 744, 812, 644);

    const after = rect();
    expect(after.width).toBe(before.width - 80);
    expect(after.height).toBe(before.height - 100);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('stops at the minimum instead of collapsing when a grip is pushed past it', async () => {
    await render();

    await drag(grip('se'), 892, 744, -4000, -4000);

    expect(rect().width).toBe(READ_FRAME_MIN_WIDTH);
    expect(rect().height).toBe(READ_FRAME_MIN_HEIGHT);
  });

  it('comes back where it was left after the sheet is closed and reopened', async () => {
    await render();
    await drag(headBar(), 500, 40, 300, 300);
    const left = rect();
    expect(left).not.toEqual({ x: 132, y: 24, width: 760, height: 720 });

    // Closing Read unmounts the panel; the next capture mounts a fresh one.
    await act(async () => root?.unmount());
    host.remove();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await render();

    expect(rect()).toEqual(left);
  });

  it('NEGATIVE CONTROL: with the stored frame cleared it opens at the default again', async () => {
    await render();
    await drag(headBar(), 500, 40, 300, 300);
    expect(localStorage.getItem(FRAME_KEY)).toBeTruthy();

    localStorage.removeItem(FRAME_KEY);
    await act(async () => root?.unmount());
    host.remove();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await render();

    expect(rect()).toEqual({ x: 132, y: 24, width: 760, height: 720 });
  });

  it('moves and resizes from the keyboard, and remembers each step', async () => {
    localStorage.setItem(FRAME_KEY, JSON.stringify({ x: 200, y: 100, width: 600, height: 400 }));
    await render();
    const bar = headBar() as HTMLElement;
    expect(bar.tabIndex).toBe(0);

    const key = async (k: string, shift = false) => {
      await act(async () => {
        bar.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true }));
      });
    };

    await key('ArrowRight');
    await key('ArrowDown');
    expect(rect()).toEqual({ x: 224, y: 124, width: 600, height: 400 });

    await key('ArrowRight', true);
    expect(rect()).toEqual({ x: 224, y: 124, width: 624, height: 400 });

    // Every step persists — a reader who nudges it into place and closes Read
    // must not have to nudge it again.
    expect(JSON.parse(localStorage.getItem(FRAME_KEY) ?? 'null')).toEqual({
      x: 224,
      y: 124,
      width: 624,
      height: 400,
    });
  });

  it('NEGATIVE CONTROL: a key the sheet does not own leaves the frame alone', async () => {
    localStorage.setItem(FRAME_KEY, JSON.stringify({ x: 200, y: 100, width: 600, height: 400 }));
    await render();
    const before = rect();

    await act(async () => {
      headBar().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });

    expect(rect()).toEqual(before);
  });

  it('the keyboard cannot push the sheet anywhere a drag could not', async () => {
    localStorage.setItem(FRAME_KEY, JSON.stringify({ x: 0, y: 0, width: 600, height: 400 }));
    await render();
    const bar = headBar();

    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
    }

    expect(rect().x).toBe(0);
  });

  it('clamps a stored frame that is off-screen on this display back onto it', async () => {
    // What a sheet moved onto the second display (x=1920) and saved looks like
    // when the lens next opens on the primary one.
    localStorage.setItem(FRAME_KEY, JSON.stringify({ x: 2400, y: 1400, width: 600, height: 400 }));
    await render();

    const frame = rect();
    expect(frame.x).toBe(1024 - 600);
    expect(frame.y).toBe(768 - 400);
    expect(frame.x + frame.width).toBeLessThanOrEqual(1024);
    expect(frame.y + frame.height).toBeLessThanOrEqual(768);
  });
});
