// @vitest-environment jsdom
/**
 * Audit round 2 — the YouTube manager, on the real view.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';
import type { YtPlaylistsStore, YtVideo } from '../../shared/ytPlaylists';
import type { YtQueueEntry } from '../../main/ytDownloadQueue';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.now();

function video(id: string, over: Partial<YtVideo> = {}): YtVideo {
  return {
    id,
    playlistId: 'p1',
    youtubeId: `${id}xxxxxxxxxx`.slice(0, 11),
    title: `Video ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    downloaded: false,
    hasOfficialSubs: null,
    transcribed: false,
    firstSeenAt: 1,
    viewCount: 1234,
    ...over,
  };
}

function makeStore(over: Partial<YtPlaylistsStore> = {}): YtPlaylistsStore {
  return {
    version: 1,
    folders: [],
    channels: [],
    playlists: [
      {
        id: 'p1',
        title: 'Listening',
        url: 'https://www.youtube.com/playlist?list=PL1',
        youtubePlaylistId: 'PL1',
        subscriptionStatus: 'subscribed',
        lang: 'ja',
        preferSubs: ['ja'],
        autoUpdate: true,
        lastSyncedAt: NOW,
        lastCheckedAt: NOW,
        updateFrequencyHours: 24,
        sortDefault: 'playlist',
        createdAt: 1,
      },
    ],
    videos: [
      video('a', { hasAutoSubs: true, downloaded: true, mediaItemId: 'm-a' }),
      video('b', { removedFromYouTube: true }),
      video('c'),
    ],
    lastNewsCheckedAt: NOW,
    lastNewsVideoIds: ['c'],
    planToWatchIds: [],
    ...over,
  } as YtPlaylistsStore;
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let queueListener: ((entries: YtQueueEntry[]) => void) | null = null;
const api = {
  ytList: vi.fn(),
  ytRefreshAll: vi.fn(),
  ytSetPlaylistPrefs: vi.fn(),
  ytCancelDownloads: vi.fn(async () => []),
  ytPauseDownload: vi.fn(async () => []),
  ytDownloadQueue: vi.fn(async () => [] as YtQueueEntry[]),
  onYtQueueChanged: vi.fn((cb: (entries: YtQueueEntry[]) => void) => {
    queueListener = cb;
    return () => undefined;
  }),
  onYtChanged: vi.fn(() => () => undefined),
  onYtRefreshProgress: vi.fn(() => () => undefined),
  onYtDownloadProgress: vi.fn(() => () => undefined),
};

async function mount(store: YtPlaylistsStore): Promise<HTMLDivElement> {
  api.ytList.mockResolvedValue(store);
  const { default: View } = await import('../views/YouTubePlaylistsView');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<View />);
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return host;
}

beforeEach(() => {
  localStorage.clear();
  queueListener = null;
  for (const fn of Object.values(api)) (fn as ReturnType<typeof vi.fn>).mockClear();
  api.ytRefreshAll.mockResolvedValue({ store: makeStore(), newVideoIds: [], errors: [] });
  api.ytSetPlaylistPrefs.mockImplementation(async () => makeStore());
  installResizeObserver();
  installReadingSurfaceApi(api);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

const titles = (el: HTMLElement) => [...el.querySelectorAll('.yt-row-title')].map((n) => n.textContent);

describe('YouTube manager (audit r2)', () => {
  it('#22 opening the window does not re-sync when nothing is due, and News shows the last check', async () => {
    const el = await mount(makeStore());
    expect(api.ytRefreshAll).not.toHaveBeenCalled();
    expect(titles(el)).toEqual(['Video c']);
  });

  it('#16 a first check lists nothing as new, not the whole library', async () => {
    const el = await mount(makeStore({ lastNewsCheckedAt: undefined, lastNewsVideoIds: undefined }));
    expect(api.ytRefreshAll).toHaveBeenCalledTimes(1);
    expect(titles(el)).toEqual([]);
  });

  it('#18 the channel name keeps a typed space: saved on blur, not per keystroke', async () => {
    const el = await mount(makeStore());
    await act(async () => {
      (el.querySelector('.yt-pl-item:not(.yt-plan-item)') as HTMLElement).click();
    });
    const input = [...el.querySelectorAll<HTMLInputElement>('.yt-pref input')].find(
      (i) => i.placeholder === 'Channel name',
    )!;
    expect(input).toBeTruthy();
    for (const next of ['M', 'My', 'My ', 'My C']) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    expect(input.value).toBe('My C');
    expect(api.ytSetPlaylistPrefs).not.toHaveBeenCalled();
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(api.ytSetPlaylistPrefs).toHaveBeenCalledWith('p1', { channelTitle: 'My C' });
  });

  it('#17 shows the queue with per-item Cancel, and the window stays usable while it runs', async () => {
    const el = await mount(makeStore());
    await act(async () => {
      queueListener?.([
        { videoId: 'a', state: 'downloading', percent: 40 },
        { videoId: 'c', state: 'queued', percent: 0 },
      ]);
    });
    const rows = [...el.querySelectorAll('.yt-queue-row')];
    expect(rows.map((r) => r.getAttribute('data-state'))).toEqual(['downloading', 'queued']);
    expect(el.querySelector('.yt-queue-row')?.textContent).toContain('Downloading 40%');
    await act(async () => {
      (rows[0].querySelector('.yt-queue-cancel') as HTMLElement).click();
    });
    expect(api.ytCancelDownloads).toHaveBeenCalledWith(['a']);
    const refreshAll = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Check again'),
    );
    expect(refreshAll?.disabled).toBe(false);
  });

  it('#20/#21/#23 distinguishes auto captions, marks removed videos, and formats views for the locale', async () => {
    const el = await mount(makeStore());
    await act(async () => {
      (el.querySelector('.yt-pl-item:not(.yt-plan-item)') as HTMLElement).click();
    });
    expect(el.querySelector('.yt-chip.autosubs')?.textContent).toBe('Auto subs');
    expect(el.querySelector('.yt-chip.subs')).toBeNull();
    expect(el.querySelector('.yt-chip.removed')?.textContent).toBe('Removed from YouTube');
    expect(el.querySelector('.yt-row-meta')?.textContent).toContain('1.2K');
    const idInput = [...el.querySelectorAll<HTMLInputElement>('.yt-pref input')].find((i) =>
      i.placeholder.includes('UC'),
    );
    expect(idInput?.placeholder).toBe('Channel ID (starts with UC)');
  });
});
