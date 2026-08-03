import { describe, expect, it } from 'vitest';
import {
  addPlanToWatchIds,
  diffNewVideos,
  emptyYtStore,
  filterUnlogged,
  isVideoUnlogged,
  mergePlaylistVideos,
  normalizeYtStore,
  parseYoutubePlaylistId,
  pickSurpriseVideo,
  planToWatchVideos,
  removePlanToWatchIds,
  sortYtVideos,
  type YtPlaylist,
  type YtVideo,
} from '../ytPlaylists';

function vid(partial: Partial<YtVideo> & Pick<YtVideo, 'id' | 'youtubeId' | 'title'>): YtVideo {
  return {
    playlistId: 'pl1',
    url: `https://www.youtube.com/watch?v=${partial.youtubeId}`,
    downloaded: false,
    hasOfficialSubs: null,
    transcribed: false,
    position: 0,
    ...partial,
  };
}

describe('ytPlaylists helpers', () => {
  it('parses playlist id from common URL shapes', () => {
    expect(parseYoutubePlaylistId('https://www.youtube.com/playlist?list=PLabc123')).toBe('PLabc123');
    expect(
      parseYoutubePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz&index=2'),
    ).toBe('PLxyz');
    expect(parseYoutubePlaylistId('not a url')).toBeNull();
    expect(parseYoutubePlaylistId('')).toBeNull();
  });

  it('merge refresh preserves local status flags', () => {
    const existing = [
      vid({
        id: 'ytv-pl1-aaa',
        youtubeId: 'aaa',
        title: 'Old title',
        downloaded: true,
        mediaItemId: 'm1',
        transcribed: true,
        hasOfficialSubs: true,
        loggedAt: 100,
        position: 0,
      }),
      vid({
        id: 'ytv-pl1-bbb',
        youtubeId: 'bbb',
        title: 'Gone later',
        downloaded: false,
        position: 1,
      }),
    ];
    const merged = mergePlaylistVideos('pl1', existing, [
      {
        youtubeId: 'aaa',
        title: 'New title',
        viewCount: 99,
        position: 0,
      },
      {
        youtubeId: 'ccc',
        title: 'Brand new',
        position: 1,
      },
    ]);
    const aaa = merged.find((v) => v.youtubeId === 'aaa');
    if (!aaa) throw new Error('missing aaa');
    expect(aaa.title).toBe('New title');
    expect(aaa.downloaded).toBe(true);
    expect(aaa.mediaItemId).toBe('m1');
    expect(aaa.transcribed).toBe(true);
    expect(aaa.hasOfficialSubs).toBe(true);
    expect(aaa.loggedAt).toBe(100);
    expect(aaa.viewCount).toBe(99);
    expect(merged.find((v) => v.youtubeId === 'bbb')).toBeUndefined();
    const ccc = merged.find((v) => v.youtubeId === 'ccc');
    if (!ccc) throw new Error('missing ccc');
    expect(ccc.downloaded).toBe(false);
    expect(typeof ccc.firstSeenAt).toBe('number');
    expect(aaa.firstSeenAt).toBeUndefined();
  });

  it('diffNewVideos returns videos first seen after checkpoint', () => {
    const pl: YtPlaylist = {
      id: 'pl1',
      title: 'P',
      url: 'https://www.youtube.com/playlist?list=PLx',
      channelTitle: 'Channel',
      youtubePlaylistId: 'PLx',
      subscriptionStatus: 'subscribed',
      lang: 'ja',
      preferSubs: ['ja'],
      autoUpdate: true,
      updateFrequencyHours: 12,
      sortDefault: 'playlist',
      createdAt: 1,
    };
    const store = {
      ...emptyYtStore(),
      playlists: [pl],
      videos: [
        vid({ id: '1', youtubeId: 'a', title: 'A', firstSeenAt: 100 }),
        vid({ id: '2', youtubeId: 'b', title: 'B', firstSeenAt: 200 }),
        vid({ id: '3', youtubeId: 'c', title: 'C' }),
      ],
      lastNewsCheckedAt: 150,
    };
    expect(diffNewVideos(store, 150).map((v) => v.id)).toEqual(['2']);
  });

  it('plan to watch add/remove ignores unknown ids', () => {
    const base = {
      ...emptyYtStore(),
      videos: [vid({ id: 'ytv-1', youtubeId: 'a', title: 'A' })],
    };
    const added = addPlanToWatchIds(base, ['ytv-1', 'missing', 'ytv-1']);
    expect(added.planToWatchIds).toEqual(['ytv-1']);
    expect(removePlanToWatchIds(added, ['ytv-1']).planToWatchIds).toEqual([]);
  });

  it('normalizeYtStore fills missing planToWatchIds and preferSubs for old stores', () => {
    const normalized = normalizeYtStore({
      version: 1,
      playlists: [
        {
          id: 'pl1',
          title: 'Old',
          url: 'https://www.youtube.com/playlist?list=PLx',
          channelTitle: 'Channel',
          youtubePlaylistId: 'PLx',
          lang: 'ja',
          autoUpdate: true,
          sortDefault: 'playlist',
          createdAt: 1,
        },
      ],
      videos: [vid({ id: 'ytv-1', youtubeId: 'a', title: 'A' })],
      folders: [{ id: 'f1', name: 'Folder' }],
    });
    expect(normalized.planToWatchIds).toEqual([]);
    expect(normalized.folders).toHaveLength(1);
    expect(normalized.playlists[0]?.preferSubs).toEqual(['ja']);
    expect(normalized.playlists[0]?.subscriptionStatus).toBe('subscribed');
    expect(normalized.playlists[0]?.updateFrequencyHours).toBe(12);
    expect(planToWatchVideos(normalized)).toEqual([]);
  });

  it('normalizeYtStore derives tracked channels from playlist metadata', () => {
    const normalized = normalizeYtStore({
      version: 1,
      playlists: [
        {
          id: 'pl1',
          title: 'Tracked',
          url: 'https://www.youtube.com/playlist?list=PLx',
          channelId: 'UC123',
          channelTitle: 'Tracked channel',
          channelIconUrl: 'https://example.test/icon.png',
          youtubePlaylistId: 'PLx',
          subscriptionStatus: 'watching',
          lang: 'ja',
          preferSubs: ['ja'],
          autoUpdate: true,
          lastCheckedAt: 10,
          updateFrequencyHours: 18,
          sortDefault: 'playlist',
          createdAt: 1,
        },
      ],
      videos: [vid({ id: 'ytv-1', youtubeId: 'a', title: 'A' })],
    });
    expect(normalized.channels).toHaveLength(1);
    expect(normalized.channels[0]).toMatchObject({
      channelId: 'UC123',
      title: 'Tracked channel',
      iconUrl: 'https://example.test/icon.png',
      subscriptionStatus: 'watching',
      lastCheckedAt: 10,
      updateFrequencyHours: 18,
      playlistIds: ['pl1'],
      videoCount: 1,
    });
  });

  it('preserves connector metadata and defaults cadence fields when normalizing', () => {
    const normalized = normalizeYtStore({
      version: 1,
      playlists: [
        {
          id: 'pl2',
          title: 'Tracked channel',
          url: 'https://www.youtube.com/playlist?list=PLtracked',
          youtubePlaylistId: 'PLtracked',
          channelId: 'UC123',
          channelTitle: 'Tracked channel',
          channelIconUrl: 'https://example.test/icon.png',
          subscriptionStatus: 'watching',
          lang: 'en',
          preferSubs: ['en'],
          autoUpdate: true,
          lastCheckedAt: 1,
          updateFrequencyHours: 24,
          sortDefault: 'date',
          createdAt: 1,
        },
      ],
      videos: [],
    });
    expect(normalized.playlists[0]).toMatchObject({
      channelId: 'UC123',
      channelTitle: 'Tracked channel',
      channelIconUrl: 'https://example.test/icon.png',
      subscriptionStatus: 'watching',
      lastCheckedAt: 1,
      updateFrequencyHours: 24,
    });
  });

  it('preserves explicit channel records while syncing playlist metadata into them', () => {
    const normalized = normalizeYtStore({
      version: 1,
      channels: [
        {
          id: 'ytc-UC123',
          channelId: 'UC123',
          title: 'Local title',
          subscriptionStatus: 'custom',
          updateFrequencyHours: 8,
          playlistIds: ['pl1'],
          videoCount: 0,
          createdAt: 1,
        },
      ],
      playlists: [
        {
          id: 'pl1',
          title: 'Tracked',
          url: 'https://www.youtube.com/playlist?list=PLx',
          channelId: 'UC123',
          channelTitle: 'Remote title',
          youtubePlaylistId: 'PLx',
          subscriptionStatus: 'subscribed',
          lang: 'ja',
          preferSubs: ['ja'],
          autoUpdate: true,
          sortDefault: 'playlist',
          createdAt: 1,
        },
      ],
      videos: [],
    });
    expect(normalized.channels[0]).toMatchObject({
      title: 'Remote title',
      subscriptionStatus: 'subscribed',
      playlistIds: ['pl1'],
    });
  });

  it('plan helpers tolerate undefined planToWatchIds on legacy objects', () => {
    const legacy = {
      ...emptyYtStore(),
      videos: [vid({ id: 'ytv-1', youtubeId: 'a', title: 'A' })],
      planToWatchIds: undefined as unknown as string[],
    };
    expect(planToWatchVideos(legacy)).toEqual([]);
    expect(addPlanToWatchIds(legacy, ['ytv-1']).planToWatchIds).toEqual(['ytv-1']);
    expect(removePlanToWatchIds(legacy, ['ytv-1']).planToWatchIds).toEqual([]);
  });

  it('pickSurpriseVideo prefers plan-to-watch then unlogged', () => {
    const pl: YtPlaylist = {
      id: 'pl1',
      title: 'P',
      url: 'https://www.youtube.com/playlist?list=PLx',
      channelTitle: 'Channel',
      youtubePlaylistId: 'PLx',
      subscriptionStatus: 'subscribed',
      lang: 'ja',
      preferSubs: ['ja'],
      autoUpdate: true,
      updateFrequencyHours: 12,
      sortDefault: 'playlist',
      createdAt: 1,
    };
    const store = {
      ...emptyYtStore(),
      playlists: [pl],
      videos: [
        vid({ id: '1', youtubeId: 'a', title: 'A', downloaded: true }),
        vid({ id: '2', youtubeId: 'b', title: 'B', downloaded: false }),
      ],
      planToWatchIds: ['1'],
    };
    expect(pickSurpriseVideo(store, () => 0)?.id).toBe('1');
    const noPlan = { ...store, planToWatchIds: [] };
    expect(pickSurpriseVideo(noPlan, () => 0)?.id).toBe('2');
  });

  it('unlogged filter keeps only not downloaded and not transcribed', () => {
    const list = [
      vid({ id: '1', youtubeId: 'a', title: 'A', downloaded: false, transcribed: false }),
      vid({ id: '2', youtubeId: 'b', title: 'B', downloaded: true, transcribed: false }),
      vid({ id: '3', youtubeId: 'c', title: 'C', downloaded: false, transcribed: true }),
    ];
    expect(filterUnlogged(list, true).map((v) => v.id)).toEqual(['1']);
    expect(isVideoUnlogged(list[0])).toBe(true);
    expect(isVideoUnlogged(list[1])).toBe(false);
  });

  it('sorts by views descending', () => {
    const list = [
      vid({ id: '1', youtubeId: 'a', title: 'A', viewCount: 10, position: 0 }),
      vid({ id: '2', youtubeId: 'b', title: 'B', viewCount: 50, position: 1 }),
      vid({ id: '3', youtubeId: 'c', title: 'C', viewCount: 20, position: 2 }),
    ];
    expect(sortYtVideos(list, 'views').map((v) => v.id)).toEqual(['2', '3', '1']);
  });
});
