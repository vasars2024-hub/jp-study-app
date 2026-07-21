// UI string catalogs — loader.
//
// Scope rule, and it matters: this translates app *chrome* only. Study content
// (deck names, mined sentences, dictionary glosses) is never translated — the UI
// language and the study language are two independent settings.
//
// English is the source of truth. A key missing from another catalog falls back
// to English, so partial translations ship fine and never blank out the UI.
//
// Catalogs are TypeScript rather than JSON so that a typo in a key is a compile
// error at the call site instead of a silent fallback at runtime.
//
// ----------------------------------------------------------------------------
// Why this file is a loader rather than the catalogs themselves (2026-07-21)
//
// It used to be one 16,000-line module exporting all four languages, which meant
// every bundle carried every language. Measured by sourcemap attribution, that
// was **698 KB — 54.7% of Blanc's boot JS**, in a window whose own chrome is
// deliberately untranslated. Study OS paid the same cost.
//
// Now: English is eager (it is the fallback, and the default language, so it is
// needed on every boot no matter what), and ja/zh/ru load on demand via dynamic
// `import()`. Rollup gives each its own chunk, so a session in English never
// fetches the other three.
//
// The constraint that shapes the API: `translate()` is synchronous by design,
// and callers rely on that. So a catalog must be *resolved before render*, not
// awaited inside `t()`. Hence `ensureCatalog()` — call it at boot and before a
// language switch — plus the synchronous `catalogFor()` that `t()` uses.

import type { Catalog, UiLang } from './core';
import { DEFAULT_LANG } from './core';
import { en } from './catalogs/en';

export { en };
export { GAME_ARENA_CHROME } from './catalogs/gameArena';

/**
 * Loaded catalogs, keyed by language. English is present from the start; the
 * others appear once `ensureCatalog` has resolved them.
 */
const loaded = new Map<UiLang, Catalog>([['en', en]]);

/** In-flight loads, so concurrent callers share one import rather than racing. */
const inFlight = new Map<UiLang, Promise<Catalog>>();

function importCatalog(lang: UiLang): Promise<Catalog> {
  // A switch statement rather than a computed path: bundlers can only see the
  // dependency — and therefore only emit a chunk — for a literal import path.
  switch (lang) {
    case 'ja':
      return import('./catalogs/ja').then((m) => m.ja);
    case 'zh':
      return import('./catalogs/zh').then((m) => m.zh);
    case 'ru':
      return import('./catalogs/ru').then((m) => m.ru);
    default:
      return Promise.resolve(en);
  }
}

/**
 * Resolve a catalog, loading it if needed. Safe to call repeatedly.
 *
 * On failure the promise resolves to English rather than rejecting: a missing
 * translation chunk should degrade to an English UI, not a blank screen.
 */
export async function ensureCatalog(lang: UiLang): Promise<Catalog> {
  const already = loaded.get(lang);
  if (already) return already;

  const pending = inFlight.get(lang);
  if (pending) return pending;

  const load = importCatalog(lang)
    .then((catalog) => {
      loaded.set(lang, catalog);
      return catalog;
    })
    .catch((err) => {
      console.error(`[i18n] failed to load the ${lang} catalog; falling back to English`, err);
      return en;
    })
    .finally(() => {
      inFlight.delete(lang);
    });

  inFlight.set(lang, load);
  return load;
}

/**
 * The catalog for `lang` if it is loaded, else English.
 *
 * Synchronous on purpose — this is what keeps `t()` synchronous. Callers that
 * need a specific language on screen must `ensureCatalog()` first; this never
 * blocks and never triggers a load.
 */
export function catalogFor(lang: UiLang): Catalog {
  return loaded.get(lang) ?? en;
}

/** True once `lang` is resolved and `catalogFor` will return the real thing. */
export function isCatalogLoaded(lang: UiLang): boolean {
  return loaded.has(lang);
}

/** Test hook: forget everything but English. */
export function resetCatalogsForTest(): void {
  loaded.clear();
  loaded.set(DEFAULT_LANG, en);
  inFlight.clear();
}
