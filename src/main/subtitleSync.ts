/**
 * The ffmpeg half of subtitle sync estimation. All the arithmetic lives in
 * `shared/subtitleSync.ts`; this file only turns a video path into decoded audio windows.
 *
 * `ffmpeg-static` is already a dependency (`mediaArtwork.ts`, `media.ts`), so this adds no
 * install-time requirement and works the same on a machine with no ffmpeg on PATH.
 */
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import {
  detrend,
  estimateOffset,
  logRmsEnvelope,
  syncSampleWindows,
  SYNC_BASELINE_SEC,
  SYNC_HOP_SEC,
  SYNC_SAMPLE_RATE,
  type SubtitleSyncEstimate,
  type SyncAudioWindow,
  type SyncCueInterval,
} from '../shared/subtitleSync';

const ffmpegPath = ffmpegStatic as unknown as string;

const FRAME_LENGTH = Math.round(SYNC_SAMPLE_RATE * SYNC_HOP_SEC);

/**
 * Decode one stretch of the first audio track to mono 16-bit PCM on stdout.
 *
 * `-ss` before `-i` so ffmpeg seeks by index instead of decoding and discarding everything
 * up to the window — the difference between 2.5 s and minutes for a window late in an
 * episode.
 *
 * Resolves to an empty buffer rather than rejecting: a damaged or unreadable stretch
 * should cost this window, not the whole estimate. (`The Big O - 02` in the user's library
 * throws `invalid as first byte of an EBML number` and FLAC decode errors while still
 * producing usable audio around them.)
 */
function decodeWindow(file: string, startSec: number, lengthSec: number): Promise<Buffer> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-ss', String(startSec),
      '-t', String(lengthSec),
      '-i', file,
      '-map', '0:a:0',
      '-ac', '1',
      '-ar', String(SYNC_SAMPLE_RATE),
      '-f', 's16le',
      'pipe:1',
    ], { windowsHide: true });
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', () => { /* decode noise is expected; see above */ });
    proc.on('error', () => resolve(Buffer.alloc(0)));
    proc.on('close', () => resolve(Buffer.concat(chunks)));
  });
}

/** PCM bytes to the detrended log envelope the estimator consumes. */
function toWindow(pcm: Buffer, startSec: number): SyncAudioWindow | null {
  if (pcm.length < FRAME_LENGTH * 2 * 20) return null; // under a second of audio
  // `Buffer` may be a view into a larger pool, so the byteOffset is load-bearing here —
  // reading from index 0 of the underlying ArrayBuffer would decode someone else's bytes.
  const samples = new Int16Array(
    pcm.buffer,
    pcm.byteOffset,
    Math.floor(pcm.length / 2),
  );
  const envelope = logRmsEnvelope(samples, FRAME_LENGTH);
  return {
    startSec,
    detrended: detrend(envelope, Math.round(SYNC_BASELINE_SEC / SYNC_HOP_SEC)),
  };
}

/**
 * How far the cues need to move to land on this file's speech.
 *
 * Never throws and never rejects: this is an enhancement on the subtitle mount path, and a
 * failure here must leave the track mounted unshifted rather than unmounted.
 */
export async function estimateSubtitleOffset(
  videoPath: string,
  cues: readonly SyncCueInterval[],
  durationSec: number,
): Promise<SubtitleSyncEstimate> {
  const nothing: SubtitleSyncEstimate = {
    offsetSec: 0, score: 0, rivalScore: 0, confident: false,
  };
  if (!videoPath || !cues.length) return nothing;
  // The cue track's own extent is the fallback when the caller does not know the runtime,
  // and it is close enough: sampling positions only have to be interior and spread out.
  const span = Number.isFinite(durationSec) && durationSec > 0
    ? durationSec
    : cues.reduce((max, cue) => Math.max(max, cue.end), 0);
  const plan = syncSampleWindows(span);
  if (!plan.length) return nothing;

  try {
    const decoded = await Promise.all(
      plan.map((w) => decodeWindow(videoPath, w.startSec, w.lengthSec)),
    );
    const windows = decoded
      .map((pcm, i) => toWindow(pcm, plan[i].startSec))
      .filter((w): w is SyncAudioWindow => w !== null);
    if (!windows.length) return nothing;
    return estimateOffset(windows, cues);
  } catch {
    return nothing;
  }
}
