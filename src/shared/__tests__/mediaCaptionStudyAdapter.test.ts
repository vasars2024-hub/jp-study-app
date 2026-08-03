import { describe, expect, it } from 'vitest';
import type { VideoCore_VideoPlaybackInfo } from '@/app/(main)/_features/video-core/video-core.atoms';
import type { MediaCaptionsManager } from '@/app/(main)/_features/video-core/video-core-media-captions';
import {
  mediaCaptionCues,
  normalizeMediaCaptionTracks,
} from '../../media/mediaCaptionStudyAdapter';

function managerWithVtt(content: string): MediaCaptionsManager {
  return {
    getTracks: () => [{
      number: 0,
      label: 'Japanese',
      language: 'ja',
    }],
    getTrackContent: (trackNumber: number) => trackNumber === 0 ? content : null,
  } as unknown as MediaCaptionsManager;
}

describe('provider subtitle study adapter', () => {
  it('projects provider VTT cues onto the VideoCore study timeline', async () => {
    const manager = managerWithVtt([
      'WEBVTT',
      '',
      '00:00:00.250 --> 00:00:02.500',
      'フリーレンは魔法を勉強している。',
      '',
      '00:00:02.500 --> 00:00:05.000',
      'この字幕から言葉を採掘できる。',
    ].join('\n'));

    await expect(mediaCaptionCues(manager, 0)).resolves.toEqual([
      {
        index: 0,
        trackNumber: 0,
        text: 'フリーレンは魔法を勉強している。',
        startMs: 250,
        endMs: 2_500,
      },
      {
        index: 1,
        trackNumber: 0,
        text: 'この字幕から言葉を採掘できる。',
        startMs: 2_500,
        endMs: 5_000,
      },
    ]);
  });

  it('retains provider language and default-track metadata', () => {
    const manager = managerWithVtt('WEBVTT');
    const playbackInfo = {
      subtitleTracks: [{ default: true }],
    } as unknown as VideoCore_VideoPlaybackInfo;

    expect(normalizeMediaCaptionTracks(manager, playbackInfo)).toEqual([{
      type: 'file',
      number: 0,
      label: 'Japanese',
      language: 'ja',
      forced: false,
      default: true,
    }]);
  });

  it('returns no cues until the provider track content is loaded', async () => {
    const manager = managerWithVtt('');
    await expect(mediaCaptionCues(manager, 0)).resolves.toEqual([]);
  });
});
