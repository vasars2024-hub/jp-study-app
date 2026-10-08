// Test media for the scraper pipeline E2E suites.
//
// A real video file is needed twice over: the ingest only auto-imports a video
// of at least MIN_AUTO_VIDEO_BYTES (2 MiB, shared/mediaIngest.ts), and the
// sentence-clip step runs the bundled ffmpeg against it. Nothing is checked in:
// the clip is generated from ffmpeg's own lavfi sources (a test pattern plus a
// sine tone), lossless and noisy so it clears the size floor, and cached in the
// OS temp directory under a hash of its arguments so a re-run costs nothing.
// Each episode is then a hard link to the cached file (a copy where the volume
// cannot link), so four "episodes" cost one file's worth of disk.
//
// When ffmpeg-static is not installed the generator answers null and the suites
// skip, rather than failing for a reason that has nothing to do with the code.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

const FFMPEG = (ffmpegStatic as unknown as string | null) ?? '';

/** Whether the bundled ffmpeg is present. Synchronous, so a suite can `skipIf` on it. */
export const HAVE_FFMPEG = Boolean(FFMPEG) && fs.existsSync(FFMPEG);

/** Four seconds: long enough for the fixture subtitles' cues (0.5 s to 2.8 s). */
const ARGS = [
  '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=4',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050:duration=4',
  '-vf', 'noise=alls=80:allf=t+u',
  '-pix_fmt', 'yuv420p', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', '-shortest',
];

/** Comfortably above the 2 MiB auto-import floor. */
const MIN_BYTES = 2.5 * 1024 * 1024;

export const E2E_MEDIA_DIR = path.join(os.tmpdir(), 'gum-e2e-media');

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))));
  });
}

let pending: Promise<string | null> | null = null;

/** The cached test clip, generated on first use. Null when ffmpeg is unavailable. */
export function ensureTestMedia(): Promise<string | null> {
  if (!HAVE_FFMPEG) return Promise.resolve(null);
  pending ??= (async () => {
    const hash = crypto.createHash('sha1').update(ARGS.join('\0')).digest('hex').slice(0, 12);
    const target = path.join(E2E_MEDIA_DIR, `testsrc-${hash}.mkv`);
    try {
      if (fs.statSync(target).size >= MIN_BYTES) return target;
    } catch {
      /* not generated yet */
    }
    fs.mkdirSync(E2E_MEDIA_DIR, { recursive: true });
    // A unique temp name, renamed into place: two suites generating at once
    // must not read each other's half-written file.
    const temp = path.join(E2E_MEDIA_DIR, `testsrc-${hash}.${process.pid}.${Date.now()}.mkv`);
    await run([...ARGS, '-y', temp]);
    if (fs.statSync(temp).size < MIN_BYTES) {
      fs.rmSync(temp, { force: true });
      throw new Error('Generated test media is below the auto-import size floor.');
    }
    try {
      fs.renameSync(temp, target);
    } catch {
      // Another suite won the race; its file is the same bytes.
      fs.rmSync(temp, { force: true });
    }
    return target;
  })();
  return pending;
}

/** Places the clip at `destination` as a hard link, falling back to a copy. */
export function placeMedia(source: string, destination: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.rmSync(destination, { force: true });
  try {
    fs.linkSync(source, destination);
  } catch {
    fs.copyFileSync(source, destination);
  }
}
