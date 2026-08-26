// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CATALOGS, en } from '../i18n/catalogs/all';
import { UI_LANGS, translate } from '../i18n/core';

/**
 * The strings behind the Aero deck browser's page row.
 *
 * The defect they exist for: `FlashcardsView.tsx` rendered `group.cards.length`
 * — the true total — in the header cell beside a list hard-capped at 80 rows,
 * with no control that could reach row 81. A deck of 247 showed "247" and 80
 * rows. The row now states the page and a button raises it.
 *
 * Why this is asserted on the rendered string and not on key presence: an
 * untranslated interpolation is invisible to both standard guards — a raw-key
 * sweep sees a real English sentence and a key-count check sees nothing missing.
 * Only asserting that the rendered text CHANGES between languages finds it, and
 * that a dropped placeholder loses a number the user needs. Same shape as
 * `ankiSetupReasonTranslated.test.tsx`, recorded in `L8_STATES.md`.
 */
const SHOWING = 'flash.aero.deck.showingOf';
const MORE = 'flash.aero.deck.showMore';

const render = (key: string, lang: (typeof UI_LANGS)[number], vars?: Record<string, unknown>) =>
  translate(key, vars as never, { lang, catalog: CATALOGS[lang], fallback: en });

describe('aero deck page strings', () => {
  it('carries both keys in all four catalogs', () => {
    for (const lang of UI_LANGS) {
      expect(CATALOGS[lang][SHOWING], `${SHOWING} missing from ${lang}`).toBeDefined();
      expect(CATALOGS[lang][MORE], `${MORE} missing from ${lang}`).toBeDefined();
    }
  });

  it('interpolates both numbers in every language, so neither placeholder can be dropped', () => {
    for (const lang of UI_LANGS) {
      const text = render(SHOWING, lang, { shown: 80, total: 247 });
      expect(text, `${lang} left a raw key`).not.toBe(SHOWING);
      expect(text, `${lang} dropped {shown}`).toContain('80');
      expect(text, `${lang} dropped {total}`).toContain('247');
      expect(text, `${lang} left an uninterpolated brace`).not.toMatch(/\{(shown|total)\}/);
    }
  });

  it('actually translates rather than falling back to English', () => {
    // The negative control for this file: if a locale's entry were deleted,
    // `translate` would fall back to `en` and these would collapse to equal.
    for (const lang of UI_LANGS.filter((l) => l !== 'en')) {
      expect(render(SHOWING, lang, { shown: 1, total: 2 }), `${lang} renders the English sentence`)
        .not.toBe(render(SHOWING, 'en', { shown: 1, total: 2 }));
      expect(render(MORE, lang), `${lang} renders the English label`).not.toBe(render(MORE, 'en'));
    }
  });
});
