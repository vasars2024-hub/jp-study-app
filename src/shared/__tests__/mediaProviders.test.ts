import { describe, expect, it } from 'vitest';
import {
  createEmptyMediaProvidersDocument,
  MEDIA_PROVIDER_MODEL_VERSION,
  normalizeMediaProvidersDocument,
  planMediaProviderCapabilities,
  removeMediaProvider,
  selectCapableMediaProviders,
  upsertMediaProvider,
  type MediaProvidersDocument,
} from '../mediaProviders';

const provider = (over: Record<string, unknown> = {}) => ({
  id: 'prov-a',
  name: 'Provider A',
  role: 'anime',
  contentTypes: ['anime'],
  capabilities: { search: true, metadata: true },
  ...over,
});

const docOf = (input: unknown): MediaProvidersDocument => normalizeMediaProvidersDocument(input).value;

describe('media provider model', () => {
  it('provides complete safe capability defaults and coerces an unknown role', () => {
    const value = docOf({ providers: [{ id: 'p', name: 'P', role: 'wizard' }] });
    expect(value.providers[0].role).toBe('user-added');
    expect(value.providers[0].capabilities).toEqual({
      search: false, metadata: false, episodes: false, artwork: false, tracking: false, subtitles: false,
    });
    expect(value.providers[0].availability).toBe('unknown');
    expect(value.providers[0].priority).toBe(100);
  });

  it('keeps only known content types, namespaces, and bounds the reliability score', () => {
    const value = docOf({ providers: [provider({
      contentTypes: ['anime', 'movie', 'hologram', 'anime'],
      identifierNamespaces: ['mal', 'tmdb', 'nonsense'],
      reliabilityScore: 250,
    })] });
    expect(value.providers[0].contentTypes).toEqual(['anime', 'movie']);
    expect(value.providers[0].identifierNamespaces).toEqual(['mal', 'tmdb']);
    expect(value.providers[0].reliabilityScore).toBe(100);
  });

  it('accepts only HTTP(S) base URLs', () => {
    expect(docOf({ providers: [provider({ url: 'https://example.test/api' })] }).providers[0].baseUrl)
      .toBe('https://example.test/api');
    const bad = normalizeMediaProvidersDocument({ providers: [provider({ baseUrl: 'javascript:alert(1)' })] });
    expect(bad.value.providers[0].baseUrl).toBeNull();
    expect(bad.issues.some((issue) => issue.path.endsWith('baseUrl'))).toBe(true);
  });

  it('rejects providers without an ID or name and drops duplicate provider IDs', () => {
    const result = normalizeMediaProvidersDocument({ providers: [
      provider(),
      provider({ name: 'Duplicate' }),
      { id: 'no-name' },
    ] });
    expect(result.value.providers).toHaveLength(1);
    expect(result.issues.some((issue) => issue.message.includes('duplicate'))).toBe(true);
  });

  it('stores identifiers without resolving or merging them, dropping duplicates', () => {
    const value = docOf({
      providers: [provider()],
      descriptors: [{
        providerId: 'prov-a', providerItemId: 'x1', title: 'Frieren', contentType: 'anime',
        identifiers: [
          { namespace: 'mal', value: '52991' },
          { namespace: 'mal', value: '52991' },
          { namespace: 'unknown-db', value: '7' },
          { value: 'no-namespace-defaults-custom' },
        ],
      }],
    });
    expect(value.descriptors[0].identifiers).toEqual([
      { namespace: 'mal', value: '52991' },
      { namespace: 'custom', value: '7' },
      { namespace: 'custom', value: 'no-namespace-defaults-custom' },
    ]);
  });

  it('drops descriptors that reference an unknown provider and de-dupes provider item IDs', () => {
    const result = normalizeMediaProvidersDocument({
      providers: [provider()],
      descriptors: [
        { providerId: 'ghost', providerItemId: 'a', title: 'Orphan' },
        { providerId: 'prov-a', providerItemId: 'a', title: 'Kept' },
        { providerId: 'prov-a', providerItemId: 'a', title: 'Duplicate item' },
      ],
    });
    expect(result.value.descriptors).toHaveLength(1);
    expect(result.value.descriptors[0].title).toBe('Kept');
    expect(result.issues.some((issue) => issue.message.includes('duplicate provider descriptor'))).toBe(true);
  });

  it('discards a document from a newer model version', () => {
    const result = normalizeMediaProvidersDocument({ version: MEDIA_PROVIDER_MODEL_VERSION + 1, providers: [provider()] });
    expect(result.value).toEqual(createEmptyMediaProvidersDocument());
    expect(result.issues[0].path).toBe('version');
  });
});

describe('capability routing (inert data flow)', () => {
  const routingDoc = () => docOf({
    providers: [
      provider({ id: 'fast', name: 'Fast', priority: 10, contentTypes: ['anime', 'movie'], capabilities: { search: true, metadata: true }, languages: ['ja', 'en'], availability: 'available' }),
      provider({ id: 'slow', name: 'Slow', priority: 50, contentTypes: ['anime'], capabilities: { search: true }, languages: [], availability: 'degraded' }),
      provider({ id: 'off', name: 'Off', priority: 5, contentTypes: ['anime'], capabilities: { search: true }, enabled: false }),
      provider({ id: 'movies', name: 'Movies', priority: 20, contentTypes: ['movie'], capabilities: { search: true, metadata: true } }),
    ],
  });

  it('routes by content type + capability in priority order, skipping disabled providers', () => {
    const plan = planMediaProviderCapabilities(routingDoc(), { contentType: 'anime', capability: 'search' });
    expect(plan.status).toBe('ready');
    expect(plan.steps.map((step) => step.providerId)).toEqual(['fast', 'slow']);
    expect(plan.steps[0]).toMatchObject({ role: 'anime', priority: 10, availability: 'available' });
  });

  it('requires the specific capability flag, not merely the content type', () => {
    const plan = planMediaProviderCapabilities(routingDoc(), { contentType: 'anime', capability: 'metadata' });
    expect(plan.steps.map((step) => step.providerId)).toEqual(['fast']);
  });

  it('treats an empty provider language list as language-agnostic but filters others', () => {
    const providers = selectCapableMediaProviders(routingDoc(), { contentType: 'anime', capability: 'search', language: 'FR' });
    // 'fast' declares ja/en (no fr → excluded); 'slow' declares no languages → matches any.
    expect(providers.map((item) => item.id)).toEqual(['slow']);
  });

  it('reports no-content-type for an unrecognized content type and runs nothing', () => {
    const plan = planMediaProviderCapabilities(routingDoc(), { contentType: 'wizard' as never });
    expect(plan.status).toBe('no-content-type');
    expect(plan.steps).toEqual([]);
  });

  it('reports no-capable-providers when a valid content type matches nobody', () => {
    const plan = planMediaProviderCapabilities(routingDoc(), { contentType: 'kdrama' });
    expect(plan.status).toBe('no-capable-providers');
    expect(plan.steps).toEqual([]);
  });
});

describe('local mutation helpers', () => {
  it('upserts a provider by ID, replacing an existing one', () => {
    const first = upsertMediaProvider(createEmptyMediaProvidersDocument(), provider({ name: 'First' })).value;
    expect(first.providers).toHaveLength(1);
    const second = upsertMediaProvider(first, provider({ name: 'Second' })).value;
    expect(second.providers).toHaveLength(1);
    expect(second.providers[0].name).toBe('Second');
  });

  it('removing a provider also removes every descriptor it produced', () => {
    const doc = docOf({
      providers: [provider(), provider({ id: 'prov-b', name: 'B' })],
      descriptors: [
        { providerId: 'prov-a', providerItemId: '1', title: 'A item' },
        { providerId: 'prov-b', providerItemId: '1', title: 'B item' },
      ],
    });
    const pruned = removeMediaProvider(doc, 'PROV-A');
    expect(pruned.providers.map((item) => item.id)).toEqual(['prov-b']);
    expect(pruned.descriptors.map((item) => item.providerId)).toEqual(['prov-b']);
  });
});
