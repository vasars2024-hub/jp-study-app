import { useCallback, useSyncExternalStore } from 'react';
import { CATALOGS, en } from '../shared/i18n/catalogs';
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

export function setUiLang(lang: UiLang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // A language that cannot be persisted still applies for this session.
  }
  applyLangAttribute(lang);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: string, vars?: TVars): string {
  return translate(key, vars, {
    lang: current,
    catalog: CATALOGS[current],
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
