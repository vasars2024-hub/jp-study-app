/**
 * Region Recorder, step two: the recorded WebM becomes a library-ready MP4.
 *
 * Deliberately free of any `electron` import so it runs against the real
 * bundled ffmpeg in the test suite (`__tests__/recordingFinalize.test.ts`),
 * like `videoClipExtract.ts`. The controller (`regionRecorder.ts`) owns the
 * import, transcription and player hand-off that follow.
 *
 * Failure never deletes the input: a recording that could not be converted
 * stays in `.partial/` and can be finished again later.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import {
  parseFfmpegProbe,
  parseFfmpegProgressSeconds,
  recorderFinalizeArgs,
  type CropPx,
  type RecorderQuality,
} from '../shared/regionRecorder';

// Resolved exactly as `videoClipExtract.ts` and `media.ts` resolve it.
const ffmpegPath = (ffmpegStatic as unknown as string | null) ?? '';

export type FinalizeErrorCode = 'no-ffmpeg' | 'no-input' | 'corrupt' | 'disk-full' | 'cancelled' | 'failed';

export type FinalizeResult =
  | {
    ok: true;
    output: string;
    durationSec: number | null;
    hasAudio: boolean;
    width: number | null;
    height: number | null;
    /** The ffmpeg encoder that produced the MP4. */
    encoder: string;
    /** A hardware encoder failed on this recording and x264 finished it instead. */
    fellBack: boolean;
  }
  | { ok: false; error: FinalizeErrorCode; detail?: string };

export interface FinalizeRequest {
  input: string;
  output: string;
  /** Applied when the recording was made without the live crop. */
  crop?: CropPx | null;
  quality: RecorderQuality;
  /** The ffmpeg video encoder to try first; x264 finishes it when a hardware one fails. */
  encoder?: string;
  /** Fit every frame into the first frame's size (window recordings; see `recorderFinalizeArgs`). */
  fitToFirstFrame?: boolean;
  /** The recorded length, for progress (a MediaRecorder WebM carries no duration). */
  durationHintSec?: number;
  onProgress?: (fraction: number) => void;
}

export interface FinalizeHandle {
  done: Promise<FinalizeResult>;
  cancel: () => void;
}

export interface ProbeResult {
  ok: boolean;
  durationSec: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
}

/** What ffmpeg can tell about a file: streams, size, duration (null when the container says N/A). */
export function probeRecording(file: string): Promise<ProbeResult> {
  const none: ProbeResult = { ok: false, durationSec: null, hasVideo: false, hasAudio: false, width: null, height: null };
  if (!ffmpegPath) return Promise.resolve(none);
  return new Promise((resolve) => {
    let stderr = '';
    let proc;
    try {
      proc = spawn(ffmpegPath, ['-hide_banner', '-i', file], { windowsHide: true });
    } catch {
      resolve(none);
      return;
    }
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('error', () => resolve(none));
    // `ffmpeg -i` with no output always exits 1; the report is on stderr either way.
    proc.on('close', () => {
      const parsed = parseFfmpegProbe(stderr);
      resolve({ ok: parsed.hasVideo || parsed.hasAudio, ...parsed });
    });
  });
}

function classify(stderr: string): FinalizeErrorCode {
  const lower = stderr.toLowerCase();
  if (lower.includes('no space left') || lower.includes('disk full')) return 'disk-full';
  if (lower.includes('invalid data found') || lower.includes('ebml header') || lower.includes('could not find codec')
    || lower.includes('does not contain any stream') || lower.includes('matches no streams')) return 'corrupt';
  return 'failed';
}

/** ffmpeg silent (no `-progress` block, no stderr) this long is called stalled... */
export const FINALIZE_STALL_BASE_MS = 30_000;
/** ...plus this much per GB of input (a big recording can take a while to open)... */
export const FINALIZE_STALL_PER_GB_MS = 10_000;
/** ...but never longer than this. */
export const FINALIZE_STALL_MAX_MS = 5 * 60_000;

/** How long the finish may go without a sign of life before ffmpeg is killed. */
export function finalizeStallTimeoutMs(inputBytes: number): number {
  const gb = Math.max(0, Number.isFinite(inputBytes) ? inputBytes : 0) / 1024 ** 3;
  return Math.min(FINALIZE_STALL_MAX_MS, Math.round(FINALIZE_STALL_BASE_MS + gb * FINALIZE_STALL_PER_GB_MS));
}

export interface StallTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const realTimers: StallTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export type FinalizeChild = Pick<ChildProcess, 'stdout' | 'stderr' | 'on' | 'kill'>;

export interface FinalizeChildRun {
  code: number | null;
  stderr: string;
  /** Killed for making no progress within the stall timeout. */
  stalled: boolean;
}

/**
 * Run one ffmpeg child to its end. Any stdout (`-progress`) or stderr output
 * counts as progress; silence for `stallMs` kills it (SIGKILL) and settles at
 * once, without waiting for a `close` a wedged process may never send.
 */
export function runFinalizeChild(options: {
  start: () => FinalizeChild;
  stallMs: number;
  timers?: StallTimers;
  onStdout?: (text: string) => void;
  onChild?: (child: FinalizeChild | null) => void;
}): Promise<FinalizeChildRun> {
  const timers = options.timers ?? realTimers;
  return new Promise((resolve) => {
    let stderr = '';
    let stalled = false;
    let settled = false;
    let timer: unknown = null;
    let child: FinalizeChild | null = null;
    const finish = (code: number | null, text: string): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      options.onChild?.(null);
      resolve({ code, stderr: text, stalled });
    };
    const arm = (): void => {
      if (settled) return;
      if (timer !== null) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => {
        timer = null;
        stalled = true;
        try {
          child?.kill('SIGKILL');
        } catch {
          /* already gone */
        }
        finish(null, `${stderr}\nffmpeg made no progress for ${Math.round(options.stallMs / 1000)} s`);
      }, options.stallMs);
    };
    try {
      child = options.start();
    } catch (err) {
      finish(null, err instanceof Error ? err.message : String(err));
      return;
    }
    options.onChild?.(child);
    child.stdout?.on('data', (d: Buffer) => {
      arm();
      options.onStdout?.(d.toString());
    });
    child.stderr?.on('data', (d: Buffer) => {
      arm();
      stderr += d.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-10_000);
    });
    child.on('error', (err: Error) => finish(null, `${stderr}\n${err.message}`));
    child.on('close', (code: number | null) => finish(code, stderr));
    arm();
  });
}

/** Convert `input` (WebM) to `output` (MP4). Cancel kills ffmpeg and removes the half-written MP4. */
export function finalizeRecording(request: FinalizeRequest): FinalizeHandle {
  let cancelled = false;
  let child: FinalizeChild | null = null;
  const removeOutput = (): void => {
    try {
      fs.rmSync(request.output, { force: true });
    } catch {
      /* best effort */
    }
  };

  const done = (async (): Promise<FinalizeResult> => {
    if (!ffmpegPath) return { ok: false, error: 'no-ffmpeg' };
    let size = 0;
    try {
      size = fs.statSync(request.input).size;
    } catch {
      return { ok: false, error: 'no-input' };
    }
    if (size === 0) return { ok: false, error: 'corrupt', detail: 'empty recording' };
    const probe = await probeRecording(request.input);
    if (cancelled) return { ok: false, error: 'cancelled' };
    if (!probe.hasVideo) return { ok: false, error: 'corrupt', detail: 'no video stream' };
    const total = request.durationHintSec && request.durationHintSec > 0 ? request.durationHintSec : probe.durationSec ?? 0;
    const fit = request.fitToFirstFrame && probe.width && probe.height ? { width: probe.width, height: probe.height } : null;
    const attempt = (encoder: string) => runFinalizeChild({
      start: () => spawn(ffmpegPath, recorderFinalizeArgs({
        input: request.input,
        output: request.output,
        crop: request.crop ?? null,
        hasAudio: probe.hasAudio,
        quality: request.quality,
        encoder,
        fit,
      }), { windowsHide: true }),
      stallMs: finalizeStallTimeoutMs(size),
      onChild: (c) => {
        child = c;
      },
      onStdout: (text) => {
        const seconds = parseFfmpegProgressSeconds(text);
        if (seconds !== null && total > 0) request.onProgress?.(Math.min(0.99, seconds / total));
      },
    });
    let encoder = request.encoder && request.encoder !== 'libx264' ? request.encoder : 'libx264';
    let fellBack = false;
    let result = await attempt(encoder);
    child = null;
    // A hardware encoder that fails on THIS recording (a crop below NVENC's minimum
    // size, a driver that went away since the probe, a busy encoder session) is not
    // the recording's fault: x264 finishes it. A corrupt input or a full disk would
    // fail x264 just the same, so those are reported as they are.
    if (!cancelled && encoder !== 'libx264' && (result.stalled || result.code !== 0)
      && classify(result.stderr) === 'failed') {
      removeOutput();
      request.onProgress?.(0);
      encoder = 'libx264';
      fellBack = true;
      result = await attempt(encoder);
      child = null;
    }
    if (cancelled) {
      removeOutput();
      return { ok: false, error: 'cancelled' };
    }
    if (result.stalled) {
      removeOutput();
      return { ok: false, error: 'failed', detail: result.stderr.trim().split('\n').slice(-3).join('\n') };
    }
    if (result.code !== 0) {
      removeOutput();
      return { ok: false, error: classify(result.stderr), detail: result.stderr.trim().split('\n').slice(-3).join('\n') };
    }
    const out = await probeRecording(request.output);
    if (!out.hasVideo) {
      removeOutput();
      return { ok: false, error: 'failed', detail: 'output has no video' };
    }
    request.onProgress?.(1);
    return {
      ok: true,
      output: request.output,
      durationSec: out.durationSec,
      hasAudio: out.hasAudio,
      width: out.width,
      height: out.height,
      encoder,
      fellBack,
    };
  })();

  return {
    done,
    cancel: () => {
      cancelled = true;
      try {
        (child as FinalizeChild | null)?.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    },
  };
}
