import { describe, expect, it } from 'vitest';
import {
  emptyYtStore,
  formatYtViews,
  mergePlaylistVideos,
  newsIdsAfterCheck,
  ytNewsIsStale,
  type YtPlaylist,
  type YtPlaylistsStore,
  type YtVideo,
} from '../ytPlaylists';
import { partialDownloadFiles, subtitleIsAutoCaption } from '../youtubeDownloadFiles';

function playlist(over: Partial<YtPlaylist> = {}): YtPlaylist {
  return {
    id: 'p1',
    title: 'P',
    url: 'https://www.youtube.com/playlist?list=PL1',
    youtubePlaylistId: 'PL1',
    subscriptionStatus: 'subscribed',
    lang: 'ja',
    preferSubs: ['ja'],
    autoUpdate: true,
    lastSyncedAt: 0,
    lastCheckedAt: 0,
    updateFrequencyHours: 24,
    sortDefault: 'playlist',
    createdAt: 0,
    ...over,
  } as YtPlaylist;
}

function video(youtubeId: string, over: Partial<YtVideo> = {}): YtVideo {
  return {
    id: `ytv-p1-${youtubeId}`,
    playlistId: 'p1',
    youtubeId,
    title: youtubeId,
    url: `https://www.youtube.com/watch?v=${youtubeId}`,
    downloaded: false,
    hasOfficialSubs: null,
    transcribed: false,
    ...over,
  };
}

describe('r2 #16 — News does not list the whole library', () => {
  it('reports nothing on the first check, and only what arrived after on later ones', () => {
    const store: YtPlaylistsStore = {
      ...emptyYtStore(),
      playlists: [playlist()],
      videos: [video('a', { firstSeenAt: 100 }), video('b', { firstSeenAt: 500 })],
    };
    expect(newsIdsAfterCheck(store, undefined)).toEqual([]);
    expect(newsIdsAfterCheck(store, 0)).toEqual([]);
    expect(newsIdsAfterCheck(store, 200)).toEqual(['ytv-p1-b']);
  });
});

describe('r2 #21 — a video removed from YouTube is kept and marked', () => {
  it('marks it, keeps its local file, and clears the mark if it comes back', () => {
    const existing = [video('a', { downloaded: true, mediaItemId: 'm1' }), video('b')];
    const once = mergePlaylistVideos('p1', existing, [{ youtubeId: 'b', title: 'B' }], 1);
    const gone = once.find((v) => v.youtubeId === 'a');
    expect(gone).toMatchObject({ removedFromYouTube: true, downloaded: true, mediaItemId: 'm1' });
    const back = mergePlaylistVideos('p1', once, [{ youtubeId: 'a', title: 'A' }, { youtubeId: 'b', title: 'B' }], 2);
    expect(back.find((v) => v.youtubeId === 'a')?.removedFromYouTube).toBeUndefined();
    expect(back).toHaveLength(2);
  });
});

describe('r2 #22 — opening the window syncs only when due', () => {
  it('is stale when never checked or when an auto-updated playlist is due', () => {
    const now = 100 * 60 * 60 * 1000;
    const fresh: YtPlaylistsStore = {
      ...emptyYtStore(),
      lastNewsCheckedAt: now - 1000,
      playlists: [playlist({ lastCheckedAt: now - 60 * 60 * 1000 })],
    };
    expect(ytNewsIsStale(fresh, now)).toBe(false);
    expect(ytNewsIsStale({ ...fresh, lastNewsCheckedAt: undefined }, now)).toBe(true);
    expect(
      ytNewsIsStale({ ...fresh, playlists: [playlist({ lastCheckedAt: now - 25 * 60 * 60 * 1000 })] }, now),
    ).toBe(true);
    expect(ytNewsIsStale(emptyYtStore(), now)).toBe(false);
  });
});

describe('r2 #23 — view counts in the UI locale', () => {
  it('uses the locale compact form, not a hard-coded K/M', () => {
    expect(formatYtViews(1234, 'en-US')).toBe('1.2K');
    expect(formatYtViews(1_500_000, 'en-US')).toBe('1.5M');
    expect(formatYtViews(12_000, 'ja-JP')).toBe('1.2万');
    expect(formatYtViews(undefined, 'en-US')).toBe('—');
  });
});

describe('r2 #17/#20 — download file helpers', () => {
  it('tells a creator subtitle from an auto caption by the creator track list', () => {
    expect(subtitleIsAutoCaption('Title [abcdefghijk].ja.vtt', ['ja', 'en'])).toBe(false);
    expect(subtitleIsAutoCaption('Title [abcdefghijk].ja.vtt', ['en'])).toBe(true);
    expect(subtitleIsAutoCaption('Title [abcdefghijk].zh-Hans.vtt', ['zh-Hans'])).toBe(false);
  });

  it('finds only the cancelled video\u2019s partial files', () => {
    const names = [
      'A [abcdefghijk].mp4.part',
      'A [abcdefghijk].f137.mp4',
      'A [abcdefghijk].f140.m4a.part',
      'A [abcdefghijk].mp4',
      'A [abcdefghijk].ja.vtt',
      'B [zzzzzzzzzzz].mp4.part',
    ];
    expect(partialDownloadFiles(names, 'abcdefghijk')).toEqual([
      'A [abcdefghijk].mp4.part',
      'A [abcdefghijk].f137.mp4',
      'A [abcdefghijk].f140.m4a.part',
    ]);
  });
});
