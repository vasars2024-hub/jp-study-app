// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultScraperSettingsDocument,
  resolveScraperSettings,
} from '../../shared/scraperSettings';
import type { EpisodeRow } from '../../shared/scraperResults';
import type { CatalogueWork } from '../scraper/catalogue';

const api = vi.hoisted(() => ({
  calls: [] as { route: string; body: unknown }[],
  handler: async (route: string, body: unknown): Promise<unknown> => {
    void route;
    void body;
    return undefined;
  },
}));

vi.mock('../seanime/client', () => ({
  SeanimeUnavailableError: class SeanimeUnavailableError extends Error {},
  seanimeApi: async (route: string, options?: { body?: unknown }) => {
    api.calls.push({ route, body: options?.body });
    return api.handler(route, options?.body);
  },
}));

import {
  listSeanimeAcquisitionProviders,
  resolveSeanimeStreams,
} from '../scraper/seanimeSources';

function work(): CatalogueWork {
  return {
    provider: 'anilist',
    id: 154587,
    titleEn: 'Fixture Anime',
    titleJa: 'フィクスチャ',
    titleRomaji: 'Fixture Anime',
    synopsis: '',
    genres: [],
    studios: [],
    format: 'TV',
    status: '',
    season: '',
    episodeCount: 2,
    averageDurationSec: 1_440,
    contentRating: '',
    communityRating: 0,
    malId: null,
    aniListId: 154587,
    officialSite: '',
    posterUrl: '',
    posterVariants: {},
    bannerUrl: '',
    year: 2026,
  };
}

function episode(number: number): EpisodeRow {
  return {
    id: `anilist-154587-e${number}`,
    seriesId: 'anilist-154587',
    number,
    numberLabel: `EP ${number}`,
    season: 1,
    titleEn: `Episode ${number}`,
    titleJa: '',
    kind: 'episode',
    audio: 'sub',
    resolution: '1080p',
    sourceId: 'catalogue',
    sourceLabel: 'AniList',
    sizeBytes: 0,
    durationSec: 1_440,
    airDate: null,
    url: '',
    thumbnailUrl: '',
    subtitles: [],
    status: 'pending',
    statusNote: '',
  };
}

beforeEach(() => {
  api.calls = [];
  api.handler = async (route, body) => {
    if (route.endsWith('/list/onlinestream-provider')) {
      return [{
        id: 'provider-a',
        name: 'Provider A',
        lang: 'ja',
        episodeServers: ['main'],
        supportsDub: true,
      }];
    }
    if (route.endsWith('/episode-list')) {
      expect(body).toMatchObject({ mediaId: 154587, provider: 'provider-a', dubbed: false });
      return { episodes: [{ number: 1 }, { number: 2 }] };
    }
    if (route.endsWith('/episode-source')) {
      const number = (body as { episodeNumber: number }).episodeNumber;
      return {
        number,
        videoSources: [{
          server: 'main',
          url: `https://stream.test/${number}/master.m3u8`,
          quality: '1080',
          type: 'm3u8',
          headers: { Referer: 'https://provider.test/' },
          subtitles: [{ url: 'https://subs.test/en.vtt', language: 'en', isDefault: true }],
        }],
      };
    }
    throw new Error(`Unexpected route ${route}`);
  };
});

describe('Seanime online-stream acquisition adapter', () => {
  it('reports streaming, torrent and manga extensions through one inventory', async () => {
    api.handler = async (route) => {
      if (route.endsWith('/onlinestream-provider')) {
        return [{
          id: 'stream-a',
          name: 'Stream A',
          lang: 'ja',
          supportsDub: true,
          episodeServers: ['main', 'backup'],
        }];
      }
      if (route.endsWith('/anime-torrent-provider')) {
        return [{ id: 'torrent-a', name: 'Torrent A', lang: 'en' }];
      }
      if (route.endsWith('/manga-provider')) {
        return [{ id: 'manga-a', name: 'Manga A', lang: 'ja' }];
      }
      throw new Error(`Unexpected route ${route}`);
    };

    const inventory = await listSeanimeAcquisitionProviders();
    expect(inventory.state).toBe('ready');
    expect(inventory.providers).toEqual([
      expect.objectContaining({
        id: 'stream-a',
        kind: 'online-stream',
        capabilities: ['search', 'episodes', 'streams'],
        supportsDub: true,
        servers: ['main', 'backup'],
      }),
      expect.objectContaining({
        id: 'torrent-a',
        kind: 'torrent',
        capabilities: ['search', 'download'],
      }),
      expect.objectContaining({
        id: 'manga-a',
        kind: 'manga-source',
        capabilities: ['search', 'episodes'],
      }),
    ]);
  });

  it('maps extension sources onto playable shared rows without dropping headers', async () => {
    const settings = resolveScraperSettings(createDefaultScraperSettingsDocument());
    settings.sources.mode = 'streaming';
    const rows = await resolveSeanimeStreams({
      work: work(),
      episodes: [episode(1), episode(2)],
      settings,
      correlationId: 'job-test',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      episodeId: 'anilist-154587-e1',
      sourceId: 'seanime:provider-a',
      resolution: '1080p',
      container: 'hls',
      subtitleLanguages: ['en'],
      playback: {
        providerId: 'provider-a',
        kind: 'hls',
        headers: { Referer: 'https://provider.test/' },
      },
    });
  });

  it('does not consult streaming providers in torrent-only mode', async () => {
    const settings = resolveScraperSettings(createDefaultScraperSettingsDocument());
    settings.sources.mode = 'torrent';
    const rows = await resolveSeanimeStreams({
      work: work(),
      episodes: [episode(1)],
      settings,
      correlationId: 'job-test',
    });
    expect(rows).toEqual([]);
    expect(api.calls).toEqual([]);
  });

  it('uses the next provider for episodes the first provider cannot resolve', async () => {
    api.handler = async (route, body) => {
      if (route.endsWith('/list/onlinestream-provider')) {
        return [
          { id: 'first', name: 'First', lang: 'ja', supportsDub: false },
          { id: 'fallback', name: 'Fallback', lang: 'ja', supportsDub: false },
        ];
      }
      const provider = (body as { provider: string }).provider;
      if (route.endsWith('/episode-list')) {
        return { episodes: provider === 'first' ? [{ number: 1 }] : [{ number: 2 }] };
      }
      const episodeNumber = (body as { episodeNumber: number }).episodeNumber;
      return {
        number: episodeNumber,
        videoSources: [{
          server: 'main',
          url: `https://${provider}.test/${episodeNumber}.mp4`,
          quality: '720p',
          type: 'mp4',
        }],
      };
    };

    const settings = resolveScraperSettings(createDefaultScraperSettingsDocument());
    settings.sources.mode = 'both';
    settings.sources.stopAfterFirstSuccess = true;
    const rows = await resolveSeanimeStreams({
      work: work(),
      episodes: [episode(1), episode(2)],
      settings,
      correlationId: 'job-test',
    });

    expect(rows.map((row) => [row.episodeId, row.playback?.providerId])).toEqual([
      ['anilist-154587-e1', 'first'],
      ['anilist-154587-e2', 'fallback'],
    ]);
  });

  it('honours the profile requirement for subtitle-bearing streams', async () => {
    api.handler = async (route, body) => {
      if (route.endsWith('/list/onlinestream-provider')) {
        return [{ id: 'provider-a', name: 'Provider A', lang: 'ja', supportsDub: false }];
      }
      if (route.endsWith('/episode-list')) return { episodes: [{ number: 1 }] };
      return {
        number: (body as { episodeNumber: number }).episodeNumber,
        videoSources: [
          {
            server: 'raw',
            url: 'https://stream.test/raw.mp4',
            quality: '1080p',
            type: 'mp4',
          },
          {
            server: 'subbed',
            url: 'https://stream.test/subbed.m3u8',
            quality: '720p',
            type: 'm3u8',
            subtitles: [{ url: 'https://subs.test/ja.vtt', language: 'ja', isDefault: true }],
          },
        ],
      };
    };

    const settings = resolveScraperSettings(createDefaultScraperSettingsDocument());
    settings.sources.requireSubtitleAvailability = true;
    const rows = await resolveSeanimeStreams({
      work: work(),
      episodes: [episode(1)],
      settings,
      correlationId: 'job-test',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].sourceLabel).toContain('subbed');
  });
});
