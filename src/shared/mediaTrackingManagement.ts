import type { MediaContentType } from './mediaProviders';
import {
  getMediaTrackingRecord,
  normalizeMediaTrackingDocument,
  upsertMediaTrackingRecord,
  type MediaEpisodeMark,
  type MediaTrackingDocument,
  type MediaTrackingPreferences,
  type MediaTrackingRecord,
  type MediaTrackingStatus,
} from './mediaTracking';

export interface MediaTrackingManagementTarget {
  identityId: string;
  identityPartition: string;
  contentType: MediaContentType;
}

export type MediaTrackingManagementAction =
  | { type: 'details/set'; status?: MediaTrackingStatus; favorite?: boolean; rating?: number | null; notes?: string; preferences?: Partial<MediaTrackingPreferences> }
  | { type: 'totals/set'; totalEpisodes: number | null; totalSeasons: number | null }
  | { type: 'episode/add'; mark: MediaEpisodeMark }
  | { type: 'episode/remove'; mark: MediaEpisodeMark }
  | { type: 'episode/replace'; from: MediaEpisodeMark; to: MediaEpisodeMark }
  | { type: 'unit/set'; watched: boolean };

export type MediaTrackingManagementResult =
  | { ok: true; value: MediaTrackingDocument; record: MediaTrackingRecord }
  | { ok: false; value: MediaTrackingDocument; reason: 'partition-mismatch' | 'not-found' | 'content-type-mismatch' | 'invalid-progress' };

function sameMark(left: MediaEpisodeMark, right: MediaEpisodeMark): boolean {
  return left.season === right.season && left.episode === right.episode;
}

/** Pure offline correction command. The caller supplies and persists the resulting snapshot. */
export function manageMediaTracking(
  document: MediaTrackingDocument,
  target: MediaTrackingManagementTarget,
  action: MediaTrackingManagementAction,
): MediaTrackingManagementResult {
  const current = normalizeMediaTrackingDocument(document).value;
  if (target.identityPartition !== target.contentType) return { ok: false, value: current, reason: 'partition-mismatch' };
  const record = getMediaTrackingRecord(current, target.identityId);
  if (!record) return { ok: false, value: current, reason: 'not-found' };
  if (record.contentType !== target.contentType) return { ok: false, value: current, reason: 'content-type-mismatch' };

  let next: MediaTrackingRecord;
  if (action.type === 'details/set') {
    next = {
      ...record,
      ...(action.status !== undefined ? { status: action.status } : {}),
      ...(action.favorite !== undefined ? { favorite: action.favorite } : {}),
      ...(action.rating !== undefined ? { rating: action.rating } : {}),
      ...(action.notes !== undefined ? { notes: action.notes } : {}),
      preferences: { ...record.preferences, ...action.preferences },
    };
  } else if (action.type === 'unit/set') {
    if (record.progress.kind !== 'unit') return { ok: false, value: current, reason: 'invalid-progress' };
    next = { ...record, progress: { kind: 'unit', watched: action.watched } };
  } else {
    if (record.progress.kind !== 'episodic') return { ok: false, value: current, reason: 'invalid-progress' };
    let watchedEpisodes = record.progress.watchedEpisodes;
    if (action.type === 'episode/add') watchedEpisodes = [...watchedEpisodes, action.mark];
    if (action.type === 'episode/remove') watchedEpisodes = watchedEpisodes.filter((mark) => !sameMark(mark, action.mark));
    if (action.type === 'episode/replace') watchedEpisodes = watchedEpisodes.map((mark) => sameMark(mark, action.from) ? action.to : mark);
    next = {
      ...record,
      progress: action.type === 'totals/set'
        ? { ...record.progress, totalEpisodes: action.totalEpisodes, totalSeasons: action.totalSeasons }
        : { ...record.progress, watchedEpisodes },
    };
  }
  const result = upsertMediaTrackingRecord(current, next);
  const saved = getMediaTrackingRecord(result.value, record.identityId);
  if (!saved) return { ok: false, value: current, reason: 'not-found' };
  return { ok: true, value: result.value, record: saved };
}
