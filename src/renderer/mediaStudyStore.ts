import {
  createEmptyMediaStudyDatabase,
  finishMediaStudySession,
  normalizeMediaStudyDatabase,
  recordMediaStudyAction,
  updateMediaStudySession,
  upsertMediaLanguageProfile,
  type MediaLanguageProfile,
  type MediaStudyDatabase,
} from '../shared/mediaStudyDatabase';
import type { MediaStudyActionId } from '../shared/mediaStudyIntegration';
import { IDB_KEYS, mirrorToIdb } from './storage/storage';

export const MEDIA_STUDY_STORAGE_KEY = 'jp-media-study-database-v1';
export const MEDIA_STUDY_CHANGED_EVENT = 'media-study-database-changed';

let memoryFallback: MediaStudyDatabase | null = null;

export function loadMediaStudyDatabase(): MediaStudyDatabase {
  try {
    const raw = localStorage.getItem(MEDIA_STUDY_STORAGE_KEY);
    const database = raw ? normalizeMediaStudyDatabase(JSON.parse(raw)) : createEmptyMediaStudyDatabase();
    memoryFallback = database;
    return database;
  } catch {
    return memoryFallback ?? createEmptyMediaStudyDatabase();
  }
}

export function saveMediaStudyDatabase(value: unknown): MediaStudyDatabase {
  const database = normalizeMediaStudyDatabase(value);
  memoryFallback = database;
  try {
    localStorage.setItem(MEDIA_STUDY_STORAGE_KEY, JSON.stringify(database));
  } catch {
    // The durable mirror below remains available when the hot cache is full.
  }
  mirrorToIdb(IDB_KEYS.mediaStudy, database);
  window.dispatchEvent(new CustomEvent<MediaStudyDatabase>(MEDIA_STUDY_CHANGED_EVENT, { detail: database }));
  return database;
}

/**
 * Save a profile, and put its headline numbers on the media item too, so every
 * surface that reads the library (tiles, search, filters) sees the same level
 * the profile holds — the item's `jlptLevel` used to be written only by an
 * agent tool. A profile for something that is not a library item (a season
 * harvest, a visual novel) simply has no item to update.
 */
export function saveMediaLanguageProfile(profile: MediaLanguageProfile): MediaStudyDatabase {
  const database = saveMediaStudyDatabase(upsertMediaLanguageProfile(loadMediaStudyDatabase(), profile));
  const update = typeof window === 'undefined' ? undefined : window.api?.updateMediaMetadata;
  if (update && !profile.mediaId.includes(':')) {
    void update(profile.mediaId, {
      ...(profile.difficulty.jlptLevel ? { jlptLevel: profile.difficulty.jlptLevel } : {}),
      vocabularyCount: profile.vocabulary.uniqueWords,
      kanjiCount: profile.kanji.uniqueKanji,
    }).catch(() => undefined);
  }
  return database;
}

export function startMediaStudySession(
  input: { mediaId: string; title: string; action: MediaStudyActionId; positionSec?: number },
  now = Date.now(),
): string {
  const result = recordMediaStudyAction(loadMediaStudyDatabase(), input, now);
  saveMediaStudyDatabase(result.database);
  return result.session.id;
}

export function addMediaStudySessionProgress(
  sessionId: string,
  patch: Parameters<typeof updateMediaStudySession>[2],
  now = Date.now(),
): MediaStudyDatabase {
  return saveMediaStudyDatabase(updateMediaStudySession(loadMediaStudyDatabase(), sessionId, patch, now));
}

export function endMediaStudySession(
  sessionId: string,
  positionSec = 0,
  now = Date.now(),
): MediaStudyDatabase {
  return saveMediaStudyDatabase(finishMediaStudySession(loadMediaStudyDatabase(), sessionId, positionSec, now));
}

export function onMediaStudyDatabaseChanged(listener: (database: MediaStudyDatabase) => void): () => void {
  const handler = (event: Event): void => {
    listener((event as CustomEvent<MediaStudyDatabase>).detail ?? loadMediaStudyDatabase());
  };
  window.addEventListener(MEDIA_STUDY_CHANGED_EVENT, handler);
  return () => window.removeEventListener(MEDIA_STUDY_CHANGED_EVENT, handler);
}
