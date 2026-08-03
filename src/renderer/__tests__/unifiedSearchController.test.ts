// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { UnifiedSearchDocument, UnifiedSearchProvider } from '../../shared/unifiedSearch';
import {
  createInertUnifiedSearchRegistry,
  createUnifiedSearchRegistry,
  createRendererUnifiedSearchSession,
} from '../unifiedSearchController';

function provider(id: string, overrides: Partial<UnifiedSearchProvider> = {}): UnifiedSearchProvider {
  return {
    id,
    name: id.toUpperCase(),
    kind: 'connector',
    enabled: true,
    priority: 100,
    groupIds: [],
    supportedLanguages: [],
    definition: { endpoint: null, method: 'get', selectors: {}, apiConfiguration: {}, resultParser: null, metadataMapping: {} },
    ...overrides,
  };
}

function document(providers: UnifiedSearchProvider[]): UnifiedSearchDocument {
  return { version: 1, providers, groups: [], results: [] };
}

describe('unified search renderer controller', () => {
  it('binds only enabled providers to an inert executor, in priority order', () => {
    const doc = document([
      provider('site', { priority: 20 }),
      provider('local', { priority: 5 }),
      provider('disabled', { enabled: false, priority: 1 }),
    ]);
    const registry = createInertUnifiedSearchRegistry(doc);
    expect(Object.keys(registry)).toEqual(['local', 'site']);
    expect(registry.disabled).toBeUndefined();
  });

  it('inert executors resolve to zero results without performing any I/O', async () => {
    const registry = createInertUnifiedSearchRegistry(document([provider('local')]));
    const controller = new AbortController();
    const results = await registry.local({ query: 'Frieren', step: { providerId: 'local', providerName: 'LOCAL', providerKind: 'connector', priority: 0, groupIds: [] }, signal: controller.signal });
    expect(results).toEqual([]);
  });

  it('binds the supplied executor only to providers of kind local-library', async () => {
    const localExecutor = vi.fn(async ({ step }) => [{
      id: `${step.providerId}:deck:1`,
      providerId: step.providerId,
      providerResultId: 'deck:1',
      title: 'Local title',
      alternativeTitles: [],
      japaneseTitle: null,
      romajiTitle: null,
      authorsOrStudios: [],
      coverUrl: null,
      language: null,
      availability: 'available' as const,
      metadataQuality: null,
      episodeCount: null,
      trackingStatus: 'unknown' as const,
      mediaType: 'novel' as const,
      year: null,
      season: null,
      genres: [],
    }]);
    const registry = createUnifiedSearchRegistry(document([
      provider('library', { kind: 'local-library', priority: 0 }),
      provider('site', { kind: 'site', priority: 1 }),
    ]), { localLibrary: localExecutor });
    const signal = new AbortController().signal;

    const localResults = await registry.library({
      query: 'local',
      step: { providerId: 'library', providerName: 'Library', providerKind: 'local-library', priority: 0, groupIds: [] },
      signal,
    });
    const siteResults = await registry.site({
      query: 'local',
      step: { providerId: 'site', providerName: 'Site', providerKind: 'site', priority: 1, groupIds: [] },
      signal,
    });

    expect(localExecutor).toHaveBeenCalledOnce();
    expect(localResults.map((result) => result.providerId)).toEqual(['library']);
    expect(siteResults).toEqual([]);
  });

  it('keeps a local-library loading failure scoped to its provider partition', async () => {
    const session = createRendererUnifiedSearchSession({
      loadDocument: () => document([
        provider('library', { kind: 'local-library', priority: 0 }),
        provider('site', { kind: 'site', priority: 1 }),
      ]),
      localLibrary: async () => { throw new Error('media-library: media index is locked'); },
    });

    session.search({ query: 'Frieren' });
    const settled = await session.whenSettled();
    expect(settled.providers).toMatchObject([
      { providerId: 'library', status: 'failed', results: [], error: 'media-library: media index is locked' },
      { providerId: 'site', status: 'succeeded', results: [], error: null },
    ]);
    session.dispose();
  });

  it('runs an inert search to completion with every enabled provider succeeding and no results', async () => {
    const loadDocument = vi.fn(() => document([provider('local', { priority: 0 }), provider('site', { priority: 1 })]));
    const session = createRendererUnifiedSearchSession({ loadDocument });

    expect(session.getState().status).toBe('idle');
    session.search({ query: 'Frieren' });
    expect(session.getState().status).toBe('running');

    const settled = await session.whenSettled();
    expect(settled.status).toBe('completed');
    expect(settled.planStatus).toBe('ready');
    expect(settled.providers.map((entry) => entry.providerId)).toEqual(['local', 'site']);
    expect(settled.providers.every((entry) => entry.status === 'succeeded')).toBe(true);
    expect(settled.providers.flatMap((entry) => entry.results)).toEqual([]);
    // The store is read once per search; the registry reuses that planned snapshot.
    expect(loadDocument).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it('reports no-providers when the document has no enabled sources', async () => {
    const session = createRendererUnifiedSearchSession({ loadDocument: () => document([provider('off', { enabled: false })]) });
    session.search({ query: 'Frieren' });
    const settled = await session.whenSettled();
    expect(settled.status).toBe('completed');
    expect(settled.planStatus).toBe('no-providers');
    expect(settled.providers).toEqual([]);
    session.dispose();
  });

  it('picks up a newly enabled provider on the next search', () => {
    const documents = [document([provider('local')]), document([provider('local'), provider('site')])];
    const loadDocument = vi.fn(() => documents.shift() ?? document([]));
    const session = createRendererUnifiedSearchSession({ loadDocument });

    session.search({ query: 'first' });
    expect(session.getState().providers.map((entry) => entry.providerId)).toEqual(['local']);
    session.search({ query: 'second' });
    expect(session.getState().providers.map((entry) => entry.providerId)).toEqual(['local', 'site']);
    session.dispose();
  });
});
