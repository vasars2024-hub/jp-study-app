// @vitest-environment jsdom
/**
 * D155 — `formatDuration` returned `${s}s` / `${m}m` / `${h}h ${m}m`, three bare
 * literals with no `t()`. Live on Statistics at window 12 the Russian tooltip
 * read `чтение 20m` and the Japanese one `読書20m`: the sentence around the
 * number translated, the unit letter did not.
 *
 * The unit now comes from `stats.duration.{s,m,hm}`, following the
 * `vnPanel.duration.*` precedent — abbreviated units, which are invariant in all
 * four languages, so no CLDR plural arm is needed (Russian writes `20 мин` for
 * every count).
 *
 * The guard that matters is the same one D210 needed: English must be UNCHANGED,
 * because a key that fails to resolve falls back to the English catalog and
 * would otherwise read as a pass in the language most turns run in.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { ensureCatalog } from '../../shared/i18n/catalogs';
import { getUiLang, setUiLang } from '../i18n';
import { formatDuration } from '../stats';

type Lang = 'en' | 'ja' | 'zh' | 'ru';

/** `setUiLang` lands only once the language's catalog chunk resolves. */
async function switchTo(lang: Lang): Promise<void> {
  await ensureCatalog(lang);
  setUiLang(lang);
  await new Promise((r) => setTimeout(r, 0));
  expect(getUiLang(), `the switch to ${lang} never landed`).toBe(lang);
}

/** Under a minute, a whole number of minutes, and hours-plus-minutes. */
const CASES = [45, 20 * 60, 3 * 3600 + 47 * 60] as const;

async function rendered(lang: Lang): Promise<string[]> {
  await switchTo(lang);
  return CASES.map((s) => formatDuration(s));
}

describe('formatDuration speaks the interface language', () => {
  afterEach(async () => {
    setUiLang('en');
    await new Promise((r) => setTimeout(r, 0));
  });

  it('is byte-identical to the old literals in English', async () => {
    expect(await rendered('en')).toEqual(['45s', '20m', '3h 47m']);
  });

  it('speaks Japanese', async () => {
    expect(await rendered('ja')).toEqual(['45秒', '20分', '3時間47分']);
  });

  it('speaks Chinese', async () => {
    expect(await rendered('zh')).toEqual(['45 秒', '20 分', '3 小时 47 分']);
  });

  it('speaks Russian', async () => {
    expect(await rendered('ru')).toEqual(['45 с', '20 мин', '3 ч 47 мин']);
  });

  it('leaves no Latin unit letter in any non-English language', async () => {
    for (const lang of ['ja', 'zh', 'ru'] as const) {
      for (const out of await rendered(lang)) {
        expect(out, `${lang} still carries an English unit in "${out}"`).not.toMatch(/[a-z]/i);
      }
    }
  });

  it('gives every non-English language a form of its own', async () => {
    const en = (await rendered('en')).join('|');
    for (const lang of ['ja', 'zh', 'ru'] as const) {
      expect((await rendered(lang)).join('|'), `${lang} fell back to English`).not.toBe(en);
    }
  });

  it('rounds to whole seconds before choosing a unit', async () => {
    await switchTo('en');
    expect(formatDuration(59.4)).toBe('59s');
    // 59.6 rounds to 60, which is a whole minute, not "60s".
    expect(formatDuration(59.6)).toBe('1m');
    expect(formatDuration(0)).toBe('0s');
  });
});

/**
 * The three keys have to exist in all four catalogs — a key present only in `en`
 * resolves through the English fallback and every assertion above still passes
 * for the language that is missing it. `i18n.test.ts`'s catalog-hygiene block is
 * the general gate; this pins the three by name so a later catalog edit that
 * drops one fails here, next to the code that depends on them.
 */
describe('the duration keys exist in every catalog', () => {
  it('carries stats.duration.{s,m,hm} in en, ja, zh and ru', async () => {
    const { catalogFor } = await import('../../shared/i18n/catalogs');
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      await ensureCatalog(lang);
      const catalog = catalogFor(lang);
      for (const key of ['stats.duration.s', 'stats.duration.m', 'stats.duration.hm']) {
        expect(catalog[key], `${lang} is missing ${key}`).toBeTypeOf('string');
      }
    }
  });
});
