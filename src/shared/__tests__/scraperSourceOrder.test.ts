import { describe, expect, it } from 'vitest';
import {
  enabledSourcesOfKind,
  fallbackChain,
  metadataProviderOrder,
  orderStreamProviders,
  sourceWalk,
} from '../scraperSourceOrder';
import { DEFAULT_SCRAPER_SETTINGS, type ScraperSettings } from '../scraperSettings';
import type { ScraperSourceEntry, ScraperSourceSettings } from '../scraperSourceSettings';

function entry(id: string, over: Partial<ScraperSourceEntry> = {}): ScraperSourceEntry {
  return {
    id, label: id, host: `${id}.test`, kind: 'metadata', enabled: true, priority: 1,
    fallbackIds: [], verifiedSiteId: '', requiresAuth: false, supportsSubtitles: false,
    health: 'unknown', lastCheckedAt: null, notes: '', ...over,
  };
}

function sources(entries: ScraperSourceEntry[], over: Partial<ScraperSourceSettings> = {}): ScraperSourceSettings {
  return { ...DEFAULT_SCRAPER_SETTINGS.sources, entries, order: entries.map((e) => e.id), ...over };
}

function withSources(s: ScraperSourceSettings): ScraperSettings {
  return { ...DEFAULT_SCRAPER_SETTINGS, sources: s };
}

describe('source priority', () => {
  it('orders by the Source Manager list, not by entry position', () => {
    const s = sources([entry('a'), entry('b'), entry('c')], { order: ['c', 'a', 'b'] });
    expect(enabledSourcesOfKind(s, 'metadata').map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('drops disabled sources and other kinds', () => {
    const s = sources([entry('a', { enabled: false }), entry('b'), entry('t', { kind: 'torrent' })]);
    expect(enabledSourcesOfKind(s, 'metadata').map((e) => e.id)).toEqual(['b']);
  });
});

describe('fallbacks', () => {
  it('walks fallbacks depth-first within the depth, skipping disabled and other kinds', () => {
    const pool = [
      entry('a', { fallbackIds: ['b', 'x', 'off'] }),
      entry('b', { fallbackIds: ['c'] }),
      entry('c'),
      entry('x', { kind: 'torrent' }),
      entry('off', { enabled: false }),
    ];
    expect(fallbackChain(pool[0], pool, 2).map((e) => e.id)).toEqual(['b', 'c']);
    expect(fallbackChain(pool[0], pool, 1).map((e) => e.id)).toEqual(['b']);
    expect(fallbackChain(pool[0], pool, 0)).toEqual([]);
  });

  it('puts each source’s fallbacks straight after it in the sequential walk', () => {
    const s = sources([
      entry('a', { fallbackIds: ['z'] }),
      entry('b'),
      entry('z', { enabled: true }),
    ], { order: ['a', 'b', 'z'], maxFallbackDepth: 1 });
    expect(sourceWalk(s, 'metadata').map((e) => e.id)).toEqual(['a', 'z', 'b']);
  });
});

describe('metadata provider order', () => {
  it('follows the Source Manager when it lists a catalogue', () => {
    const s = sources([entry('anilist'), entry('jikan'), entry('animethemes')]);
    expect(metadataProviderOrder(withSources(s))).toEqual(['anilist', 'jikan']);
  });

  it('leaves out a catalogue the user switched off', () => {
    const s = sources([entry('jikan', { enabled: false }), entry('anilist')]);
    expect(metadataProviderOrder(withSources(s))).toEqual(['anilist']);
  });

  it('falls back to metadata.providerOrder when the Source Manager lists none', () => {
    const settings = { ...withSources(sources([])), metadata: { ...DEFAULT_SCRAPER_SETTINGS.metadata, providerOrder: ['anilist', 'jikan'] } };
    expect(metadataProviderOrder(settings)).toEqual(['anilist', 'jikan']);
  });
});

describe('video server preference order', () => {
  const providers = [
    { id: 'zoro', name: 'Zoro' },
    { id: 'gogo', name: 'Gogoanime' },
    { id: 'animepahe', name: 'AnimePahe' },
  ];

  it('puts preferred servers first, by id or by name', () => {
    expect(orderStreamProviders(providers, ['animepahe', 'gogoanime']).map((p) => p.id))
      .toEqual(['animepahe', 'gogo', 'zoro']);
  });

  it('keeps the incoming order when there is no preference', () => {
    expect(orderStreamProviders(providers, []).map((p) => p.id)).toEqual(['zoro', 'gogo', 'animepahe']);
    expect(orderStreamProviders(providers, undefined).map((p) => p.id)).toEqual(['zoro', 'gogo', 'animepahe']);
  });
});
