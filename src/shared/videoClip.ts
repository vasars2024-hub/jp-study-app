/**
 * Cutting one sentence's worth of video out of an episode, for an Anki card.
 *
 * Pure by design — the ffmpeg argument vector and the bounds arithmetic are the
 * parts that are worth testing and the parts that are easy to get wrong, and
 * neither needs a child process to check.
 */

/** Hard ceiling on a mined clip. A sentence is seconds; anything longer is a bug. */
export const MAX_CLIP_SEC = 30;
/** Below this the clip is too short to carry the line at all. */
export const MIN_CLIP_SEC = 0.4;

export interface VideoClipRequest {
  /** Absolute path to the episode. Streams cannot be cut this way — see the fallback. */
  filePath: string;
  startSec: number;
  endSec: number;
  /**
   * Extra time before and after the cue. A clip that starts exactly on the cue
   * clips the first mora, for the same reason the transcript's jump takes a
   * run-up: the decoder settles on the following keyframe.
   */
  padSec?: number;
  /**
   * Extra time after the cue when it should differ from `padSec`. Speech tails off
   * past a subtitle's end time more often than it starts before it, so one-key mining
   * pads the end a little more than the start.
   */
  padAfterSec?: number;
  /** Downscale ceiling. A card does not need source resolution, and Anki syncs the file. */
  maxHeight?: number;
  /**
   * Which audio stream to keep, as a 0-based index among the file's AUDIO streams
   * (`0:a:<n>`): the track the user is listening to. A dual-audio release often puts
   * the dub first, so "the first audio stream" can be the wrong language entirely.
   */
  audioStreamOrdinal?: number | null;
}

export interface VideoClipBounds {
  startSec: number;
  durationSec: number;
}

/** One-key mining's default lead-in before a cue (seconds). */
export const MINE_AUDIO_PAD_BEFORE_SEC = 0.25;
/** One-key mining's default tail after a cue (seconds). */
export const MINE_AUDIO_PAD_AFTER_SEC = 0.35;

/**
 * The cue audio extraction request: the same range a clip uses, cut to speech-sized
 * audio rather than video. Lives beside the clip request because both are mined from
 * the same file with the same padding rules.
 */
export interface AudioClipRequest {
  filePath: string;
  startSec: number;
  endSec: number;
  padBeforeSec?: number;
  padAfterSec?: number;
  audioStreamOrdinal?: number | null;
}

/** One still from the file, for a cue that is not the frame on screen. */
export interface VideoFrameRequest {
  filePath: string;
  atSec: number;
  /** Width ceiling; the frame is never upscaled. */
  maxWidth?: number;
}

/**
 * Machine reasons a cut can fail. Main has no locale, so it reports one of these and
 * the renderer turns it into a sentence (`studyLoop.mine.error.*`).
 */
export type VideoClipErrorCode =
  | 'no-local-file'
  | 'file-missing'
  | 'ffmpeg-unavailable'
  | 'timeout'
  | 'too-large'
  | 'ffmpeg-failed';

export const VIDEO_CLIP_ERROR_KEY: Record<VideoClipErrorCode, string> = {
  'no-local-file': 'studyLoop.mine.error.noLocalFile',
  'file-missing': 'studyLoop.mine.error.fileMissing',
  'ffmpeg-unavailable': 'studyLoop.mine.error.ffmpegUnavailable',
  timeout: 'studyLoop.mine.error.timeout',
  'too-large': 'studyLoop.mine.error.tooLarge',
  'ffmpeg-failed': 'studyLoop.mine.error.ffmpegFailed',
};

/** The catalog key for a cut's error, or null for a reason this module did not author. */
export function videoClipErrorKey(error: string | undefined): string | null {
  return error && Object.prototype.hasOwnProperty.call(VIDEO_CLIP_ERROR_KEY, error)
    ? VIDEO_CLIP_ERROR_KEY[error as VideoClipErrorCode]
    : null;
}

function audioOrdinal(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Resolve the padded, clamped window to cut.
 *
 * Clamped at zero because a cue in the first second would otherwise ask ffmpeg to
 * seek negative, and at `MAX_CLIP_SEC` because a mis-timed subtitle track can
 * report a cue that runs for minutes — which would otherwise silently produce a
 * hundred-megabyte card.
 */
export function videoClipBounds(request: VideoClipRequest): VideoClipBounds {
  const pad = Math.max(0, request.padSec ?? 0.25);
  const padAfter = Math.max(0, request.padAfterSec ?? pad);
  const rawStart = Math.min(request.startSec, request.endSec);
  const rawEnd = Math.max(request.startSec, request.endSec);
  const startSec = Math.max(0, rawStart - pad);
  const durationSec = Math.min(
    MAX_CLIP_SEC,
    Math.max(MIN_CLIP_SEC, rawEnd + padAfter - startSec),
  );
  return { startSec, durationSec };
}

/** The padded, clamped window for cue audio (same rules as a clip). */
export function audioClipBounds(request: AudioClipRequest): VideoClipBounds {
  return videoClipBounds({
    filePath: request.filePath,
    startSec: request.startSec,
    endSec: request.endSec,
    padSec: request.padBeforeSec ?? MINE_AUDIO_PAD_BEFORE_SEC,
    padAfterSec: request.padAfterSec ?? MINE_AUDIO_PAD_AFTER_SEC,
  });
}

/**
 * A still at `atSec` as a JPEG on stdout, at most `maxWidth` wide (never upscaled).
 * `-ss` before `-i` for the same reason as the clip: an indexed seek, not a decode
 * from zero.
 */
export function videoFrameFfmpegArgs(request: VideoFrameRequest): string[] {
  const maxWidth = Math.max(160, Math.min(1920, Math.round(request.maxWidth ?? 1280)));
  const atSec = Math.max(0, Number.isFinite(request.atSec) ? request.atSec : 0);
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-ss', atSec.toFixed(3),
    '-i', request.filePath,
    '-frames:v', '1',
    '-map', '0:v:0',
    '-vf', `scale='min(${maxWidth},iw)':-2`,
    '-q:v', '3',
    '-f', 'image2',
    '-c:v', 'mjpeg',
    'pipe:1',
  ];
}

/**
 * The ffmpeg argument vector for a clip on stdout.
 *
 * `-ss` before `-i` so ffmpeg seeks by index instead of decoding from zero — the
 * difference between instant and several seconds on a 24-minute file. Output is
 * fragmented MP4 because a normal MP4 puts its index at the end of the file and
 * therefore cannot be written to a pipe at all; this is the same container
 * jidoujisho ships, and Anki plays it through the `[sound:…]` tag.
 */
export function videoClipFfmpegArgs(request: VideoClipRequest): string[] {
  const { startSec, durationSec } = videoClipBounds(request);
  const maxHeight = Math.max(120, Math.min(1080, request.maxHeight ?? 480));
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', startSec.toFixed(3),
    '-t', durationSec.toFixed(3),
    '-i', request.filePath,
    // One video and one audio stream — the one being listened to (default the
    // first): episodes routinely carry several audio tracks, and without this
    // every one of them lands in the card.
    '-map', '0:v:0',
    '-map', `0:a:${audioOrdinal(request.audioStreamOrdinal)}?`,
    '-vf', `scale=-2:'min(${maxHeight},ih)'`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', 'frag_keyframe+empty_moov+faststart',
    '-f', 'mp4',
    'pipe:1',
  ];
}

/** Anki media name for a mined clip. Deterministic, so re-mining overwrites. */
export function videoClipFilename(seed: string, startSec: number): string {
  const safe = seed.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    || 'clip';
  return `jp-clip-${safe}-${Math.round(startSec * 1000)}.mp4`;
}
