// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bundle, BundleDownload } from '../../shared/resourcesCatalog';

const UI_KEYS = new Set([
  'common.back',
  'common.open',
  'bundleDetail.beginnerChecklist',
  'bundleDetail.checklistProgress',
  'bundleDetail.checklistCardProgress',
  'bundleDetail.setupLinks',
  'bundleDetail.setupExplanation',
  'bundleDetail.saveAndOpen',
  'bundleDetail.resourceLinks',
  'bundleDetail.linkCount',
  'bundleDetail.savedToolNote',
]);

vi.mock('../i18n', () => ({
  useT: () => ({
    lang: 'en',
    t: (key: string, vars?: Record<string, unknown>) => {
      if (!UI_KEYS.has(key)) throw new Error(`catalog content was passed to t(): ${key}`);
      const values = vars
        ? ` ${Object.entries(vars)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(' ')}`
        : '';
      return `[${key}${values}]`;
    },
  }),
}));

vi.mock('../components/Icons', () => ({
  default: ({ name }: { name: string }) => createElement('i', { 'data-icon': name }),
}));

const setupLink: BundleDownload = {
  id: 'starter-file',
  name: 'Remote starter file',
  url: 'https://downloads.example.test/starter.apkg?release=2#asset',
  description: 'Remote instructions stay exactly as authored.',
  kind: 'deck',
  tags: ['starter'],
};

const bundle: Bundle = {
  id: 'remote-bundle',
  gem: 'Remote Gem',
  creature: 'Remote Creature',
  color: '#7f1d1d',
  icon: 'resources',
  title: 'Remote bundle title',
  blurb: 'Remote bundle blurb.',
  checklist: [
    {
      id: 'remote-step',
      text: 'Remote checklist instruction.',
      url: 'https://example.test/guide',
    },
  ],
  downloads: [setupLink],
  items: [
    {
      name: 'Remote resource name',
      url: 'https://example.test/resource',
      description: 'Remote resource description.',
      cost: 'Free',
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Resources bundle setup truthfulness', () => {
  it('localizes UI chrome while rendering remote catalogue content verbatim', async () => {
    const [{ default: BundleDetail }, { default: BundleCard }] = await Promise.all([
      import('../components/resources/BundleDetail'),
      import('../components/resources/BundleCard'),
    ]);

    const detail = renderToStaticMarkup(
      createElement(BundleDetail, {
        bundle,
        checkedIds: [],
        onToggle: vi.fn(),
        onBack: vi.fn(),
        onOpenLink: vi.fn(),
        onOpenSetupLink: vi.fn(),
      }),
    );
    const card = renderToStaticMarkup(
      createElement(BundleCard, { bundle, checkedCount: 0, onOpen: vi.fn() }),
    );

    for (const key of [
      'common.back',
      'common.open',
      'bundleDetail.beginnerChecklist',
      'bundleDetail.checklistProgress',
      'bundleDetail.setupLinks',
      'bundleDetail.setupExplanation',
      'bundleDetail.saveAndOpen',
      'bundleDetail.resourceLinks',
      'bundleDetail.linkCount',
    ]) {
      expect(detail).toContain(`[${key}`);
    }
    expect(card).toContain('[bundleDetail.linkCount count=1]');
    expect(card).toContain('[bundleDetail.checklistCardProgress done=0 total=1]');

    for (const content of [
      bundle.gem,
      bundle.creature,
      bundle.title,
      bundle.blurb,
      bundle.checklist?.[0].text,
      setupLink.name,
      setupLink.description,
      bundle.items[0].name,
      bundle.items[0].description,
    ]) {
      expect(detail + card).toContain(content);
    }

    expect(detail).not.toContain('One-click setup');
    expect(detail).not.toContain('direct download');
    expect(detail).not.toContain('data-icon="download"');
  });

  it('saves only a link record, refreshes My tools, then opens the URL externally', async () => {
    const order: string[] = [];
    const toolsAdd = vi.fn(async () => {
      order.push('toolsAdd');
      return { ok: true };
    });
    const openExternal = vi.fn(() => {
      order.push('openExternal');
      return Promise.resolve(true);
    });
    const reloadTools = vi.fn(async () => {
      order.push('reloadTools');
    });
    vi.stubGlobal('window', { api: { toolsAdd, openExternal }, dispatchEvent: vi.fn() });
    vi.stubGlobal('document', { documentElement: { getAttribute: () => null } });

    const { saveAndOpenBundleLink } = await import('../components/resources/ResourcesContent');
    await saveAndOpenBundleLink(bundle, setupLink, 'Localized saved note', reloadTools);

    expect(toolsAdd).toHaveBeenCalledWith({
      name: setupLink.name,
      url: setupLink.url,
      note: 'Localized saved note',
      tags: ['bundle', bundle.id, setupLink.kind, 'starter'],
      source: 'app',
    });
    expect(order).toEqual(['toolsAdd', 'reloadTools', 'openExternal']);
    expect(openExternal).toHaveBeenCalledWith(setupLink.url);
  });

  it('still opens externally when My tools cannot save the link', async () => {
    const toolsAdd = vi.fn(async () => {
      throw new Error('store unavailable');
    });
    const openExternal = vi.fn(async () => true);
    const reloadTools = vi.fn(async () => undefined);
    vi.stubGlobal('window', { api: { toolsAdd, openExternal }, dispatchEvent: vi.fn() });
    vi.stubGlobal('document', { documentElement: { getAttribute: () => null } });

    const { saveAndOpenBundleLink } = await import('../components/resources/ResourcesContent');
    await saveAndOpenBundleLink(bundle, setupLink, 'Localized saved note', reloadTools);

    expect(reloadTools).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith(setupLink.url);
  });

  it('keeps both Resources shells wired to the same truthful detail surface', () => {
    const view = readFileSync(
      new URL('../views/ResourcesView.tsx', import.meta.url),
      'utf8',
    );
    const content = readFileSync(
      new URL('../components/resources/ResourcesContent.tsx', import.meta.url),
      'utf8',
    );
    const detail = readFileSync(
      new URL('../components/resources/BundleDetail.tsx', import.meta.url),
      'utf8',
    );

    expect(view.match(/<ResourceBundleDetail state=\{state\} \/>/g)).toHaveLength(2);
    expect(content).toContain('onOpenSetupLink={(link) => void state.openBundleSetupLink(bundle, link)}');
    expect(detail).not.toContain('DIRECT_DOWNLOAD_EXTENSIONS');
    expect(detail).not.toContain('isDirectDownload');
    expect(detail).not.toContain('One-click setup');
  });

  it('defines every changed UI claim in all four catalogs', async () => {
    const { CATALOGS } = await import('../../shared/i18n/catalogs/all');
    const keys = [
      'bundleDetail.checklistProgress',
      'bundleDetail.checklistCardProgress',
      'bundleDetail.setupLinks',
      'bundleDetail.setupExplanation',
      'bundleDetail.saveAndOpen',
      'bundleDetail.resourceLinks',
      'bundleDetail.linkCount',
      'bundleDetail.savedToolNote',
    ];

    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      for (const key of keys) expect(CATALOGS[lang][key], `${lang}:${key}`).toBeDefined();
    }
    for (const lang of ['ja', 'zh', 'ru'] as const) {
      for (const key of keys) {
        expect(JSON.stringify(CATALOGS[lang][key])).not.toBe(JSON.stringify(CATALOGS.en[key]));
      }
    }
  });
});
