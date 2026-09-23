// @vitest-environment jsdom
/**
 * The media workspace is the PLAYER, and only the player (2026-09-23).
 *
 * The Media Center became the one media library for every kind of video, so the host lost
 * its Library / Readiness / Review segments. What it must still do, and what these tests pin:
 *
 *   - open for a file, and mount the player once the sidecar is ready;
 *   - send a bare open ("open the media workspace", nothing to play) to the Media Center's
 *     library instead of showing an empty overlay;
 *   - send "review this file" (a readiness row, the desktop Continue-watching widget) to the
 *     Media Center's Review page, focused on that file;
 *   - close on Back and on Escape, and forget the video when it does;
 *   - show one loader while a stopped sidecar is being auto-started, then explain it.
 *
 * `MediaWorkspace` and `seanimeBootstrap` are mocked: without the bootstrap mock
 * `conn.baseUrl` is empty and the player never mounts, and without the workspace mock the
 * test drags in the whole adopted vendor bundle.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeanimeStatus } from '../../shared/seanime';

vi.mock('../../media/seanimeBootstrap', () => ({
  bootstrapSeanimeConnection: async () => ({ baseUrl: 'http://127.0.0.1:58554', token: 't' }),
}));

vi.mock('../../media/MediaWorkspace', () => ({
  default: () => createElement('div', { 'data-stub-workspace': 'true' }),
}));

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
let osOpens: unknown[] = [];
const onOsOpen = (event: Event): void => void osOpens.push((event as CustomEvent).detail);

function stubApi(status: SeanimeStatus): void {
  vi.stubGlobal('window', globalThis.window);
  (globalThis.window as unknown as { api: Record<string, unknown> }).api = {
    seanimeStatus: async () => status,
    onSeanimeStatus: () => () => undefined,
    seanimeStart: async () => undefined,
    listMedia: async () => [],
  };
}

beforeEach(() => {
  vi.resetModules();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  osOpens = [];
  window.addEventListener('os:open', onOsOpen);
});

afterEach(() => {
  window.removeEventListener('os:open', onOsOpen);
  // Unmounted, not just detached: a detached host keeps its window listeners and answers
  // the next test's events a second time.
  act(() => { root?.unmount(); });
  root = null;
  host?.remove();
  host = null;
});

/** Several act cycles: a React.lazy chain does not settle in one microtask. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
}

async function mount(): Promise<HTMLDivElement> {
  const { default: MediaWorkspaceHost } = await import('../../media/MediaWorkspaceHost');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const mounted = root;
  await act(async () => { mounted.render(createElement(MediaWorkspaceHost, {})); });
  await flush();
  return host;
}

async function dispatch(name: string, detail?: unknown): Promise<void> {
  await act(async () => { window.dispatchEvent(new CustomEvent(name, { detail })); });
  await flush();
}

const STOPPED = { kind: 'stopped', port: 0 } as unknown as SeanimeStatus;
const READY = { kind: 'ready', port: 58554, pid: 123 } as unknown as SeanimeStatus;
const FILE = { localFilePath: 'c:/media/ep1.mkv' };

describe('MediaWorkspaceHost — player only', () => {
  it('opens for a file and mounts the player, with no library segments', async () => {
    stubApi(READY);
    const el = await mount();
    expect(el.querySelector('.seanime-host')).toBeNull();

    await dispatch('seanime:media-workspace-open', FILE);

    expect(el.querySelector('.seanime-host')).not.toBeNull();
    expect(el.querySelector('[data-stub-workspace]')).not.toBeNull();
    expect(el.querySelector('.seanime-host-views')).toBeNull();
    expect(el.querySelector('.seanime-host-back')).not.toBeNull();
  });

  it('sends a bare open to the Media Center library instead of an empty overlay', async () => {
    stubApi(READY);
    const el = await mount();
    const { takeMediaCenterIntent } = await import('../mediaCenterIntent');

    await dispatch('seanime:media-workspace-open');

    expect(el.querySelector('.seanime-host')).toBeNull();
    expect(osOpens).toEqual(['player']);
    expect(takeMediaCenterIntent()).toEqual({ tab: 'library' });
  });

  it('sends "review this file" to the Media Center Review page, focused', async () => {
    stubApi(STOPPED);
    const el = await mount();
    const { takeMediaCenterIntent } = await import('../mediaCenterIntent');
    const focus = { pathKey: 'c:/media/ep1.mkv', title: 'The Big O' };

    await dispatch('seanime:study-review-focus', focus);

    expect(el.querySelector('.seanime-host')).toBeNull();
    expect(osOpens).toEqual(['player']);
    expect(takeMediaCenterIntent()).toEqual({ tab: 'review', focus });
  });

  it('ignores a review focus carrying no join key', async () => {
    stubApi(STOPPED);
    await mount();
    await dispatch('seanime:study-review-focus', { pathKey: '', title: 'The Big O' });
    expect(osOpens).toEqual([]);
  });

  it('closes on Back, and a later bare open does not replay the old video', async () => {
    stubApi(READY);
    const el = await mount();
    await dispatch('seanime:media-workspace-open', FILE);

    await act(async () => { el.querySelector<HTMLButtonElement>('.seanime-host-back')?.click(); });
    await flush();
    expect(el.querySelector('.seanime-host')).toBeNull();

    await dispatch('seanime:media-workspace-open');
    expect(el.querySelector('.seanime-host')).toBeNull();
  });

  it('closes on Escape, but not while the user is typing', async () => {
    stubApi(READY);
    const el = await mount();
    await dispatch('seanime:media-workspace-open', FILE);

    const field = document.createElement('input');
    el.querySelector('.seanime-host')?.append(field);
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(el.querySelector('.seanime-host')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await flush();
    expect(el.querySelector('.seanime-host')).toBeNull();
  });

  it('shows one loader while a stopped sidecar is auto-started, then explains it', async () => {
    // For the first few seconds a stopped sidecar is one that auto-start is bringing up,
    // so it shows the single loader rather than "stopped" and a Start button for a frame.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      stubApi(STOPPED);
      const el = await mount();
      await dispatch('seanime:media-workspace-open', FILE);
      expect(el.querySelector('.lq-loading')).not.toBeNull();
      expect(el.querySelector('.seanime-host-state')).toBeNull();

      await act(async () => { vi.advanceTimersByTime(4100); });
      await flush();
      expect(el.querySelector('.seanime-host-state')?.textContent).toContain('media server is');
    } finally {
      vi.useRealTimers();
    }
  });
});
