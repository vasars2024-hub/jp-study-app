/**
 * Local artwork for the media library.
 *
 * The library grid is poster-first, and a grid of grey placeholders looks broken
 * no matter how good the layout is. Metadata providers (Phase 2) will supply real
 * posters for anything they can identify, but that leaves personal recordings,
 * lecture captures and anything with an unmatchable name with nothing — and it
 * needs the network. So every file gets artwork locally, first:
 *
 *   audio  -> the embedded cover art, if the container has any
 *   video  -> a frame grabbed ~10% into the runtime
 *
 * 10% rather than the first frame because frame 0 is almost always black, a
 * distributor logo, or a title card — technically an image, useless as a poster.
 *
 * Results are cached per media id under `<userData>/artwork`, with a 0-byte file
 * marking a known miss (the same negative-cache trick `extractCoverArt` uses in
 * `media.ts`) so a file ffmpeg cannot read is not retried on every library paint.
 *
 * Callers get an absolute path; turning that into a renderer-safe URL is
 * `media.ts`'s job, because it owns the token map.
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import type { MediaKind } from '../shared/mediaKind';

const ffmpegPath = ffmpegStatic as unknown as string;

/**
 * Thumbnailing a freshly imported folder would otherwise spawn one ffmpeg per
 * file at once and stall the machine. Four keeps the grid filling visibly fast
 * without the app competing with itself for cores.
 */
const MAX_CONCURRENT = 4;

/** Long edge of a generated still. Wide enough for a 2x poster tile, small on disk. */
const THUMB_WIDTH = 480;

let active = 0;
const waiting: Array<() => void> = [];
/** id -> in-flight job, so a re-render never starts a second ffmpeg for one file. */
const inFlight = new Map<string, Promise<string | null>>();

function artworkDir(): string {
  return path.join(app.getPath('userData'), 'artwork');
}

function artworkPath(id: string): string {
  // Ids are UUIDs, but a hostile/legacy id must not escape the cache directory.
  return path.join(artworkDir(), `${id.replace(/[^a-zA-Z0-9_-]/g, '')}.jpg`);
}

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  // No increment here: `release` handed this permit over without ever dropping
  // `active`, so the slot is already accounted for. Incrementing again would
  // double-count and let the pool drift above the limit.
}

function release(): void {
  const next = waiting.shift();
  if (next) {
    // Transfer the permit directly. Decrementing first would open a window in
    // which a fresh `acquire()` sees a free slot and takes it, while the woken
    // waiter also proceeds — two holders for one permit, and one more ffmpeg
    // process than the limit exists to allow. Over a large import that leaks a
    // slot per release.
    next();
    return;
  }
  active -= 1;
}

/** Exposed for tests: the invariant is "never more than MAX_CONCURRENT holders". */
export const __artworkTestables = {
  acquire,
  release,
  maxConcurrent: MAX_CONCURRENT,
  activeCount: (): number => active,
  reset(): void {
    active = 0;
    waiting.length = 0;
  },
};

function runFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    proc.stderr.on('data', (d: Buffer) => {
      // Bounded: a broken file can produce megabytes of repeated warnings.
      if (stderr.length < 64_000) stderr += d.toString();
    });
    proc.on('error', () => resolve({ code: null, stderr }));
    proc.on('close', (code) => resolve({ code, stderr }));
  });
}

const DURATION = /Duration:\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/;

/**
 * Runtime in seconds, read from ffmpeg's stderr banner.
 *
 * ffprobe would be the obvious tool, but it is not a dependency and adding one
 * would mean touching root config. `ffmpeg -i <file>` with no output prints the
 * same stream summary and exits non-zero by design, so the exit code is ignored
 * and only the banner is parsed.
 */
export async function probeDurationSec(file: string): Promise<number | null> {
  if (!file || !fs.existsSync(file)) return null;
  await acquire();
  try {
    const { stderr } = await runFfmpeg(['-hide_banner', '-i', file]);
    const m = DURATION.exec(stderr);
    if (!m) return null;
    const seconds =
      Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4] ?? '0'}`);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } finally {
    release();
  }
}

/**
 * Candidate timestamps to grab, past the cold open and before the credits.
 *
 * Several rather than one because any single fixed point is a coin flip: a tenth
 * of the way into an episode is very often a fade, a letterboxed eyecatch or a
 * black scene transition, and the resulting flat grey tile looks like a bug. The
 * spread costs about a second per file and is what makes the grid look real.
 */
function seekTargets(durationSec: number | null): number[] {
  if (durationSec === null || durationSec <= 0) return [5];
  const usable = Math.max(durationSec - 2, 1);
  const points = [0.12, 0.28, 0.45, 0.62]
    .map((fraction) => Math.min(Math.max(durationSec * fraction, 1), usable));
  return [...new Set(points.map((value) => Math.round(value)))];
}

/**
 * Below this, a 480px-wide JPEG is a essentially flat field of one colour — a
 * fade, a blank transition, or a frame the decoder could not resolve. Measured
 * against real output: genuine frames land at 8-20 KB, flat ones at ~1.6 KB.
 * Anything under this loses to the deterministic gradient fallback, which at
 * least differs per title.
 */
const FLAT_FRAME_BYTES = 4000;

function isAudioLike(kind: MediaKind | undefined): boolean {
  return kind === 'audio' || kind === 'audiobook';
}

async function generate(file: string, kind: MediaKind | undefined, durationSec: number | null, out: string): Promise<boolean> {
  const common = ['-y', '-hide_banner', '-loglevel', 'error', '-frames:v', '1', '-f', 'image2'];

  if (isAudioLike(kind)) {
    // Attached-picture streams only. Without -an, ffmpeg happily writes a
    // waveform-less black frame for audio that has no cover at all.
    const { code } = await runFfmpeg(['-i', file, '-an', '-map', '0:v?', ...common, out]);
    return code === 0;
  }

  // Fast seek (-ss before -i) so each grab costs a decode from one keyframe
  // rather than a decode of everything up to that point.
  const scale = ['-vf', `scale=${THUMB_WIDTH}:-2`];
  const grab = async (seek: number | null, target: string): Promise<number> => {
    const seekArgs = seek === null ? [] : ['-ss', String(seek)];
    const { code } = await runFfmpeg([...seekArgs, '-i', file, '-an', ...scale, ...common, target]);
    return code === 0 ? fileSize(target) : 0;
  };

  let bestSize = 0;
  const candidate = `${out}.tmp`;
  for (const seek of seekTargets(durationSec)) {
    const size = await grab(seek, candidate);
    // Keep the most detailed frame. JPEG size is a good enough stand-in for
    // "has something in it" — a flat frame cannot compress to anything else.
    if (size > bestSize) {
      bestSize = size;
      try {
        fs.renameSync(candidate, out);
      } catch {
        bestSize = 0;
      }
    }
    if (bestSize >= FLAT_FRAME_BYTES * 3) break; // clearly good; stop paying for more
  }
  safeUnlink(candidate);
  if (bestSize >= FLAT_FRAME_BYTES) return true;

  // Seeking past the end of a mis-tagged or truncated file yields no frame at
  // all, so fall back to frame 0 — a poor poster, but a real one.
  const first = await grab(null, out);
  return first >= FLAT_FRAME_BYTES;
}

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function safeUnlink(file: string): void {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    /* a leftover temp file is harmless; it is overwritten on the next attempt */
  }
}

function fileHasBytes(file: string): boolean {
  return fileSize(file) > 0;
}

export interface MediaArtworkRequest {
  id: string;
  file: string;
  kind?: MediaKind;
  /** Known runtime, if the library already has one. Probed when omitted. */
  durationSec?: number;
}

/**
 * Absolute path to this item's artwork, generating it on first use.
 * Returns `null` when the file has no usable image — a decision that is cached.
 */
export function ensureMediaArtwork(request: MediaArtworkRequest): Promise<string | null> {
  const { id, file } = request;
  if (!id || !file) return Promise.resolve(null);

  const existing = inFlight.get(id);
  if (existing) return existing;

  const job = (async (): Promise<string | null> => {
    const out = artworkPath(id);
    try {
      if (fs.existsSync(out)) return fileHasBytes(out) ? out : null;
      if (!fs.existsSync(file)) return null;

      fs.mkdirSync(artworkDir(), { recursive: true });

      const durationSec = typeof request.durationSec === 'number' && request.durationSec > 0
        ? request.durationSec
        : isAudioLike(request.kind)
          ? null
          : await probeDurationSec(file);

      await acquire();
      let ok: boolean;
      try {
        ok = await generate(file, request.kind, durationSec, out);
      } finally {
        release();
      }

      if (ok && fileHasBytes(out)) return out;

      // Negative cache. Written as an empty file so the miss survives a restart.
      try {
        fs.writeFileSync(out, '');
      } catch {
        /* a cache we cannot write is a cache we retry — not worth failing over */
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlight.delete(id);
    }
  })();

  inFlight.set(id, job);
  return job;
}

/** Drop cached artwork for the given media ids, or all of it when `ids` is empty. */
export function clearMediaArtwork(ids: Set<string>): void {
  const dir = artworkDir();
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (ids.size > 0 && !ids.has(path.basename(name, path.extname(name)))) continue;
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* a file we cannot delete is regenerated over, not fatal */
    }
  }
}
