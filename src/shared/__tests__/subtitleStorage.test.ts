import { describe, expect, it } from 'vitest';
import {
  SUBTITLE_DISCOVERY_SETTINGS_FILE,
  SUBTITLE_LIBRARY_DIRECTORY,
  TRANSCRIPTION_QUEUE_FILE,
  subtitleStorageMediaId,
} from '../subtitleStorage';

describe('persisted subtitle storage contract', () => {
  it('names the stores owned by discovery and transcription', () => {
    expect(SUBTITLE_LIBRARY_DIRECTORY).toBe('subtitles');
    expect(SUBTITLE_DISCOVERY_SETTINGS_FILE).toBe('subtitle-discovery.json');
    expect(TRANSCRIPTION_QUEUE_FILE).toBe('transcription-jobs.json');
  });

  it('places every cached track below a sanitized media-id directory', () => {
    expect(subtitleStorageMediaId('media:one/two')).toBe('mediaonetwo');
    expect(subtitleStorageMediaId('episode_01-JA')).toBe('episode_01-JA');
  });
});
