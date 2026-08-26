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
