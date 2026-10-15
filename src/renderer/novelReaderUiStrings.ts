/**
 * The novel reader's lazy string pack (`shared/i18n/novelReaderUi`): in-book
 * search, the link import's status lines, coded web-import and Jiten errors.
 *
 * English is bundled as the fallback; ja/zh/ru are one chunk each, loaded the
 * first time a reader surface renders in that language. The catalogs are not
 * touched, so none of these strings ship in the boot bundle.
 */
import { useCallback, useEffect, useState } from 'react';
import { getUiLang, useT } from './i18n';
import { translate, type Catalog, type TVars, type UiLang } from '../shared/i18n/core';
import { NOVEL_READER_UI_EN } from '../shared/i18n/novelReaderUi/en';

const packs = new Map<UiLang, Catalog>([['en', NOVEL_READER_UI_EN]]);
const listeners = new Set<() => void>();

function importPack(lang: UiLang): Promise<Catalog> {
  // Literal paths, so the bundler emits one chunk per language.
  switch (lang) {
    case 'ja':
      return import('../shared/i18n/novelReaderUi/ja').then((m) => m.NOVEL_READER_UI_JA);
    case 'zh':
      return import('../shared/i18n/novelReaderUi/zh').then((m) => m.NOVEL_READER_UI_ZH);
    case 'ru':
      return import('../shared/i18n/novelReaderUi/ru').then((m) => m.NOVEL_READER_UI_RU);
    default:
      return Promise.resolve(NOVEL_READER_UI_EN);
  }
}

/** Load the pack for `lang`. Never rejects: a failed chunk leaves English. */
export function loadNovelReaderUiStrings(lang: UiLang): Promise<void> {
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
export function novelReaderUiText(lang: UiLang, key: string, vars?: TVars): string {
  return translate(key, vars, { lang, catalog: packs.get(lang) ?? NOVEL_READER_UI_EN, fallback: NOVEL_READER_UI_EN });
}

/**
 * The same, for a message set once and kept on screen (an error line): waits
 * for the current language's chunk first, so it never freezes in English.
 */
export async function novelReaderUiTextLoaded(key: string, vars?: TVars): Promise<string> {
  const lang = getUiLang();
  await loadNovelReaderUiStrings(lang);
  return novelReaderUiText(lang, key, vars);
}

/** `nt(key, vars)` for the current UI language; re-renders when the pack arrives. */
export function useNovelReaderUi(): { nt: (key: string, vars?: TVars) => string; lang: UiLang } {
  const { lang } = useT();
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    const bump = (): void => setLoaded((n) => n + 1);
    listeners.add(bump);
    if (!packs.has(lang)) void loadNovelReaderUiStrings(lang);
    return () => {
      listeners.delete(bump);
    };
  }, [lang]);
  // Stable until the language or its pack changes, so effects can depend on it.
  const nt = useCallback((key: string, vars?: TVars) => novelReaderUiText(lang, key, vars), [lang, loaded]);
  return { nt, lang };
}
