/**
 * Settings > Models & dictionaries showed 27 of 28 asset descriptions in English
 * under Japanese, Chinese and Russian: `StoragePage` falls back to the English
 * `description` when an asset has no `descriptionKey`, and only one did. Every
 * catalogued asset now carries a key, translated in all four languages.
 */
import { describe, expect, it } from 'vitest';
import { ASSET_CATALOG } from '../assetRegistry';
import { CATALOGS } from '../i18n/catalogs/all';
import { UI_LANGS } from '../i18n/core';

describe('asset descriptions are translated', () => {
  it('every asset has a descriptionKey that every language defines', () => {
    for (const asset of ASSET_CATALOG) {
      expect(asset.descriptionKey, asset.id).toBeTruthy();
      for (const lang of UI_LANGS) {
        expect(CATALOGS[lang][asset.descriptionKey as string], `${lang} ${asset.id}`).toBeTruthy();
      }
    }
  });

  it('the English text is the registry text, and the others are real translations', () => {
    for (const asset of ASSET_CATALOG) {
      const key = asset.descriptionKey as string;
      expect(CATALOGS.en[key], asset.id).toBe(asset.description);
      for (const lang of UI_LANGS.filter((l) => l !== 'en')) {
        expect(CATALOGS[lang][key], `${lang} ${asset.id}`).not.toBe(asset.description);
      }
    }
  });
});
