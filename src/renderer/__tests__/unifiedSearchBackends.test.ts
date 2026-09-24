// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_UNIFIED_SEARCH_PROVIDERS,
  createCatalogueExecutor,
  createTorrentIndexExecutor,
  mergeUnifiedSearchResults,
} from '../unifiedSearchBackends';
import { createRendererUnifiedSearchSession } from '../unifiedSearchController';
import { DEFAULT_SCRAPER_SETTINGS } from '../../shared/scraperSettings';
import type { DiscoveryFeedResult } from '../../shared/mediaDiscovery';
import type { TorrentRow } from '../../shared/scraperResults';
import type { ScraperSourceEntry } from '../../shared/scraperSourceSettings';
import type { UnifiedSearchQueryPlanStep, UnifiedSearchResult } from '../../shared/unifiedSearch';

const step = (providerId: string): UnifiedSearchQueryPlanStep => ({
  providerId, providerName: providerId, providerKind: 'metadata', priority: 0, groupIds: [],
});

const signal = () => new AbortController().signal;

const CATALOGUE: DiscoveryFeedResult = {
  candidates: [
    { provider: 'jikan', id: 52991, title: 'Frieren: Beyond Journey’s End', nativeTitle: '葬送のフリーレン', genres: ['Fantasy'], episodeCount: 28, year: 2023 },
  ],
  provenance: { servedBy: 'jikan', failures: [], fetchedAt: 0 },
};

const ROW: TorrentRow = {
  id: 'r', infoHash: 'abcd', name: '[SubsPlease] Sousou no Frieren - 01 (1080p)', releaseGroup: 'SubsPlease',
  resolution: '1080p', seeders: 12, leechers: 1, availability: 1, tracker: 'Nyaa', sizeBytes: 1,
  ageDays: 1, fileCount: 1, subtitleLanguages: ['en'], isBatch: false, magnet: '',
};

function index(id: string, priority: number): ScraperSourceEntry {
  return {
    id, label: id, host: `${id}.test`, kind: 'torrent', enabled: true, priority, fallbackIds: [],
    verifiedSiteId: '', requiresAuth: false, supportsSubtitles: true, health: 'unknown',
    lastCheckedAt: null, notes: '',
  };
}

function result(over: Partial<UnifiedSearchResult>): UnifiedSearchResult {
  return {
    id: 'a:1', providerId: 'a', providerResultId: 'x:1', title: 'Frieren', alternativeTitles: [],
    japaneseTitle: null, romajiTitle: null, authorsOrStudios: [], coverUrl: null, language: null,
    availability: 'unknown', metadataQuality: null, episodeCount: null, trackingStatus: 'unknown',
    mediaType: 'anime', year: null, season: null, genres: [], ...over,
  };
}

describe('the catalogue connector', () => {
  it('turns catalogue hits into results', async () => {
    const run = createCatalogueExecutor(async () => CATALOGUE);
    const results = await run({ query: 'frieren', step: step('catalogues'), signal: signal() });
    expect(results).toMatchObject([{ providerId: 'catalogues', providerResultId: 'jikan:52991', episodeCount: 28 }]);
  });

  it('fails, rather than answering "0 results", when no catalogue answered', async () => {
    const run = createCatalogueExecutor(async () => ({
      candidates: [], provenance: { servedBy: null, failures: ['jikan', 'anilist'], fetchedAt: 0 },
    }));
    await expect(run({ query: 'x', step: step('catalogues'), signal: signal() }))
      .rejects.toThrow(/No catalogue answered/);
  });
});

describe('the torrent-index connector', () => {
  it('searches the Source Manager enabled indexes in priority order', async () => {
    const search = vi.fn<(input: { indexers: ScraperSourceEntry[] }) => Promise<TorrentRow[]>>(async () => [ROW]);
    const settings = {
      ...DEFAULT_SCRAPER_SETTINGS,
      sources: { ...DEFAULT_SCRAPER_SETTINGS.sources, entries: [index('b', 2), index('a', 1)], order: ['a', 'b'] },
    };
    const run = createTorrentIndexExecutor(search as never, () => settings);
    const results = await run({ query: 'frieren', step: step('torrent-indexes'), signal: signal() });
    expect(search.mock.calls[0][0].indexers.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(results[0]).toMatchObject({ title: ROW.name, availability: 'available', providerResultId: 'abcd' });
  });

  it('says there is nothing to search instead of returning nothing', async () => {
    const run = createTorrentIndexExecutor(async () => [], () => DEFAULT_SCRAPER_SETTINGS);
    await expect(run({ query: 'x', step: step('t'), signal: signal() })).rejects.toThrow(/No torrent index/);
  });
});

describe('merging across sources', () => {
  it('dedupes by title and keeps every source as a badge, in provider order', () => {
    const merged = mergeUnifiedSearchResults([
      { providerId: 'a', providerName: 'Catalogues', status: 'succeeded', error: null, results: [result({})] },
      { providerId: 'b', providerName: 'Library', status: 'succeeded', error: null, results: [result({ id: 'b:9', providerId: 'b', providerResultId: 'deck:9', title: 'FRIEREN!' })] },
      { providerId: 'c', providerName: 'Other', status: 'succeeded', error: null, results: [result({ id: 'c:2', providerId: 'c', providerResultId: 'y:2', title: 'Dungeon Meshi' })] },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].result.providerId).toBe('a');
    expect(merged[0].sources.map((s) => s.providerName)).toEqual(['Catalogues', 'Library']);
    expect(merged[1].sources.map((s) => s.providerName)).toEqual(['Other']);
  });

  it('dedupes the same catalogue entry reached twice even under different titles', () => {
    const merged = mergeUnifiedSearchResults([
      { providerId: 'a', providerName: 'A', status: 'succeeded', error: null, results: [result({ title: 'Sousou no Frieren' })] },
      { providerId: 'b', providerName: 'B', status: 'succeeded', error: null, results: [result({ id: 'b:1', providerId: 'b', title: 'Frieren' })] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sources).toHaveLength(2);
  });
});

describe('the default search reaches real backends', () => {
  it('binds the built-in catalogue and index sources to their connectors', async () => {
    const metadata = vi.fn(async () => []);
    const sites = vi.fn(async () => []);
    const session = createRendererUnifiedSearchSession({
      loadDocument: () => ({ version: 1, providers: BUILT_IN_UNIFIED_SEARCH_PROVIDERS.map((p) => ({ ...p })), groups: [], results: [] }),
      localLibrary: async () => [],
      metadata,
      sites,
    });
    session.search({ query: 'Frieren' });
    await session.whenSettled();
    expect(metadata).toHaveBeenCalledOnce();
    expect(sites).toHaveBeenCalledOnce();
    session.dispose();
  });
});
