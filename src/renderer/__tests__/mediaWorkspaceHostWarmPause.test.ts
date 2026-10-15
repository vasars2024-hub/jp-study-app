// @vitest-environment jsdom
/**
 * The warm player (`MediaWorkspaceHost.tsx`, "A warm player") stays mounted, hidden, for
 * ten minutes after the player closes. It must be paused, never playing: a video going on
 * unseen and unheard there would keep the media pipeline busy and, before the auto-lock's
 * tracker re-checked what it hears, would have counted as the viewer watching.
 *
 * Mocking follows `mediaWorkspaceHostRecovery.test.ts`, one level deeper: the pause lives in
 * `MediaWorkspace.tsx`, and the stubbed player slice draws one <video> whose play state the
 * test drives (jsdom has no media pipeline).
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeanimeStatus } from '../../shared/seanime';

vi.mock('../../media/seanimeBootstrap', () => ({
  bootstrapSeanimeConnection: async () => ({ baseUrl: 'http://127.0.0.1:9001', token: 'token-1' }),
}));

// The real `MediaWorkspace` (it holds the warm pause); its heavy pieces are stubbed, and the
// player slice draws one <video>.
vi.mock('../../media/MediaSurfaceShell', () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock('../../media/seanimeLocalPlayback', () => ({
  LocalPlaybackProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('../../media/StudyPlayerSlice', async () => {
  const react = await import('react');
  return {
    default: () => react.createElement('video', { 'data-stub-video': 'true' }),
  };
});

const READY = {
  kind: 'ready', port: 51106, pid: 8844, dataDir: null, version: null,
  simulatedUser: null, error: null, logTail: [],
} as unknown as SeanimeStatus;

let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.resetModules();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  (globalThis.window as unknown as { api: Record<string, unknown> }).api = {
    seanimeStatus: async () => READY,
    onSeanimeStatus: () => () => undefined,
    seanimeStart: async () => READY,
    seanimeWarm: async () => READY,
    pickMedia: async () => null,
    ankiStatus: async () => ({ connected: false, decks: [], models: [] }),
    ankiGetIntervals: async () => null,
    ankiGetIntervalsForNotes: async () => null,
  };
});

afterEach(() => {
  host?.remove();
  host = null;
});

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
}

/** Gives the stub video a play state and a pause() that clears it. */
function drive(video: HTMLVideoElement): { pauses: number; playing: boolean } {
  const state = { pauses: 0, playing: false };
  Object.defineProperty(video, 'paused', { configurable: true, get: () => !state.playing });
  video.pause = () => {
    state.pauses += 1;
    state.playing = false;
  };
  return state;
}

describe('MediaWorkspaceHost — the warm player is paused, never playing', () => {
  it('pauses a video still going at close, and any that starts while it is warm', async () => {
    const { default: MediaWorkspaceHost } = await import('../../media/MediaWorkspaceHost');
    host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(createElement(MediaWorkspaceHost, {})); });
    await act(async () => {
      window.dispatchEvent(new CustomEvent('seanime:media-workspace-open', {
        detail: { localFilePath: 'c:/media/ep1.mkv' },
      }));
    });
    // The lazy player chunk (the real module, stubbed inside) takes a few turns to load.
    for (let i = 0; i < 50 && !host.querySelector('[data-stub-video]'); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    const video = host.querySelector<HTMLVideoElement>('[data-stub-video]');
    expect(video).not.toBeNull();
    const state = drive(video!);
    state.playing = true;
    // Open: the host never touches the viewer's playback.
    video!.dispatchEvent(new Event('play'));
    expect(state.pauses).toBe(0);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('seanime:media-workspace-close'));
    });
    await flush();
    // Closed and warm: still mounted, hidden, and paused.
    expect(host.querySelector('.seanime-host-warm [data-stub-video]')).toBe(video);
    expect(state.pauses).toBe(1);
    expect(video!.paused).toBe(true);

    // A late play() under the closed host is paused again at once.
    state.playing = true;
    video!.dispatchEvent(new Event('play'));
    expect(state.pauses).toBe(2);
    expect(video!.paused).toBe(true);
    await act(async () => { root.unmount(); });
  });
});
