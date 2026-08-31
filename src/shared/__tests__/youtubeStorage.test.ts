import { describe, expect, it } from 'vitest';
import {
  YOUTUBE_MEDIA_SUBTITLE_DIRECTORY,
  YOUTUBE_PLAYLIST_STORE_FILE,
  YOUTUBE_PLAYLIST_SUBTITLE_DIRECTORY,
  YOUTUBE_SUBTITLE_DIRECTORIES,
  YOUTUBE_SUBTITLE_DIRECTORY_LAYOUTS,
  YOUTUBE_TRANSCRIPT_DIRECTORY,
  youtubeSubtitleProvenance,
} from '../youtubeStorage';

describe('YouTube persisted storage contract', () => {
  it('names each store owned by the playlist and media acquisition flows', () => {
    expect(YOUTUBE_PLAYLIST_STORE_FILE).toBe('yt-playlists.json');
    expect(YOUTUBE_TRANSCRIPT_DIRECTORY).toBe('yt-transcripts');
    expect(YOUTUBE_PLAYLIST_SUBTITLE_DIRECTORY).toBe('yt-subs');
    expect(YOUTUBE_MEDIA_SUBTITLE_DIRECTORY).toBe('subs-cache');
  });

  it('requires read-only consumers to inspect both distinct subtitle caches', () => {
    expect(YOUTUBE_SUBTITLE_DIRECTORIES).toEqual(['yt-subs', 'subs-cache']);
    expect(new Set(YOUTUBE_SUBTITLE_DIRECTORIES).size).toBe(2);
  });

  it('requires both subtitle cache layouts to be walked recursively', () => {
    expect(YOUTUBE_SUBTITLE_DIRECTORY_LAYOUTS).toEqual([
      { directory: 'yt-subs', recursive: true },
      { directory: 'subs-cache', recursive: true },
    ]);
  });

  it('derives YouTube caption provenance from yt-dlp track names', () => {
    expect(youtubeSubtitleProvenance('video.a.ja.vtt')).toBe('auto-captions');
    expect(youtubeSubtitleProvenance('video.a.zh-Hans.srt')).toBe('auto-captions');
    expect(youtubeSubtitleProvenance('video.ja.vtt')).toBe('human-subs');
    expect(youtubeSubtitleProvenance('episode.ass')).toBe('human-subs');
  });
});
