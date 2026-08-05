import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS, en } from '../i18n/catalogs/all';
import {
  LANG_TAGS,
  UI_LANGS,
  isUiLang,
  resetMissingWarnings,
  translate,
  type CatalogEntry,
  type UiLang,
} from '../i18n/core';

const t = (key: string, lang: UiLang, vars?: Record<string, string | number>, onMissing?: (k: string, l: UiLang) => void) =>
  translate(key, vars, { lang, catalog: CATALOGS[lang], fallback: en, onMissing });

beforeEach(() => {
  resetMissingWarnings();
});

describe('translate', () => {
  it('resolves a key in each language', () => {
    expect(t('common.download', 'en')).toBe('Download');
    expect(t('common.download', 'ja')).toBe('ダウンロード');
    expect(t('common.download', 'zh')).toBe('下载');
    expect(t('common.download', 'ru')).toBe('Скачать');
  });

  it('interpolates variables', () => {
    expect(t('storage.installedSize', 'en', { size: '2.1 GB' })).toBe('2.1 GB installed');
    expect(t('storage.removed', 'ru', { name: 'Whisper Base' })).toContain('Whisper Base');
  });

  it('leaves an unknown placeholder alone rather than printing undefined', () => {
    expect(t('storage.installedSize', 'en', {})).toBe('{size} installed');
  });

  it('localises numbers with the active locale', () => {
    // ru groups thousands with a space, en with a comma.
    expect(t('storage.modelCount', 'en', { count: 1234 })).toBe('1,234 models installed');
    expect(t('storage.modelCount', 'ru', { count: 1234 })).toMatch(/1\s234/);
  });
});

describe('fallback', () => {
  it('falls back to English for a key the language is missing', () => {
    // 'common.save' exists everywhere, so use a key only English has.
    const partial = { lang: 'ru' as UiLang, catalog: {}, fallback: en };
    expect(translate('common.download', undefined, partial)).toBe('Download');
  });

  it('warns once per missing key, not once per render', () => {
    const onMissing = vi.fn();
    const opts = { lang: 'ru' as UiLang, catalog: {}, fallback: en, onMissing };
    translate('common.download', undefined, opts);
    translate('common.download', undefined, opts);
    translate('common.download', undefined, opts);
    expect(onMissing).toHaveBeenCalledTimes(1);
  });

  it('shows the key itself when English is missing it too, so the bug is findable', () => {
    expect(translate('nope.not.a.key', undefined, { lang: 'en', catalog: {}, fallback: {} })).toBe(
      'nope.not.a.key',
    );
  });
});

describe('plurals', () => {
  it('handles English one/other', () => {
    expect(t('storage.modelCount', 'en', { count: 1 })).toBe('1 model installed');
    expect(t('storage.modelCount', 'en', { count: 2 })).toBe('2 models installed');
    expect(t('storage.modelCount', 'en', { count: 0 })).toBe('0 models installed');
  });

  it('handles the Russian 1 / 2-4 / 5+ forms', () => {
    // The whole reason plural categories exist rather than a bare count check:
    // Russian needs three forms, and 21 behaves like 1 while 11 does not.
    expect(t('storage.modelCount', 'ru', { count: 1 })).toBe('Установлена 1 модель');
    expect(t('storage.modelCount', 'ru', { count: 3 })).toBe('Установлено 3 модели');
    expect(t('storage.modelCount', 'ru', { count: 7 })).toBe('Установлено 7 моделей');
    expect(t('storage.modelCount', 'ru', { count: 11 })).toBe('Установлено 11 моделей');
    expect(t('storage.modelCount', 'ru', { count: 21 })).toBe('Установлена 21 модель');
  });

  it('uses the single form for languages without plural inflection', () => {
    expect(t('storage.modelCount', 'ja', { count: 1 })).toBe('1 個のモデルをインストール済み');
    expect(t('storage.modelCount', 'ja', { count: 5 })).toBe('5 個のモデルをインストール済み');
    expect(t('storage.modelCount', 'zh', { count: 5 })).toBe('已安装 5 个模型');
  });
});

describe('catalog hygiene', () => {
  it('gives every language a tag Intl accepts', () => {
    for (const lang of UI_LANGS) {
      expect(() => new Intl.PluralRules(LANG_TAGS[lang])).not.toThrow();
    }
  });

  /**
   * Plurals must be the OBJECT form, never a raw ICU string.
   *
   * `isPluralForms` (core.ts) only recognises an object carrying `other`. A string entry falls
   * through to `interpolate`, whose placeholder regex is `/\{(\w+)\}/g` — which cannot match
   * `{count,` (the comma) or `{# result}` (the `#` and the spaces). So an ICU template is
   * returned VERBATIM and the user reads `{count, plural, one {# result} other {# results}}`
   * off the screen.
   *
   * 33 entries across the four catalogs were shipping in that state, on live surfaces. Neither
   * existing gate could see it: `i18n-check.cjs` and the missing-key block below both ask only
   * whether every language HAS the key and whether its value is a non-empty string — and a
   * broken ICU template is a perfectly good non-empty string.
   */
  it('never writes a plural as a raw ICU string', () => {
    const offenders: string[] = [];
    for (const lang of UI_LANGS) {
      for (const [key, value] of Object.entries(CATALOGS[lang])) {
        if (typeof value === 'string' && value.includes(', plural,')) offenders.push(`${lang}:${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives every plural object an `other` arm, which is what makes it a plural at all', () => {
    // Without `other`, `isPluralForms` returns false and the object falls through to
    // interpolate() as a non-string — a silent empty render rather than an error.
    const missing: string[] = [];
    for (const lang of UI_LANGS) {
      for (const [key, value] of Object.entries(CATALOGS[lang])) {
        if (value && typeof value === 'object' && !('other' in value)) missing.push(`${lang}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('never leaves a translated catalog with keys English does not have', () => {
    // A stray key in ja/zh/ru is dead weight — usually a typo of a real key,
    // which would silently fall back to English forever.
    for (const lang of UI_LANGS) {
      for (const key of Object.keys(CATALOGS[lang])) {
        expect(en[key], `${lang} has orphan key ${key}`).toBeDefined();
      }
    }
  });

  it('keeps Russian plural entries complete', () => {
    for (const [key, entry] of Object.entries(CATALOGS.ru)) {
      if (typeof entry === 'object') {
        expect(entry.one, `${key} missing 'one'`).toBeDefined();
        expect(entry.few, `${key} missing 'few'`).toBeDefined();
        expect(entry.many, `${key} missing 'many'`).toBeDefined();
      }
    }
  });

  it('validates language ids', () => {
    expect(isUiLang('ru')).toBe(true);
    expect(isUiLang('de')).toBe(false);
    expect(isUiLang(null)).toBe(false);
  });

  it('gives every English key a translation in ja/zh/ru', () => {
    // The reverse of the orphan-key check above: a key present in en but
    // missing from another catalog silently falls back to English at runtime
    // (by design), so nothing *breaks* — but a hand-authored batch of keys is
    // exactly how one gets dropped from one language without anyone noticing.
    // This turns that into a loud, immediate test failure instead.
    const enKeys = Object.keys(en);
    for (const lang of UI_LANGS) {
      if (lang === 'en') continue;
      const missing = enKeys.filter((k) => CATALOGS[lang][k] === undefined);
      expect(missing, `${lang} is missing translations for: ${missing.join(', ')}`).toEqual([]);
    }
  });

  it('actually translates the grammar taxonomy, not just fills the keys in', () => {
    /*
     * Key-presence checks (this file's test above, and tools/i18n-check.cjs)
     * both report clean when a block is spread into all four catalogs as one
     * shared object.
     *
     * The taxonomy block is authored as four separate per-language records
     * specifically to avoid that. This asserts it stayed that way. The
     * catalog-wide version of this check is the next test — this one stays as
     * the narrow, named guard for the block that got it right first.
     */
    const taxonomyKeys = Object.keys(en).filter(
      (k) =>
        k.startsWith('grammar.cat') ||
        k.startsWith('grammar.filter') ||
        k.startsWith('grammar.register') ||
        k.startsWith('grammar.flag'),
    );
    expect(taxonomyKeys.length).toBeGreaterThan(150);

    const untranslated = taxonomyKeys.filter(
      (k) =>
        CATALOGS.ja[k] === en[k] && CATALOGS.zh[k] === en[k] && CATALOGS.ru[k] === en[k],
    );
    expect(
      untranslated,
      `these grammar keys are still English in every language: ${untranslated.join(', ')}`,
    ).toEqual([]);
  });

  it('does not let a new block of English be spread into every catalog', () => {
    /*
     * The catalog-wide form of the check above, added 2026-08-04 for audit F8.
     *
     * The comment this replaced said it plainly: GAME_ARENA_CHROME left "105
     * games.* keys as English in ja/zh/ru while every checker says fully
     * translated", and the guard was scoped to grammar.* on purpose because the
     * rest of the catalog was not clean. Measured at the time: 309 such keys —
     * GAME_ARENA_CHROME (109) plus MOONCAP_PHASE_LORE (200) — both since split
     * into per-language modules under src/shared/i18n/{gameArena,mooncapLore}/.
     *
     * ~110 keys per language are legitimately identical to English (product
     * names, pure format strings, the Frutiger Aero easter egg), so this is a
     * ratchet, not a zero: the accepted set lives in
     * tools/i18n-untranslated-baseline.json — the same file tools/i18n-check.cjs
     * reads, so the CLI gate and this test can never disagree — and anything
     * NEW fails here. Adding a whole block to that baseline at once is the
     * exact move that produced F8; add entries one at a time, with a reason.
     */
    const baseline = JSON.parse(
      readFileSync(new URL('../../../tools/i18n-untranslated-baseline.json', import.meta.url), 'utf8'),
    ) as Record<string, string[]>;

    const valueOf = (entry: CatalogEntry): string =>
      typeof entry === 'string' ? entry : JSON.stringify(entry);

    const enKeys = Object.keys(en);
    for (const lang of UI_LANGS) {
      if (lang === 'en') continue;
      const accepted = new Set(baseline[lang] ?? []);
      const offenders = enKeys.filter(
        (k) =>
          CATALOGS[lang][k] !== undefined &&
          valueOf(CATALOGS[lang][k]) === valueOf(en[k]) &&
          !accepted.has(k),
      );
      expect(
        offenders,
        `${lang} renders these ${offenders.length} keys as English verbatim — either translate ` +
          `them, or if they are genuinely identical in ${lang} add them to ` +
          `tools/i18n-untranslated-baseline.json one at a time: ${offenders.slice(0, 20).join(', ')}`,
      ).toEqual([]);
    }
  });

  it('does not let a new component render UI text without adopting i18n', () => {
    /*
     * Audit F7's second half. Everything above compares the catalogs against
     * each other, so none of it can see a component that hardcodes every
     * string: a file contributing no keys contributes nothing to compare, and
     * both gates passed forever while four components (904 lines) rendered
     * English beside a fully-translated sibling in the same viewport.
     *
     * The scan lives in tools/i18n-hardcoded-check.cjs and is imported rather
     * than reimplemented, so the CLI and this gate cannot drift apart. Ratchet
     * over a recorded baseline, like the check above — the app has 60 such
     * files today; this fails only on a new one.
     */
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS tool, intentionally shared
    const { scan } = require('../../../tools/i18n-hardcoded-check.cjs') as {
      scan: () => { fresh: { file: string; count: number }[] };
    };
    const { fresh } = scan();
    expect(
      fresh.map((o) => `${o.file} (${o.count} strings)`),
      'route these through useT()/t() per CLAUDE.md "i18n workflow", or baseline them ' +
        'with `node tools/i18n-hardcoded-check.cjs --update-baseline` and say why',
    ).toEqual([]);
  });

  it('does not let a date or time be formatted in the OS locale', () => {
    /*
     * Audit C1-2, and a third blind spot in the same shape as the two above.
     * `toLocaleDateString()` with no locale argument formats in the *host*
     * locale, so a Russian UI renders "Wed, Aug 5" — but no date is a catalog
     * key, so neither the catalog comparison nor the adoption check can see it.
     * All 32 sites this was written for sat in files already calling `t()` on
     * every string around them.
     *
     * Two tiers, mirroring the CLI: date/time is a hard zero, `toLocaleString`
     * (number formatting, much lower stakes) is a per-file count ratchet. The
     * scan is imported from tools/i18n-locale-arg-check.cjs rather than
     * reimplemented, so the CLI and this gate cannot drift apart.
     */
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS tool, intentionally shared
    const { scan } = require('../../../tools/i18n-locale-arg-check.cjs') as {
      scan: () => {
        strict: { file: string; line: number; method: string }[];
        grown: { file: string; was: number; now: number }[];
      };
    };
    const { strict, grown } = scan();

    expect(
      strict.map((s) => `${s.file}:${s.line} .${s.method}()`),
      'pass LANG_TAGS[lang] (shared/i18n/core) with `lang` from useT(); a module-level ' +
        'helper takes `lang` as a parameter. If the host locale is genuinely correct — ' +
        'the string is compared, not shown — mark the site with a reasoned ' +
        '`// i18n-locale-arg-ignore: <why>` comment',
    ).toEqual([]);

    expect(
      grown.map((g) => `${g.file} (was ${g.was}, now ${g.now})`),
      'these files gained bare toLocaleString() calls; pass LANG_TAGS[lang] or re-record ' +
        'with `node tools/i18n-locale-arg-check.cjs --update-baseline` and say why',
    ).toEqual([]);
  });
});
