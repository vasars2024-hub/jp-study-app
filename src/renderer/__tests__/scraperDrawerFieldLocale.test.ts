import { beforeAll, describe, expect, it } from 'vitest';
import { catalogFor, ensureCatalog } from '../../shared/i18n/catalogs';
import { SCRAPER_FIELDS, SCRAPER_SETTINGS_GROUPS } from '../components/scraper/settings/fields';
import { localizeScraperField, scraperFieldKey } from '../components/scraper/settings/fieldLocale';

const LANGS = ['ja', 'zh', 'ru'] as const;

beforeAll(async () => {
  for (const lang of LANGS) await ensureCatalog(lang);
});

describe('Scraper Advanced Settings field translation', () => {
  it.each(LANGS)('translates every group, field name and hint in %s', (lang) => {
    const catalog = catalogFor(lang);
    for (const group of SCRAPER_SETTINGS_GROUPS) {
      expect(typeof catalog[`scraperDrawer.group.${group.id}.label`]).toBe('string');
      expect(typeof catalog[`scraperDrawer.group.${group.id}.description`]).toBe('string');
    }
    for (const field of SCRAPER_FIELDS) {
      const keyPath = scraperFieldKey(field);
      expect(typeof catalog[`scraperDrawer.field.${keyPath}.label`], field.path).toBe('string');
      if (field.hint) expect(typeof catalog[`scraperDrawer.field.${keyPath}.hint`], field.path).toBe('string');
      const localized = localizeScraperField(field, (key) => {
        const value = catalog[key];
        return typeof value === 'string' ? value : key;
      });
      expect(localized.label, field.path).not.toBe(field.label);
      if (field.hint) expect(localized.hint, field.path).not.toBe(field.hint);
    }
  });

  it('uses natural terms for the four rows visible when opening Torrents', () => {
    const field = SCRAPER_FIELDS.find((item) => item.path === 'torrents.minSeeders');
    expect(field).toBeDefined();
    if (!field) return;
    const zh = catalogFor('zh');
    const localized = localizeScraperField(field, (key) => String(zh[key] ?? key));
    expect(localized.label).toBe('最少做种人数');
    expect(catalogFor('ja')['scraperDrawer.field.torrents.maxSizeMb.label']).toBe('最大サイズ');
    expect(catalogFor('ru')['scraperDrawer.field.torrents.preferredReleaseGroups.label'])
      .toBe('Предпочтительные группы выпуска');
  });
});
