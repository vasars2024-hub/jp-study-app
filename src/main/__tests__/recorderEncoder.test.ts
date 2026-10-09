/**
 * Hardware encoding against the REAL bundled ffmpeg: what is compiled in, what
 * a probe proves usable on this machine, and that a hardware encoder failing on
 * a recording falls back to x264 instead of failing it.
 *
 * Machine-agnostic on purpose: whatever detection reports usable here must
 * really encode, and whatever it reports unusable must really fail — the
 * report is checked against ffmpeg itself rather than against a fixed list.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectRecorderEncoders, listFfmpegEncoders, probeVideoEncoder, resetRecorderEncoderCache } from '../recorderEncoder';
import { finalizeRecording } from '../recordingFinalize';
import { RECORDER_FFMPEG_ENCODER, resolveRecorderEncoder } from '../../shared/regionRecorder';

const ffmpegPath = ffmpegStatic as unknown as string;
let dir = '';
let webm = '';
let resized = '';

function run(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ code, stderr }));
  });
}

async function makeWebm(file: string, size: string, seconds: number, audio = true): Promise<void> {
  const { code, stderr } = await run([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=15:duration=${seconds}`,
    ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`] : []),
    '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '400k',
    ...(audio ? ['-c:a', 'libopus'] : []),
    file,
  ]);
  if (code !== 0) throw new Error(`fixture failed: ${stderr.slice(-400)}`);
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-rec-encoder-'));
  webm = path.join(dir, 'rec.webm');
  await makeWebm(webm, '640x360', 2);
  // A WINDOW recording: the window was resized halfway, so the frames change size
  // mid-stream (two VP8 segments of different sizes, joined without re-encoding).
  const a = path.join(dir, 'a.webm');
  const b = path.join(dir, 'b.webm');
  await makeWebm(a, '640x360', 1, false);
  await makeWebm(b, '800x600', 1, false);
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, `file '${a.replace(/\\/g, '/')}'\nfile '${b.replace(/\\/g, '/')}'\n`);
  resized = path.join(dir, 'resized.webm');
  const joined = await run(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', resized]);
  if (joined.code !== 0) throw new Error(`concat failed: ${joined.stderr.slice(-400)}`);
}, 180_000);

afterAll(() => {
  resetRecorderEncoderCache();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe('recorder encoders (real ffmpeg)', () => {
  it('lists what the bundled ffmpeg was built with, x264 always among it', async () => {
    const names = await listFfmpegEncoders();
    expect(names.has('libx264')).toBe(true);
    expect(names.has('aac')).toBe(true);
  }, 30_000);

  it('a probe succeeds for x264 and fails for an encoder that does not exist', async () => {
    expect((await probeVideoEncoder('libx264')).ok).toBe(true);
    const bogus = await probeVideoEncoder('h264_doesnotexist');
    expect(bogus.ok).toBe(false);
    expect(bogus.detail).not.toBe('');
    expect((await probeVideoEncoder('rm -rf')).ok).toBe(false);
  }, 30_000);

  it('detection is honest: every encoder it calls usable encodes, every one it rejects fails', async () => {
    resetRecorderEncoderCache();
    const report = await detectRecorderEncoders();
    const names = await listFfmpegEncoders();
    for (const e of report.listed) expect(names.has(RECORDER_FFMPEG_ENCODER[e])).toBe(true);
    for (const e of report.listed) {
      const probe = await probeVideoEncoder(RECORDER_FFMPEG_ENCODER[e]);
      expect({ encoder: e, ok: probe.ok }).toEqual({ encoder: e, ok: report.usable.includes(e) });
    }
    // Cached: a second ask does not probe again.
    expect(await detectRecorderEncoders()).toBe(report);
  }, 60_000);

  it('finishes a recording with what auto picks here, and says which encoder made it', async () => {
    const report = await detectRecorderEncoders();
    const chosen = resolveRecorderEncoder('auto', report);
    const result = await finalizeRecording({ input: webm, output: path.join(dir, 'auto.mp4'), quality: 'small', encoder: chosen.encoder }).done;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([chosen.encoder, 'libx264']).toContain(result.encoder);
    expect(result.hasAudio).toBe(true);
    expect([result.width, result.height]).toEqual([640, 360]);
  }, 120_000);

  it('a hardware encoder that fails on the recording falls back to x264 instead of failing it', async () => {
    const result = await finalizeRecording({ input: webm, output: path.join(dir, 'fallback.mp4'), quality: 'small', encoder: 'h264_doesnotexist' }).done;
    expect(result).toMatchObject({ ok: true, encoder: 'libx264', fellBack: true });
  }, 120_000);

  it('a window resized mid-recording becomes one MP4 at its first frame size', async () => {
    const result = await finalizeRecording({ input: resized, output: path.join(dir, 'window.mp4'), quality: 'small', fitToFirstFrame: true }).done;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([result.width, result.height]).toEqual([640, 360]);
    expect(result.durationSec ?? 0).toBeGreaterThan(1.5);
  }, 120_000);
});
