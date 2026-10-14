/**
 * The Grammar window's own lazy string pack (`shared/i18n/grammarUi`).
 *
 * English is bundled as the fallback; ja/zh/ru are one chunk each, loaded the
 * first time a Grammar surface renders in that language. The catalogs are not
 * touched, so these strings never ship in the boot bundle of a session that
 * never opens Grammar.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { translate, type Catalog, type TVars, type UiLang } from '../../../shared/i18n/core';
import { GRAMMAR_UI_EN } from '../../../shared/i18n/grammarUi/en';

const packs = new Map<UiLang, Catalog>([['en', GRAMMAR_UI_EN]]);
const listeners = new Set<() => void>();

function importPack(lang: UiLang): Promise<Catalog> {
  // Literal paths, so the bundler emits one chunk per language.
  switch (lang) {
    case 'ja':
      return import('../../../shared/i18n/grammarUi/ja').then((m) => m.GRAMMAR_UI_JA);
    case 'zh':
      return import('../../../shared/i18n/grammarUi/zh').then((m) => m.GRAMMAR_UI_ZH);
    case 'ru':
      return import('../../../shared/i18n/grammarUi/ru').then((m) => m.GRAMMAR_UI_RU);
    default:
      return Promise.resolve(GRAMMAR_UI_EN);
  }
}

/** Load the pack for `lang`. Never rejects: a failed chunk leaves English. */
export function loadGrammarUiStrings(lang: UiLang): Promise<void> {
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
export function grammarUiText(lang: UiLang, key: string, vars?: TVars): string {
  return translate(key, vars, { lang, catalog: packs.get(lang) ?? GRAMMAR_UI_EN, fallback: GRAMMAR_UI_EN });
}

/** `gt(key, vars)` for the current UI language; re-renders when the pack arrives. */
export function useGrammarUi(): { gt: (key: string, vars?: TVars) => string; lang: UiLang } {
  const { lang } = useT();
  const [, setLoaded] = useState(0);
  useEffect(() => {
    const bump = (): void => setLoaded((n) => n + 1);
    listeners.add(bump);
    if (!packs.has(lang)) void loadGrammarUiStrings(lang);
    return () => {
      listeners.delete(bump);
    };
  }, [lang]);
  return { gt: (key, vars) => grammarUiText(lang, key, vars), lang };
}
