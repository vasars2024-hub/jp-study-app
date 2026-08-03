/**
 * The half TypeScript cannot cover: `Record<Union, string>` proves every enum variant is
 * mapped, but not that the key it is mapped to exists. A missing key renders as the key
 * itself — "mediaWorkspace.sidecar.ready" in the status bar — which is exactly the class
 * of leak these maps were introduced to stop.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS, en } from '../i18n/catalogs/all';
import { UI_LANGS, type UiLang } from '../i18n/core';
import {
  MINING_HISTORY_STATUS_KEY,
  SIDECAR_STATUS_KEY,
} from '../mediaWorkspaceLabels';

const MAPS = {
  'sidecar status': SIDECAR_STATUS_KEY,
  'mining history status': MINING_HISTORY_STATUS_KEY,
} as const;

describe('media workspace enum labels', () => {
  for (const [name, map] of Object.entries(MAPS)) {
    const entries = Object.entries(map);

    it(`maps every ${name} to a real English key`, () => {
      expect(entries.length).toBeGreaterThan(0);
      for (const [variant, key] of entries) {
        expect(en[key], `${name} "${variant}" -> ${key}`).toBeTruthy();
      }
    });

    it(`has a translation for every ${name} in all four languages`, () => {
      for (const lang of UI_LANGS as readonly UiLang[]) {
        for (const [variant, key] of entries) {
          expect(
            CATALOGS[lang][key],
            `${name} "${variant}" -> ${key} missing in ${lang}`,
          ).toBeTruthy();
        }
      }
    });

    it(`never maps two ${name} variants to the same label key`, () => {
      const keys = entries.map(([, key]) => key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }

  /**
   * The English label may legitimately equal the enum token — "sidecar ready" is just
   * correct English, and that is where the token came from. The defect was that JA, ZH
   * and RU readers got that English word, so those are the catalogs to assert on.
   */
  it('never leaves the raw enum token in a non-English catalog', () => {
    const translated = (UI_LANGS as readonly UiLang[]).filter((lang) => lang !== 'en');
    for (const map of [SIDECAR_STATUS_KEY, MINING_HISTORY_STATUS_KEY]) {
      for (const [variant, key] of Object.entries(map)) {
        for (const lang of translated) {
          expect(
            CATALOGS[lang][key],
            `${key} in ${lang} is still the raw token "${variant}"`,
          ).not.toBe(variant);
        }
      }
    }
  });
});
