/** Persisted subtitle/transcription locations relative to Electron userData. */
export const SUBTITLE_LIBRARY_DIRECTORY = 'subtitles';
export const SUBTITLE_DISCOVERY_SETTINGS_FILE = 'subtitle-discovery.json';
export const TRANSCRIPTION_QUEUE_FILE = 'transcription-jobs.json';

/**
 * Provider downloads and generated transcription/fusion tracks intentionally
 * share one media-id directory. Provenance comes from each media record, not
 * from a guessed folder name.
 */
export function subtitleStorageMediaId(mediaId: string): string {
  return mediaId.replace(/[^a-zA-Z0-9_-]/g, '');
}
