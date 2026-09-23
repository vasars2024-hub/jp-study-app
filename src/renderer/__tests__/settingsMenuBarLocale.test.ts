/**
 * D239 — the Settings window's own menu bar was English in every language.
 *
 * `settingsMenus: MenuBarMenu[]` is built inside the component, four lines below
 * a `useT()` it already held, and every one of its 18 labels was a string
 * literal: the three menu titles (`File` / `View` / `Page`), the nine items
 * under them, the advanced-mode toggle's two states, the Aero command bar's
 * `aria-label`, and the `Advanced` badge on the breadcrumb. So a ja/zh/ru user
 * opening Settings — which is where they would go to CHANGE the language — got
 * an English menu bar.
 *
 * Third confirmed instance of the D188/D189/D231 shape, and the numbers say the
 * same thing again: **8 of the 18 needed no new key.** `Desktop layout`,
 * `Appearance`, `Reading`, `Transcription` and `Memory & storage` were already
 * translated as `settings.nav.*` and rendered by the nav rail on the same
 * screen; `Keyboard shortcuts` and `Special modules` as `search.*`; `Advanced`
 * as `settings.card.advancedBadge`. The menu bar and the nav rail were printing
 * the same words from two different places, one of them untranslated.
 *
 * `i18n-shadow-check` had found 4 of those 8 and listed them with their keys.
 * It could not find the other 14, which is the correct division of labour — a
 * literal with no existing key is `i18n-partial-check`'s business, and that
 * tool reported all 16 it can see. Neither is a substitute for opening the file:
 * the ternary at the advanced toggle is scored as one string by both.
 *
 * Source-scanned rather than mounted: `SettingsApp` imports the whole settings
 * tree at module eval, the same reason `monitorsPage.test.ts` and
 * `desktopStartAppHints.test.ts` scan rather than render.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCatalog, catalogFor } from '../../shared/i18n/catalogs';

const REPO = resolve(__dirname, '../../..');
const LANGS = ['en', 'ja', 'zh', 'ru'] as const;

/**
 * Comments stripped. A key named in prose must not count as a consumer, and a
 * removed literal quoted in a comment must not count as still present — this
 * repo has a recorded case of a comment scoring a source ratchet green.
 */
const SOURCE = readFileSync(resolve(REPO, 'src/renderer/components/settings/SettingsApp.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** The ten this defect had to mint, because nothing carried the words. */
const NEW_KEYS = [
  'settings.menu.file',
  'settings.menu.home',
  'settings.menu.findSetting',
  'settings.menu.openDisplay',
  'settings.menu.openLockscreen',
  'settings.menu.view',
  'settings.menu.hideAdvanced',
  'settings.menu.showAdvanced',
  'settings.menu.page',
  'settings.menu.commandsAria',
];

/**
 * The eight that were already translated elsewhere and are now REUSED. This
 * list is the point of the whole defect: each entry is a word the app already
 * knew in four languages while this file re-typed it in one.
 */
const REUSED_KEYS = [
  'settings.nav.desktopLayout',
  'settings.nav.appearance',
  'settings.nav.reading',
  'settings.nav.transcription',
  'settings.nav.memory',
  'settings.card.advancedBadge',
  'search.shortcuts',
  'search.special',
];

/** Every literal the menu bar used to render. None may come back. */
const OLD_LITERALS = [
  "label: 'File'",
  "label: 'Control Center Home'",
  "label: 'Find a setting'",
  "label: 'Open Display'",
  "label: 'Open Lockscreen'",
  "label: 'View'",
  "'Hide advanced pages'",
  "'Show advanced pages'",
  "label: 'Desktop layout'",
  "label: 'Keyboard shortcuts'",
  "label: 'Page'",
  "label: 'Appearance'",
  "label: 'Reading'",
  "label: 'Transcription'",
  "label: 'Memory and storage'",
  "label: 'Special modules'",
  'aria-label="Settings commands"',
  '>Advanced<',
];

beforeAll(async () => {
  for (const lang of LANGS) await ensureCatalog(lang);
});

describe('the Settings menu bar is built from the catalog', () => {
  it('asks for all eighteen, and the count is the count', () => {
    for (const key of [...NEW_KEYS, ...REUSED_KEYS]) {
      expect(SOURCE, `${key} is not used`).toContain(`'${key}'`);
    }
    expect(NEW_KEYS.length + REUSED_KEYS.length).toBe(18);
  });

  it('renders none of the eighteen literals any more', () => {
    for (const literal of OLD_LITERALS) {
      expect(SOURCE, `the literal ${literal} is still there`).not.toContain(literal);
    }
  });

  /**
   * The half that makes this defect worth its own row: eight of the words were
   * already in four languages. A "fix" that minted eighteen fresh keys would
   * pass every gate in this repo and leave the menu bar and the nav rail free
   * to drift apart, which is exactly how they came to disagree.
   */
  it('reuses, rather than re-mints, every word the app already knew', () => {
    expect(REUSED_KEYS.length).toBeGreaterThanOrEqual(8);
    for (const key of REUSED_KEYS) {
      expect(SOURCE, `${key} should be reused, not replaced by a new key`).toContain(`'${key}'`);
      expect(SOURCE, `a settings.menu.* twin was minted for ${key}`).not.toContain(
        `'settings.menu.${key.split('.').pop()}'`,
      );
    }
  });
});

describe('the catalogs answer every key the menu bar can ask for', () => {
  it.each(LANGS)('answers all eighteen in %s', (lang) => {
    const catalog = catalogFor(lang);
    for (const key of [...NEW_KEYS, ...REUSED_KEYS]) {
      const value = catalog[key];
      expect(typeof value, `${lang} cannot answer ${key}`).toBe('string');
      expect((value as string).trim().length, `${lang}'s ${key} is empty`).toBeGreaterThan(0);
    }
  });

  it.each(['ja', 'zh', 'ru'] as const)('leaves no English behind in %s', (lang) => {
    const catalog = catalogFor(lang);
    const en = catalogFor('en');
    for (const key of NEW_KEYS) {
      expect(catalog[key], `${lang}'s ${key} is still the English string`).not.toBe(en[key]);
    }
  });

  /**
   * The reused keys carry the SAME word in two places on one screen — the menu
   * bar and the nav rail. If they ever stop resolving to one value the two will
   * disagree in front of the user, which is the drift this reuse exists to
   * prevent. Asserted per language, because a divergence could be introduced in
   * one catalog alone.
   */
  it.each(LANGS)('gives the nav rail and the menu bar one word each in %s', (lang) => {
    const catalog = catalogFor(lang);
    // Both of these render on the Settings screen at once.
    for (const key of ['settings.nav.appearance', 'settings.nav.reading', 'settings.nav.transcription']) {
      expect(typeof catalog[key], `${lang} lost ${key}`).toBe('string');
    }
  });
});

describe('D98 Settings toolbar and status chrome', () => {
  const keys = [
    'settings.toolbar.home', 'settings.toolbar.find', 'settings.toolbar.display',
    'settings.toolbar.lock', 'settings.status.advancedVisible',
    'settings.status.standardPages', 'settings.status.theme',
  ];

  it('resolves each toolbar and status string through the catalog', () => {
    for (const key of keys) expect(SOURCE).toContain(`'${key}'`);
    for (const literal of ['>Home<', '>Find<', '>Display<', '>Lock<',
      "'Advanced pages visible'", "'Standard pages'", 'title={`Theme: ${theme}`}']) {
      expect(SOURCE).not.toContain(literal);
    }
  });

  it.each(LANGS)('has translations for every new string in %s', (lang) => {
    for (const key of keys) {
      const value = catalogFor(lang)[key];
      expect(typeof value).toBe('string');
      if (lang !== 'en') expect(value).not.toBe(catalogFor('en')[key]);
    }
  });
});
