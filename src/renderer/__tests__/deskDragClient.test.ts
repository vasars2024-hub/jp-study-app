// @vitest-environment jsdom
/**
 * The renderer half of the cross-monitor drag, driven the way `DesktopShell`
 * drives it.
 *
 * `main/deskDrag.ts` already has its own suite; this covers the side nothing
 * tested — the decision of *when* to talk to main at all. That decision is the
 * whole reason a normal same-desk drag stays free: `beginDeskDrag` is called on
 * every icon and window drag in the shell, so if it forwarded moves
 * unconditionally, every ordinary drag would become an IPC storm and every
 * ordinary drop would end in `deskDragEnd` rather than a local commit.
 *
 * jsdom rather than node: the module reads `getBoundingClientRect()`,
 * `window.screenX/Y` and installs a real `keydown` listener for the Escape
 * guard, and stubbing all three is how you end up testing the stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginDeskDrag,
  cancelDeskDrag,
  deskDisplayKey,
  endDeskDrag,
  isDeskDragActive,
  moveDeskDrag,
  registerDeskContext,
  screenToDeskPoint,
  subscribeDeskDrag,
} from '../deskDrag';
import type { WindowSnapshot } from '../../shared/desktop';

/** The desk this window paints, at a deliberately non-zero origin. */
const DESK_RECT = { left: 100, top: 50, right: 900, bottom: 650 };

function makeDeskEl(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = (() => ({
    ...DESK_RECT,
    x: DESK_RECT.left,
    y: DESK_RECT.top,
    width: DESK_RECT.right - DESK_RECT.left,
    height: DESK_RECT.bottom - DESK_RECT.top,
    toJSON: () => undefined,
  })) as HTMLElement['getBoundingClientRect'];
  return el;
}

/** Only the shape `deskDrag.ts` actually reaches for. */
function pointer(clientX: number, clientY: number, screenX = 0, screenY = 0): PointerEvent {
  return { clientX, clientY, screenX, screenY } as PointerEvent;
}

const SNAPSHOT = { id: 'w1', section: 'library' } as unknown as WindowSnapshot;

let api: {
  deskDragBegin: ReturnType<typeof vi.fn>;
  deskDragMove: ReturnType<typeof vi.fn>;
  deskDragEnd: ReturnType<typeof vi.fn>;
  deskDragCancel: ReturnType<typeof vi.fn>;
  onDeskDragHover: ReturnType<typeof vi.fn>;
  onDeskDragLeave: ReturnType<typeof vi.fn>;
  onDeskDragAdopt: ReturnType<typeof vi.fn>;
  onDeskDragRelease: ReturnType<typeof vi.fn>;
  onDeskDragCancelled: ReturnType<typeof vi.fn>;
};
let unregister: (() => void) | null = null;

beforeEach(() => {
  api = {
    deskDragBegin: vi.fn(),
    deskDragMove: vi.fn(),
    deskDragEnd: vi.fn(),
    deskDragCancel: vi.fn(),
    onDeskDragHover: vi.fn(() => vi.fn()),
    onDeskDragLeave: vi.fn(() => vi.fn()),
    onDeskDragAdopt: vi.fn(() => vi.fn()),
    onDeskDragRelease: vi.fn(() => vi.fn()),
    onDeskDragCancelled: vi.fn(() => vi.fn()),
  };
  (window as unknown as { api: typeof api }).api = api;
});

afterEach(() => {
  // The module is a per-window singleton, so an unfinished drag would leak into
  // the next test exactly as it would leak into the next gesture.
  cancelDeskDrag();
  unregister?.();
  unregister = null;
});

function register(displayKey = 'display|1920x1080|1'): HTMLElement {
  const deskEl = makeDeskEl();
  unregister = registerDeskContext({ displayKey, deskEl: () => deskEl });
  return deskEl;
}

describe('registering the desk context', () => {
  it('reports the display this shell is on, and forgets it on unregister', () => {
    register('display|3440x1440|2');
    expect(deskDisplayKey()).toBe('display|3440x1440|2');
    unregister?.();
    unregister = null;
    expect(deskDisplayKey()).toBeNull();
  });

  it('refuses to start a drag before a context is registered', () => {
    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    expect(api.deskDragBegin).not.toHaveBeenCalled();
    expect(isDeskDragActive()).toBe(false);
  });
});

describe('a drag that never leaves this monitor', () => {
  it('tells main it began, and then says nothing at all', () => {
    register();
    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });

    expect(api.deskDragBegin).toHaveBeenCalledWith({
      kind: 'window',
      id: 'w1',
      payload: { kind: 'window', snapshot: SNAPSHOT },
      displayKey: 'display|1920x1080|1',
    });
    expect(isDeskDragActive()).toBe(true);

    // Three moves well inside the desk rect.
    expect(moveDeskDrag(pointer(200, 200))).toBe(false);
    expect(moveDeskDrag(pointer(500, 400))).toBe(false);
    expect(moveDeskDrag(pointer(880, 640))).toBe(false);
    expect(api.deskDragMove).not.toHaveBeenCalled();
  });

  it('ends as a local drop: cancel to main, false to the caller', () => {
    register();
    beginDeskDrag('icon', 'i1', { kind: 'icon', snapshot: { id: 'i1' } as never });
    moveDeskDrag(pointer(300, 300));

    // False is what tells DesktopShell to commit the icon's new position here.
    expect(endDeskDrag(pointer(310, 305))).toBe(false);
    expect(api.deskDragEnd).not.toHaveBeenCalled();
    expect(api.deskDragCancel).toHaveBeenCalledTimes(1);
    expect(isDeskDragActive()).toBe(false);
  });
});

describe('a drag that crosses onto another monitor', () => {
  it('forwards screen coordinates only once the pointer is outside the desk', () => {
    register();
    beginDeskDrag('widget', 'g1', { kind: 'widget', snapshot: { id: 'g1' } as never });

    expect(moveDeskDrag(pointer(500, 400, 500, 400))).toBe(false);
    // Past the desk's right edge — screenX/Y, not clientX/Y, is what main needs.
    expect(moveDeskDrag(pointer(1000, 400, 2010, 450))).toBe(true);
    expect(api.deskDragMove).toHaveBeenCalledTimes(1);
    expect(api.deskDragMove).toHaveBeenCalledWith(2010, 450);
  });

  it('retracts the hover exactly once when the pointer comes home', () => {
    register();
    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    moveDeskDrag(pointer(1000, 400, 2010, 450));
    api.deskDragMove.mockClear();

    // Back inside: one NaN retraction, then silence.
    expect(moveDeskDrag(pointer(500, 400, 500, 400))).toBe(false);
    expect(api.deskDragMove).toHaveBeenCalledTimes(1);
    const [x, y] = api.deskDragMove.mock.calls[0] as [number, number];
    expect(Number.isNaN(x) && Number.isNaN(y)).toBe(true);

    expect(moveDeskDrag(pointer(520, 420, 520, 420))).toBe(false);
    expect(api.deskDragMove).toHaveBeenCalledTimes(1);
  });

  it('hands the item over when released outside, and says so', () => {
    register();
    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    moveDeskDrag(pointer(1000, 400, 2010, 450));

    // True means "do NOT commit locally" — the release message removes it here.
    expect(endDeskDrag(pointer(1010, 402, 2020, 452))).toBe(true);
    expect(api.deskDragEnd).toHaveBeenCalledWith(2020, 452);
    expect(api.deskDragCancel).not.toHaveBeenCalled();
  });

  it('keeps the item when the pointer wanders out and back before release', () => {
    register();
    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    moveDeskDrag(pointer(1000, 400, 2010, 450));

    expect(endDeskDrag(pointer(500, 400, 500, 400))).toBe(false);
    expect(api.deskDragEnd).not.toHaveBeenCalled();
    expect(api.deskDragCancel).toHaveBeenCalledTimes(1);
  });

  it('ignores an end with no drag in flight', () => {
    register();
    expect(endDeskDrag(pointer(1000, 400, 2010, 450))).toBe(false);
    expect(api.deskDragEnd).not.toHaveBeenCalled();
    expect(api.deskDragCancel).not.toHaveBeenCalled();
  });
});

describe('the Escape guard', () => {
  it('abandons the hand-off on Escape', () => {
    register();
    beginDeskDrag('note', 'n1', { kind: 'note', snapshot: { id: 'n1' } as never });
    moveDeskDrag(pointer(1000, 400, 2010, 450));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(api.deskDragCancel).toHaveBeenCalledTimes(1);
    expect(isDeskDragActive()).toBe(false);
  });

  it('is removed once the drag ends, so a later Escape is inert', () => {
    register();
    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    moveDeskDrag(pointer(1000, 400, 2010, 450));
    endDeskDrag(pointer(1010, 402, 2020, 452));
    api.deskDragCancel.mockClear();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(api.deskDragCancel).not.toHaveBeenCalled();
  });

  it('leaves other keys alone', () => {
    register();
    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(api.deskDragCancel).not.toHaveBeenCalled();
    expect(isDeskDragActive()).toBe(true);
  });
});

describe('subscribing to the broker', () => {
  it('wires all five channels and releases all five', () => {
    const offs = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    api.onDeskDragHover.mockReturnValue(offs[0]);
    api.onDeskDragLeave.mockReturnValue(offs[1]);
    api.onDeskDragAdopt.mockReturnValue(offs[2]);
    api.onDeskDragRelease.mockReturnValue(offs[3]);
    api.onDeskDragCancelled.mockReturnValue(offs[4]);

    const handlers = {
      onHover: vi.fn(),
      onLeave: vi.fn(),
      onAdopt: vi.fn(),
      onRelease: vi.fn(),
      onCancelled: vi.fn(),
    };
    const off = subscribeDeskDrag(handlers);

    // Each preload binding got a listener, and each listener reaches its handler.
    (api.onDeskDragHover.mock.calls[0][0] as (p: unknown) => void)({
      kind: 'icon',
      screenX: 12,
      screenY: 34,
    });
    expect(handlers.onHover).toHaveBeenCalledWith({ kind: 'icon', screenX: 12, screenY: 34 });

    (api.onDeskDragCancelled.mock.calls[0][0] as (p: unknown) => void)({
      kind: 'icon',
      id: 'i1',
      reason: 'same-display',
    });
    expect(handlers.onCancelled).toHaveBeenCalledWith({
      kind: 'icon',
      id: 'i1',
      reason: 'same-display',
    });

    off();
    for (const fn of offs) expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('screenToDeskPoint', () => {
  it('converts a virtual-screen point into desk-local pixels', () => {
    const deskEl = makeDeskEl();
    // jsdom reports window.screenX/screenY as 0, which is the main window's case.
    expect(screenToDeskPoint(400, 250, deskEl, 1)).toEqual({ x: 300, y: 200 });
  });

  it('undoes the Aero canvas scale', () => {
    const deskEl = makeDeskEl();
    expect(screenToDeskPoint(400, 250, deskEl, 2)).toEqual({ x: 150, y: 100 });
  });

  it('never returns a negative position', () => {
    const deskEl = makeDeskEl();
    expect(screenToDeskPoint(0, 0, deskEl, 1)).toEqual({ x: 0, y: 0 });
  });

  it('clamps an absurd scale rather than dividing by zero', () => {
    const deskEl = makeDeskEl();
    const p = screenToDeskPoint(400, 250, deskEl, 0);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(p).toEqual({ x: 300 / 0.05, y: 200 / 0.05 });
  });

  it('falls back to a visible corner when there is no desk yet', () => {
    expect(screenToDeskPoint(400, 250, null, 1)).toEqual({ x: 40, y: 40 });
  });
});

/**
 * `DesktopShell.dragStart` calls `moveDeskDrag` on EVERY `pointermove`, before
 * its own rAF throttle, while the rAF writes `style.transform` on the dragged
 * window. A `getBoundingClientRect()` per move is therefore a forced layout
 * flush per pointer event interleaved with a write — measured 2026-08-24 as an
 * occasional ~100 ms frame that missed rubric category 7's "0 frames over
 * 100 ms" bar in 4 of 8 drag runs, in both presentations.
 *
 * These pin the fix in both directions: the rect is read once per gesture, and
 * a mid-drag window resize still invalidates it — a stale rect would hand the
 * window to the wrong monitor, which is the only way this cache can be wrong.
 */
describe('the desk rect is measured once per drag, not once per move', () => {
  function countingDesk(): { el: HTMLElement; reads: () => number } {
    const el = makeDeskEl();
    const real = el.getBoundingClientRect.bind(el);
    let n = 0;
    el.getBoundingClientRect = (() => {
      n += 1;
      return real();
    }) as HTMLElement['getBoundingClientRect'];
    return { el, reads: () => n };
  }

  it('reads the rect once for a whole gesture however many moves it takes', () => {
    const { el, reads } = countingDesk();
    unregister = registerDeskContext({ displayKey: 'display|1920x1080|1', deskEl: () => el });

    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    const afterBegin = reads();
    for (let i = 0; i < 200; i += 1) expect(moveDeskDrag(pointer(200 + (i % 400), 300))).toBe(false);

    // 200 moves, zero extra layout flushes.
    expect(reads()).toBe(afterBegin);
    expect(afterBegin).toBeLessThanOrEqual(1);

    endDeskDrag(pointer(500, 400));
  });

  it('re-measures after a resize, so a mid-drag geometry change is not missed', () => {
    const { el, reads } = countingDesk();
    unregister = registerDeskContext({ displayKey: 'display|1920x1080|1', deskEl: () => el });

    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    moveDeskDrag(pointer(300, 300));
    const before = reads();

    window.dispatchEvent(new Event('resize'));
    moveDeskDrag(pointer(300, 300));
    expect(reads()).toBe(before + 1);

    endDeskDrag(pointer(300, 300));
  });

  it('drops the cache at the end, so the next gesture measures again', () => {
    const { el, reads } = countingDesk();
    unregister = registerDeskContext({ displayKey: 'display|1920x1080|1', deskEl: () => el });

    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    moveDeskDrag(pointer(300, 300));
    endDeskDrag(pointer(300, 300));
    const afterFirst = reads();

    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    moveDeskDrag(pointer(300, 300));
    expect(reads()).toBeGreaterThan(afterFirst);
    endDeskDrag(pointer(300, 300));
  });

  it('still decides the monitor correctly from the cached rect', () => {
    const { el } = countingDesk();
    unregister = registerDeskContext({ displayKey: 'display|1920x1080|1', deskEl: () => el });

    beginDeskDrag('window', 'w1', { kind: 'window', snapshot: SNAPSHOT });
    expect(moveDeskDrag(pointer(500, 400))).toBe(false);
    // Outside DESK_RECT (100,50)-(900,650) — must still be detected as escaped.
    expect(moveDeskDrag(pointer(1400, 400, 1400, 400))).toBe(true);
    expect(api.deskDragMove).toHaveBeenCalledWith(1400, 400);
    expect(endDeskDrag(pointer(1400, 400, 1400, 400))).toBe(true);
  });
});
