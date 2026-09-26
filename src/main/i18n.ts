import { ipcMain } from 'electron';
import { catalogFor, en, ensureCatalog } from '../shared/i18n/catalogs';
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
const langListeners = new Set<(lang: UiLang) => void>();

export function setMainLang(lang: UiLang): void {
  currentLang = lang;
  // Catalogs are per-language chunks now, so main has to load one before mt()
  // can return anything but English. Fire-and-forget: the renderer pushes the
  // language at boot, well before any native dialog needs a title, and mt()
  // falls back to English in the gap rather than blocking startup.
  void Promise.resolve(ensureCatalog(lang)).then(() => {
    // Native surfaces built once (the tray menu) rebuild in the new language.
    for (const cb of langListeners) {
      try {
        cb(lang);
      } catch {
        /* a listener's failure is its own */
      }
    }
  });
}

/** Called after a language switch has loaded its catalog. */
export function onMainLangChanged(cb: (lang: UiLang) => void): () => void {
  langListeners.add(cb);
  return () => langListeners.delete(cb);
}

export function getMainLang(): UiLang {
  return currentLang;
}

/** Main-process translate — same semantics as renderer's t(). */
export function mt(key: string, vars?: TVars): string {
  return translate(key, vars, { lang: currentLang, catalog: catalogFor(currentLang), fallback: en });
}

export function registerMainI18nIpc(): void {
  ipcMain.handle('i18n:setLang', (_e, lang: unknown) => {
    if (isUiLang(lang)) setMainLang(lang);
  });
}
