// @vitest-environment jsdom
/**
 * The re-import note on a Yomitan dictionary imported before the term bank's
 * rules column was read (components/dictionary/DictRulesReimportNote.tsx): shown
 * only for a user-imported term dictionary without the `rulesColumn` mark, and
 * its strings are a lazy pack complete in all four languages.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DictRulesReimportNote, {
  loadDictRulesStrings,
  needsRulesReimport,
} from '../components/dictionary/DictRulesReimportNote';
import { DICT_RULES_UI_EN } from '../../shared/i18n/dictRulesUi/en';
import { DICT_RULES_UI_JA } from '../../shared/i18n/dictRulesUi/ja';
import { DICT_RULES_UI_RU } from '../../shared/i18n/dictRulesUi/ru';
import { DICT_RULES_UI_ZH } from '../../shared/i18n/dictRulesUi/zh';
import type { YomitanDictInfo } from '../../shared/types';

const BASE: YomitanDictInfo = {
  id: 'user-dict',
  title: 'User dict',
  revision: '1',
  priority: 1,
  hasTerms: true,
  hasPitch: false,
  hasFreq: false,
  importedAt: 0,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('needsRulesReimport', () => {
  it('asks only a user-imported term dictionary that predates the rules column', () => {
    expect(needsRulesReimport(BASE)).toBe(true);
    expect(needsRulesReimport({ ...BASE, rulesColumn: true })).toBe(false);
    expect(needsRulesReimport({ ...BASE, bundled: true })).toBe(false);
    expect(needsRulesReimport({ ...BASE, hasTerms: false })).toBe(false);
  });
});

describe('DictRulesReimportNote', () => {
  it('renders the note for an old store and nothing for a current one', () => {
    act(() => root.render(createElement(DictRulesReimportNote, { dict: BASE })));
    const note = host.querySelector('[data-dict-rules-reimport="user-dict"]');
    expect(note?.textContent).toBe(DICT_RULES_UI_EN['dictRules.reimport.note']);

    act(() => root.render(createElement(DictRulesReimportNote, { dict: { ...BASE, rulesColumn: true } })));
    expect(host.textContent).toBe('');
  });

  it('has every key in all four languages, translated', async () => {
    const keys = Object.keys(DICT_RULES_UI_EN).sort();
    for (const pack of [DICT_RULES_UI_JA, DICT_RULES_UI_ZH, DICT_RULES_UI_RU]) {
      expect(Object.keys(pack).sort()).toEqual(keys);
      for (const key of keys) expect(pack[key]).not.toBe(DICT_RULES_UI_EN[key]);
    }
    await expect(loadDictRulesStrings('ja')).resolves.toBeUndefined();
  });
});
