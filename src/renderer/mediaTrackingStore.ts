import type { MediaContentType } from '../shared/mediaProviders';
import {
  createEmptyMediaTrackingDocument,
  getMediaTrackingRecord,
  markMediaEpisodesWatched,
  normalizeMediaTrackingDocument,
  removeMediaTrackingRecord,
  setMediaWatched,
  upsertMediaTrackingRecord,
  type MediaEpisodeMark,
  type MediaReleaseSchedule,
  type MediaTrackingDocument,
  type MediaTrackingPreferences,
  type MediaTrackingRecord,
  type MediaTrackingStatus,
  type MediaTrackingValidationResult,
} from '../shared/mediaTracking';
import { manageMediaTracking, type MediaTrackingManagementAction, type MediaTrackingManagementResult, type MediaTrackingManagementTarget } from '../shared/mediaTrackingManagement';

export const MEDIA_TRACKING_STORAGE_KEY = 'jp-media-tracking-v1';

export type MediaTrackingLoadState =
  | { status: 'ready'; document: MediaTrackingDocument }
  | { status: 'error'; document: MediaTrackingDocument; error: string };

let memoryFallback: MediaTrackingDocument | null = null;

/**
 * A shallow patch of a tracking record's user-editable fields. The store re-validates
 * every field through {@link normalizeMediaTrackingDocument}; callers never touch
 * `addedAt`/`updatedAt` — the clock is this layer's sole responsibility.
 */
export interface MediaTrackingPatch {
  status?: MediaTrackingStatus;
  favorite?: boolean;
  rating?: number | null;
  notes?: string;
  preferences?: Partial<MediaTrackingPreferences>;
  schedule?: Partial<MediaReleaseSchedule>;
}

function readCandidate(key: string): MediaTrackingDocument | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const validated = normalizeMediaTrackingDocument(JSON.parse(raw));
    if (validated.issues.some((issue) => issue.path === '' || issue.path === 'version')) return null;
    return validated.value;
  } catch {
    return null;
  }
}

export function loadMediaTrackingDocument(): MediaTrackingDocument {
  try {
    const document = readCandidate(MEDIA_TRACKING_STORAGE_KEY);
    if (document) {
      memoryFallback = document;
      return document;
    }
  } catch { /* retain the last validated in-memory snapshot */ }
  return memoryFallback ?? createEmptyMediaTrackingDocument();
}

/** Reads the local snapshot with a user-facing validation state while retaining the last safe value. */
export function loadMediaTrackingSnapshot(): MediaTrackingLoadState {
  try {
    const raw = localStorage.getItem(MEDIA_TRACKING_STORAGE_KEY);
    if (raw) {
      const validated = normalizeMediaTrackingDocument(JSON.parse(raw));
      if (validated.issues.some((issue) => issue.path === '' || issue.path === 'version')) {
        return { status: 'error', document: memoryFallback ?? createEmptyMediaTrackingDocument(), error: 'The local tracking data could not be validated.' };
      }
      memoryFallback = validated.value;
      return { status: 'ready', document: validated.value };
    }
  } catch {
    return { status: 'error', document: memoryFallback ?? createEmptyMediaTrackingDocument(), error: 'The local tracking data could not be read.' };
  }
  return { status: 'ready', document: memoryFallback ?? createEmptyMediaTrackingDocument() };
}

export function saveMediaTrackingDocument(input: unknown): MediaTrackingValidationResult {
  const result = normalizeMediaTrackingDocument(input);
  memoryFallback = result.value;
  try { localStorage.setItem(MEDIA_TRACKING_STORAGE_KEY, JSON.stringify(result.value)); } catch { /* retain in memory */ }
  return result;
}

/** Existing record for an identity, or a fresh normalized default seeded with its content type. */
function resolveRecord(document: MediaTrackingDocument, identityId: string, contentType: MediaContentType): MediaTrackingRecord {
  const existing = getMediaTrackingRecord(document, identityId);
  if (existing) return existing;
  return normalizeMediaTrackingDocument({ records: [{ identityId, contentType }] }).value.records[0];
}

/**
 * Applies `mutate` to the identity's record and persists, injecting the clock:
 * `addedAt` is stamped once on first insert and preserved thereafter; `updatedAt` is
 * stamped on every write. The pure tracking layer re-validates the merged record.
 */
function writeRecord(
  identityId: string,
  contentType: MediaContentType,
  mutate: (record: MediaTrackingRecord) => MediaTrackingRecord,
  now: number,
): MediaTrackingDocument {
  const current = loadMediaTrackingDocument();
  const existing = getMediaTrackingRecord(current, identityId);
  const iso = new Date(now).toISOString();
  const mutated = mutate(existing ?? resolveRecord(current, identityId, contentType));
  const merged: MediaTrackingRecord = { ...mutated, addedAt: existing?.addedAt ?? iso, updatedAt: iso };
  return saveMediaTrackingDocument(upsertMediaTrackingRecord(current, merged).value).value;
}

/** Inserts or patches the tracking entry for an identity, stamping the clock. */
export function upsertMediaTrackingEntry(
  identityId: string,
  contentType: MediaContentType,
  patch: MediaTrackingPatch = {},
  now = Date.now(),
): MediaTrackingDocument {
  return writeRecord(identityId, contentType, (record) => ({
    ...record,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
    ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    preferences: { ...record.preferences, ...patch.preferences },
    schedule: { ...record.schedule, ...patch.schedule },
  }), now);
}

/** Adds watched (season, episode) marks to an episodic entry, stamping the clock. */
export function markMediaTrackingEpisodesWatched(
  identityId: string,
  contentType: MediaContentType,
  marks: MediaEpisodeMark[],
  now = Date.now(),
): MediaTrackingDocument {
  return writeRecord(identityId, contentType, (record) => markMediaEpisodesWatched(record, marks), now);
}

/** Sets the watched flag on a unit (movie/special) entry, stamping the clock. */
export function setMediaTrackingWatched(
  identityId: string,
  contentType: MediaContentType,
  watched: boolean,
  now = Date.now(),
): MediaTrackingDocument {
  return writeRecord(identityId, contentType, (record) => setMediaWatched(record, watched), now);
}

/** Removes the tracking entry for an identity, if present. */
export function removeMediaTrackingEntry(identityId: string): MediaTrackingDocument {
  return saveMediaTrackingDocument(removeMediaTrackingRecord(loadMediaTrackingDocument(), identityId)).value;
}

/** Applies a partition-checked management correction and timestamps successful writes. */
export function manageMediaTrackingEntry(
  target: MediaTrackingManagementTarget,
  action: MediaTrackingManagementAction,
  now = Date.now(),
): MediaTrackingManagementResult {
  const current = loadMediaTrackingDocument();
  const result = manageMediaTracking(current, target, action);
  if (!result.ok) return result;
  const iso = new Date(now).toISOString();
  const stamped = upsertMediaTrackingRecord(result.value, { ...result.record, updatedAt: iso }).value;
  const saved = saveMediaTrackingDocument(stamped).value;
  const savedRecord = getMediaTrackingRecord(saved, target.identityId);
  if (!savedRecord) return { ok: false, value: current, reason: 'not-found' };
  return { ok: true, value: saved, record: savedRecord };
}
