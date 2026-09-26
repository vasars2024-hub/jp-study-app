/**
 * Blanc i18n (round-2 coverage F): every Blanc tool has a name and a one-line description
 * in every UI language. The launcher, the master search and the settings lists used to
 * print the registry's English label and an English description table in every language.
 */
import { describe, expect, it } from 'vitest';
import { BLANC_TOOL_LABEL_IDS, blancToolLabelKey } from '../components/blanc/blancToolLabels';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { isDeveloperOnlyTool } from '../components/blanc/blancDeveloperTools';

/** Tools the registry has but Blanc does not list in its launcher (they have no description). */
const REGISTRY_ONLY = new Set(['media', 'flashcards', 'statistics', 'epub-mining', 'anki-deck', 'mono-blocks']);

describe('Blanc tool names and descriptions', () => {
  for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
    it(`are all present in ${lang}`, () => {
      const catalog = CATALOGS[lang] as Record<string, unknown>;
      const missing: string[] = [];
      for (const id of BLANC_TOOL_LABEL_IDS) {
        const key = blancToolLabelKey(id) ?? '';
        if (typeof catalog[key] !== 'string') missing.push(key);
        if (!REGISTRY_ONLY.has(id) && typeof catalog[`${key}.desc`] !== 'string') missing.push(`${key}.desc`);
      }
      expect(missing).toEqual([]);
    });
  }

  it('the implementation-coverage map is a developer tool', () => {
    expect(isDeveloperOnlyTool('coverage')).toBe(true);
    expect(isDeveloperOnlyTool('calculator')).toBe(false);
  });
});
