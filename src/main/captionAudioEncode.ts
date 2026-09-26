/**
 * A captured system-audio clip (WAV bytes from the capture window) as the MP3
 * a card stores — through ffmpeg's pipes, so the clip never exists as a
 * temporary file: nothing the capture holds reaches the disk until the user
 * adds the card and `mineToStudy` stores it in the mined-media library.
 *
 * Free of any `electron` import, like `sentenceAudioBatch.ts`, so the suite can
 * drive the real bundled ffmpeg with it.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { wavToMp3FfmpegArgs } from '../shared/systemAudioRing';

/** Inside the packaged app ffmpeg is unpacked next to the asar, not inside it. */
function resolveFfmpeg(): string {
  const raw = (ffmpegStatic as unknown as string) || '';
  return raw.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

const ENCODE_TIMEOUT_MS = 30_000;
/** 60 s of 64 kb/s mono is ~480 KB; anything far past it is a runaway. */
const MAX_MP3_BYTES = 4 * 1024 * 1024;
/** Below this ffmpeg wrote a header and no sound. */
const MIN_MP3_BYTES = 1_024;

export interface EncodedClip {
  ok: boolean;
  bytes?: Buffer;
  error?: string;
}

export function encodeWavToMp3(wav: Uint8Array, durationSec: number, ffmpegPath: string = resolveFfmpeg()): Promise<EncodedClip> {
  return new Promise((resolve) => {
    if (!ffmpegPath) {
      resolve({ ok: false, error: 'ffmpeg unavailable' });
      return;
    }
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(ffmpegPath, wavToMp3FfmpegArgs(durationSec), { windowsHide: true });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let settled = false;
    const finish = (outcome: EncodedClip): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { proc.kill(); } catch { /* already gone */ }
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'ffmpeg timed out' }), ENCODE_TIMEOUT_MS);
    proc.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_MP3_BYTES) {
        finish({ ok: false, error: 'clip unexpectedly large' });
        return;
      }
      chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 8_000) stderr += chunk.toString();
    });
    proc.on('error', (error) => finish({ ok: false, error: error.message }));
    proc.on('close', (code) => {
      const bytes = Buffer.concat(chunks);
      if (code !== 0 || bytes.length < MIN_MP3_BYTES) {
        finish({ ok: false, error: stderr.trim().split('\n').at(-1) || `ffmpeg exited ${code}` });
        return;
      }
      finish({ ok: true, bytes });
    });
    // EPIPE when ffmpeg dies before reading everything is reported by 'close'.
    proc.stdin.on('error', () => undefined);
    proc.stdin.end(Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength));
  });
}
