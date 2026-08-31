/**
 * Persisted YouTube store locations, relative to Electron's userData path.
 *
 * There are two subtitle caches because the playlist manager and the media
 * library have different acquisition flows. Files must enumerate both; folding
 * them into one guessed directory would hide content written by the other flow.
 */
export const YOUTUBE_PLAYLIST_STORE_FILE = 'yt-playlists.json';
export const YOUTUBE_TRANSCRIPT_DIRECTORY = 'yt-transcripts';
export const YOUTUBE_PLAYLIST_SUBTITLE_DIRECTORY = 'yt-subs';
export const YOUTUBE_MEDIA_SUBTITLE_DIRECTORY = 'subs-cache';

export const YOUTUBE_SUBTITLE_DIRECTORIES = [
  YOUTUBE_PLAYLIST_SUBTITLE_DIRECTORY,
  YOUTUBE_MEDIA_SUBTITLE_DIRECTORY,
] as const;
