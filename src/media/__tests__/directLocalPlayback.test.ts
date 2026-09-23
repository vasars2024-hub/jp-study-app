import { describe, expect, it } from 'vitest';
import { videoCoreResumeKey } from '../../shared/videoCoreStudy';
import { directLocalPlaybackInfo, sidecarCannotServeFile } from '../directLocalPlayback';

describe('sidecarCannotServeFile', () => {
  it('routes around an unmatched file', () => {
    expect(sidecarCannotServeFile(
      'local file has not been matched to a media: E:\\Dramas\\Midnight Diner - 01.mkv',
    )).toBe(true);
  });

  it('routes around a file missing from the sidecar table', () => {
    expect(sidecarCannotServeFile(
      'cannot play local file, could not find local file: C:\\Videos\\clip.mp4',
    )).toBe(true);
  });

  it('keeps a real failure as a failure', () => {
    expect(sidecarCannotServeFile('failed to open file: permission denied')).toBe(false);
    expect(sidecarCannotServeFile(undefined)).toBe(false);
    expect(sidecarCannotServeFile({ reason: 'not been matched to a media' })).toBe(false);
  });
});

describe('directLocalPlaybackInfo', () => {
  const base = {
    requestId: 7,
    localFilePath: 'E:\\Dramas\\Midnight Diner - 01.mkv',
    streamUrl: 'playfile://token-1',
  };

  it('plays the token URL natively with no container subtitle tracks', () => {
    const info = directLocalPlaybackInfo(base);
    expect(info.streamUrl).toBe('playfile://token-1');
    expect(info.streamType).toBe('native');
    expect(info.playbackType).toBe('localfile');
    // No tracks here is what makes VideoCore pick the event-track manager the study
    // overlay mounts the sidecar subtitle into.
    expect(info.subtitleTracks).toBeUndefined();
    expect(info.localFile?.name).toBe('Midnight Diner - 01.mkv');
  });

  it('shares its resume key with a directstream open of the same file', () => {
    const info = directLocalPlaybackInfo(base);
    expect(videoCoreResumeKey({ localFilePath: info.localFile?.path })).toBe(
      videoCoreResumeKey({ localFilePath: base.localFilePath }),
    );
  });

  it('starts where asked, and only for a positive time', () => {
    expect(directLocalPlaybackInfo({ ...base, startAtSec: 93 }).initialState).toEqual({ currentTime: 93 });
    expect(directLocalPlaybackInfo({ ...base, startAtSec: 0 }).initialState).toBeUndefined();
  });

  it('gives every request its own playback id', () => {
    expect(directLocalPlaybackInfo(base).id).not.toBe(
      directLocalPlaybackInfo({ ...base, requestId: 8 }).id,
    );
  });
});
