/**
 * Cuts the audio for a whole sentence deck, off the real-time path.
 *
 * The player already has two ways to get a sentence's sound, and neither
 * scales to a deck: `cueAudioCapture.ts` records through MediaRecorder IN REAL
 * TIME while taking over playback (a 24-minute episode would take 24 minutes
 * and the video with it), and `videoClipExtract.ts` cuts one scene as video.
 * This runs ffmpeg once per sentence, a few at a time, each seeking straight to
 * its line — an episode of three hundred lines is a matter of seconds.
 *
 * Deliberately free of any `electron` import, like `videoClipExtract.ts`, so the
 * suite drives it against the real bundled ffmpeg: a correct-looking argument
 * vector that ffmpeg rejects is exactly the failure a deck would ship with.
 *
 * Every clip is stored through the mined-media store (`minedMediaStore.ts`) —
 * content-addressed under the managed audio root — so the existing sweep,
 * backup, export and `.apkg` paths treat these like any mined clip and nothing
 * here owns a second storage rule. A clip that fails is reported with its
 * reason and the rest carry on: one bad cue never costs the user the deck.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import {
  sentenceAudioFfmpegArgs,
  sentenceClipBounds,
  sentenceStillFfmpegArgs,
  SENTENCE_CLIP_PAD_MS,
} from '../shared/sentenceDeck';
import { writeMinedMediaBytes } from './minedMediaStore';

const ffmpegPath = ffmpegStatic as unknown as string;

/** Three encoders at once keeps a laptop responsive and still finishes an episode in seconds. */
export const SENTENCE_AUDIO_CONCURRENCY = 3;
const CLIP_TIMEOUT_MS = 30_000;
/** A 30 s mono 64 kb/s clip is ~240 KB; anything near this is a runaway. */
const MAX_CLIP_BYTES = 4 * 1024 * 1024;

export interface SentenceAudioClipRequest {
  /** Caller's id for the sentence, echoed back on its result. */
  id: string;
  startMs: number;
  endMs: number;
}

export interface SentenceAudioBatchRequest {
  filePath: string;
  clips: SentenceAudioClipRequest[];
  padMs?: number;
  /** Index among the file's audio streams (`0:a:<n>`). */
  audioStream?: number;
  /** Also grab one still per sentence. */
  withStill?: boolean;
}

/** Why a clip was not cut, for the dialog to say in the UI language. */
export type SentenceClipFailure = 'silent' | 'timeout' | 'too-large' | 'cancelled' | 'store' | 'ffmpeg';

export interface SentenceAudioClipResult {
  id: string;
  ok: boolean;
  /** On failure: which kind (the `error` text is ffmpeg's or Node's, in English). */
  failure?: SentenceClipFailure;
  /** Managed file path of the MP3. */
  audioPath?: string;
  /** Managed file path of the still, when one was asked for and cut. */
  imagePath?: string;
  /** Seconds of audio cut (the padded window). */
  durationSec?: number;
  bytes?: number;
  error?: string;
  /** The file has no audio stream at that index — true of every clip, not just this one. */
  noAudioStream?: boolean;
}

export interface SentenceAudioBatchResult {
  ok: boolean;
  cancelled: boolean;
  results: SentenceAudioClipResult[];
  /** A whole-batch refusal (no file, no audio stream), as an i18n key. */
  reasonKey?: string;
  error?: string;
}

export interface SentenceAudioBatchHooks {
  /** Where managed media lives (`minedMediaDirectoryUnder(userData)`). */
  mediaDirectory: string;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, result: SentenceAudioClipResult) => void;
}

interface RunOutcome {
  ok: boolean;
  bytes?: Buffer;
  error?: string;
  failure?: SentenceClipFailure;
  /** Everything ffmpeg printed, for classifying a failure. */
  stderr?: string;
}

/**
 * Below this an MP3 holds no sound: a range past the end of the file comes back
 * as a bare 148-byte header with exit code 0, which must not become a silent card.
 */
const MIN_CLIP_BYTES = 1_024;

function runToBuffer(args: string[], signal?: AbortSignal): Promise<RunOutcome> {
  return new Promise((resolve) => {
    // An 'abort' listener added after the fact never fires: a cancelled batch
    // must not start another encoder (the still after a clip it just stored).
    if (signal?.aborted) {
      resolve({ ok: false, error: 'cancelled', failure: 'cancelled' });
      return;
    }
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(ffmpegPath, args, { windowsHide: true });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error), failure: 'ffmpeg' });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let settled = false;
    const finish = (outcome: RunOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      try { proc.kill(); } catch { /* already gone */ }
      resolve(outcome);
    };
    const onAbort = (): void => finish({ ok: false, error: 'cancelled', failure: 'cancelled' });
    const timer = setTimeout(() => finish({ ok: false, error: 'ffmpeg timed out', failure: 'timeout' }), CLIP_TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    proc.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_CLIP_BYTES) {
        finish({ ok: false, error: 'clip unexpectedly large', failure: 'too-large' });
        return;
      }
      chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 16_000) stderr += chunk.toString();
    });
    proc.on('error', (error) => finish({ ok: false, error: error.message, failure: 'ffmpeg' }));
    proc.on('close', (code) => {
      if (code !== 0 || !chunks.length) {
        finish({ ok: false, error: stderr.trim().split('\n').at(-1) || `ffmpeg exited ${code}`, failure: 'ffmpeg', stderr });
        return;
      }
      finish({ ok: true, bytes: Buffer.concat(chunks), stderr });
    });
  });
}

/** Cut, store and describe one sentence. Never throws. */
export async function extractSentenceClip(
  request: Omit<SentenceAudioBatchRequest, 'clips'>,
  clip: SentenceAudioClipRequest,
  mediaDirectory: string,
  signal?: AbortSignal,
): Promise<SentenceAudioClipResult> {
  const bounds = sentenceClipBounds(clip.startMs, clip.endMs, request.padMs ?? SENTENCE_CLIP_PAD_MS);
  const audio = await runToBuffer(
    sentenceAudioFfmpegArgs({ filePath: request.filePath, bounds, audioStream: request.audioStream }),
    signal,
  );
  if (!audio.ok || !audio.bytes) {
    return {
      id: clip.id,
      ok: false,
      error: audio.error ?? 'no audio',
      failure: audio.failure ?? 'ffmpeg',
      ...(/matches no streams/i.test(audio.stderr ?? '') ? { noAudioStream: true } : {}),
    };
  }
  if (audio.bytes.length < MIN_CLIP_BYTES) {
    return { id: clip.id, ok: false, error: 'nothing to hear in this range', failure: 'silent' };
  }
  const stored = writeMinedMediaBytes(mediaDirectory, audio.bytes, '.mp3');
  if (!stored.ok || !stored.path) return { id: clip.id, ok: false, error: stored.error ?? 'store failed', failure: 'store' };
  const result: SentenceAudioClipResult = {
    id: clip.id,
    ok: true,
    audioPath: stored.path,
    durationSec: bounds.durationSec,
    bytes: audio.bytes.length,
  };
  if (request.withStill) {
    // A missing picture is not a failed card: the sentence and its sound are the card.
    const still = await runToBuffer(sentenceStillFfmpegArgs(request.filePath, bounds), signal);
    if (still.ok && still.bytes) {
      const image = writeMinedMediaBytes(mediaDirectory, still.bytes, '.jpg');
      if (image.ok && image.path) result.imagePath = image.path;
    }
  }
  return result;
}

/**
 * Cut every clip in `request`, `concurrency` at a time, in order of the
 * request. Resolves with one result per clip that was attempted; after a
 * cancel the remaining clips are simply not attempted, and `cancelled` says so.
 * Every file stored — including one finished just as the cancel arrived — is in
 * `results`, because the caller owns deleting what it will not use.
 */
export async function extractSentenceAudioBatch(
  request: SentenceAudioBatchRequest,
  hooks: SentenceAudioBatchHooks,
): Promise<SentenceAudioBatchResult> {
  if (!request?.filePath || !fs.existsSync(request.filePath)) {
    return { ok: false, cancelled: false, results: [], reasonKey: 'sentenceDeck.error.noFile' };
  }
  if (!ffmpegPath) {
    return { ok: false, cancelled: false, results: [], reasonKey: 'sentenceDeck.error.noFfmpeg' };
  }
  const clips = Array.isArray(request.clips) ? request.clips : [];
  const total = clips.length;
  const results: SentenceAudioClipResult[] = new Array(total);
  const concurrency = Math.max(1, Math.min(8, hooks.concurrency ?? SENTENCE_AUDIO_CONCURRENCY));
  const base = {
    filePath: request.filePath,
    padMs: request.padMs,
    audioStream: request.audioStream,
    withStill: request.withStill,
  };

  // The first clip goes alone: a file with no audio stream at all fails every
  // clip for the same reason, and that is one refusal, not three hundred.
  let next = 0;
  let done = 0;
  const record = (index: number, result: SentenceAudioClipResult): void => {
    results[index] = result;
    done += 1;
    hooks.onProgress?.(done, total, result);
  };
  if (total > 0) {
    const first = await extractSentenceClip(base, clips[0], hooks.mediaDirectory, hooks.signal);
    if (first.noAudioStream) {
      return { ok: false, cancelled: false, results: [], reasonKey: 'sentenceDeck.error.noAudioStream', error: first.error };
    }
    record(0, first);
    next = 1;
  }

  const worker = async (): Promise<void> => {
    while (next < total && !hooks.signal?.aborted) {
      const index = next;
      next += 1;
      const result = await extractSentenceClip(base, clips[index], hooks.mediaDirectory, hooks.signal);
      if (hooks.signal?.aborted) {
        // Cut and stored before the cancel landed (its audio, or audio without the
        // still the cancel stopped): still reported, so the caller can take the
        // file back — a cancel must not leave clips no card will ever point at.
        if (result.ok) results[index] = result;
        return;
      }
      record(index, result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(0, total - next)) }, worker));

  const cancelled = Boolean(hooks.signal?.aborted);
  return { ok: true, cancelled, results: results.filter(Boolean) };
}
