/**
 * Visual novel study preferences (7.5): mining context lines, the screenshot,
 * and the line-study loop. Renderer-owned: none of these change how main
 * captures, so they stay out of `VisualNovelSettings` (an update there restarts
 * the capture session).
 */
import { useEffect, useState } from 'react';
import { writeLocalStorageJson } from './localStorageWrite';
import { vn5NormalizeStudyPrefs, type Vn5StudyPrefs } from '../shared/visualNovelStudy5';

const VN5_PREFS_KEY = 'jp-vn5-study-prefs';
const listeners = new Set<(prefs: Vn5StudyPrefs) => void>();

export function loadVn5StudyPrefs(): Vn5StudyPrefs {
  try {
    const raw = localStorage.getItem(VN5_PREFS_KEY);
    return vn5NormalizeStudyPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return vn5NormalizeStudyPrefs(null);
  }
}

export function saveVn5StudyPrefs(patch: Partial<Vn5StudyPrefs>): Vn5StudyPrefs {
  const next = vn5NormalizeStudyPrefs({ ...loadVn5StudyPrefs(), ...patch });
  writeLocalStorageJson(VN5_PREFS_KEY, next);
  for (const listener of listeners) listener(next);
  return next;
}

export function useVn5StudyPrefs(): [Vn5StudyPrefs, (patch: Partial<Vn5StudyPrefs>) => void] {
  const [prefs, setPrefs] = useState<Vn5StudyPrefs>(loadVn5StudyPrefs);
  useEffect(() => {
    listeners.add(setPrefs);
    return () => {
      listeners.delete(setPrefs);
    };
  }, []);
  return [prefs, (patch) => setPrefs(saveVn5StudyPrefs(patch))];
}
