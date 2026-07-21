import { useCallback, useSyncExternalStore } from 'react';
import { catalogFor, en, ensureCatalog } from '../shared/i18n/catalogs';
import {
  DEFAULT_LANG,
  LANG_TAGS,
  isUiLang,
  translate,
  type TVars,
  type UiLang,
} from '../shared/i18n/core';

/**
 * UI language.
 *
 * Same shape as theme.ts: the choice lives in localStorage, changing it stamps
 * an attribute on <html> and notifies subscribers, and every component re-renders
 * from the store — so the switch is live, with no reload.
 *
 * The `lang` attribute on <html> is not cosmetic. Japanese and Chinese share
 * codepoints but render with different glyph shapes, and the browser picks the
 * shapes from `lang` — without it a Chinese UI shows Japanese-shaped characters.
 */

const STORAGE_KEY = 'ui-lang';

function readStored(): UiLang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isUiLang(raw)) return raw;
  } catch {
    // Storage can be unavailable (private mode, wiped profile) — fall back.
  }
  return DEFAULT_LANG;
}

let current: UiLang = readStored();
const listeners = new Set<() => void>();

/** Stamped on <html> so CSS font stacks and glyph selection follow the UI language. */
export function applyLangAttribute(lang: UiLang = current): void {
  document.documentElement.lang = LANG_TAGS[lang];
  // Main has no access to localStorage (and shouldn't reach into the renderer's
  // storage anyway), so it can't know the active language on its own — push it
  // over so native dialog titles/filters (file pickers) aren't stuck in
  // English. Called at boot and on every switch; window.api may not exist yet
  // in a non-Electron test environment.
  window.api?.setUiLang?.(lang);
}

export function getUiLang(): UiLang {
  return current;
}

/**
 * Load the stored language's catalog. **Await this before the first render** —
 * `t()` is synchronous, so a catalog that is not resolved yet renders English
 * and then flips, which is a visible flash on every boot in a non-English UI.
 */
export async function initI18n(): Promise<void> {
  await ensureCatalog(current);
  applyLangAttribute(current);
}

/**
 * Switch language.
 *
 * Stays synchronous for callers (it is wired to `onChange` handlers), but the
 * switch itself lands once the catalog chunk resolves — otherwise the UI would
 * repaint in English before the new strings arrived. For an already-loaded
 * language `ensureCatalog` resolves on the microtask queue, so switching back
 * and forth is instant after the first time.
 */
export function setUiLang(lang: UiLang): void {
  if (lang === current) return;
  void ensureCatalog(lang).then(() => {
    // Re-check: a second switch may have landed while this chunk was loading.
    if (lang === current) return;
    current = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // A language that cannot be persisted still applies for this session.
    }
    applyLangAttribute(lang);
    for (const listener of listeners) listener();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: string, vars?: TVars): string {
  return translate(key, vars, {
    lang: current,
    // Synchronous by design: catalogs are resolved before render (initI18n) and
    // before a switch (setUiLang), so this never needs to await. A language that
    // somehow is not loaded degrades to English rather than blocking.
    catalog: catalogFor(current),
    fallback: en,
    onMissing: (missing, lang) => {
      if (lang !== DEFAULT_LANG) console.warn(`[i18n] missing ${lang} string: ${missing}`);
    },
  });
}

/**
 * Components call this instead of importing `t` directly: it subscribes them to
 * language changes, which is what makes the switch live.
 */
export function useT(): { t: (key: string, vars?: TVars) => string; lang: UiLang } {
  const lang = useSyncExternalStore(subscribe, getUiLang, () => DEFAULT_LANG);
  const translateFn = useCallback((key: string, vars?: TVars) => t(key, vars), []);
  return { t: translateFn, lang };
}
