// @vitest-environment jsdom
//
// The watch-folder settings panel through the real DOM: it shows what main
// reports (automatic folders marked, missing and paused ones said out loud),
// and every control reaches the IPC it names.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaIngestState } from '../../shared/mediaIngest';
import MediaWatchFoldersPanel from '../components/mediaIngest/MediaWatchFoldersPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let pushState: ((state: MediaIngestState) => void) | null = null;

function state(patch: Partial<MediaIngestState> = {}): MediaIngestState {
  return {
    autoImport: true,
    folders: [
      { path: 'D:\\Anime', origin: 'user', addedAt: 1, exists: true, active: true },
      { path: 'D:\\Downloads', origin: 'qbittorrent', addedAt: 2, exists: true, active: true },
      { path: 'E:\\Gone', origin: 'user', addedAt: 3, exists: false, active: true },
    ],
    qbit: { status: 'watching', lastCheckedAt: 1 },
    ...patch,
  };
}

function stubApi(initial: MediaIngestState) {
  const api = {
    mediaIngestState: vi.fn(async () => initial),
    mediaIngestSetAutoImport: vi.fn(async (on: boolean) => state({ autoImport: on })),
    mediaIngestRemoveFolder: vi.fn(async () => state({ folders: [] })),
    mediaIngestAddFolder: vi.fn(async () => initial),
    mediaIngestRescan: vi.fn(async () => initial),
    onMediaIngestState: vi.fn((cb: (next: MediaIngestState) => void) => {
      pushState = cb;
      return () => { pushState = null; };
    }),
  };
  (window as unknown as { api: typeof api }).api = api;
  return api;
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(createElement(MediaWatchFoldersPanel));
  });
}

function text(): string {
  return host.textContent ?? '';
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  pushState = null;
});

describe('MediaWatchFoldersPanel', () => {
  it('lists the folders, marks the automatic one and names a missing one', async () => {
    stubApi(state());
    await render();
    expect(text()).toContain('Import finished downloads automatically');
    expect(text()).toContain('Anime');
    expect(text()).toContain('Added automatically · qBittorrent downloads');
    expect(text()).toContain('Folder not found');
    expect(text()).toContain('Watching qBittorrent');
  });

  it('turns automatic import off through main and says the automatic folders are paused', async () => {
    const api = stubApi(state());
    await render();
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(toggle?.checked).toBe(true);
    await act(async () => {
      toggle?.click();
    });
    expect(api.mediaIngestSetAutoImport).toHaveBeenCalledWith(false);
    await act(async () => {
      pushState?.(state({
        autoImport: false,
        folders: [{ path: 'D:\\Downloads', origin: 'qbittorrent', addedAt: 2, exists: true, active: false }],
        qbit: { status: 'off', lastCheckedAt: null },
      }));
    });
    expect(text()).toContain('Paused while automatic import is off');
    expect(text()).not.toContain('Watching qBittorrent');
  });

  it('removes a folder by its path', async () => {
    const api = stubApi(state());
    await render();
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="Stop watching Downloads"]');
    expect(remove).not.toBeNull();
    await act(async () => {
      remove?.click();
    });
    expect(api.mediaIngestRemoveFolder).toHaveBeenCalledWith('D:\\Downloads');
    expect(text()).toContain('No folders are being watched.');
  });

  it('renders nothing on a build without the ingest bridge', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {};
    await render();
    expect(host.innerHTML).toBe('');
  });
});
