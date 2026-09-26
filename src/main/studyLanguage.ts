/**
 * Main's copy of the study language — the one source of truth for main-process
 * code (subtitle discovery, OCR, whisper, YouTube, the extension bridge).
 *
 * The renderer owns the choice (Settings > Study, persisted in its
 * localStorage). Main cannot read that storage, and it used to guess instead:
 * the study subtitle line was `autoDownloadLanguages[0] ?? 'ja'`, OCR and
 * whisper hard-coded Japanese. Now the renderer pushes `{ lang, script }` at
 * boot and on every switch (`renderer/studyEnvironment.ts` →
 * `study:setLanguage`), and main persists it, so startup work that runs before
 * the first window (auto-discovery sweeps) still sees the right language.
 */
import path from 'node:path';
import { app, ipcMain } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import {
  DEFAULT_STUDY_LANG,
  isStudyLang,
  studyLangTag,
  type ChineseScript,
  type StudyLang,
} from '../shared/studyLang';

const FILE = 'study-language.json';

export interface StudyLanguageState {
  lang: StudyLang;
  script: ChineseScript;
}

export function normalizeStudyLanguageState(value: unknown): StudyLanguageState {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<StudyLanguageState>;
  return {
    lang: isStudyLang(raw.lang) ? raw.lang : DEFAULT_STUDY_LANG,
    script: raw.script === 'traditional' ? 'traditional' : 'simplified',
  };
}

let state: StudyLanguageState | null = null;
const listeners = new Set<(next: StudyLanguageState, prev: StudyLanguageState) => void>();

function filePath(): string {
  return path.join(app.getPath('userData'), FILE);
}

function load(): StudyLanguageState {
  if (state) return state;
  try {
    state = normalizeStudyLanguageState(readJsonSync<unknown>(filePath(), {}));
  } catch {
    state = normalizeStudyLanguageState(null);
  }
  return state;
}

/** The language being studied, as main knows it. */
export function getMainStudyLang(): StudyLang {
  return load().lang;
}

/** The Chinese script preference (only meaningful when studying Chinese). */
export function getMainChineseScript(): ChineseScript {
  return load().script;
}

/** `ja`, `ru`, `zh-Hans` or `zh-Hant`. */
export function getMainStudyLangTag(): string {
  const current = load();
  return studyLangTag(current.lang, current.script);
}

/** Apply (and persist) a new state. Returns true when it changed. */
export function setMainStudyLanguage(value: unknown): boolean {
  const prev = load();
  const next = normalizeStudyLanguageState(value);
  if (prev.lang === next.lang && prev.script === next.script) return false;
  state = next;
  try {
    writeJsonAtomicSync(filePath(), next);
  } catch {
    /* the in-memory value still applies for this session */
  }
  for (const listener of listeners) {
    try {
      listener(next, prev);
    } catch {
      /* one listener's failure must not stop the others */
    }
  }
  return true;
}

/** Subscribe to study-language changes. Returns an unsubscribe. */
export function onMainStudyLanguageChanged(
  listener: (next: StudyLanguageState, prev: StudyLanguageState) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerStudyLanguageIpc(): void {
  ipcMain.handle('study:setLanguage', (_e, value: unknown) => {
    setMainStudyLanguage(value);
  });
}

/** Tests only. */
export function __setStudyLanguageStateForTests(next: StudyLanguageState | null): void {
  state = next;
}
