// @vitest-environment jsdom
/**
 * Resources grows beyond what ships: learners add or import their own links,
 * Chinese and Russian learners get their own categories first, "NEW" is
 * measured against the catalogue's edition, Refresh admits there is nothing to
 * fetch, and the learner map does not count the viewer's own guessed country.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESOURCES } from '../data/resources';
import { CATALOG_FALLBACK } from '../data/catalogFallback';
import {
  OWN_RESOURCES_CATEGORY_ID,
  RESOURCE_TEMPLATE_CSV,
  RESOURCE_TEMPLATE_JSON,
  addOwnResources,
  isNewInCatalogue,
  loadOwnResources,
  normalizeCost,
  normalizeResourceUrl,
  orderForStudyLang,
  parseResourceImport,
  removeOwnResource,
} from '../ownResources';

vi.mock('../i18n', () => ({
  getUiLang: () => 'en',
  useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
}));

vi.mock('../../shared/stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/stats')>()),
  guessCountryCode: () => 'JP',
}));

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => localStorage.clear());
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('built-in directory', () => {
  it('has Chinese, Russian and any-language categories with real links', () => {
    const count = (id: string) => RESOURCES.find((c) => c.id === id)?.items.length ?? 0;
    expect(count('zh-dictionaries') + count('zh-practice')).toBeGreaterThanOrEqual(20);
    expect(count('ru-dictionaries') + count('ru-practice')).toBeGreaterThanOrEqual(15);
    expect(count('any-language')).toBeGreaterThanOrEqual(6);
    for (const cat of RESOURCES) {
      const urls = cat.items.map((r) => r.url);
      expect(new Set(urls).size, cat.id).toBe(urls.length);
      for (const r of cat.items) {
        expect(r.url).toMatch(/^https?:\/\/[^/]+\.[^/]+/);
        expect(['Free', 'Freemium', 'Paid']).toContain(r.cost);
        expect(r.description.length).toBeGreaterThan(20);
      }
    }
  });

  it('lists the study language first and keeps everything else', () => {
    const zh = orderForStudyLang(RESOURCES, 'zh').map((c) => c.id);
    expect(zh.slice(0, 2)).toEqual(['zh-dictionaries', 'zh-practice']);
    expect(zh[2]).toBe('any-language');
    expect(zh).toHaveLength(RESOURCES.length);
    expect(orderForStudyLang(RESOURCES, 'ru')[0].id).toBe('ru-dictionaries');
    expect(orderForStudyLang(RESOURCES, 'ja')[0].id).toBe('dictionaries');
  });
});

describe('NEW is relative to the catalogue edition', () => {
  it('marks entries added within 30 days of the catalogue date, whatever today is', () => {
    const edition = CATALOG_FALLBACK.updatedAt;
    const fresh = CATALOG_FALLBACK.newSection.filter((e) => isNewInCatalogue(e.addedAt, edition));
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.some((e) => e.lang?.includes('zh'))).toBe(true);
    expect(fresh.some((e) => e.lang?.includes('ru'))).toBe(true);
    expect(isNewInCatalogue('2026-07-12', '2026-09-25')).toBe(false);
    expect(isNewInCatalogue('2026-09-01', '2026-09-25')).toBe(true);
    expect(isNewInCatalogue('not a date', '2026-09-25')).toBe(false);
  });
});

describe('your own resources', () => {
  it('parses the CSV and JSON templates, and skips rows without a usable link', () => {
    const csv = parseResourceImport(RESOURCE_TEMPLATE_CSV, 'list.csv');
    expect(csv.rows).toHaveLength(3);
    expect(csv.rows.map((r) => r.lang)).toEqual([['ja'], ['zh'], ['ru']]);
    expect(csv.rows[1]).toMatchObject({ name: 'Du Chinese', cost: 'Freemium', group: 'Reading' });
    const json = parseResourceImport(RESOURCE_TEMPLATE_JSON, 'list.json');
    expect(json.rows).toHaveLength(2);
    const messy = parseResourceImport('name\turl\tcost\nNo link\t\tFree\nBare host\texample.org\t有料\nBad\tjavascript:alert(1)\t', 'x.tsv');
    expect(messy.rows).toHaveLength(1);
    expect(messy.rows[0]).toMatchObject({ url: 'https://example.org/', cost: 'Paid' });
    expect(messy.skipped).toBe(2);
  });

  it('normalises links and costs', () => {
    expect(normalizeResourceUrl('tatoeba.org')).toBe('https://tatoeba.org/');
    expect(normalizeResourceUrl('file:///C:/x')).toBeNull();
    expect(normalizeResourceUrl('localhost')).toBeNull();
    expect(normalizeCost('бесплатно')).toBe('Free');
    expect(normalizeCost('部分免费')).toBe('Freemium');
    expect(normalizeCost('платно')).toBe('Paid');
  });

  it('adds, updates by link instead of duplicating, and removes', () => {
    const row = { name: 'Mine', url: 'https://example.org', description: 'x', cost: 'Free' as const, lang: ['ru' as const] };
    expect(addOwnResources([row], 1)).toBe(1);
    expect(addOwnResources([{ ...row, name: 'Renamed' }], 2)).toBe(0);
    const list = loadOwnResources();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Renamed', addedAt: 1, lang: ['ru'] });
    removeOwnResource(list[0].id);
    expect(loadOwnResources()).toEqual([]);
  });
});

async function mount(node: React.ReactNode): Promise<HTMLDivElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

describe('resources state', () => {
  it('puts your resources first and cannot refresh a built-in catalogue', async () => {
    addOwnResources([{ name: 'Mine', url: 'https://example.org', description: '', cost: 'Free', lang: [] }]);
    (window as unknown as { api: unknown }).api = {
      catalogGet: vi.fn().mockResolvedValue(null),
      catalogRefresh: vi.fn().mockResolvedValue({ catalog: null, source: 'builtin' }),
      toolsList: vi.fn().mockResolvedValue({ tools: [] }),
    };
    const { useResources } = await import('../components/resources/ResourcesContent');
    let seen: ReturnType<typeof useResources> | null = null;
    function Harness() {
      seen = useResources();
      return null;
    }
    await mount(<Harness />);
    const state = seen as unknown as ReturnType<typeof useResources>;
    expect(state.refreshState).toBe('builtin');
    expect(state.canRefresh).toBe(false);
    expect(state.allCategories[0].id).toBe(OWN_RESOURCES_CATEGORY_ID);
    expect(state.allCategories[0].items.map((r) => r.name)).toEqual(['Mine']);
  });
});

describe('learner map', () => {
  it('outlines the guessed country without counting it', async () => {
    const { TELEMETRY_CONSENT_KEY } = await import('../../shared/stats');
    localStorage.setItem(TELEMETRY_CONSENT_KEY, 'yes');
    (window as unknown as { api: unknown }).api = {
      statsCounts: vi.fn().mockResolvedValue({ US: 3 }),
      statsPing: vi.fn().mockResolvedValue(undefined),
    };
    const { default: WorldHeatMap } = await import('../components/resources/WorldHeatMap');
    const host = await mount(<WorldHeatMap />);
    // The full-size card holds a placeholder until the lazy map chunk is in (no layout
    // jump), so wait for the real caption rather than one microtask.
    await vi.waitFor(async () => {
      await act(async () => { await Promise.resolve(); });
      expect(host.querySelector('.heatmap-section[aria-busy]')).toBeNull();
    }, { timeout: 5_000 });
    const caption = host.querySelector('.heatmap-caption')?.textContent ?? '';
    expect(caption).toContain('"count":1');
    expect(caption).toContain('"total":3');
    expect(host.querySelector('.heatmap-you-note')?.textContent).toContain('resources.heatmap.you');
  });
});
