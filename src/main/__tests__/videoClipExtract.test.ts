/**
 * Drives the real encoder.
 *
 * The argument vector is unit-tested next door in `shared/__tests__/videoClip.test.ts`,
 * but a correct-looking vector that ffmpeg rejects is exactly the failure this
 * feature would ship with — mining would report "clip attached" and the card
 * would carry a zero-byte file. So this builds a synthetic two-audio-track
 * episode, cuts it through the same code path the app uses, and decodes the
 * result back to check it is a real clip of the right length with the extra
 * audio track dropped.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractVideoClip } from '../videoClipExtract';

const ffmpegPath = ffmpegStatic as unknown as string;

let workDir = '';
let sourceFile = '';

function runFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', () => resolve({ code: null, stderr }));
    proc.on('close', (code) => resolve({ code, stderr }));
  });
}

/**
 * ffmpeg reports what it decoded on stderr; that report is the assertion target.
 *
 * Truncated at `Output #0` on purpose. ffmpeg prints the stream list twice — once
 * for the input it opened and once for the output it is about to write — so a
 * naive `Stream #0:\d+.*Audio:` count over the whole log reports two audio
 * streams for a file that has exactly one, and a track-count assertion built on
 * it "fails" against correct output.
 */
async function identify(file: string): Promise<string> {
  const { stderr } = await runFfmpeg(['-hide_banner', '-i', file, '-f', 'null', '-']);
  const outputSection = stderr.indexOf('Output #0');
  return outputSection === -1 ? stderr : stderr.slice(0, outputSection);
}

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-clip-test-'));
  sourceFile = path.join(workDir, 'episode 01.mkv');
  // Two audio tracks, the way a real release ships — the extractor is supposed
  // to take only the first.
  const { code, stderr } = await runFfmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=880:duration=6',
    '-map', '0:v', '-map', '1:a', '-map', '2:a',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest',
    sourceFile,
  ]);
  if (code !== 0) throw new Error(`fixture build failed: ${stderr.slice(-400)}`);
}, 120_000);

afterAll(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
});

describe('extractVideoClip against real ffmpeg', () => {
  it('cuts a playable clip of the requested length', async () => {
    const result = await extractVideoClip({
      filePath: sourceFile,
      startSec: 2,
      endSec: 4,
      padSec: 0.25,
    });

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.mimeType).toBe('video/mp4');
    expect(result.bytes ?? 0).toBeGreaterThan(1000);
    expect(result.durationSec).toBeCloseTo(2.5, 5);

    const clipFile = path.join(workDir, 'clip.mp4');
    fs.writeFileSync(clipFile, Buffer.from(result.base64 ?? '', 'base64'));
    const report = await identify(clipFile);

    // Really decodable, really about 2.5s, really has picture and sound.
    expect(report).toMatch(/Video: h264/);
    expect(report).toMatch(/Audio: aac/);
    const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(report);
    expect(duration).not.toBeNull();
    const seconds = Number(duration?.[2]) * 60 + Number(duration?.[3]);
    expect(seconds).toBeGreaterThan(2);
    expect(seconds).toBeLessThan(3.2);
  }, 120_000);

  it('keeps only the first audio track', async () => {
    const result = await extractVideoClip({ filePath: sourceFile, startSec: 1, endSec: 2 });
    const clipFile = path.join(workDir, 'clip-tracks.mp4');
    fs.writeFileSync(clipFile, Buffer.from(result.base64 ?? '', 'base64'));
    const report = await identify(clipFile);

    expect(report.match(/Stream #0:\d+.*Audio:/g) ?? []).toHaveLength(1);
    expect(report.match(/Stream #0:\d+.*Video:/g) ?? []).toHaveLength(1);
  }, 120_000);

  it('cuts a cue at the very start without seeking negative', async () => {
    // The clamp is only observable here: a negative -ss makes ffmpeg fail or
    // silently return the whole file, and both look like "it worked" upstream.
    const result = await extractVideoClip({
      filePath: sourceFile,
      startSec: 0.1,
      endSec: 1,
      padSec: 0.5,
    });
    expect(result.ok).toBe(true);
    expect(result.bytes ?? 0).toBeGreaterThan(500);
  }, 120_000);

  it('reports a missing file instead of producing an empty clip', async () => {
    const result = await extractVideoClip({
      filePath: path.join(workDir, 'not-here.mkv'),
      startSec: 1,
      endSec: 2,
    });
    expect(result.ok).toBe(false);
    expect(result.base64).toBeUndefined();
    expect(result.error).toMatch(/no longer where/i);
  });

  it('reports a streaming source rather than pretending to cut it', async () => {
    const result = await extractVideoClip({ filePath: '', startSec: 1, endSec: 2 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no local file/i);
  });
});
