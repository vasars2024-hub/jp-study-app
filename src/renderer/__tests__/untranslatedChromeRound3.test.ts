// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { translate, type Catalog } from '../../shared/i18n/core';
import { GUM_LIBRARY_EN } from '../../shared/i18n/gumLibrary/en';
import { GUM_LIBRARY_JA } from '../../shared/i18n/gumLibrary/ja';
import { GUM_LIBRARY_RU } from '../../shared/i18n/gumLibrary/ru';
import { formatLabel } from '../components/media/gum/GumCards';
import { BUILT_IN_UI_THEMES, builtInUiThemeNameKey } from '../../shared/uiCustomization';
import { SCRAPER_UI_EN } from '../../shared/i18n/scraperUi/en';
import { SCRAPER_UI_JA } from '../../shared/i18n/scraperUi/ja';
import { SCRAPER_UI_ZH } from '../../shared/i18n/scraperUi/zh';
import { SCRAPER_UI_RU } from '../../shared/i18n/scraperUi/ru';
import { SCRAPER_SOURCE_MODES } from '../../shared/scraperSourceSettings';

/**
 * Round-3 sweep, the English left in ja/zh/ru that was interface text rather than content:
 * the Watch title page's format chip ("SPECIAL"), Theme Studio's built-in profile names
 * ("Default"), the Scraper's sidecar state pill ("offline") and profile source mode
 * ("streaming"). Titles, note-type fields, domains and product names stay as they are.
 */

const translator = (catalog: Catalog, fallback: Catalog) => (key: string) =>
  translate(key, undefined, { lang: 'ja', catalog, fallback });

describe('Watch: the release-format chip', () => {
  const ja = translator(GUM_LIBRARY_JA, GUM_LIBRARY_EN);
  const ru = translator(GUM_LIBRARY_RU, GUM_LIBRARY_EN);

  it('translates the formats AniList and MAL send, whatever their case', () => {
    expect(formatLabel(ja, 'SPECIAL')).toBe(GUM_LIBRARY_JA['gum.format.special']);
    expect(formatLabel(ja, 'Special')).toBe(GUM_LIBRARY_JA['gum.format.special']);
    expect(formatLabel(ru, 'TV_SHORT')).toBe(GUM_LIBRARY_RU['gum.format.tvShort']);
    expect(formatLabel(ru, 'Movie')).toBe(GUM_LIBRARY_RU['gum.format.movie']);
    expect(formatLabel(ja, 'MUSIC')).toBe(GUM_LIBRARY_JA['gum.format.music']);
  });

  it('says nothing for plain TV and passes universal or unknown formats through', () => {
    expect(formatLabel(ja, 'TV')).toBeNull();
    expect(formatLabel(ja, undefined)).toBeNull();
    expect(formatLabel(ja, 'OVA')).toBe('OVA');
    expect(formatLabel(ja, 'Something new')).toBe('Something new');
  });
});

describe('Theme Studio: built-in profile names', () => {
  it('names every built-in through a key while it keeps its own name', () => {
    for (const theme of BUILT_IN_UI_THEMES) {
      expect(builtInUiThemeNameKey(theme), theme.id).toMatch(/^theme\.builtin\./);
    }
  });

  it('shows a name the user typed as typed', () => {
    expect(builtInUiThemeNameKey({ id: 'default', name: 'My default' })).toBeNull();
    expect(builtInUiThemeNameKey({ id: 'custom-1', name: 'Default' })).toBeNull();
  });
});

describe('Scraper: sidecar state and source mode', () => {
  const STATES = ['ready', 'disabled', 'offline', 'error'];

  it.each([
    ['ja', SCRAPER_UI_JA],
    ['zh', SCRAPER_UI_ZH],
    ['ru', SCRAPER_UI_RU],
  ] as const)('%s has its own word for every state and mode', (_lang, catalog) => {
    for (const state of STATES) {
      const key = `scrApp.acq.state.${state}`;
      expect(typeof catalog[key], key).toBe('string');
      expect(catalog[key], key).not.toBe(SCRAPER_UI_EN[key]);
    }
    for (const mode of SCRAPER_SOURCE_MODES) {
      const key = `scraperMgmt.profiles.stat.mode.${mode}`;
      expect(typeof catalog[key], key).toBe('string');
      expect(catalog[key], key).not.toBe(SCRAPER_UI_EN[key]);
    }
    expect(catalog['scrApp.result.openedPreview']).toContain('{value}');
  });
});
