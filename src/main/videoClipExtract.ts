/**
 * Cuts a mined sentence's video out of the episode file.
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
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import {
  videoClipBounds,
  videoClipFfmpegArgs,
  type VideoClipRequest,
} from '../shared/videoClip';

const ffmpegPath = ffmpegStatic as unknown as string;

/** A few seconds of 480p h264 is well under this; the cap stops a runaway encode. */
const MAX_CLIP_BYTES = 24 * 1024 * 1024;
const CLIP_TIMEOUT_MS = 60_000;

export interface VideoClipResult {
  ok: boolean;
  base64?: string;
  bytes?: number;
  mimeType?: string;
  durationSec?: number;
  error?: string;
}

export function extractVideoClip(request: VideoClipRequest): Promise<VideoClipResult> {
  if (!request?.filePath) {
    return Promise.resolve({ ok: false, error: 'No local file for this playback.' });
  }
  if (!fs.existsSync(request.filePath)) {
    return Promise.resolve({
      ok: false,
      error: 'The episode file is no longer where the library expects it.',
    });
  }
  if (!ffmpegPath) return Promise.resolve({ ok: false, error: 'ffmpeg is unavailable in this build.' });

  const { durationSec } = videoClipBounds(request);
  const args = videoClipFfmpegArgs(request);

  return new Promise<VideoClipResult>((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stderr = '';
    let settled = false;

    const finish = (result: VideoClipResult): void => {
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

    const timer = setTimeout(
      () => finish({ ok: false, error: 'Clip extraction timed out.' }),
      CLIP_TIMEOUT_MS,
    );

    proc.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_CLIP_BYTES) {
        finish({ ok: false, error: 'Clip is unexpectedly large; extraction stopped.' });
        return;
      }
      chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 64_000) stderr += chunk.toString();
    });
    proc.on('error', (err) => finish({ ok: false, error: err.message }));
    proc.on('close', (code) => {
      if (code !== 0 || !chunks.length) {
        finish({ ok: false, error: stderr.trim().split('\n').at(-1) || `ffmpeg exited ${code}` });
        return;
      }
      const buffer = Buffer.concat(chunks);
      finish({
        ok: true,
        base64: buffer.toString('base64'),
        bytes: buffer.length,
        mimeType: 'video/mp4',
        durationSec,
      });
    });
  });
}
