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
import { defaultWhisperTier } from '../shared/whisperModels';
import { setWhisperModelTier } from './whisperSettings';

export const STUDY_LANG_KEY = 'jp-study-dict-lang';
export const WHISPER_LANG_KEY = 'jp-study-whisper-lang';
export const STUDY_LANG_EVENT = 'study-lang-changed';

export type { StudyLang };

export function getStudyLang(): StudyLang {
  try {
    return localStorage.getItem(STUDY_LANG_KEY) === 'zh' ? 'zh' : 'ja';
  } catch {
    return 'ja';
  }
}

/**
 * Persist study language, sync whisper lang + default model tier, broadcast.
 * No-op if unchanged.
 */
export function setStudyLang(lang: StudyLang): void {
  const next: StudyLang = lang === 'zh' ? 'zh' : 'ja';
  const prev = getStudyLang();
  try {
    localStorage.setItem(STUDY_LANG_KEY, next);
    localStorage.setItem(WHISPER_LANG_KEY, next);
  } catch {
    /* storage unavailable */
  }
  // Always align whisper tier with the language default when switching.
  if (prev !== next) {
    setWhisperModelTier(defaultWhisperTier(next));
  }
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
