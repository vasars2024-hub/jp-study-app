// @vitest-environment jsdom
/**
 * YouTube study, on the real playlist view: a downloaded video opens straight into
 * the study player (one step, resuming), and its row says where the learner stopped.
 *
 * Before: Open parked a session handoff and opened the Video tab, which read it only
 * on mount and then showed a card with a second "Open in workspace" button — so the
 * player with auto-pause, line loop and one-key mining was two clicks away, or
 * unreachable from an already-open Media Center.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';
import type { YtPlaylistsStore } from '../../shared/ytPlaylists';
import { VIDEO_CORE_RESUME_STORAGE_KEY, videoCoreResumeKey } from '../../shared/videoCoreStudy';

vi.mock('../mediaCenterIntent', () => ({ requestMediaCenterPlay: vi.fn() }));
import { requestMediaCenterPlay } from '../mediaCenterIntent';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PATH = 'C:\\yt\\Video a [dQw4w9WgXcQ].mp4';
const ITEM = { id: 'm-a', path: PATH, title: 'Video a', kind: 'video', positionSec: 0, durationSec: 600 };

function store(): YtPlaylistsStore {
  return {
    version: 1,
    folders: [],
    channels: [],
    playlists: [{
      id: 'p1', title: 'Listening', url: 'https://www.youtube.com/playlist?list=PL1', youtubePlaylistId: 'PL1',
      subscriptionStatus: 'subscribed', lang: 'ja', preferSubs: ['ja'], autoUpdate: true,
      lastSyncedAt: Date.now(), lastCheckedAt: Date.now(), updateFrequencyHours: 24, sortDefault: 'playlist', createdAt: 1,
    }],
    videos: [{
      id: 'a', playlistId: 'p1', youtubeId: 'dQw4w9WgXcQ', title: 'Video a', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      downloaded: true, mediaItemId: 'm-a', hasOfficialSubs: true, transcribed: false, firstSeenAt: 1, durationSec: 600,
    }],
    lastNewsCheckedAt: Date.now(),
    lastNewsVideoIds: [],
    planToWatchIds: [],
  } as unknown as YtPlaylistsStore;
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;
const api = {
  ytList: vi.fn(async () => store()),
  listMedia: vi.fn(async () => [ITEM]),
  ytDownloadQueue: vi.fn(async () => []),
  onYtQueueChanged: vi.fn(() => () => undefined),
  onYtChanged: vi.fn(() => () => undefined),
  onYtRefreshProgress: vi.fn(() => () => undefined),
  onYtDownloadProgress: vi.fn(() => () => undefined),
};

async function mount(): Promise<HTMLDivElement> {
  const { default: View } = await import('../views/YouTubePlaylistsView');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<View />));
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
  await act(async () => (host?.querySelector('.yt-pl-item:not(.yt-plan-item)') as HTMLElement).click());
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
  return host;
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(requestMediaCenterPlay).mockClear();
  installResizeObserver();
  installReadingSurfaceApi(api);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe('YouTube study open', () => {
  it('Open plays the library item in the study player in one step', async () => {
    const el = await mount();
    const row = el.querySelector('.yt-row') as HTMLElement;
    expect(row).not.toBeNull();
    await act(async () => row.click());
    for (let i = 0; i < 3; i += 1) await act(async () => { await Promise.resolve(); });
    expect(requestMediaCenterPlay).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestMediaCenterPlay).mock.calls[0][0]).toMatchObject({ id: 'm-a', path: PATH });
  });

  it('a half-watched video shows where it will resume', async () => {
    localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify([
      { key: videoCoreResumeKey({ localFilePath: PATH }), positionSec: 125, updatedAt: 1 },
    ]));
    const el = await mount();
    const chip = el.querySelector('.yt-chip.resume');
    expect(chip?.textContent).toContain('2:05');
  });

  it('a finished video reads Watched', async () => {
    api.listMedia.mockResolvedValueOnce([{ ...ITEM, positionSec: 598 }]);
    const el = await mount();
    expect(el.querySelector('.yt-chip.watched')).not.toBeNull();
    expect(el.querySelector('.yt-chip.resume')).toBeNull();
  });
});
