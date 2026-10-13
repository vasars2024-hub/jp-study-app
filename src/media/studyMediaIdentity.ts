/**
 * Which series and episode a file is, when it plays straight from disk.
 *
 * Through the media server an anime episode arrives with `playbackInfo.media` (the AniList
 * entry) and `playbackInfo.episode`, and the study surfaces name the card's source, key the
 * subtitle memory per series and title the ledger from them. A file that now plays from
 * disk (`directLocalPlayback.ts`) has neither — and must NOT be given them: VideoCore reads
 * `media`/`episode` too, and would start the server-side playlist, continuity and AniSkip
 * queries for a stream the server is not serving.
 *
 * So the app's own library row rides along under a key VideoCore does not know, and the
 * study surfaces read `media`/`episode` first and this second. Same AniList id, so a card
 * mined from an episode carries the same series identity whichever way it was opened.
 */
import type { VideoCore_VideoPlaybackInfo } from '@/app/(main)/_features/video-core/video-core.atoms';

export interface StudyMediaIdentity {
  /** AniList id, as the media server's `media.id` would be. */
  mediaId?: number;
  title?: string;
  episodeNumber?: number;
}

export const STUDY_MEDIA_KEY = '__studyMedia' as const;

export type WithStudyMedia<T> = T & { [STUDY_MEDIA_KEY]?: StudyMediaIdentity };

export function studyMediaOf(
  playbackInfo: VideoCore_VideoPlaybackInfo | null | undefined,
): StudyMediaIdentity | null {
  if (!playbackInfo) return null;
  const value = (playbackInfo as WithStudyMedia<VideoCore_VideoPlaybackInfo>)[STUDY_MEDIA_KEY];
  return value && typeof value === 'object' ? value : null;
}

/** The series id: the server's AniList entry, else the library's. */
export function studyMediaId(playbackInfo: VideoCore_VideoPlaybackInfo | null | undefined): number | undefined {
  return playbackInfo?.media?.id ?? studyMediaOf(playbackInfo)?.mediaId;
}

/** The episode number: the server's, else the library's. */
export function studyEpisodeNumber(playbackInfo: VideoCore_VideoPlaybackInfo | null | undefined): number | undefined {
  return playbackInfo?.episode?.episodeNumber ?? studyMediaOf(playbackInfo)?.episodeNumber;
}

/** The series title: the server's AniList title, else the library's. */
export function studyMediaTitle(playbackInfo: VideoCore_VideoPlaybackInfo | null | undefined): string | undefined {
  const title = playbackInfo?.media?.title;
  return title?.userPreferred || title?.romaji || title?.english || title?.native
    || studyMediaOf(playbackInfo)?.title
    || undefined;
}
