/**
 * What the study player remembers about subtitles PER FILE, as opposed to the global
 * appearance preferences (`jp-media-player-preferences-v1`):
 *
 * - the subtitle delay the user set for this file (`VIDEO_CORE_SUB_DELAY_STORAGE_KEY`), and
 * - the primary track they chose for this file and its series
 *   (`VIDEO_CORE_TRACK_CHOICE_STORAGE_KEY`).
 *
 * The rules (normalisation, limits, which key wins) live in `shared/videoCoreStudy.ts`; this
 * module is only their localStorage binding, kept out of the overlay so the slice — which hears
 * VideoCore's own CC menu — can record a choice without importing the overlay component.
 */
import type { VideoCore_VideoPlaybackInfo } from '@/app/(main)/_features/video-core/video-core.atoms';
import {
  normalizeVideoCoreSubtitleDelays,
  normalizeVideoCoreTrackChoices,
  resolveVideoCoreSubtitleDelay,
  resolveVideoCoreTrackChoice,
  studyTrackLanguage,
  upsertVideoCoreSubtitleDelay,
  upsertVideoCoreTrackChoice,
  VIDEO_CORE_SUB_DELAY_STORAGE_KEY,
  VIDEO_CORE_TRACK_CHOICE_STORAGE_KEY,
  videoCoreResumeKey,
  videoCoreTrackChoiceKeys,
  type VideoCoreResumeSource,
  type VideoCoreTrackChoice,
} from '../shared/videoCoreStudy';

function readStoredList<T>(key: string, normalize: (value: unknown) => T[]): T[] {
  try {
    return normalize(JSON.parse(localStorage.getItem(key) ?? 'null'));
  } catch {
    return [];
  }
}

function writeStoredList(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or a locked profile: the setting still applies for this session.
  }
}

/** The identity per-file subtitle memory is keyed on — the same inputs as the resume key. */
export function studySubtitleSource(
  playbackInfo: VideoCore_VideoPlaybackInfo | null,
  localFilePath?: string | null,
): VideoCoreResumeSource {
  const source: VideoCoreResumeSource = {};
  const local = localFilePath || playbackInfo?.localFile?.path;
  if (local) source.localFilePath = local;
  if (playbackInfo?.media?.id != null) source.mediaId = playbackInfo.media.id;
  if (playbackInfo?.episode?.episodeNumber != null) {
    source.episodeNumber = playbackInfo.episode.episodeNumber;
  }
  if (playbackInfo?.streamPath) source.streamPath = playbackInfo.streamPath;
  if (playbackInfo?.id) source.playbackId = playbackInfo.id;
  return source;
}

/** Keyed exactly like the resume position, so both describe the same file. */
export function subtitleDelayKey(source: VideoCoreResumeSource): string {
  return videoCoreResumeKey(source);
}

export function loadSubtitleDelay(key: string): number {
  return resolveVideoCoreSubtitleDelay(
    readStoredList(VIDEO_CORE_SUB_DELAY_STORAGE_KEY, normalizeVideoCoreSubtitleDelays),
    key,
  );
}

export function saveSubtitleDelay(key: string, delaySec: number): void {
  if (!key) return;
  writeStoredList(
    VIDEO_CORE_SUB_DELAY_STORAGE_KEY,
    upsertVideoCoreSubtitleDelay(
      readStoredList(VIDEO_CORE_SUB_DELAY_STORAGE_KEY, normalizeVideoCoreSubtitleDelays),
      key,
      delaySec,
    ),
  );
}

export function loadStudyTrackChoice(source: VideoCoreResumeSource): VideoCoreTrackChoice | null {
  return resolveVideoCoreTrackChoice(
    readStoredList(VIDEO_CORE_TRACK_CHOICE_STORAGE_KEY, normalizeVideoCoreTrackChoices),
    videoCoreTrackChoiceKeys(source),
  );
}

/**
 * Record an explicit primary-track choice (or Off, `null`) for this file and its series.
 * Only a USER's pick comes through here — never the automatic study-language correction —
 * so a remembered choice always means "the viewer asked for this".
 */
export function rememberStudyTrackChoice(
  source: VideoCoreResumeSource,
  track: { language?: string; languageIETF?: string; label?: string } | null,
): void {
  const keys = videoCoreTrackChoiceKeys(source);
  if (!keys.length) return;
  const choice = track
    ? { lang: studyTrackLanguage({ number: 0, ...track }), label: track.label ?? '', off: false }
    : { lang: '', label: '', off: true };
  writeStoredList(
    VIDEO_CORE_TRACK_CHOICE_STORAGE_KEY,
    upsertVideoCoreTrackChoice(
      readStoredList(VIDEO_CORE_TRACK_CHOICE_STORAGE_KEY, normalizeVideoCoreTrackChoices),
      keys,
      choice,
    ),
  );
}
