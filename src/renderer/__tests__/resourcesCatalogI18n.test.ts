// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RESOURCES } from '../data/resources';
import { localizeResourceCategory, resourceItemKey, resourceSlug } from '../components/resources/resourceText';
import { RESOURCES_CATALOG_EN } from '../../shared/i18n/resourcesCatalog/en';
import { RESOURCES_CATALOG_JA } from '../../shared/i18n/resourcesCatalog/ja';
import { RESOURCES_CATALOG_ZH } from '../../shared/i18n/resourcesCatalog/zh';
import { RESOURCES_CATALOG_RU } from '../../shared/i18n/resourcesCatalog/ru';
import type { Catalog } from '../../shared/i18n/core';

/**
 * Round-3 sweep: the Resources window was English in ja/zh/ru — 12 category titles and
 * blurbs and every item description (the english list went 107 -> 225 there). The data
 * file keeps its English; the window shows `resourcesCatalog.*`. These cases hold every
 * built-in string to a real translation in all three languages, and hold the key shape
 * the window derives to the one the catalogs declare.
 */

const OTHERS: Array<[string, Catalog]> = [
  ['ja', RESOURCES_CATALOG_JA],
  ['zh', RESOURCES_CATALOG_ZH],
  ['ru', RESOURCES_CATALOG_RU],
];

const expectedKeys = (): string[] =>
  RESOURCES.flatMap((category) => [
    `resourcesCatalog.cat.${category.id}.title`,
    `resourcesCatalog.cat.${category.id}.blurb`,
    ...category.items.map((item) => resourceItemKey(category.id, item.name)),
  ]);

/** A translate function over one catalog with English fallback, like the app's `t`. */
const translatorFor = (catalog: Catalog) => (key: string) => {
  const value = catalog[key] ?? RESOURCES_CATALOG_EN[key];
  return typeof value === 'string' ? value : key;
};

describe('Resources catalogue: built-in text in every interface language', () => {
  it('gives every item a distinct key within its category', () => {
    for (const category of RESOURCES) {
      const slugs = category.items.map((item) => resourceSlug(item.name));
      expect(slugs.every(Boolean), `${category.id}: an empty slug`).toBe(true);
      expect(new Set(slugs).size, `${category.id}: two items share a slug`).toBe(slugs.length);
    }
  });

  it('English declares exactly the keys the data derives, with the data file’s own text', () => {
    const keys = expectedKeys();
    expect(Object.keys(RESOURCES_CATALOG_EN).sort()).toEqual([...keys].sort());
    for (const category of RESOURCES) {
      expect(RESOURCES_CATALOG_EN[`resourcesCatalog.cat.${category.id}.title`]).toBe(category.title);
      for (const item of category.items) {
        expect(RESOURCES_CATALOG_EN[resourceItemKey(category.id, item.name)]).toBe(item.description);
      }
    }
  });

  it.each(OTHERS)('%s translates every key, and none is an English copy', (_lang, catalog) => {
    for (const key of expectedKeys()) {
      const value = catalog[key];
      expect(typeof value, `${key} missing`).toBe('string');
      expect(value, `${key} is the English text`).not.toBe(RESOURCES_CATALOG_EN[key]);
    }
  });

  it('shows a built-in category in the interface language and keeps names and URLs', () => {
    const t = translatorFor(RESOURCES_CATALOG_JA);
    const source = RESOURCES.find((c) => c.id === 'grammar');
    if (!source) throw new Error('the grammar category moved');
    const shown = localizeResourceCategory(source, t);
    expect(shown.title).toBe(RESOURCES_CATALOG_JA['resourcesCatalog.cat.grammar.title']);
    expect(shown.items.map((i) => i.name)).toEqual(source.items.map((i) => i.name));
    expect(shown.items.map((i) => i.url)).toEqual(source.items.map((i) => i.url));
    expect(shown.items[0].description).not.toBe(source.items[0].description);
    // The data itself is untouched: search, "My tools" and the remote catalogue share it.
    expect(source.title).toBe('Grammar references');
  });

  it('falls back to the English it came with for a category the catalogs do not know', () => {
    const t = translatorFor(RESOURCES_CATALOG_RU);
    const remote = {
      id: 'remote-extra',
      icon: 'globe',
      title: 'Remote extras',
      blurb: 'From the online catalogue.',
      items: [{ name: 'Example', url: 'https://example.org', description: 'An example.', cost: 'Free' as const }],
    };
    expect(localizeResourceCategory(remote, t)).toEqual(remote);
  });
});
