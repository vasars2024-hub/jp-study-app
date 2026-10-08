/**
 * Drives the real bundled ffmpeg against a synthetic recording shaped like a
 * MediaRecorder WebM (VP8 + Opus), the way `videoClipExtract.test.ts` does:
 * a correct-looking argument vector that ffmpeg rejects is exactly the failure
 * this pipeline would otherwise ship with.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { finalizeRecording, probeRecording } from '../recordingFinalize';

const ffmpegPath = ffmpegStatic as unknown as string;
let dir = '';
let withAudio = '';
let silentVideo = '';
let longer = '';

function run(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ code, stderr }));
  });
}

async function makeWebm(file: string, seconds: number, audio: boolean, size = '641x361'): Promise<void> {
  const { code, stderr } = await run([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=15:duration=${seconds}`,
    ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`] : []),
    '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '500k',
    ...(audio ? ['-c:a', 'libopus'] : []),
    file,
  ]);
  if (code !== 0) throw new Error(`fixture failed: ${stderr.slice(-400)}`);
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-rec-finalize-'));
  withAudio = path.join(dir, 'with audio.webm');
  silentVideo = path.join(dir, 'video only.webm');
  longer = path.join(dir, 'longer.webm');
  await makeWebm(withAudio, 4, true);
  await makeWebm(silentVideo, 3, false);
  await makeWebm(longer, 20, true, '1280x720');
}, 180_000);

afterAll(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe('finalizeRecording', () => {
  it('makes an H.264/AAC MP4 of the same length, trimmed to even dimensions, with progress', async () => {
    const output = path.join(dir, 'full.mp4');
    const progress: number[] = [];
    const result = await finalizeRecording({ input: withAudio, output, quality: 'small', durationHintSec: 4, onProgress: (f) => progress.push(f) }).done;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hasAudio).toBe(true);
    expect(result.width).toBe(640);
    expect(result.height).toBe(360);
    expect(Math.abs((result.durationSec ?? 0) - 4)).toBeLessThan(0.3);
    expect(progress.at(-1)).toBe(1);
    // The input is never touched.
    expect(fs.existsSync(withAudio)).toBe(true);
  }, 120_000);

  it('applies the crop when the live crop was not available', async () => {
    const output = path.join(dir, 'cropped.mp4');
    const result = await finalizeRecording({ input: withAudio, output, quality: 'small', crop: { x: 100, y: 50, width: 320, height: 180 } }).done;
    expect(result.ok && [result.width, result.height]).toEqual([320, 180]);
  }, 120_000);

  it('a recording with no audio track stays a video, and says it has no audio', async () => {
    const output = path.join(dir, 'silent.mp4');
    const result = await finalizeRecording({ input: silentVideo, output, quality: 'small' }).done;
    expect(result.ok).toBe(true);
    expect(result.ok && result.hasAudio).toBe(false);
    expect((await probeRecording(output)).hasVideo).toBe(true);
  }, 120_000);

  it('cancel stops ffmpeg, removes the half-written MP4 and keeps the recording', async () => {
    const output = path.join(dir, 'cancelled.mp4');
    const handle = finalizeRecording({ input: longer, output, quality: 'high' });
    setTimeout(() => handle.cancel(), 300);
    const result = await handle.done;
    expect(result).toMatchObject({ ok: false, error: 'cancelled' });
    expect(fs.existsSync(output)).toBe(false);
    expect(fs.existsSync(longer)).toBe(true);
  }, 120_000);

  it('a corrupt, empty or missing recording fails without deleting it', async () => {
    const corrupt = path.join(dir, 'corrupt.webm');
    fs.writeFileSync(corrupt, Buffer.from('this is not a webm at all, just bytes'.repeat(50)));
    const bad = await finalizeRecording({ input: corrupt, output: path.join(dir, 'corrupt.mp4'), quality: 'small' }).done;
    expect(bad).toMatchObject({ ok: false, error: 'corrupt' });
    expect(fs.existsSync(corrupt)).toBe(true);

    const empty = path.join(dir, 'empty.webm');
    fs.writeFileSync(empty, '');
    expect(await finalizeRecording({ input: empty, output: path.join(dir, 'e.mp4'), quality: 'small' }).done)
      .toMatchObject({ ok: false, error: 'corrupt' });
    expect(await finalizeRecording({ input: path.join(dir, 'nope.webm'), output: path.join(dir, 'n.mp4'), quality: 'small' }).done)
      .toMatchObject({ ok: false, error: 'no-input' });
  }, 120_000);

  it('finishes a truncated recording (a crash mid-write) from what is there', async () => {
    const bytes = fs.readFileSync(longer);
    const truncated = path.join(dir, 'truncated.webm');
    fs.writeFileSync(truncated, bytes.subarray(0, Math.floor(bytes.length * 0.6)));
    const result = await finalizeRecording({ input: truncated, output: path.join(dir, 'truncated.mp4'), quality: 'small' }).done;
    expect(result.ok).toBe(true);
    expect(result.ok && (result.durationSec ?? 0)).toBeGreaterThan(5);
  }, 120_000);
});
