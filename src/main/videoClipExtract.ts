/**
 * Cuts a mined sentence's video, audio or still out of the episode file.
 *
 * Deliberately free of any `electron` import so it can be exercised against a
 * real ffmpeg in the test suite — the IPC binding lives next door in
 * `videoClip.ts`. Splitting them is the difference between testing that the
 * argument vector has the right *shape* and testing that it actually produces a
 * playable clip, which is the only claim worth making about an encoder.
 *
 * Why main rather than the renderer: the renderer-side alternative —
 * `captureStream()` + MediaRecorder, which `cueAudioCapture.ts` already does for
 * cue audio — records in REAL TIME and hijacks playback while it runs. Fine for a
 * one-second word reading, not for mining. A local file is cut here instead, and
 * the recorder stays the fallback for sources with no file path.
 *
 * The clip comes back as base64 rather than a temp file because AnkiConnect's
 * `storeMediaFile` takes base64 anyway — a file would only be something to leak.
 *
 * Errors are machine codes (`VideoClipErrorCode`), never sentences: main has no
 * locale, and the renderer turns a code into the user's language.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import {
  audioClipBounds,
  videoClipBounds,
  videoClipFfmpegArgs,
  videoFrameFfmpegArgs,
  type AudioClipRequest,
  type VideoClipErrorCode,
  type VideoClipRequest,
  type VideoFrameRequest,
} from '../shared/videoClip';
import { sentenceAudioFfmpegArgs } from '../shared/sentenceDeck';

const ffmpegPath = ffmpegStatic as unknown as string;

/** A few seconds of 480p h264 is well under this; the cap stops a runaway encode. */
const MAX_CLIP_BYTES = 24 * 1024 * 1024;
/** A line of 64 kb/s mono MP3 is tens of KB; a still is a few hundred. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const CLIP_TIMEOUT_MS = 60_000;
const AUDIO_TIMEOUT_MS = 30_000;

export interface VideoClipResult {
  ok: boolean;
  base64?: string;
  bytes?: number;
  mimeType?: string;
  durationSec?: number;
  /** A `VideoClipErrorCode`; the renderer translates it. */
  error?: VideoClipErrorCode;
  /** ffmpeg's own last stderr line for `ffmpeg-failed` (diagnostics, not UI copy). */
  detail?: string;
}

function preflight(filePath: string | undefined): VideoClipResult | null {
  if (!filePath) return { ok: false, error: 'no-local-file' };
  if (!fs.existsSync(filePath)) return { ok: false, error: 'file-missing' };
  if (!ffmpegPath) return { ok: false, error: 'ffmpeg-unavailable' };
  return null;
}

/** Run ffmpeg with output on stdout, bounded in size and time. */
function runToBuffer(
  args: string[],
  maxBytes: number,
  timeoutMs: number,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: VideoClipErrorCode; detail?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stderr = '';
    let settled = false;

    const finish = (
      result: { ok: true; buffer: Buffer } | { ok: false; error: VideoClipErrorCode; detail?: string },
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        finish({ ok: false, error: 'too-large' });
        return;
      }
      chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 64_000) stderr += chunk.toString();
    });
    proc.on('error', (err) => finish({ ok: false, error: 'ffmpeg-failed', detail: err.message }));
    proc.on('close', (code) => {
      if (code !== 0 || !chunks.length) {
        finish({
          ok: false,
          error: 'ffmpeg-failed',
          detail: stderr.trim().split('\n').at(-1) || `exit ${code}`,
        });
        return;
      }
      finish({ ok: true, buffer: Buffer.concat(chunks) });
    });
  });
}

export async function extractVideoClip(request: VideoClipRequest): Promise<VideoClipResult> {
  const refused = preflight(request?.filePath);
  if (refused) return refused;
  const { durationSec } = videoClipBounds(request);
  const run = await runToBuffer(videoClipFfmpegArgs(request), MAX_CLIP_BYTES, CLIP_TIMEOUT_MS);
  if (!run.ok) return { ok: false, error: run.error, ...(run.detail ? { detail: run.detail } : {}) };
  return {
    ok: true,
    base64: run.buffer.toString('base64'),
    bytes: run.buffer.length,
    mimeType: 'video/mp4',
    durationSec,
  };
}

/**
 * One cue's audio as speech-sized MP3 (the format every Anki client plays), from the
 * audio stream the user is listening to. Padded and clamped like a clip.
 *
 * A stream ordinal past the file's last audio stream is a stale track choice, not a
 * reason to give up: the cut is retried on the first stream.
 */
export async function extractAudioClip(request: AudioClipRequest): Promise<VideoClipResult> {
  const refused = preflight(request?.filePath);
  if (refused) return refused;
  const bounds = audioClipBounds(request);
  const ordinal = typeof request.audioStreamOrdinal === 'number' && request.audioStreamOrdinal > 0
    ? Math.floor(request.audioStreamOrdinal)
    : 0;
  let run = await runToBuffer(
    sentenceAudioFfmpegArgs({ filePath: request.filePath, bounds, audioStream: ordinal }),
    MAX_AUDIO_BYTES,
    AUDIO_TIMEOUT_MS,
  );
  if (!run.ok && run.error === 'ffmpeg-failed' && ordinal > 0) {
    run = await runToBuffer(
      sentenceAudioFfmpegArgs({ filePath: request.filePath, bounds, audioStream: 0 }),
      MAX_AUDIO_BYTES,
      AUDIO_TIMEOUT_MS,
    );
  }
  if (!run.ok) return { ok: false, error: run.error, ...(run.detail ? { detail: run.detail } : {}) };
  return {
    ok: true,
    base64: run.buffer.toString('base64'),
    bytes: run.buffer.length,
    mimeType: 'audio/mpeg',
    durationSec: bounds.durationSec,
  };
}

/** One frame of the file as a JPEG, for a cue that is not the one on screen. */
export async function extractVideoFrame(request: VideoFrameRequest): Promise<VideoClipResult> {
  const refused = preflight(request?.filePath);
  if (refused) return refused;
  const run = await runToBuffer(videoFrameFfmpegArgs(request), MAX_FRAME_BYTES, AUDIO_TIMEOUT_MS);
  if (!run.ok) return { ok: false, error: run.error, ...(run.detail ? { detail: run.detail } : {}) };
  return {
    ok: true,
    base64: run.buffer.toString('base64'),
    bytes: run.buffer.length,
    mimeType: 'image/jpeg',
  };
}
