// @vitest-environment jsdom
/**
 * The Region Recorder's picker: drag draws a box (labelled in real pixels),
 * a click is not a box, arrows nudge it, Enter records it — or the whole
 * monitor with nothing drawn — Esc cancels, Tab asks for the next monitor and
 * "last region" puts the remembered box back.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecorderSelectInit } from '../../shared/regionRecorder';

let root: Root | null = null;
const api = {
  recorderSelectGetInit: vi.fn(),
  onRecorderSelectInit: vi.fn(() => () => undefined),
  recorderSelectDone: vi.fn(async () => null),
  recorderSelectNextDisplay: vi.fn(async () => null),
};

const init = (over: Partial<RecorderSelectInit> = {}): RecorderSelectInit => ({
  bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
  displayId: 2,
  scaleFactor: 1.5,
  displayCount: 2,
  lastRegion: null,
  ...over,
});

async function mount(value: RecorderSelectInit): Promise<HTMLElement> {
  api.recorderSelectGetInit.mockResolvedValue(value);
  const { default: RegionSelectOverlay } = await import('../recorder/RegionSelectOverlay');
  const host = document.getElementById('host')!;
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(RegionSelectOverlay));
  });
  await act(async () => undefined);
  return host;
}

function pointer(type: string, x: number, y: number): void {
  const el = document.querySelector('[data-testid="rr-select"]')!;
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
  });
}

function key(k: string, extra: KeyboardEventInit = {}): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '<div id="host"></div>';
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
  Object.values(api).forEach((fn) => fn.mockClear());
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
});

describe('RegionSelectOverlay', () => {
  it('Enter with nothing drawn records the whole monitor (display-local, whatever its origin)', async () => {
    await mount(init());
    key('Enter');
    expect(api.recorderSelectDone).toHaveBeenCalledWith({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('a drag draws a box sized in real pixels; arrows nudge it; Enter records it', async () => {
    await mount(init());
    pointer('pointerdown', 100, 100);
    pointer('pointermove', 300, 200);
    pointer('pointerup', 300, 200);
    expect(document.querySelector('[data-testid="rr-size"]')?.textContent).toContain('300');
    expect(document.querySelector('[data-testid="rr-size"]')?.textContent).toContain('150');
    key('ArrowRight');
    key('ArrowDown', { shiftKey: true });
    key('Enter');
    expect(api.recorderSelectDone).toHaveBeenCalledWith({ x: 110, y: 100, width: 200, height: 110 });
  });

  it('a click under 12 px is not a box', async () => {
    await mount(init());
    pointer('pointerdown', 100, 100);
    pointer('pointerup', 105, 108);
    key('Enter');
    expect(api.recorderSelectDone).toHaveBeenCalledWith({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('Esc cancels, once; Tab asks for the next monitor', async () => {
    await mount(init());
    key('Tab');
    expect(api.recorderSelectNextDisplay).toHaveBeenCalledTimes(1);
    key('Escape');
    key('Escape');
    key('Enter');
    expect(api.recorderSelectDone).toHaveBeenCalledTimes(1);
    expect(api.recorderSelectDone).toHaveBeenCalledWith(null);
  });

  it('R brings back the remembered region', async () => {
    await mount(init({ lastRegion: { x: 40, y: 50, width: 640, height: 360 } }));
    key('r');
    key('Enter');
    expect(api.recorderSelectDone).toHaveBeenCalledWith({ x: 40, y: 50, width: 640, height: 360 });
  });
});
