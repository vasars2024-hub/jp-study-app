/**
 * snd5 — the stored study-mode presets, apart from the link that acts on them
 * (studyModeSoundscape.ts). The widget only reads and writes these; keeping the
 * module free of the command registry keeps the widget's import graph small.
 */
import { writeLocalStorageJson } from '../localStorageWrite';
import { normalizeStudyModePresets, type StudyModePresets } from './soundscapeModel';

export const STUDY_MODE_PRESETS_KEY = 'jp-soundscape-modes-v1';
export const STUDY_MODE_PRESETS_EVENT = 'jp-soundscape-modes-changed';

export function loadStudyModePresets(): StudyModePresets {
  try {
    const raw = localStorage.getItem(STUDY_MODE_PRESETS_KEY);
    return normalizeStudyModePresets(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeStudyModePresets(null);
  }
}

export function saveStudyModePresets(patch: Partial<StudyModePresets>): StudyModePresets {
  const next = normalizeStudyModePresets({ ...loadStudyModePresets(), ...patch });
  writeLocalStorageJson(STUDY_MODE_PRESETS_KEY, next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STUDY_MODE_PRESETS_EVENT, { detail: next }));
  }
  return next;
}

export function onStudyModePresetsChanged(cb: (presets: StudyModePresets) => void): () => void {
  const handler = (e: Event): void =>
    cb((e as CustomEvent<StudyModePresets>).detail ?? loadStudyModePresets());
  window.addEventListener(STUDY_MODE_PRESETS_EVENT, handler);
  return () => window.removeEventListener(STUDY_MODE_PRESETS_EVENT, handler);
}
