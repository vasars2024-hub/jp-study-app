import { ipcMain } from 'electron';
import { CATALOGS, en } from '../shared/i18n/catalogs';
import { DEFAULT_LANG, isUiLang, translate, type TVars, type UiLang } from '../shared/i18n/core';

// Main-process side of Phase 2. The renderer owns the language *choice*
// (persisted in its own localStorage); main just needs to know what it is so
// native dialog titles/filters aren't stuck in English. The renderer pushes
// its language over on boot and on every switch — see renderer/i18n.ts —
// so this stays in sync without main ever touching localStorage itself.
//
// Reuses shared/i18n/core.ts's translate() directly: that module was written
// framework-free from the start specifically so main and renderer never need
// two implementations.

let currentLang: UiLang = DEFAULT_LANG;

export function setMainLang(lang: UiLang): void {
  currentLang = lang;
}

export function getMainLang(): UiLang {
  return currentLang;
}

/** Main-process translate — same semantics as renderer's t(). */
export function mt(key: string, vars?: TVars): string {
  return translate(key, vars, { lang: currentLang, catalog: CATALOGS[currentLang], fallback: en });
}

export function registerMainI18nIpc(): void {
  ipcMain.handle('i18n:setLang', (_e, lang: unknown) => {
    if (isUiLang(lang)) setMainLang(lang);
  });
}
