// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PILLARBOX_KEY = 'jp-pillarbox-settings';
let root: Root | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  document.body.innerHTML = '<div id="host"></div>';
  vi.resetModules();
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('AeroViewport display-mode wiring', () => {
  it('feeds persisted and live nativeFill changes into the rendered viewport mode', async () => {
    localStorage.setItem(PILLARBOX_KEY, JSON.stringify({
      style: 'default-gradient',
      solidColor: '#1a1a2e',
      nativeFill: false,
    }));
    const [{ default: AeroViewport }, pillarbox] = await Promise.all([
      import('../components/AeroViewport'),
      import('../pillarboxSettings'),
    ]);
    const host = document.getElementById('host');
    if (!host) throw new Error('Missing test host');
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(AeroViewport, null, createElement('span', null, 'desktop')));
    });
    expect(host?.querySelector('.os-viewport-stage')?.getAttribute('data-display-mode'))
      .toBe('classic-4-3');

    await act(async () => {
      pillarbox.savePillarboxSettings({
        style: 'default-gradient',
        solidColor: '#1a1a2e',
        nativeFill: true,
      });
    });
    const stage = host?.querySelector<HTMLElement>('.os-viewport-stage');
    expect(stage?.dataset.displayMode).toBe('native');
    expect(stage?.style.getPropertyValue('--os-viewport-scale')).toBe('1');
  });
});
