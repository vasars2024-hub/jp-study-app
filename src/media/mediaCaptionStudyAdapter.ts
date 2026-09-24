import type { VideoCore_VideoPlaybackInfo } from '@/app/(main)/_features/video-core/video-core.atoms';
import type { MediaCaptionsManager } from '@/app/(main)/_features/video-core/video-core-media-captions';
import type {
  NormalizedTrackInfo,
  VideoCoreActiveCue,
} from '@/app/(main)/_features/video-core/video-core-subtitles';
import { parseText } from 'media-captions';

/**
 * VideoCore has two subtitle paths. Embedded ASS/MKV tracks use SubtitleManager,
 * while provider VTT files use MediaCaptionsManager. This adapter projects the
 * latter onto the same cue/track shape consumed by Study Mode and mining.
 */
export function normalizeMediaCaptionTracks(
  manager: MediaCaptionsManager,
  playbackInfo: VideoCore_VideoPlaybackInfo | null,
): NormalizedTrackInfo[] {
  return manager.getTracks().map((track) => ({
    type: 'file',
    number: track.number,
    label: track.label,
    language: track.language,
    forced: false,
    default: Boolean(playbackInfo?.subtitleTracks?.[track.number]?.default),
  }));
}

export async function mediaCaptionCues(
  manager: MediaCaptionsManager,
  trackNumber: number,
): Promise<VideoCoreActiveCue[]> {
  // The provider fetches a track only when it is SELECTED. The second line reads the track
  // beside the selected one, which on this path was never fetched: its content was null and
  // the English line under a Japanese one stayed blank. Loading it here does not select it.
  const content = typeof manager.loadTrackContent === 'function'
    ? await manager.loadTrackContent(trackNumber)
    : manager.getTrackContent(trackNumber);
  if (!content) return [];
  const parsed = await parseText(content);
  return parsed.cues.map((cue, index) => ({
    index,
    trackNumber,
    text: cue.text,
    startMs: Math.round(cue.startTime * 1_000),
    endMs: Math.round(cue.endTime * 1_000),
  }));
}
