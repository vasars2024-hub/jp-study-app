import type { MediaContentType } from '../shared/mediaProviders';
import {
  getMediaTrackingRecord,
  markMediaEpisodesWatched,
  normalizeMediaTrackingDocument,
  setMediaWatched,
  upsertMediaTrackingRecord,
  type MediaEpisodeMark,
  type MediaTrackingDocument,
  type MediaTrackingRecord,
  type MediaTrackingStatus,
} from '../shared/mediaTracking';
import { saveMediaTrackingDocument } from './mediaTrackingStore';

/** Identity-bearing subset exposed by a merged Unified Search result. */
export interface UnifiedSearchTrackingTarget {
  identityId: string;
  identityPartition: string;
  contentType: MediaContentType;
}

export type UnifiedSearchTrackingMutation =
  | { type: 'status/set'; status: Extract<MediaTrackingStatus, 'planned' | 'on-hold' | 'completed'> }
  | { type: 'progress/update'; episode?: MediaEpisodeMark; watched?: boolean };

export type UnifiedSearchTrackingMutationResult =
  | { ok: true; value: MediaTrackingDocument; record: MediaTrackingRecord }
  | { ok: false; value: MediaTrackingDocument; reason: 'invalid-identity' | 'partition-mismatch' | 'content-type-mismatch' | 'invalid-progress' };

const normalizedIdentityId = (value: string): string => value.trim().toLowerCase();

function defaultRecord(target: UnifiedSearchTrackingTarget): MediaTrackingRecord | null {
  return normalizeMediaTrackingDocument({
    records: [{ identityId: target.identityId, contentType: target.contentType }],
  }).value.records[0] ?? null;
}

/**
 * Applies an offline tracking action to the exact resolved identity represented by a
 * merged search result. The content-type partition is an integrity boundary: a
 * result can never mutate a record from another partition, even if IDs collide.
 * The caller supplies the timestamp, keeping the reducer deterministic and testable.
 */
export function mutateUnifiedSearchTracking(
  document: MediaTrackingDocument | unknown,
  target: UnifiedSearchTrackingTarget,
  mutation: UnifiedSearchTrackingMutation,
  updatedAt: string,
): UnifiedSearchTrackingMutationResult {
  const current = normalizeMediaTrackingDocument(document).value;
  const identityId = normalizedIdentityId(target.identityId);
  if (!identityId || !defaultRecord({ ...target, identityId })) {
    return { ok: false, value: current, reason: 'invalid-identity' };
  }
  if (target.identityPartition !== target.contentType) {
    return { ok: false, value: current, reason: 'partition-mismatch' };
  }

  const existing = getMediaTrackingRecord(current, identityId);
  if (existing && existing.contentType !== target.contentType) {
    return { ok: false, value: current, reason: 'content-type-mismatch' };
  }
  const base = existing ?? defaultRecord({ ...target, identityId });
  if (!base) return { ok: false, value: current, reason: 'invalid-identity' };

  let next = base;
  if (mutation.type === 'status/set') {
    next = { ...base, status: mutation.status };
    if (mutation.status === 'completed' && next.progress.kind === 'unit') {
      next = setMediaWatched(next, true);
    }
  } else if (base.progress.kind === 'episodic' && mutation.episode && mutation.watched === undefined) {
    next = markMediaEpisodesWatched(base, [mutation.episode]);
    if (next.status === 'planned') next = { ...next, status: 'watching' };
  } else if (base.progress.kind === 'unit' && typeof mutation.watched === 'boolean' && mutation.episode === undefined) {
    next = setMediaWatched(base, mutation.watched);
    next = { ...next, status: mutation.watched ? 'completed' : 'planned' };
  } else {
    return { ok: false, value: current, reason: 'invalid-progress' };
  }

  const stamped = {
    ...next,
    identityId,
    contentType: target.contentType,
    addedAt: existing?.addedAt ?? updatedAt,
    updatedAt,
  };
  const value = upsertMediaTrackingRecord(current, stamped).value;
  const record = getMediaTrackingRecord(value, identityId);
  if (!record) return { ok: false, value: current, reason: 'invalid-identity' };
  return { ok: true, value, record };
}

/** Store boundary for the pure reducer; no provider or network execution occurs. */
export function persistUnifiedSearchTrackingMutation(
  document: MediaTrackingDocument,
  target: UnifiedSearchTrackingTarget,
  mutation: UnifiedSearchTrackingMutation,
  now = Date.now(),
): UnifiedSearchTrackingMutationResult {
  const result = mutateUnifiedSearchTracking(document, target, mutation, new Date(now).toISOString());
  if (!result.ok) return result;
  const saved = saveMediaTrackingDocument(result.value).value;
  return { ok: true, value: saved, record: getMediaTrackingRecord(saved, target.identityId) ?? result.record };
}
