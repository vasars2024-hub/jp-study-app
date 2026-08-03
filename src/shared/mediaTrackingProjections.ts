import { summarizeMediaTrackingProgress, type MediaTrackingDocument, type MediaTrackingRecord, type MediaTrackingStatus } from './mediaTracking';

export type MediaTrackingProjectionSection = 'watching' | 'completed' | 'planned' | 'dropped' | 'favorites' | 'all';

export interface MediaTrackingProjectionItem {
  identityId: string;
  contentType: MediaTrackingRecord['contentType'];
  status: MediaTrackingStatus;
  favorite: boolean;
  progress: ReturnType<typeof summarizeMediaTrackingProgress>;
  nextEpisodeNumber: number | null;
  releaseStatus: MediaTrackingRecord['schedule']['status'];
  updatedAt: string | null;
}

/** Pure, stable library/watchlist view. Records are never mutated or reordered in storage. */
export function projectMediaTracking(document: MediaTrackingDocument, section: MediaTrackingProjectionSection = 'all'): MediaTrackingProjectionItem[] {
  const records = document.records.filter((record) => {
    if (section === 'all') return true;
    if (section === 'favorites') return record.favorite;
    return record.status === section;
  });
  return records.map((record) => ({
    identityId: record.identityId,
    contentType: record.contentType,
    status: record.status,
    favorite: record.favorite,
    progress: summarizeMediaTrackingProgress(record),
    nextEpisodeNumber: record.schedule.nextEpisodeNumber,
    releaseStatus: record.schedule.status,
    updatedAt: record.updatedAt,
  })).sort((a, b) => a.identityId.localeCompare(b.identityId));
}

export function projectMediaTrackingLibrary(document: MediaTrackingDocument): MediaTrackingProjectionItem[] {
  return projectMediaTracking(document, 'all');
}

export function projectMediaTrackingWatchlist(document: MediaTrackingDocument): MediaTrackingProjectionItem[] {
  return projectMediaTracking(document, 'planned');
}
