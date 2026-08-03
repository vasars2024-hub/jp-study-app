import { describe, expect, it } from 'vitest';
import {
  createUnifiedSearchQueryPlan,
  createEmptyUnifiedSearchDocument,
  normalizeUnifiedSearchDocument,
  reduceUnifiedSearchDocument,
  selectEnabledUnifiedSearchProviders,
  UNIFIED_SEARCH_MODEL_VERSION,
  type UnifiedSearchProvider,
  type UnifiedSearchProviderDefinition,
  type UnifiedSearchResult,
} from '../unifiedSearch';

const provider = { id: 'local-library', name: 'Local Library', kind: 'local-library' };

describe('unified multi-source search model', () => {
  it('creates a versioned empty local model', () => {
    expect(createEmptyUnifiedSearchDocument()).toEqual({ version: UNIFIED_SEARCH_MODEL_VERSION, providers: [], groups: [], results: [] });
  });

  it('normalizes an inert provider definition without executing it', () => {
    const value = normalizeUnifiedSearchDocument({ providers: [{
      ...provider, priority: -5, supportedLanguages: ['ja', 'ja'],
      definition: { method: 'local', endpoint: null, selectors: { title: ['.title'] }, apiConfiguration: { format: 'json' }, resultParser: 'declarative-parser-id', metadataMapping: { name: 'title' } },
    }] }).value.providers[0];
    expect(value).toMatchObject({ id: 'local-library', enabled: true, priority: 0, groupIds: [], supportedLanguages: ['ja'] });
    expect(value.definition).toEqual({ endpoint: null, method: 'local', selectors: { title: ['.title'] }, apiConfiguration: { format: 'json' }, resultParser: 'declarative-parser-id', metadataMapping: { name: 'title' } });
  });

  it('does not accept authentication material in inert provider configuration', () => {
    const result = normalizeUnifiedSearchDocument({ providers: [{
      ...provider, definition: { apiConfiguration: { format: 'json', token: 'secret', Authorization: 'Bearer secret' } },
    }] });
    expect(result.value.providers[0].definition.apiConfiguration).toEqual({ format: 'json' });
    expect(result.issues.filter((issue) => issue.message.includes('Credential-bearing'))).toHaveLength(2);
  });

  it('preserves the complete source result contract and bounds quality fields', () => {
    const result = normalizeUnifiedSearchDocument({ providers: [provider], results: [{
      id: 'frieren-local', providerId: 'local-library', providerResultId: 'media-1', title: 'Frieren',
      alternativeTitles: ['Sousou no Frieren'], japaneseTitle: '葬送のフリーレン', romajiTitle: 'Sousou no Frieren',
      authorsOrStudios: ['Madhouse'], coverUrl: 'https://example.com/cover.jpg', language: 'ja', availability: 'available',
      metadataQuality: 120, episodeCount: 28, trackingStatus: 'watching', mediaType: 'anime', year: 2023, season: 'Fall', genres: ['Fantasy'],
    }] }).value.results[0];
    expect(result).toMatchObject({ providerId: 'local-library', title: 'Frieren', metadataQuality: 100, episodeCount: 28, trackingStatus: 'watching', mediaType: 'anime' });
    expect(result.japaneseTitle).toBe('葬送のフリーレン');
  });

  it('rejects unknown-provider results and duplicate provider result identities', () => {
    const result = normalizeUnifiedSearchDocument({ providers: [provider], results: [
      { providerId: 'missing', providerResultId: '1', title: 'Unknown' },
      { providerId: 'local-library', providerResultId: '1', title: 'One' },
      { providerId: 'local-library', providerResultId: '1', title: 'Duplicate' },
    ] });
    expect(result.value.results).toHaveLength(1);
    expect(result.issues.some((issue) => issue.message.includes('known provider'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('duplicate provider result'))).toBe(true);
  });

  it('normalizes groups, provider membership, ordering metadata, and stale references', () => {
    const value = normalizeUnifiedSearchDocument({
      providers: [{ ...provider, priority: 2, groupIds: ['anime', 'missing'] }, { id: 'metadata-a', name: 'Metadata A', priority: 1 }],
      groups: [{ id: 'anime', name: 'Anime', providerIds: ['metadata-a', 'missing'] }],
    }).value;
    expect(value.providers[0].groupIds).toEqual(['anime']);
    expect(value.groups[0].providerIds).toEqual(['metadata-a']);
    expect(value.providers.map((item) => item.priority)).toEqual([2, 1]);
  });

  it('rejects invalid and future-version documents safely', () => {
    expect(normalizeUnifiedSearchDocument(null).value).toEqual(createEmptyUnifiedSearchDocument());
    const future = normalizeUnifiedSearchDocument({ version: 999, providers: [provider] });
    expect(future.value.providers).toEqual([]);
    expect(future.issues[0].path).toBe('version');
  });
});

describe('unified search reducer', () => {
  const definition: UnifiedSearchProviderDefinition = { endpoint: null, method: 'local', selectors: {}, apiConfiguration: {}, resultParser: null, metadataMapping: {} };
  const local: UnifiedSearchProvider = { id: 'local', name: 'Local', kind: 'local-library', enabled: true, priority: 9, groupIds: [], supportedLanguages: [], definition };
  const site: UnifiedSearchProvider = { ...local, id: 'site', name: 'Site', kind: 'site' };

  it('atomically creates, updates, and removes providers while maintaining group references', () => {
    const base = normalizeUnifiedSearchDocument({ groups: [{ id: 'anime', name: 'Anime', providerIds: [] }] }).value;
    const created = reduceUnifiedSearchDocument(base, { type: 'provider/create', provider: { ...local, groupIds: ['anime'] } });
    expect(created.ok && created.value.groups[0].providerIds).toEqual(['local']);
    const updated = reduceUnifiedSearchDocument(created.value, { type: 'provider/update', id: 'local', patch: { name: 'Library', groupIds: [] } });
    expect(updated.ok && updated.value.groups[0].providerIds).toEqual([]);
    const withSnapshot = normalizeUnifiedSearchDocument({ ...updated.value, results: [{ providerId: 'local', providerResultId: '1', title: 'Saved' }] }).value;
    const removed = reduceUnifiedSearchDocument(withSnapshot, { type: 'provider/remove', id: 'local' });
    expect(removed.ok && removed.value).toMatchObject({ providers: [], results: [] });
  });

  it('atomically creates, updates, and removes groups while maintaining provider references', () => {
    const base = normalizeUnifiedSearchDocument({ providers: [local, site] }).value;
    const created = reduceUnifiedSearchDocument(base, { type: 'group/create', group: { id: 'anime', name: 'Anime', providerIds: ['site'] } });
    expect(created.ok && created.value.providers.map((item) => item.groupIds)).toEqual([[], ['anime']]);
    const updated = reduceUnifiedSearchDocument(created.value, { type: 'group/update', id: 'anime', patch: { providerIds: ['local'] } });
    expect(updated.ok && updated.value.providers.map((item) => item.groupIds)).toEqual([['anime'], []]);
    const removed = reduceUnifiedSearchDocument(updated.value, { type: 'group/remove', id: 'anime' });
    expect(removed.ok && removed.value.providers.map((item) => item.groupIds)).toEqual([[], []]);
  });

  it('uses complete ID permutations for deterministic provider and group reordering', () => {
    const base = normalizeUnifiedSearchDocument({ providers: [local, site], groups: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }).value;
    const providers = reduceUnifiedSearchDocument(base, { type: 'provider/reorder', providerIds: ['site', 'local'] });
    expect(providers.ok && providers.value.providers.map((item) => [item.id, item.priority])).toEqual([['site', 0], ['local', 1]]);
    const groups = reduceUnifiedSearchDocument(providers.value, { type: 'group/reorder', groupIds: ['b', 'a'] });
    expect(groups.ok && groups.value.groups.map((item) => item.id)).toEqual(['b', 'a']);
    expect(reduceUnifiedSearchDocument(groups.value, { type: 'provider/reorder', providerIds: ['local'] })).toEqual(expect.objectContaining({ ok: false, value: groups.value }));
  });

  it('replaces or clears inert snapshots explicitly and rejects an invalid batch without changes', () => {
    const base = normalizeUnifiedSearchDocument({ providers: [local] }).value;
    const result: UnifiedSearchResult = { id: 'one', providerId: 'local', providerResultId: '1', title: 'One', alternativeTitles: [], japaneseTitle: null, romajiTitle: null, authorsOrStudios: [], coverUrl: null, language: null, availability: 'unknown', metadataQuality: null, episodeCount: null, trackingStatus: 'unknown', mediaType: 'other', year: null, season: null, genres: [] };
    const replaced = reduceUnifiedSearchDocument(base, { type: 'snapshots/replace', results: [result] });
    expect(replaced.ok && replaced.value.results).toEqual([result]);
    const rejected = reduceUnifiedSearchDocument(replaced.value, { type: 'snapshots/replace', results: [{ ...result, providerId: 'missing' }] });
    expect(rejected).toEqual(expect.objectContaining({ ok: false, value: replaced.value }));
    expect(reduceUnifiedSearchDocument(replaced.value, { type: 'snapshots/clear' })).toEqual({ ok: true, value: { ...replaced.value, results: [] } });
  });
});

describe('unified search query planning', () => {
  const definition: UnifiedSearchProviderDefinition = { endpoint: null, method: 'local', selectors: {}, apiConfiguration: {}, resultParser: null, metadataMapping: {} };
  const document = normalizeUnifiedSearchDocument({
    providers: [
      { id: 'disabled', name: 'Disabled', enabled: false, priority: 0, groupIds: ['anime'], definition },
      { id: 'metadata', name: 'Metadata', enabled: true, priority: 2, groupIds: ['anime', 'movies'], definition },
      { id: 'library', name: 'Library', kind: 'local-library', enabled: true, priority: 1, groupIds: ['anime'], definition },
      { id: 'movies', name: 'Movies', enabled: true, priority: 1, groupIds: ['movies'], definition },
      { id: 'ungrouped', name: 'Ungrouped', enabled: true, priority: 3, groupIds: [], definition },
    ],
    groups: [
      { id: 'anime', name: 'Anime', providerIds: ['disabled', 'metadata', 'library'] },
      { id: 'movies', name: 'Movies', providerIds: ['metadata', 'movies'] },
    ],
  }).value;

  it('selects enabled providers by group with deterministic priority and document-order ties', () => {
    expect(selectEnabledUnifiedSearchProviders(document, ['anime', 'movies']).map((provider) => provider.id))
      .toEqual(['library', 'movies', 'metadata']);
    expect(selectEnabledUnifiedSearchProviders(document).map((provider) => provider.id))
      .toEqual(['library', 'movies', 'metadata', 'ungrouped']);
  });

  it('resolves normalized membership declared from either side of the provider/group relation', () => {
    const asymmetric = normalizeUnifiedSearchDocument({
      providers: [
        { id: 'provider-side', name: 'Provider side', enabled: true, priority: 2, groupIds: ['anime'], definition },
        { id: 'group-side', name: 'Group side', enabled: true, priority: 1, groupIds: [], definition },
      ],
      groups: [{ id: 'anime', name: 'Anime', providerIds: ['group-side'] }],
    }).value;
    expect(selectEnabledUnifiedSearchProviders(asymmetric, ['anime']).map((provider) => provider.id))
      .toEqual(['group-side', 'provider-side']);
  });

  it('creates one inert step per provider even when it belongs to multiple selected groups', () => {
    const plan = createUnifiedSearchQueryPlan(document, { query: '  Sousou   no Frieren  ', selectedGroupIds: ['movies', 'anime', 'movies'] });
    expect(plan).toEqual({
      query: 'Sousou no Frieren',
      selectedGroupIds: ['movies', 'anime'],
      status: 'ready',
      steps: [
        { providerId: 'library', providerName: 'Library', providerKind: 'local-library', priority: 1, groupIds: ['anime'] },
        { providerId: 'movies', providerName: 'Movies', providerKind: 'connector', priority: 1, groupIds: ['movies'] },
        { providerId: 'metadata', providerName: 'Metadata', providerKind: 'connector', priority: 2, groupIds: ['movies', 'anime'] },
      ],
    });
    expect(JSON.stringify(plan)).not.toMatch(/endpoint|method|callback|function/i);
  });

  it('keeps empty queries and unknown or empty explicit group selections inert', () => {
    expect(createUnifiedSearchQueryPlan(document, { query: ' ', selectedGroupIds: ['anime'] }).status).toBe('empty-query');
    const unknown = createUnifiedSearchQueryPlan(document, { query: 'Frieren', selectedGroupIds: ['missing'] });
    expect(unknown).toMatchObject({ selectedGroupIds: [], status: 'no-providers', steps: [] });
    expect(createUnifiedSearchQueryPlan(document, { query: 'Frieren', selectedGroupIds: [] }).steps).toEqual([]);
  });
});
