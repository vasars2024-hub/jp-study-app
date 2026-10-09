/**
 * Region Recorder: which H.264 encoder can finish a recording on this machine.
 *
 * The bundled ffmpeg (a gyan.dev "essentials" build on Windows) is compiled
 * with NVENC, Quick Sync and AMF, but being compiled in says nothing about the
 * machine: measured on the development box, `h264_nvenc` encodes, while
 * `h264_qsv` fails with "Error creating a MFX session" and `h264_amf` with
 * "DLL amfrt64.dll failed to open". So a hardware encoder counts as usable only
 * when ffmpeg lists it AND a tiny probe encode (a few black frames into the
 * null muxer) exits cleanly here.
 *
 * Electron-free, like `recordingFinalize.ts`, so the real ffmpeg drives the
 * tests. The probes run in parallel and the report is cached for the process;
 * `force` re-probes (Settings' "Detect again", a driver update).
 */
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import {
  RECORDER_FFMPEG_ENCODER,
  RECORDER_HARDWARE_ENCODERS,
  parseFfmpegEncoderList,
  type RecorderEncoderReport,
  type RecorderHardwareEncoder,
} from '../shared/regionRecorder';

const ffmpegPath = (ffmpegStatic as unknown as string | null) ?? '';

/** A probe that has not finished in this long failed (a wedged driver must not hold a recording). */
export const ENCODER_PROBE_TIMEOUT_MS = 10_000;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    if (!ffmpegPath) {
      resolve({ code: null, stdout: '', stderr: 'no ffmpeg', timedOut: false });
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    let proc: ReturnType<typeof spawn>;
    const finish = (result: RunResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    try {
      proc = spawn(ffmpegPath, args, { windowsHide: true });
    } catch (err) {
      resolve({ code: null, stdout: '', stderr: err instanceof Error ? err.message : String(err), timedOut: false });
      return;
    }
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      finish({ code: null, stdout, stderr, timedOut: true });
    }, timeoutMs);
    proc.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < 200_000) stdout += d.toString();
    });
    proc.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < 20_000) stderr += d.toString();
    });
    proc.on('error', (err: Error) => finish({ code: null, stdout, stderr: `${stderr}\n${err.message}`, timedOut: false }));
    proc.on('close', (code: number | null) => finish({ code, stdout, stderr, timedOut: false }));
  });
}

/** The encoder names the bundled ffmpeg was built with. Empty when ffmpeg is missing. */
export async function listFfmpegEncoders(): Promise<Set<string>> {
  const run = await runFfmpeg(['-hide_banner', '-encoders'], ENCODER_PROBE_TIMEOUT_MS);
  return parseFfmpegEncoderList(run.stdout);
}

export interface EncoderProbe {
  ok: boolean;
  ms: number;
  /** The last line ffmpeg printed on failure. */
  detail: string;
}

/**
 * One probe encode: a third of a second of black at 320×180 through `encoder`
 * into the null muxer. 320×180 because NVENC refuses frames below roughly
 * 145×49, and a probe that fails for its own size proves nothing.
 */
export async function probeVideoEncoder(encoder: string, timeoutMs = ENCODER_PROBE_TIMEOUT_MS): Promise<EncoderProbe> {
  const started = Date.now();
  if (!/^[\w-]+$/.test(encoder)) return { ok: false, ms: 0, detail: 'not an encoder name' };
  const run = await runFfmpeg([
    '-hide_banner', '-nostats', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=0.34',
    '-frames:v', '6', '-c:v', encoder, '-pix_fmt', encoder === 'h264_qsv' ? 'nv12' : 'yuv420p',
    '-f', 'null', '-',
  ], timeoutMs);
  const lines = run.stderr.trim().split(/\r?\n/).filter(Boolean);
  return {
    ok: run.code === 0 && !run.timedOut,
    ms: Date.now() - started,
    detail: run.timedOut ? `timed out after ${timeoutMs} ms` : (lines.at(-1) ?? ''),
  };
}

let cached: RecorderEncoderReport | null = null;
let inFlight: Promise<RecorderEncoderReport> | null = null;

/** The cached report, if detection has run in this process. */
export function cachedRecorderEncoderReport(): RecorderEncoderReport | null {
  return cached;
}

/** Which hardware encoders are compiled in, and which of those really encode here. */
export function detectRecorderEncoders(options: { force?: boolean } = {}): Promise<RecorderEncoderReport> {
  if (cached && !options.force) return Promise.resolve(cached);
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const names = await listFfmpegEncoders();
    const listed = RECORDER_HARDWARE_ENCODERS.filter((e) => names.has(RECORDER_FFMPEG_ENCODER[e]));
    const probes = await Promise.all(listed.map(async (e) => [e, await probeVideoEncoder(RECORDER_FFMPEG_ENCODER[e])] as const));
    const usable: RecorderHardwareEncoder[] = probes.filter(([, probe]) => probe.ok).map(([e]) => e);
    const report: RecorderEncoderReport = { listed, usable, probedAt: Date.now() };
    cached = report;
    return report;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Test seam. */
export function resetRecorderEncoderCache(report: RecorderEncoderReport | null = null): void {
  cached = report;
  inFlight = null;
}
