// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CATALOGS, en } from '../i18n/catalogs/all';
import { UI_LANGS, translate } from '../i18n/core';

/**
 * The reasons behind Translate's two disabled controls.
 *
 * The defect they exist for: the category-8 sweep found `button.btn "Ask the
 * Agent"` disabled with no `title`, no `aria-describedby` and no explanation
 * anywhere on screen — a mute pair, a control the user cannot act on and cannot
 * find out why. Its only neighbour is a button labelled "Translate", which is
 * why the sweep caught it here and not on Grammar or Scraper, where the
 * neighbouring button labels happen to be long enough to read as an explanation.
 *
 * `busy` is deliberately not given a reason: the label already becomes
 * "Working…" and `.tr-status` renders below it. Only the empty-input case is
 * silent, so only that one is named.
 */
const KEYS = ['translate.askAgent.needsText', 'translate.run.needsText'] as const;

const render = (key: string, lang: (typeof UI_LANGS)[number]) =>
  translate(key, undefined as never, { lang, catalog: CATALOGS[lang], fallback: en });

/**
 * The Aero branch's chrome, which was eight raw English literals in JSX.
 *
 * Why a test rather than a live check: the Aero toolbar and status bar only
 * render under the Aero shell, and the running app is on `forest-night`, so
 * these strings cannot be read off the live DOM without flipping a persisted
 * setting. A raw-key sweep would not have caught them either — `From`, `To`,
 * `Ready`, `Complete` and `Error` are real English words, not keys.
 */
const CHROME = [
  'translate.toolbar.label',
  'translate.lang.from',
  'translate.lang.to',
  'translate.status.ready',
  'translate.status.complete',
  'translate.status.error',
] as const;

describe('translate aero chrome strings', () => {
  it('carries every chrome key in all four catalogs and renders it', () => {
    for (const lang of UI_LANGS) {
      for (const key of CHROME) {
        expect(CATALOGS[lang][key], `${key} missing from ${lang}`).toBeDefined();
        expect(render(key, lang), `${lang} left a raw key for ${key}`).not.toBe(key);
      }
    }
  });

  it('interpolates the language pair and the character count in every language', () => {
    for (const lang of UI_LANGS) {
      const pair = translate(
        'translate.status.pair',
        { source: 'Japanese', target: 'English' } as never,
        { lang, catalog: CATALOGS[lang], fallback: en },
      );
      expect(pair, `${lang} dropped {source}`).toContain('Japanese');
      expect(pair, `${lang} dropped {target}`).toContain('English');
      expect(pair, `${lang} left an uninterpolated brace`).not.toMatch(/\{(source|target)\}/);

      const chars = translate(
        'translate.status.sourceChars',
        { count: 137 } as never,
        { lang, catalog: CATALOGS[lang], fallback: en },
      );
      expect(chars, `${lang} dropped {count}`).toContain('137');
      expect(chars, `${lang} left an uninterpolated brace`).not.toMatch(/\{count\}/);
    }
  });

  it('actually translates the words a raw-key sweep would miss', () => {
    // `From`, `To`, `Ready`, `Complete` and `Error` are real English words, so
    // the only way to prove they were adopted is that the locale differs.
    for (const lang of UI_LANGS.filter((l) => l !== 'en')) {
      for (const key of CHROME) {
        expect(render(key, lang), `${lang} renders the English word for ${key}`)
          .not.toBe(render(key, 'en'));
      }
    }
  });
});

describe('translate disabled reasons', () => {
  it('carries both reasons in all four catalogs', () => {
    for (const lang of UI_LANGS) {
      for (const key of KEYS) {
        expect(CATALOGS[lang][key], `${key} missing from ${lang}`).toBeDefined();
      }
    }
  });

  it('renders a real sentence rather than the bare key', () => {
    for (const lang of UI_LANGS) {
      for (const key of KEYS) {
        const text = render(key, lang);
        expect(text, `${lang} left a raw key for ${key}`).not.toBe(key);
        // The harness's own bar: an explanation under 12 characters does not
        // count as one, so a reason that would still read as mute is a failure.
        expect(text.length, `${lang} ${key} is too short to be an explanation`)
          .toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('actually translates rather than falling back to English', () => {
    // The negative control: delete a locale's entry and `translate` falls back
    // to `en`, collapsing these to equal.
    for (const lang of UI_LANGS.filter((l) => l !== 'en')) {
      for (const key of KEYS) {
        expect(render(key, lang), `${lang} renders the English sentence for ${key}`)
          .not.toBe(render(key, 'en'));
      }
    }
  });
});
