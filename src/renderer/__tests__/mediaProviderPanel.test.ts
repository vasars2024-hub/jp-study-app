// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) => vars?.count === undefined ? key : `${key}:${vars.count}`,
  }),
}));

vi.mock('../components/settings/SettingsCard', () => ({
  default: ({ id, children }: { id?: string; children?: unknown }) => createElement('section', { 'data-setting-id': id }, children),
}));

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('media provider settings wiring', () => {
  it('renders persisted providers, an inert capability plan, and resolved trackable identities', async () => {
    const store = await import('../mediaProviderStore');
    store.saveMediaProvidersDocument({
      providers: [{
        id: 'local-catalog',
        name: 'Local Catalog',
        role: 'metadata',
        availability: 'offline',
        enabled: true,
        priority: 0,
        contentTypes: ['anime'],
        capabilities: { search: true, metadata: true },
      }],
      descriptors: [{
        providerId: 'local-catalog',
        providerItemId: 'frieren-1',
        title: 'Frieren',
        originalTitle: '葰92のフリーレン',
        contentType: 'anime',
        year: 2023,
      }],
    });

    const { default: MediaProviderPanel } = await import('../components/settings/pages/MediaProviderPanel');
    const html = renderToStaticMarkup(createElement(MediaProviderPanel));

    expect(html).toContain('data-setting-id="media-providers"');
    expect(html).toContain('Local Catalog');
    expect(html).toContain('mediaProvider.planStepCount:1');
    expect(html).toContain('Frieren');
    expect(html).toContain('mediaProvider.sourceCount:1');
    expect(html).toContain('mediaProvider.inertNote');
  });

  it('registers the surface on the scraper settings page with identity and tracking search terms', async () => {
    const { SETTINGS_REGISTRY } = await import('../components/settings/settingsRegistry');
    const entry = SETTINGS_REGISTRY.find((item) => item.id === 'media-providers');

    expect(entry).toMatchObject({ pageId: 'scraper', group: 'Media', advanced: true });
    expect(entry?.keywords).toEqual(expect.arrayContaining(['media providers', 'identity', 'tracking', 'offline']));
  });
});
