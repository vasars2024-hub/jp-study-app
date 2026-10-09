/**
 * music2 — the lyric study loop's switches: pause after each line, repeat the
 * line being sung, colour words by how well you know them, reading aid.
 *
 * Their own record rather than the video player's preferences: a song and an
 * episode are studied differently (most people want auto-pause in a drama and
 * not in a song they are humming along to), and the two surfaces can be open at
 * once over the same media workspace.
 */
import { useEffect, useState } from 'react';
import { writeLocalStorageJson } from './localStorageWrite';

export const MUSIC_STUDY_PREFS_KEY = 'jp-music-study-prefs-v1';
const EVENT = 'music-study-prefs-changed';

export interface MusicStudyPrefs {
  autoPause: boolean;
  lineLoop: boolean;
  knownHighlight: boolean;
  readingAid: boolean;
}

export const DEFAULT_MUSIC_STUDY_PREFS: MusicStudyPrefs = {
  autoPause: false,
  lineLoop: false,
  knownHighlight: true,
  readingAid: false,
};

export function loadMusicStudyPrefs(): MusicStudyPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(MUSIC_STUDY_PREFS_KEY) ?? '{}') as Partial<MusicStudyPrefs> | null;
    const value = raw && typeof raw === 'object' ? raw : {};
    const pick = (key: keyof MusicStudyPrefs): boolean =>
      typeof value[key] === 'boolean' ? Boolean(value[key]) : DEFAULT_MUSIC_STUDY_PREFS[key];
    return {
      autoPause: pick('autoPause'),
      lineLoop: pick('lineLoop'),
      knownHighlight: pick('knownHighlight'),
      readingAid: pick('readingAid'),
    };
  } catch {
    return { ...DEFAULT_MUSIC_STUDY_PREFS };
  }
}

export function patchMusicStudyPrefs(patch: Partial<MusicStudyPrefs>): MusicStudyPrefs {
  const next = { ...loadMusicStudyPrefs(), ...patch };
  writeLocalStorageJson(MUSIC_STUDY_PREFS_KEY, next);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT));
  return next;
}

export function onMusicStudyPrefsChanged(cb: (prefs: MusicStudyPrefs) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (): void => cb(loadMusicStudyPrefs());
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === MUSIC_STUDY_PREFS_KEY) handler();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', onStorage);
  };
}

export function useMusicStudyPrefs(): MusicStudyPrefs {
  const [prefs, setPrefs] = useState(loadMusicStudyPrefs);
  useEffect(() => onMusicStudyPrefsChanged(setPrefs), []);
  return prefs;
}
