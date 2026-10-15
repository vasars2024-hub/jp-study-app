/**
 * The Immersion browser's own lazy string pack (`shared/i18n/immersionUi`):
 * coded Reader Mode errors and read-aloud.
 *
 * English is bundled as the fallback; ja/zh/ru are one chunk each, loaded the
 * first time an Immersion surface renders in that language. The catalogs are
 * not touched, so these strings never ship in the boot bundle of a session that
 * never opens Immersion.
 */
import { useEffect, useState } from 'react';
import { getUiLang, useT } from '../../i18n';
import { translate, type Catalog, type TVars, type UiLang } from '../../../shared/i18n/core';
import { IMMERSION_UI_EN } from '../../../shared/i18n/immersionUi/en';
import type { ReaderArticleErrorCode } from '../../readabilityArticle';

const packs = new Map<UiLang, Catalog>([['en', IMMERSION_UI_EN]]);
const listeners = new Set<() => void>();

function importPack(lang: UiLang): Promise<Catalog> {
  // Literal paths, so the bundler emits one chunk per language.
  switch (lang) {
    case 'ja':
      return import('../../../shared/i18n/immersionUi/ja').then((m) => m.IMMERSION_UI_JA);
    case 'zh':
      return import('../../../shared/i18n/immersionUi/zh').then((m) => m.IMMERSION_UI_ZH);
    case 'ru':
      return import('../../../shared/i18n/immersionUi/ru').then((m) => m.IMMERSION_UI_RU);
    default:
      return Promise.resolve(IMMERSION_UI_EN);
  }
}

/** Load the pack for `lang`. Never rejects: a failed chunk leaves English. */
export function loadImmersionUiStrings(lang: UiLang): Promise<void> {
  if (packs.has(lang)) return Promise.resolve();
  return importPack(lang).then(
    (pack) => {
      packs.set(lang, pack);
      for (const listener of listeners) listener();
    },
    () => undefined,
  );
}

/** Resolve one pack key in `lang` (English until that language's chunk lands). */
export function immersionUiText(lang: UiLang, key: string, vars?: TVars): string {
  return translate(key, vars, { lang, catalog: packs.get(lang) ?? IMMERSION_UI_EN, fallback: IMMERSION_UI_EN });
}

/**
 * The same, for a message set once and kept on screen (an error banner): waits
 * for the current language's chunk first, so it never freezes in English.
 */
export async function immersionUiTextLoaded(key: string, vars?: TVars): Promise<string> {
  const lang = getUiLang();
  await loadImmersionUiStrings(lang);
  return immersionUiText(lang, key, vars);
}

/** `it(key, vars)` for the current UI language; re-renders when the pack arrives. */
export function useImmersionUi(): { it: (key: string, vars?: TVars) => string; lang: UiLang } {
  const { lang } = useT();
  const [, setLoaded] = useState(0);
  useEffect(() => {
    const bump = (): void => setLoaded((n) => n + 1);
    listeners.add(bump);
    if (!packs.has(lang)) void loadImmersionUiStrings(lang);
    return () => {
      listeners.delete(bump);
    };
  }, [lang]);
  return { it: (key, vars) => immersionUiText(lang, key, vars), lang };
}

const READER_ERROR_KEY: Record<ReaderArticleErrorCode, string> = {
  'no-article': 'immersionUi.error.noArticle',
  timeout: 'immersionUi.error.timeout',
  http: 'immersionUi.error.http',
  'not-html': 'immersionUi.error.notHtml',
  'bad-url': 'immersionUi.error.badUrl',
  network: 'immersionUi.error.network',
  failed: 'immersionUi.error.failed',
};

/** The pack key and vars for a coded Reader Mode failure. */
export function readerErrorMessage(code: ReaderArticleErrorCode, status?: number): { key: string; vars?: TVars } {
  return code === 'http' ? { key: READER_ERROR_KEY.http, vars: { status: status ?? '' } } : { key: READER_ERROR_KEY[code] };
}
