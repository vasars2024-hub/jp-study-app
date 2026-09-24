/**
 * Seanime provider-extension adapter for Phase 4.
 *
 * This module is intentionally narrow: it reads installed online-stream
 * extensions and projects their episode sources onto Study OS's shared
 * StreamRow contract. It does not install extensions, mutate Seanime settings,
 * or fetch the media URL.
 */

import type {
  ExtensionRepo_AnimeTorrentProviderExtensionItem,
  ExtensionRepo_MangaProviderExtensionItem,
  ExtensionRepo_OnlinestreamProviderExtensionItem,
  Onlinestream_EpisodeListResponse,
  Onlinestream_EpisodeSource,
  Onlinestream_VideoSource,
} from '../../../vendor/seanime/generated/types';
import type {
  AcquisitionPlayback,
  AcquisitionProvider,
  AcquisitionProviderInventory,
} from '../../shared/acquisition';
import type { EpisodeRow, StreamRow } from '../../shared/scraperResults';
import type { ScraperSettings } from '../../shared/scraperSettings';
import { seanimeApi, SeanimeUnavailableError } from '../seanime/client';
import { resolveAniListId, type CatalogueWork } from './catalogue';
import { scraperLog } from './logBus';
import { orderStreamProviders } from '../../shared/scraperSourceOrder';

const PROVIDERS_ROUTE = '/api/v1/extensions/list/onlinestream-provider';
const TORRENT_PROVIDERS_ROUTE = '/api/v1/extensions/list/anime-torrent-provider';
const MANGA_PROVIDERS_ROUTE = '/api/v1/extensions/list/manga-provider';
const EPISODE_LIST_ROUTE = '/api/v1/onlinestream/episode-list';
const EPISODE_SOURCE_ROUTE = '/api/v1/onlinestream/episode-source';
const SOURCE_CONCURRENCY = 4;

export interface ResolveSeanimeStreamsInput {
  work: CatalogueWork;
  episodes: EpisodeRow[];
  settings: ScraperSettings;
  correlationId: string;
  /**
   * The Video Server Profiles preference order (lowercase ids, names and
   * provider labels). Absent or empty keeps the sidecar's own order.
   */
  providerOrder?: readonly string[];
}

export async function listSeanimeAcquisitionProviders(): Promise<AcquisitionProviderInventory> {
  try {
    const [streaming, torrents, manga] = await Promise.all([
      seanimeApi<ExtensionRepo_OnlinestreamProviderExtensionItem[]>(PROVIDERS_ROUTE),
      seanimeApi<ExtensionRepo_AnimeTorrentProviderExtensionItem[]>(TORRENT_PROVIDERS_ROUTE),
      seanimeApi<ExtensionRepo_MangaProviderExtensionItem[]>(MANGA_PROVIDERS_ROUTE),
    ]);
    const providers: AcquisitionProvider[] = [
      ...streaming.map((provider): AcquisitionProvider => ({
        id: provider.id,
        label: provider.name || provider.id,
        kind: 'online-stream',
        language: provider.lang,
        capabilities: ['search', 'episodes', 'streams'],
        supportsDub: provider.supportsDub,
        servers: [...(provider.episodeServers ?? [])],
      })),
      ...torrents.map((provider): AcquisitionProvider => ({
        id: provider.id,
        label: provider.name || provider.id,
        kind: 'torrent',
        language: provider.lang,
        capabilities: ['search', 'download'],
      })),
      ...manga.map((provider): AcquisitionProvider => ({
        id: provider.id,
        label: provider.name || provider.id,
        kind: 'manga-source',
        language: provider.lang,
        capabilities: ['search', 'episodes'],
      })),
    ];
    return {
      backend: 'seanime',
      state: 'ready',
      providers,
      message: providers.length
        ? `${providers.length} installed provider extension(s).`
        : 'Seanime is ready, but no provider extensions are installed.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      backend: 'seanime',
      state: error instanceof SeanimeUnavailableError
        ? /disabled/i.test(message) ? 'disabled' : 'offline'
        : 'error',
      providers: [],
      message,
    };
  }
}

function safePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'source';
}

function streamKind(source: Onlinestream_VideoSource): AcquisitionPlayback['kind'] {
  if (source.type === 'm3u8' || /\.m3u8(?:$|[?#])/i.test(source.url)) return 'hls';
  if (source.type === 'mp4' || /\.mp4(?:$|[?#])/i.test(source.url)) return 'mp4';
  return 'unknown';
}

function resolutionOf(source: Onlinestream_VideoSource): string {
  const match = /(\d{3,4})\s*p?/i.exec(`${source.quality} ${source.label ?? ''}`);
  return match ? `${match[1]}p` : source.quality || source.label || 'unknown';
}

function streamRow(
  provider: ExtensionRepo_OnlinestreamProviderExtensionItem,
  episode: EpisodeRow,
  source: Onlinestream_VideoSource,
  index: number,
  dubbed: boolean,
): StreamRow {
  const kind = streamKind(source);
  const providerLabel = provider.name || provider.id;
  const server = source.server || source.label || `source ${index + 1}`;
  const playback: AcquisitionPlayback = {
    providerId: provider.id,
    providerLabel,
    server,
    kind,
    url: source.url,
    headers: { ...(source.headers ?? {}) },
    subtitles: (source.subtitles ?? []).map((subtitle) => ({
      url: subtitle.url,
      language: subtitle.language,
      default: subtitle.isDefault,
    })),
    dubbed,
  };

  return {
    id: [
      'seanime',
      safePart(provider.id),
      safePart(episode.id),
      safePart(server),
      index,
    ].join('-'),
    episodeId: episode.id,
    sourceId: `seanime:${provider.id}`,
    sourceLabel: `${providerLabel} · ${server}`,
    resolution: resolutionOf(source),
    codec: 'unknown',
    container: kind === 'hls' ? 'hls' : kind === 'mp4' ? 'mp4' : 'unknown',
    bitrateKbps: 0,
    audioLanguages: dubbed ? ['dub'] : [provider.lang || 'ja'],
    subtitleLanguages: [
      ...new Set((source.subtitles ?? []).map((subtitle) => subtitle.language).filter(Boolean)),
    ],
    latencyMs: 0,
    health: 'unknown',
    expiresInSec: null,
    url: source.url,
    playback,
  };
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(values[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function episodeList(
  mediaId: number,
  provider: ExtensionRepo_OnlinestreamProviderExtensionItem,
  dubbed: boolean,
  timeoutMs: number,
): Promise<Onlinestream_EpisodeListResponse> {
  return seanimeApi<Onlinestream_EpisodeListResponse>(EPISODE_LIST_ROUTE, {
    method: 'POST',
    body: { mediaId, provider: provider.id, dubbed },
    timeoutMs,
  });
}

async function episodeSource(
  mediaId: number,
  provider: ExtensionRepo_OnlinestreamProviderExtensionItem,
  episodeNumber: number,
  dubbed: boolean,
  timeoutMs: number,
): Promise<Onlinestream_EpisodeSource> {
  return seanimeApi<Onlinestream_EpisodeSource>(EPISODE_SOURCE_ROUTE, {
    method: 'POST',
    body: {
      mediaId,
      provider: provider.id,
      episodeNumber,
      dubbed,
      refresh: false,
    },
    timeoutMs,
  });
}

export async function resolveSeanimeStreams(
  input: ResolveSeanimeStreamsInput,
): Promise<StreamRow[]> {
  const { work, episodes, settings, correlationId } = input;
  if (settings.sources.mode === 'torrent' || episodes.length === 0) return [];

  let providers: ExtensionRepo_OnlinestreamProviderExtensionItem[];
  try {
    providers = await seanimeApi<ExtensionRepo_OnlinestreamProviderExtensionItem[]>(
      PROVIDERS_ROUTE,
      { timeoutMs: settings.sources.perSourceTimeoutMs },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scraperLog(
      error instanceof SeanimeUnavailableError ? 'info' : 'warn',
      'seanime-sources',
      `Online-stream providers unavailable: ${message}`,
      { correlationId },
    );
    return [];
  }

  if (!providers.length) {
    scraperLog('info', 'seanime-sources', 'No Seanime online-stream extensions are installed.', {
      correlationId,
    });
    return [];
  }

  const mediaId = await resolveAniListId(work, correlationId);
  if (!mediaId) {
    scraperLog(
      'warn',
      'seanime-sources',
      'No AniList identity is available; online-stream resolution was skipped.',
      { correlationId },
    );
    return [];
  }

  const dubbed = settings.episodeProcessing.audioPreference === 'dubbed';
  const timeoutMs = settings.sources.perSourceTimeoutMs;
  const unresolved = new Map(episodes.map((episode) => [episode.number, episode]));
  const rows: StreamRow[] = [];

  // Preferred servers first: with `stopAfterFirstSuccess` on, whichever
  // provider answers first owns the episode, so order is the preference.
  const ordered = orderStreamProviders(providers, input.providerOrder);
  if (input.providerOrder?.length) {
    scraperLog('debug', 'seanime-sources', `Provider order: ${
      ordered.map((provider) => provider.name || provider.id).join(' → ')
    }.`, { correlationId });
  }

  for (const provider of ordered) {
    if (!unresolved.size) break;
    if (dubbed && !provider.supportsDub) continue;

    let available: Onlinestream_EpisodeListResponse;
    try {
      available = await episodeList(mediaId, provider, dubbed, timeoutMs);
    } catch (error) {
      scraperLog(
        'warn',
        'seanime-sources',
        `${provider.name || provider.id} episode lookup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { correlationId },
      );
      continue;
    }

    const availableNumbers = new Set(
      (available.episodes ?? []).map((episode) => episode.number),
    );
    const candidates = [...unresolved.values()].filter((episode) =>
      availableNumbers.has(episode.number));

    const resolved = await mapLimit(candidates, SOURCE_CONCURRENCY, async (episode) => {
      try {
        const source = await episodeSource(mediaId, provider, episode.number, dubbed, timeoutMs);
        const mapped = (source.videoSources ?? [])
          .filter((video) => Boolean(video.url))
          .filter((video) =>
            settings.sources.requireSubtitleAvailability
              ? (video.subtitles ?? []).length > 0
              : true)
          .map((video, index) => streamRow(provider, episode, video, index, dubbed));
        return { episode, rows: mapped };
      } catch (error) {
        scraperLog(
          'warn',
          'seanime-sources',
          `${provider.name || provider.id} episode ${episode.number} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { correlationId },
        );
        return { episode, rows: [] };
      }
    });

    for (const result of resolved) {
      if (!result.rows.length) continue;
      rows.push(...result.rows);
      if (settings.sources.stopAfterFirstSuccess) {
        unresolved.delete(result.episode.number);
      }
    }
  }

  scraperLog(
    rows.length ? 'info' : 'warn',
    'seanime-sources',
    rows.length
      ? `Resolved ${rows.length} playable stream(s) for ${
          new Set(rows.map((row) => row.episodeId)).size
        } episode(s) through Seanime extensions.`
      : 'Seanime extensions returned no playable streams.',
    { correlationId },
  );
  return rows;
}
