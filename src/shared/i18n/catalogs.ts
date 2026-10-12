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
    .then(async (catalog) => {
      // A pack already in use (the AI strings, once an AI surface asked) is
      // fetched with the language, so a switch lands with it rather than
      // flashing placeholders, and a catalog is never seen growing afterwards.
      await Promise.all([...requestedPacks].map((pack) => fetchPack(pack, lang)));
      loaded.set(lang, catalog);
      for (const pack of requestedPacks) mergePack(pack, lang);
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

// ----------------------------------------------------------------------------
// Lazily merged packs (2026-10-11)
//
// The English catalog is static in every window, so every string in it is boot
// cost — in Blanc too, whose low-RAM promise is the point of it. The optional AI
// features' strings (~50 KB of English source) were the newest such cost, for
// surfaces a session may never open. They are now a *pack*: per-language
// modules loaded by dynamic `import()` and merged INTO the loaded catalogs the
// first time something needs them.
//
// Merged in place rather than layered, so every consumer of `en` and
// `catalogFor()` — `t()`, `mt()`, the settings search, the agent's navigation
// index — sees the strings without learning a second lookup. A pack never
// overwrites a key the catalog already has: the eager copy (`aiEagerUi`) of a
// string a non-AI surface renders at startup stays the one on screen.
//
// Which pack a key belongs to is decided by prefix, without loading the pack, so
// `t()` can tell "not loaded yet" (show a neutral placeholder and load it) from
// "no such key" (show the key, which is a bug). `i18nLazyPacks.test.ts` keeps
// every pack key under its prefixes or in the eager catalog.

export type I18nPackId = 'ai' | 'pass6' | 'upd3';

/** Key prefixes owned by each pack. A key under one is never in an eager catalog by accident. */
export const I18N_PACK_PREFIXES: Readonly<Record<I18nPackId, readonly string[]>> = {
  ai: ['aiStudy.', 'aiImmerse.', 'aiTutor.', 'aiAgent.', 'aiProv.', 'aiError.', 'aiFix.', 'aiSpeak.'],
  // Soundscape/widget/shortcut strings; main.tsx loads them before first paint.
  pass6: ['snd6.', 'wid6.', 'kbd6.'],
  // The Updates panel's download / history / "What's new" strings (../updateUi3).
  // main.tsx loads them before first paint. Blanc has no Updates panel and loads them
  // only to post the "What's new" notice (releaseCheck.ts), never at boot.
  upd3: ['upd3.'],
};

const PACK_IDS = Object.keys(I18N_PACK_PREFIXES) as I18nPackId[];

function importPack(pack: I18nPackId, lang: UiLang): Promise<Catalog> {
  // Literal paths, one chunk per language, for the same reason as importCatalog.
  switch (pack) {
    case 'ai':
      switch (lang) {
        case 'ja':
          return import('./aiPack/ja').then((m) => m.AI_PACK_JA);
        case 'zh':
          return import('./aiPack/zh').then((m) => m.AI_PACK_ZH);
        case 'ru':
          return import('./aiPack/ru').then((m) => m.AI_PACK_RU);
        default:
          return import('./aiPack/en').then((m) => m.AI_PACK_EN);
      }
    case 'pass6':
      switch (lang) {
        case 'ja':
          return import('./pass6Pack/ja').then((m) => m.PASS6_PACK_JA);
        case 'zh':
          return import('./pass6Pack/zh').then((m) => m.PASS6_PACK_ZH);
        case 'ru':
          return import('./pass6Pack/ru').then((m) => m.PASS6_PACK_RU);
        default:
          return import('./pass6Pack/en').then((m) => m.PASS6_PACK_EN);
      }
    case 'upd3':
      switch (lang) {
        case 'ja':
          return import('./updateUi3/ja').then((m) => m.UPDATE3_UI_JA);
        case 'zh':
          return import('./updateUi3/zh').then((m) => m.UPDATE3_UI_ZH);
        case 'ru':
          return import('./updateUi3/ru').then((m) => m.UPDATE3_UI_RU);
        default:
          return import('./updateUi3/en').then((m) => m.UPDATE3_UI_EN);
      }
  }
}

const packKey = (pack: I18nPackId, lang: UiLang): string => `${pack}:${lang}`;

/** Packs something asked for; a language loaded later loads them too, before it resolves. */
const requestedPacks = new Set<I18nPackId>();
/** Resolved pack strings, by `pack:lang`. */
const packStrings = new Map<string, Catalog>();
const packInFlight = new Map<string, Promise<void>>();
/** `pack:lang` loads that failed: not retried on every render. */
const packFailed = new Set<string>();
/** What each merge added and where, so a test reset can take exactly that back out. */
const packMerged = new Map<string, { into: Catalog; keys: string[] }>();
const packListeners = new Set<() => void>();

/** Merge `pack`'s strings for `lang` into the loaded catalog. True when anything was added. */
function mergePack(pack: I18nPackId, lang: UiLang): boolean {
  const id = packKey(pack, lang);
  const strings = packStrings.get(id);
  const into = loaded.get(lang);
  if (!strings || !into || packMerged.get(id)?.into === into) return false;
  const keys: string[] = [];
  for (const [key, value] of Object.entries(strings)) {
    if (into[key] !== undefined) continue;
    into[key] = value;
    keys.push(key);
  }
  packMerged.set(id, { into, keys });
  return keys.length > 0;
}

function notifyPacks(): void {
  for (const listener of packListeners) {
    try {
      listener();
    } catch {
      /* a listener's failure is its own */
    }
  }
}

function fetchPack(pack: I18nPackId, lang: UiLang): Promise<void> {
  const id = packKey(pack, lang);
  if (packStrings.has(id)) return Promise.resolve();
  const pending = packInFlight.get(id);
  if (pending) return pending;
  const load = importPack(pack, lang)
    .then((strings) => {
      packStrings.set(id, strings);
      packFailed.delete(id);
    })
    .catch((err) => {
      packFailed.add(id);
      console.error(`[i18n] failed to load the ${pack} strings for ${lang}`, err);
    })
    .finally(() => {
      packInFlight.delete(id);
    });
  packInFlight.set(id, load);
  return load;
}

/**
 * Load `pack` for English (the fallback) and for `lang`, and merge it into
 * whichever of those catalogs is loaded. Safe to call repeatedly and from
 * render; resolves when the strings are in. Never rejects.
 */
export function ensureI18nPack(pack: I18nPackId, lang: UiLang = DEFAULT_LANG): Promise<void> {
  requestedPacks.add(pack);
  const langs: UiLang[] = lang === DEFAULT_LANG ? [DEFAULT_LANG] : [DEFAULT_LANG, lang];
  return Promise.all(langs.map((l) => fetchPack(pack, l))).then(() => {
    let changed = false;
    for (const l of langs) changed = mergePack(pack, l) || changed;
    if (changed) notifyPacks();
  });
}

/**
 * Register a pack's strings synchronously — for the main process, which has no
 * boot budget and must be able to throw a translated AI error at any time, and
 * for the test setup. Merges at once when `lang` is loaded, else when it loads.
 */
export function registerI18nPack(pack: I18nPackId, lang: UiLang, strings: Catalog): void {
  requestedPacks.add(pack);
  packStrings.set(packKey(pack, lang), strings);
  packFailed.delete(packKey(pack, lang));
  if (mergePack(pack, lang)) notifyPacks();
}

/** True once `pack`'s strings for `lang` are merged. */
export function isI18nPackLoaded(pack: I18nPackId, lang: UiLang = DEFAULT_LANG): boolean {
  return packMerged.has(packKey(pack, lang)) && packMerged.get(packKey(pack, lang))?.into === loaded.get(lang);
}

/** The pack that owns `key` by prefix, or null for a key of the eager catalogs. */
export function i18nPackForKey(key: string): I18nPackId | null {
  for (const pack of PACK_IDS) {
    if (I18N_PACK_PREFIXES[pack].some((prefix) => key.startsWith(prefix))) return pack;
  }
  return null;
}

/**
 * The pack `key` is waiting for: it is missing from English, it belongs to a
 * pack by prefix, and that pack's English strings are not in yet (and did not
 * fail). `t()` shows a placeholder for these instead of the raw key.
 */
export function pendingI18nPack(key: string): I18nPackId | null {
  if (en[key] !== undefined) return null;
  const pack = i18nPackForKey(key);
  if (!pack || isI18nPackLoaded(pack, DEFAULT_LANG) || packFailed.has(packKey(pack, DEFAULT_LANG))) return null;
  return pack;
}

/** Called after a pack's strings were merged into a loaded catalog. */
export function onI18nPacksChanged(listener: () => void): () => void {
  packListeners.add(listener);
  return () => packListeners.delete(listener);
}

/** Test hook: take every merged pack string back out and forget all pack state. */
export function resetI18nPacksForTest(): void {
  for (const { into, keys } of packMerged.values()) for (const key of keys) delete into[key];
  packMerged.clear();
  packStrings.clear();
  packInFlight.clear();
  packFailed.clear();
  requestedPacks.clear();
}
