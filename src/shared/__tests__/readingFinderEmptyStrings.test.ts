// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CATALOGS, en } from '../i18n/catalogs/all';
import { UI_LANGS, translate } from '../i18n/core';

/**
 * The two strings behind Reading Finder's honest empty state.
 *
 * The defect they exist for, found by driving the surface rather than looking at
 * it: typing any term unmounts the catalogue grid — `ReadingFinderView.tsx` swaps
 * `ReadingSiteGrid` for `ReadingUnifiedDiscovery` on `query.trim()` — so
 * `reading.noMatches` could never render for a query. A nonsense term left "0
 * sites" standing beside nothing at all, under a panel whose status line read
 * "Enter a term to search your enabled sources." while the term was in the box.
 *
 * `unifiedSearch.status.idle` is reached in exactly one state in both of its
 * consumers: a term entered, no search run. `ReadingUnifiedDiscovery` only mounts
 * when `query.trim()` is truthy, and `UnifiedSearchPanel` short-circuits an empty
 * query to `unifiedSearch.plan.emptyQuery` before the switch. So the copy has to
 * describe that state, and this file is what stops it drifting back.
 *
 * Asserted on the RENDERED string, not on key presence: an untranslated
 * interpolation is invisible to both standard guards — a raw-key sweep sees a
 * real English sentence and a key-count check sees nothing missing.
 */
const NO_MATCH = 'reading.catalogueNoMatch';
const IDLE = 'unifiedSearch.status.idle';

const render = (key: string, lang: (typeof UI_LANGS)[number], vars?: Record<string, unknown>) =>
  translate(key, vars as never, { lang, catalog: CATALOGS[lang], fallback: en });

describe('reading finder empty-state strings', () => {
  it('carries both keys in all four catalogs', () => {
    for (const lang of UI_LANGS) {
      expect(CATALOGS[lang][NO_MATCH], `${NO_MATCH} missing from ${lang}`).toBeDefined();
      expect(CATALOGS[lang][IDLE], `${IDLE} missing from ${lang}`).toBeDefined();
    }
  });

  it('interpolates the query in every language, so the user is told what matched nothing', () => {
    for (const lang of UI_LANGS) {
      const text = render(NO_MATCH, lang, { query: 'zzqqxxnosuchthing' });
      expect(text, `${lang} left a raw key`).not.toBe(NO_MATCH);
      expect(text, `${lang} dropped {query}`).toContain('zzqqxxnosuchthing');
      expect(text, `${lang} left an uninterpolated brace`).not.toMatch(/\{query\}/);
    }
  });

  it('no longer asks for the term the user has already typed', () => {
    // The regression this file's second half exists for. The panel renders this
    // line only when a term is present, so an instruction to enter one is never
    // true — in any language.
    expect(render(IDLE, 'en')).not.toMatch(/enter a (term|query)/i);
    expect(render(IDLE, 'ru')).not.toMatch(/Введите/);
    expect(render(IDLE, 'ja')).not.toMatch(/入力してください/);
    expect(render(IDLE, 'zh')).not.toMatch(/输入搜索词/);
  });

  it('actually translates rather than falling back to English', () => {
    // The negative control for this file: if a locale's entry were deleted,
    // `translate` would fall back to `en` and these would collapse to equal.
    for (const lang of UI_LANGS.filter((l) => l !== 'en')) {
      expect(render(NO_MATCH, lang, { query: 'x' }), `${lang} renders the English sentence`)
        .not.toBe(render(NO_MATCH, 'en', { query: 'x' }));
      expect(render(IDLE, lang), `${lang} renders the English sentence`)
        .not.toBe(render(IDLE, 'en'));
    }
  });
});
