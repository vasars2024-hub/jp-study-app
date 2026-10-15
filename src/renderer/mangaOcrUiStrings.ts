/**
 * The manga reader's automatic-OCR string pack (`shared/i18n/mangaOcrUi`): the
 * auto-read toggle, the page scan's progress lines and the model offer.
 *
 * English is bundled as the fallback; ja/zh/ru are one chunk each, loaded the
 * first time a reader surface renders in that language. The catalogs are not
 * touched, so none of these strings ship in the boot bundle.
 */
import { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n';
import { translate, type Catalog, type TVars, type UiLang } from '../shared/i18n/core';
import { MANGA_OCR_UI_EN } from '../shared/i18n/mangaOcrUi/en';

const packs = new Map<UiLang, Catalog>([['en', MANGA_OCR_UI_EN]]);
const listeners = new Set<() => void>();

function importPack(lang: UiLang): Promise<Catalog> {
  // Literal paths, so the bundler emits one chunk per language.
  switch (lang) {
    case 'ja':
      return import('../shared/i18n/mangaOcrUi/ja').then((m) => m.MANGA_OCR_UI_JA);
    case 'zh':
      return import('../shared/i18n/mangaOcrUi/zh').then((m) => m.MANGA_OCR_UI_ZH);
    case 'ru':
      return import('../shared/i18n/mangaOcrUi/ru').then((m) => m.MANGA_OCR_UI_RU);
    default:
      return Promise.resolve(MANGA_OCR_UI_EN);
  }
}

/** Load the pack for `lang`. Never rejects: a failed chunk leaves English. */
export function loadMangaOcrUiStrings(lang: UiLang): Promise<void> {
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
export function mangaOcrUiText(lang: UiLang, key: string, vars?: TVars): string {
  return translate(key, vars, { lang, catalog: packs.get(lang) ?? MANGA_OCR_UI_EN, fallback: MANGA_OCR_UI_EN });
}

/** `mt(key, vars)` for the current UI language; re-renders when the pack arrives. */
export function useMangaOcrUi(): { mt: (key: string, vars?: TVars) => string; lang: UiLang } {
  const { lang } = useT();
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    const bump = (): void => setLoaded((n) => n + 1);
    listeners.add(bump);
    if (!packs.has(lang)) void loadMangaOcrUiStrings(lang);
    return () => {
      listeners.delete(bump);
    };
  }, [lang]);
  // Stable until the language or its pack changes, so effects can depend on it.
  const mt = useCallback((key: string, vars?: TVars) => mangaOcrUiText(lang, key, vars), [lang, loaded]);
  return { mt, lang };
}
