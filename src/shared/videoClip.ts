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
  /** Downscale ceiling. A card does not need source resolution, and Anki syncs the file. */
  maxHeight?: number;
}

export interface VideoClipBounds {
  startSec: number;
  durationSec: number;
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
  const rawStart = Math.min(request.startSec, request.endSec);
  const rawEnd = Math.max(request.startSec, request.endSec);
  const startSec = Math.max(0, rawStart - pad);
  const durationSec = Math.min(
    MAX_CLIP_SEC,
    Math.max(MIN_CLIP_SEC, rawEnd + pad - startSec),
  );
  return { startSec, durationSec };
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
    // Only the first video and first audio stream: episodes routinely carry
    // several audio tracks, and without this every one of them lands in the card.
    '-map', '0:v:0',
    '-map', '0:a:0?',
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
