import { describe, expect, it } from 'vitest';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  normalizeMediaWorkspaceOpenRequest,
} from '../mediaWorkspace';

describe('adopted media workspace handoff', () => {
  it('uses one renderer-wide event name', () => {
    expect(MEDIA_WORKSPACE_OPEN_EVENT).toBe('seanime:media-workspace-open');
  });

  it('normalizes a local-file request with a stable caller id', () => {
    expect(normalizeMediaWorkspaceOpenRequest(
      { localFilePath: '  C:\\Anime\\Episode 01.mkv  ' },
      42,
    )).toEqual({
      kind: 'local',
      requestId: 42,
      localFilePath: 'C:\\Anime\\Episode 01.mkv',
    });
  });

  it('normalizes a live provider stream without dropping required headers or subtitles', () => {
    expect(normalizeMediaWorkspaceOpenRequest({
      stream: {
        streamId: 'stream-1',
        episodeId: 'episode-1',
        episodeNumber: 1,
        episodeTitle: 'Episode 1',
        seriesTitle: 'Fixture',
        aniListId: 154587,
        resolution: '1080p',
        playback: {
          providerId: 'provider-a',
          providerLabel: 'Provider A',
          server: 'main',
          kind: 'hls',
          url: ' https://stream.test/master.m3u8 ',
          headers: { Referer: 'https://provider.test/' },
          subtitles: [{
            url: 'https://subs.test/en.vtt',
            language: 'en',
            default: true,
          }],
          dubbed: false,
        },
      },
    }, 43)).toMatchObject({
      kind: 'stream',
      requestId: 43,
      stream: {
        streamId: 'stream-1',
        playback: {
          url: 'https://stream.test/master.m3u8',
          headers: { Referer: 'https://provider.test/' },
          subtitles: [{ language: 'en' }],
        },
      },
    });
  });

  describe('startAtSec — the watch-to-review loop\'s return path', () => {
    it('carries an explicit start position through for a local file', () => {
      const request = normalizeMediaWorkspaceOpenRequest(
        { localFilePath: 'C:\\Media\\A.mkv', startAtSec: 12.5 },
        7,
      );
      expect(request).toEqual({
        kind: 'local',
        requestId: 7,
        localFilePath: 'C:\\Media\\A.mkv',
        startAtSec: 12.5,
      });
    });

    it('omits the field entirely for an ordinary open, so resume stays authoritative', () => {
      const request = normalizeMediaWorkspaceOpenRequest({ localFilePath: 'C:\\Media\\A.mkv' }, 7);
      expect(request).not.toHaveProperty('startAtSec');
    });

    it('keeps an explicit 0 — the top of the file is a real destination', () => {
      const request = normalizeMediaWorkspaceOpenRequest(
        { localFilePath: 'C:\\Media\\A.mkv', startAtSec: 0 },
        7,
      );
      expect(request).toHaveProperty('startAtSec', 0);
    });

    it('rejects a value that would make the element seek nowhere', () => {
      // NaN or a negative reaching `initialState.currentTime` reads as a broken file
      // rather than as a bad request, so it is dropped at the boundary.
      for (const startAtSec of [Number.NaN, -1, Infinity, '30' as unknown as number]) {
        const request = normalizeMediaWorkspaceOpenRequest(
          { localFilePath: 'C:\\Media\\A.mkv', startAtSec },
          7,
        );
        expect(request).not.toHaveProperty('startAtSec');
      }
    });
  });

  it('does not create playback requests for navigation-only opens', () => {
    expect(normalizeMediaWorkspaceOpenRequest({})).toBeNull();
    expect(normalizeMediaWorkspaceOpenRequest(null)).toBeNull();
    expect(normalizeMediaWorkspaceOpenRequest({
      stream: {
        streamId: 'expired',
        episodeId: 'episode-1',
        episodeNumber: 1,
        episodeTitle: '',
        seriesTitle: '',
        aniListId: null,
        resolution: '',
        playback: {
          providerId: 'provider-a',
          providerLabel: 'Provider A',
          server: 'main',
          kind: 'hls',
          url: '',
          headers: {},
          subtitles: [],
          dubbed: false,
          refreshRequired: true,
        },
      },
    })).toBeNull();
  });
});
