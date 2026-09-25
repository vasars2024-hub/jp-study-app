// @vitest-environment jsdom
/**
 * Audit r2 #8 — the Memory panel printed the settings catalogue's English
 * labels, categories and details whatever the UI language was.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { translate } from '../../shared/i18n/core';
import type { UiLang } from '../../shared/i18n/core';
import {
  domainCategory,
  domainConfirm,
  domainDetail,
  domainLabel,
} from '../components/filesapp/panels/memoryDomainText';
import { SETTINGS_DOMAINS, listDomainInventoryLocal } from '../storage/settingsCatalog';

function tFor(lang: UiLang) {
  return (key: string, values?: Record<string, string | number>) =>
    translate(key, values, { lang, catalog: CATALOGS[lang], fallback: CATALOGS.en });
}

beforeEach(() => {
  localStorage.clear();
});

describe('Memory panel domain text', () => {
  it('gives every catalogue domain, category and clear prompt a translation', () => {
    const ja = tFor('ja');
    for (const def of SETTINGS_DOMAINS) {
      const row = { ...def, detail: '' };
      expect(domainLabel(row, ja), def.id).not.toBe(def.label);
      expect(domainCategory(row, ja), def.id).not.toBe(def.category);
      if (def.clearConfirm) expect(domainConfirm(row, ja), def.id).not.toBe(def.clearConfirm);
    }
  });

  it('keeps English identical to the catalogue, so nothing changes for an English user', () => {
    const en = tFor('en');
    for (const def of SETTINGS_DOMAINS) {
      expect(domainLabel({ ...def }, en)).toBe(def.label);
      if (def.clearConfirm) expect(domainConfirm({ ...def }, en)).toBe(def.clearConfirm);
    }
  });

  it('translates the computed detail and keeps a storage key name as data', () => {
    localStorage.setItem('jp-flashcard-deck', JSON.stringify({ cards: [{}, {}, {}] }));
    localStorage.setItem('jp-app-zoom', '1.25');
    const rows = listDomainInventoryLocal();
    const rowOf = (id: string) => {
      const found = rows.find((r) => r.id === id);
      if (!found) throw new Error(`no ${id} row`);
      return found;
    };
    const ru = tFor('ru');
    expect(domainDetail(rowOf('flashcards'), ru)).toBe('Карточки: 3');
    expect(domainDetail(rowOf('display'), ru)).toBe('Масштаб 125%');
    expect(domainDetail(rowOf('csv'), ru)).toBe('Пусто');
  });
});
