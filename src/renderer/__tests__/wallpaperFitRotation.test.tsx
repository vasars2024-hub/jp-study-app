// @vitest-environment jsdom
/**
 * Settings > Wallpaper > Fit only reached a single image or video; a rotating or
 * preset wallpaper was hard-coded `cover` (WallpaperStage, DesktopShell). The
 * rotating stage now sizes its layers with `--wall-background-fit`, the
 * background-size twin of `--wall-fit` that wallpaperFit.ts sets on <html>.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The stage's imports reach `playerBus`, which touches the preload bridge at load.
vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
      ? () => () => undefined
      : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});
import WallpaperStage from '../environment/WallpaperStage';
import { saveEnvironment } from '../environment/environmentStore';
import { applyWallpaperFit } from '../wallpaperFit';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.useRealTimers();
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

describe('wallpaper fit reaches the rotating wallpaper', () => {
  it('a rotating preset layer is sized by the user\'s fit, not a fixed cover', async () => {
    // The default playlist follows the time of day, and the night wall is an animated
    // layer this test leaves out; pin midday so the result does not depend on the clock.
    vi.useFakeTimers({ now: new Date(2026, 8, 25, 12).getTime(), toFake: ['Date'] });
    saveEnvironment({ enabled: true, rotationEnabled: true });
    applyWallpaperFit('contain');
    expect(document.documentElement.style.getPropertyValue('--wall-background-fit')).toBe('contain');

    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<WallpaperStage />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const layers = [...host.querySelectorAll<HTMLElement>('.os-wall-layer')];
    expect(layers.length).toBeGreaterThan(0);
    const sized = layers.filter((layer) => layer.style.backgroundImage && !layer.classList.contains('wall-animated'));
    expect(sized.length, 'a sized layer is on screen').toBeGreaterThan(0);
    for (const layer of sized) expect(layer.style.backgroundSize).toBe('var(--wall-background-fit, cover)');
  });
});
