// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RESOURCES } from '../data/resources';
import {
  bundleKeyPrefix,
  localizeBundle,
  localizeNewEntry,
  localizeResourceCategory,
  newEntryKey,
  resourceItemKey,
  resourceSlug,
} from '../components/resources/resourceText';
import { CATALOG_FALLBACK } from '../data/catalogFallback';
import { RESOURCES_CATALOG_EN } from '../../shared/i18n/resourcesCatalog/en';
import { RESOURCES_CATALOG_JA } from '../../shared/i18n/resourcesCatalog/ja';
import { RESOURCES_CATALOG_ZH } from '../../shared/i18n/resourcesCatalog/zh';
import { RESOURCES_CATALOG_RU } from '../../shared/i18n/resourcesCatalog/ru';
import { RESOURCE_BUNDLES_EN } from '../../shared/i18n/resourceBundles/en';
import { RESOURCE_BUNDLES_JA } from '../../shared/i18n/resourceBundles/ja';
import { RESOURCE_BUNDLES_ZH } from '../../shared/i18n/resourceBundles/zh';
import { RESOURCE_BUNDLES_RU } from '../../shared/i18n/resourceBundles/ru';
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

/**
 * The same sweep for the bundled catalogue (catalogFallback.ts): the ten gem bundles —
 * gem and creature labels, titles, blurbs, item descriptions, setup links, checklist
 * steps — and the New section were English under every interface language. The window
 * now shows `resourceBundles.*`, but only while the catalogue still carries the English
 * written there, so a fetched catalogue's rewording or additions stay in English.
 */

const BUNDLE_OTHERS: Array<[string, Catalog]> = [
  ['ja', RESOURCE_BUNDLES_JA],
  ['zh', RESOURCE_BUNDLES_ZH],
  ['ru', RESOURCE_BUNDLES_RU],
];

/** Setup links named by nothing but the product's own name: shown as-is, so no name key. */
const PRODUCT_ONLY_LINK_NAMES = new Set(['Ringotan', 'Kakimashou', 'Kanji Koohii']);

type KeyedText = [key: string, english: string];

/** Every [key, English] pair the bundled catalogue shows. */
const bundleStrings = (): KeyedText[] => [
  ...CATALOG_FALLBACK.bundles.flatMap((bundle): KeyedText[] => {
    const p = bundleKeyPrefix(bundle.id);
    const strings: KeyedText[] = [
      [`${p}.gem`, bundle.gem],
      [`${p}.title`, bundle.title],
      [`${p}.blurb`, bundle.blurb],
    ];
    if (bundle.creature) strings.push([`${p}.creature`, bundle.creature]);
    for (const item of bundle.items) strings.push([`${p}.item.${resourceSlug(item.name)}`, item.description]);
    for (const step of bundle.checklist ?? []) strings.push([`${p}.check.${step.id}`, step.text]);
    for (const link of bundle.downloads ?? []) {
      if (!PRODUCT_ONLY_LINK_NAMES.has(link.name)) strings.push([`${p}.download.${link.id}.name`, link.name]);
      strings.push([`${p}.download.${link.id}.description`, link.description]);
    }
    return strings;
  }),
  ...CATALOG_FALLBACK.newSection.map((entry): KeyedText => [newEntryKey(entry.name), entry.description]),
];

const bundleTranslatorFor = (catalog: Catalog) => (key: string) => {
  const value = catalog[key] ?? RESOURCE_BUNDLES_EN[key];
  return typeof value === 'string' ? value : key;
};

describe('Resources bundles: the bundled catalogue in every interface language', () => {
  it('gives every bundle item and every New entry a distinct key', () => {
    for (const bundle of CATALOG_FALLBACK.bundles) {
      const slugs = bundle.items.map((item) => resourceSlug(item.name));
      expect(slugs.every(Boolean), `${bundle.id}: an empty slug`).toBe(true);
      expect(new Set(slugs).size, `${bundle.id}: two items share a slug`).toBe(slugs.length);
    }
    const keys = CATALOG_FALLBACK.newSection.map((entry) => newEntryKey(entry.name));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('English declares exactly the strings the bundled catalogue shows, word for word', () => {
    const strings = bundleStrings();
    // 10 bundles x 4 labels, 68 items, 43 checklist steps, 23 setup links, 22 New entries.
    expect(strings.length).toBeGreaterThanOrEqual(200);
    expect(Object.keys(RESOURCE_BUNDLES_EN).sort()).toEqual(strings.map(([key]) => key).sort());
    for (const [key, english] of strings) expect(RESOURCE_BUNDLES_EN[key], key).toBe(english);
  });

  it.each(BUNDLE_OTHERS)('%s translates every bundle string, and none is an English copy', (_lang, catalog) => {
    for (const [key, english] of bundleStrings()) {
      const value = catalog[key];
      expect(typeof value, `${key} missing`).toBe('string');
      expect(String(value).trim(), `${key} is empty`).not.toBe('');
      expect(value, `${key} is the English text`).not.toBe(english);
    }
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(RESOURCE_BUNDLES_EN).sort());
  });

  it('shows a bundle in the interface language and keeps ids, names, URLs and costs', () => {
    const source = CATALOG_FALLBACK.bundles.find((b) => b.id === 'sapphire');
    if (!source) throw new Error('the sapphire bundle moved');
    const shown = localizeBundle(source, bundleTranslatorFor(RESOURCE_BUNDLES_RU));
    expect([shown.gem, shown.creature]).toEqual(['Сапфир', 'Кит']);
    expect(shown.title).toBe(RESOURCE_BUNDLES_RU['resourceBundles.bundle.sapphire.title']);
    const facts = (items: typeof source.items) => items.map((i) => [i.name, i.url, i.cost]);
    expect(facts(shown.items)).toEqual(facts(source.items));
    expect(shown.items.every((item, n) => item.description !== source.items[n].description)).toBe(true);
    expect(shown.checklist?.map((c) => [c.id, c.url])).toEqual(source.checklist?.map((c) => [c.id, c.url]));
    expect(shown.checklist?.every((step, n) => step.text !== source.checklist?.[n].text)).toBe(true);
    expect(shown.downloads?.map((d) => [d.id, d.url, d.kind])).toEqual(
      source.downloads?.map((d) => [d.id, d.url, d.kind]),
    );
    expect(shown.downloads?.[0].name).toBe('Anki для компьютера');
    // The data itself is untouched: search, My tools and the remote catalogue share it.
    expect(source.gem).toBe('Sapphire');

    const ja = localizeBundle(source, bundleTranslatorFor(RESOURCE_BUNDLES_JA));
    expect([ja.gem, ja.creature]).toEqual(['サファイア', 'クジラ']);
    const zh = localizeBundle(source, bundleTranslatorFor(RESOURCE_BUNDLES_ZH));
    expect([zh.gem, zh.creature]).toEqual(['蓝宝石', '鲸']);
  });

  it('keeps a product-only setup-link name as the product named it', () => {
    const ruby = CATALOG_FALLBACK.bundles.find((b) => b.id === 'ruby');
    if (!ruby) throw new Error('the ruby bundle moved');
    const shown = localizeBundle(ruby, bundleTranslatorFor(RESOURCE_BUNDLES_ZH));
    const link = shown.downloads?.find((d) => d.id === 'ringotan');
    expect(link?.name).toBe('Ringotan');
    expect(link?.description).toBe(RESOURCE_BUNDLES_ZH['resourceBundles.bundle.ruby.download.ringotan.description']);
  });

  it('shows New entries in the interface language', () => {
    const t = bundleTranslatorFor(RESOURCE_BUNDLES_JA);
    for (const entry of CATALOG_FALLBACK.newSection) {
      const shown = localizeNewEntry(entry, t);
      expect([shown.name, shown.url]).toEqual([entry.name, entry.url]);
      expect(shown.description).toBe(RESOURCE_BUNDLES_JA[newEntryKey(entry.name)]);
    }
  });

  it('keeps the English a fetched catalogue brings for anything it rewords or adds', () => {
    const t = bundleTranslatorFor(RESOURCE_BUNDLES_RU);
    const source = CATALOG_FALLBACK.bundles[0];
    const remote = {
      ...source,
      blurb: 'A reworded blurb from catalog.json.',
      items: [
        { ...source.items[0], description: 'A new description from catalog.json.' },
        { name: 'Brand New Tool', url: 'https://example.org', description: 'Added remotely.', cost: 'Free' as const },
      ],
    };
    const shown = localizeBundle(remote, t);
    expect(shown.gem).toBe('Сапфир');
    expect(shown.blurb).toBe('A reworded blurb from catalog.json.');
    expect(shown.items.map((i) => i.description)).toEqual([
      'A new description from catalog.json.',
      'Added remotely.',
    ]);

    const unknown = {
      id: 'remote-only',
      gem: 'Garnet',
      color: '#000000',
      icon: 'globe',
      title: 'Remote',
      blurb: 'Only in catalog.json.',
      items: [],
    };
    expect(localizeBundle(unknown, t)).toEqual(unknown);
    const entry = { ...CATALOG_FALLBACK.newSection[0], description: 'Updated remotely.' };
    expect(localizeNewEntry(entry, t).description).toBe('Updated remotely.');
  });
});
