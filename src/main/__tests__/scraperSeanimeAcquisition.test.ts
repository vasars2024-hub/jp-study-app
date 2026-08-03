// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TorrentRow } from '../../shared/scraperResults';

const api = vi.hoisted(() => ({
  calls: [] as Array<{ route: string; method: string; body: unknown }>,
  handler: async (route: string, body: unknown): Promise<unknown> => {
    void route;
    void body;
    return undefined;
  },
}));

vi.mock('../seanime/client', () => ({
  SeanimeUnavailableError: class SeanimeUnavailableError extends Error {},
  seanimeApi: async (
    route: string,
    options?: { method?: string; body?: unknown },
  ): Promise<unknown> => {
    api.calls.push({
      route,
      method: options?.method ?? 'GET',
      body: options?.body,
    });
    return api.handler(route, options?.body);
  },
}));

vi.mock('../scraper/logBus', () => ({
  scraperLog: vi.fn(),
}));

import {
  getSeanimeAcquisitionSnapshot,
  runSeanimeAcquisitionAction,
} from '../scraper/seanimeAcquisition';

function torrent(id: string): TorrentRow {
  return {
    id,
    infoHash: `hash-${id}`,
    name: `Torrent ${id}`,
    releaseGroup: 'Fixture',
    resolution: '1080p',
    seeders: 10,
    leechers: 2,
    availability: 3,
    tracker: 'fixture',
    sizeBytes: 1_000,
    ageDays: 1,
    fileCount: 1,
    subtitleLanguages: ['en'],
    isBatch: false,
    magnet: `magnet:?xt=urn:btih:${id}`,
  };
}

beforeEach(() => {
  api.calls = [];
  api.handler = async (route) => {
    if (route === '/api/v1/status') {
      return {
        settings: {
          torrent: { defaultTorrentClient: 'qbittorrent', qbittorrentPassword: 'secret' },
          autoDownloader: {
            enabled: true,
            provider: 'torrent-extension',
            interval: 15,
            downloadAutomatically: false,
            useDebrid: true,
          },
        },
        debridSettings: {
          enabled: true,
          provider: 'real-debrid',
          apiKey: 'must-not-cross-ipc',
        },
      };
    }
    if (route === '/api/v1/torrent-client/list') {
      return [{
        name: 'Active torrent',
        hash: 'active-hash',
        seeds: 4,
        peers: 2,
        progress: 42,
        size: '1 GB',
        eta: '5m',
        status: 'downloading',
        downSpeed: '2 MB/s',
        upSpeed: '10 KB/s',
      }];
    }
    if (route === '/api/v1/debrid/torrents') {
      return [{
        id: 'debrid-1',
        name: 'Cached torrent',
        status: 'completed',
        completionPercentage: 100,
        formattedSize: '1 GB',
        eta: '0s',
        isReady: true,
      }];
    }
    if (route === '/api/v1/auto-downloader/rules') {
      return [{
        dbId: 7,
        mediaId: 154587,
        enabled: true,
        episodeType: 'recent',
        episodeNumbers: [],
      }];
    }
    if (route === '/api/v1/auto-downloader/items') {
      return [{
        id: 8,
        ruleId: 7,
        mediaId: 154587,
        episode: 3,
        torrentName: 'Queued torrent',
        magnet: 'magnet:?secret',
        link: 'https://secret.example/torrent',
        downloaded: false,
        isDelayed: false,
        score: 12,
      }];
    }
    throw new Error(`Unexpected route ${route}`);
  };
});

describe('Seanime acquisition engine adapter', () => {
  it('returns one secret-free snapshot for torrent, debrid and auto-downloader engines', async () => {
    const snapshot = await getSeanimeAcquisitionSnapshot();

    expect(snapshot).toMatchObject({
      state: 'ready',
      torrentClient: {
        state: 'ready',
        client: 'qbittorrent',
        transfers: [{ id: 'active-hash', progress: 42 }],
      },
      debrid: {
        state: 'ready',
        provider: 'real-debrid',
        items: [{ id: 'debrid-1', ready: true }],
      },
      autoDownloader: {
        state: 'ready',
        provider: 'torrent-extension',
        rules: [{ id: 7, mediaId: 154587 }],
        queue: [{ id: 8, episode: 3, torrentName: 'Queued torrent' }],
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain('must-not-cross-ipc');
    expect(JSON.stringify(snapshot)).not.toContain('magnet:?secret');
    expect(JSON.stringify(snapshot)).not.toContain('secret.example');
  });

  it('sends only explicitly selected torrent rows to the requested Seanime engine', async () => {
    api.handler = async (route, body) => {
      if (route === '/api/v1/torrent-client/download') {
        expect(body).toMatchObject({
          destination: 'D:\\Anime',
          torrents: [{ name: 'Torrent b', magnetLink: 'magnet:?xt=urn:btih:b' }],
          smartSelect: { enabled: false, missingEpisodeNumbers: [] },
        });
        return true;
      }
      throw new Error(`Unexpected route ${route}`);
    };

    const result = await runSeanimeAcquisitionAction({
      kind: 'send-torrents',
      target: 'torrent-client',
      torrentIds: ['b'],
      destination: 'D:\\Anime',
      torrents: [torrent('a'), torrent('b')],
    });

    expect(result).toMatchObject({ ok: true, accepted: 1 });
  });

  it('refetches a queued magnet in main before sending it to the torrent client', async () => {
    api.handler = async (route, body) => {
      if (route === '/api/v1/auto-downloader/items') {
        return [{
          id: 8,
          ruleId: 7,
          mediaId: 154587,
          episode: 3,
          torrentName: 'Queued torrent',
          magnet: 'magnet:?private',
          downloaded: false,
          isDelayed: false,
          score: 12,
        }];
      }
      if (route === '/api/v1/torrent-client/rule-magnet') {
        expect(body).toEqual({
          magnetUrl: 'magnet:?private',
          ruleId: 7,
          queuedItemId: 8,
        });
        return true;
      }
      throw new Error(`Unexpected route ${route}`);
    };

    const result = await runSeanimeAcquisitionAction({
      kind: 'download-queued-item',
      itemId: 8,
    });
    expect(result).toMatchObject({ ok: true, accepted: 1 });
  });

  it('strips links and hashes from auto-downloader simulation results', async () => {
    api.handler = async (route) => {
      if (route === '/api/v1/status') {
        return { settings: { autoDownloader: { enabled: true } } };
      }
      if (route === '/api/v1/auto-downloader/run/simulation') {
        return [{
          ruleId: 7,
          mediaId: 154587,
          episode: 4,
          link: 'https://private.example/torrent',
          hash: 'private-hash',
          torrentName: 'Candidate',
          score: 21,
          extensionId: 'provider-a',
          isDelayed: false,
        }];
      }
      throw new Error(`Unexpected route ${route}`);
    };

    const result = await runSeanimeAcquisitionAction({
      kind: 'simulate-auto-downloader',
      ruleIds: [7],
    });
    expect(result.simulation).toEqual([{
      ruleId: 7,
      mediaId: 154587,
      episode: 4,
      torrentName: 'Candidate',
      score: 21,
      providerId: 'provider-a',
      delayed: false,
    }]);
    expect(JSON.stringify(result)).not.toContain('private.example');
    expect(JSON.stringify(result)).not.toContain('private-hash');
  });
});
