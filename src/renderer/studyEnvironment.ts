/**
 * Study-language environment (Phase 8).
 * Single switch that reconfigures dict/whisper defaults and drives the
 * "Set up Chinese" missing-assets card. Does not abort in-flight OCR /
 * transcription — those keep the lang they started with.
 */

import {
  ASSET_CATALOG,
  formatBytes,
  starterAssetIds,
  totalSize,
} from '../shared/assetRegistry';
import type { StudyLang } from '../shared/levelScale';
import {
  DEFAULT_STUDY_LANG,
  normalizeStudyLang,
  studyLangTag,
  type ChineseScript,
} from '../shared/studyLang';
import { defaultWhisperTier } from '../shared/whisperModels';
import { writeLocalStorage } from './localStorageWrite';
import { setWhisperModelTier } from './whisperSettings';

export type { ChineseScript };

export const STUDY_LANG_KEY = 'jp-study-dict-lang';
export const STUDY_LANG_EVENT = 'study-lang-changed';

/**
 * Retired 2026-08-07 (audit item 6.1). `jp-study-whisper-lang` was written here on every
 * language switch and read by nothing — the transcription language is `getStudyLang()`
 * everywhere it is needed (`VideoCoreStudyOverlay.tsx:346`), so the key could never hold
 * anything the dict-lang key did not already say. Copies already sitting in profiles are
 * inert (nothing reads them) and are cleared by the settings reset, which still lists the
 * key in `storage/settingsCatalog.ts`.
 */
export const RETIRED_WHISPER_LANG_KEY = 'jp-study-whisper-lang';

export type { StudyLang };

export function getStudyLang(): StudyLang {
  try {
    return normalizeStudyLang(localStorage.getItem(STUDY_LANG_KEY));
  } catch {
    return DEFAULT_STUDY_LANG;
  }
}

/** Simplified or Traditional characters, for a Chinese learner. */
export const CHINESE_SCRIPT_KEY = 'jp-study-zh-script';
export const CHINESE_SCRIPT_EVENT = 'study-zh-script-changed';

export function getChineseScript(): ChineseScript {
  try {
    return localStorage.getItem(CHINESE_SCRIPT_KEY) === 'traditional' ? 'traditional' : 'simplified';
  } catch {
    return 'simplified';
  }
}

export function setChineseScript(script: ChineseScript): void {
  const next: ChineseScript = script === 'traditional' ? 'traditional' : 'simplified';
  writeLocalStorage(CHINESE_SCRIPT_KEY, next);
  syncStudyLangToMain();
  window.dispatchEvent(new CustomEvent<ChineseScript>(CHINESE_SCRIPT_EVENT, { detail: next }));
}

export function onChineseScriptChanged(cb: (script: ChineseScript) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<ChineseScript>).detail);
  window.addEventListener(CHINESE_SCRIPT_EVENT, handler);
  return () => window.removeEventListener(CHINESE_SCRIPT_EVENT, handler);
}

/**
 * The `lang` attribute study-language content should carry: `ja`, `ru`, or
 * `zh-Hans` / `zh-Hant` by the script preference.
 */
export function studyContentLang(lang: StudyLang = getStudyLang()): string {
  return studyLangTag(lang, getChineseScript());
}

/**
 * Tell main which language is being studied. Main has no localStorage, and its
 * subtitle discovery, OCR, whisper and YouTube paths all need the answer — so
 * the renderer pushes it at boot and on every change, and main persists it so
 * work that runs before the first window (auto-discovery on startup) still reads
 * the right language. See `main/studyLanguage.ts`.
 */
export function syncStudyLangToMain(): void {
  try {
    window.api?.setStudyLanguage?.({ lang: getStudyLang(), script: getChineseScript() });
  } catch {
    /* no bridge (tests, harnesses) */
  }
}

/**
 * Persist study language, sync whisper lang + default model tier, broadcast.
 * No-op if unchanged.
 */
export function setStudyLang(lang: StudyLang): void {
  const next: StudyLang = normalizeStudyLang(lang);
  const prev = getStudyLang();
  writeLocalStorage(STUDY_LANG_KEY, next);
  // Always align whisper tier with the language default when switching.
  if (prev !== next) {
    setWhisperModelTier(defaultWhisperTier(next));
  }
  syncStudyLangToMain();
  window.dispatchEvent(new CustomEvent<StudyLang>(STUDY_LANG_EVENT, { detail: next }));
}

export function onStudyLangChanged(cb: (lang: StudyLang) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<StudyLang>).detail);
  window.addEventListener(STUDY_LANG_EVENT, handler);
  return () => window.removeEventListener(STUDY_LANG_EVENT, handler);
}

/** Asset ids the setup card should offer for this language. */
export function requiredAssetIds(lang: StudyLang = getStudyLang()): string[] {
  return starterAssetIds(lang);
}

export function requiredAssetsSizeBytes(lang: StudyLang = getStudyLang()): number {
  return totalSize(ASSET_CATALOG, requiredAssetIds(lang));
}

export function requiredAssetsSizeLabel(lang: StudyLang = getStudyLang()): string {
  return formatBytes(requiredAssetsSizeBytes(lang));
}
