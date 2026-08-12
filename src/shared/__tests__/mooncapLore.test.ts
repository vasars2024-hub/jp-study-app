import { describe, expect, it } from 'vitest';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { ru } from '../i18n/catalogs/ru';
import { zh } from '../i18n/catalogs/zh';
import type { Catalog, UiLang } from '../i18n/core';
import { MOONCAP_PHASE_LORE_EN } from '../i18n/mooncapLore/en';
import { MOONCAP_PHASE_LORE_JA } from '../i18n/mooncapLore/ja';
import { MOONCAP_PHASE_LORE_RU } from '../i18n/mooncapLore/ru';
import { MOONCAP_PHASE_LORE_ZH } from '../i18n/mooncapLore/zh';

const PHASE_FIELDS = ['name', 'age', 'condition', 'observation'] as const;
const EXPECTED_KEYS = Array.from({ length: 50 }, (_, index) => index + 1)
  .flatMap((phase) => PHASE_FIELDS.map((field) => `mooncap.phase.${phase}.${field}`))
  .sort();

const CANONICAL_LORE: Record<UiLang, Catalog> = {
  en: MOONCAP_PHASE_LORE_EN,
  ja: MOONCAP_PHASE_LORE_JA,
  zh: MOONCAP_PHASE_LORE_ZH,
  ru: MOONCAP_PHASE_LORE_RU,
};

const RUNTIME_CATALOGS: Record<UiLang, Catalog> = { en, ja, zh, ru };

describe('canonical Mooncap lore', () => {
  it.each(Object.entries(CANONICAL_LORE) as [UiLang, Catalog][])(
    '%s keeps all 50 phases in key parity with the runtime catalog',
    (lang, lore) => {
      expect(Object.keys(lore).sort()).toEqual(EXPECTED_KEYS);

      for (const key of EXPECTED_KEYS) {
        expect(lore[key], `${lang}:${key} should be non-empty`).toEqual(expect.any(String));
        expect((lore[key] as string).trim(), `${lang}:${key} should be non-empty`).not.toBe('');
        expect(RUNTIME_CATALOGS[lang][key], `${lang}:${key} should use canonical lore`).toBe(
          lore[key],
        );
      }
    },
  );
});
