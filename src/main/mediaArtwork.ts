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
 * The metadata sweep also asks this module for a *title's* local poster and
 * backdrop (`findLocalArtwork`): a sidecar `poster.jpg`/`fanart.jpg` beside the
 * files, or the cover an MKV carries as an attachment. That is what a film looks
 * like without a TMDB key, and what any title no provider knows falls back to.
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
import crypto from 'node:crypto';
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

function runFfmpeg(
  args: string[],
  options: { stdout?: boolean } = {},
): Promise<{ code: number | null; stderr: string; stdout: Buffer }> {
  return new Promise((resolve) => {
    let stderr = '';
    const out: Buffer[] = [];
    let outBytes = 0;
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    proc.stderr.on('data', (d: Buffer) => {
      // Bounded: a broken file can produce megabytes of repeated warnings.
      if (stderr.length < 64_000) stderr += d.toString();
    });
    // Drained even when not wanted, so a chatty pipe can never stall the child.
    proc.stdout.on('data', (d: Buffer) => {
      if (!options.stdout || outBytes > 1_000_000) return;
      out.push(d);
      outBytes += d.length;
    });
    const finish = (code: number | null): void => resolve({ code, stderr, stdout: Buffer.concat(out) });
    proc.on('error', () => finish(null));
    proc.on('close', (code) => finish(code));
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
 *
 * Starts at a fifth: in a film the first tenth is still distributor logos and
 * opening titles on black, and in an episode it is the opening sequence. The
 * early point is kept last, as the fallback for a short clip.
 */
function seekTargets(durationSec: number | null): number[] {
  if (durationSec === null || durationSec <= 0) return [5];
  const usable = Math.max(durationSec - 2, 1);
  const points = [0.2, 0.33, 0.47, 0.6, 0.12]
    .map((fraction) => Math.min(Math.max(durationSec * fraction, 1), usable));
  return [...new Set(points.map((value) => Math.round(value)))];
}

/** Side of the greyscale probe frame grabbed alongside every candidate still. */
const PROBE_WIDTH = 32;
const PROBE_HEIGHT = 18;

export interface LumaStats {
  /** Mean brightness, 0–255. */
  mean: number;
  /** Standard deviation of brightness, 0–~128: how much is in the frame. */
  spread: number;
}

/** Brightness statistics of a raw 8-bit greyscale frame, or null when empty. */
export function lumaStats(bytes: Uint8Array): LumaStats | null {
  if (bytes.length === 0) return null;
  let sum = 0;
  for (const value of bytes) sum += value;
  const mean = sum / bytes.length;
  let variance = 0;
  for (const value of bytes) variance += (value - mean) ** 2;
  return { mean, spread: Math.sqrt(variance / bytes.length) };
}

/** A frame this dark reads as a black tile at poster size. */
const DARK_MEAN = 40;
/** Below this spread a frame is a fade or a flat card, whatever its brightness. */
const FLAT_SPREAD = 14;

/**
 * How good a candidate still is.
 *
 * `good` ends the search: bright enough, varied enough and detailed enough
 * that another decode would not buy a better poster. `score` ranks the rest
 * when nothing is good — JPEG size (detail) weighted by brightness and
 * contrast, so a detailed night scene still beats a flat title card but loses
 * to a lit one. Without stats (the probe failed) it falls back to size alone,
 * which is exactly the old rule.
 */
export function frameVerdict(bytes: number, stats: LumaStats | null): { good: boolean; score: number } {
  if (bytes < FLAT_FRAME_BYTES) return { good: false, score: 0 };
  if (!stats) return { good: bytes >= FLAT_FRAME_BYTES * 3, score: bytes };
  const brightness = Math.min(1, stats.mean / (DARK_MEAN * 1.5));
  const contrast = Math.min(1, stats.spread / (FLAT_SPREAD * 2));
  const good = stats.mean >= DARK_MEAN && stats.spread >= FLAT_SPREAD && bytes >= FLAT_FRAME_BYTES * 2;
  return { good, score: bytes * (0.2 + 0.8 * brightness) * (0.2 + 0.8 * contrast) };
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
  /**
   * One decode, two outputs: the still itself, and a 32x18 greyscale copy
   * piped back raw so its brightness can be measured without a second ffmpeg.
   * `0:V:0` (capital V) is the first *real* video stream — never an MKV's
   * attached cover, which `0:v:0` can be.
   */
  const grabWithStats = async (seek: number, target: string): Promise<{ size: number; stats: LumaStats | null }> => {
    const { code, stdout } = await runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error', '-ss', String(seek), '-i', file, '-an',
      '-filter_complex',
      `[0:V:0]scale=${THUMB_WIDTH}:-2,split=2[still][probe];[probe]scale=${PROBE_WIDTH}:${PROBE_HEIGHT},format=gray[luma]`,
      '-map', '[still]', '-frames:v', '1', '-f', 'image2', target,
      '-map', '[luma]', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1',
    ], { stdout: true });
    if (code === 0) return { size: fileSize(target), stats: lumaStats(stdout) };
    // Some containers refuse the filter graph; the plain grab still works.
    return { size: await grab(seek, target), stats: null };
  };

  let best = 0;
  let bestBytes = 0;
  const candidate = `${out}.tmp`;
  for (const seek of seekTargets(durationSec)) {
    const { size, stats } = await grabWithStats(seek, candidate);
    const verdict = frameVerdict(size, stats);
    if (verdict.score > best) {
      try {
        fs.renameSync(candidate, out);
        best = verdict.score;
        bestBytes = size;
      } catch {
        /* keep the previous best */
      }
    }
    // A bright, varied, detailed frame: stop paying for more decodes.
    if (verdict.good && best === verdict.score) break;
  }
  safeUnlink(candidate);
  if (bestBytes >= FLAT_FRAME_BYTES) return true;

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

// ---------------------------------------------------------------------------
// Local poster and backdrop: sidecar images and embedded covers
// ---------------------------------------------------------------------------

/** One stream from ffmpeg's `-i` banner, as far as cover detection needs. */
export interface FfmpegStream {
  /** The stream's index in the input, as in `-map 0:<index>`. */
  index: number;
  /** `video`, `audio`, `subtitle`, `attachment`, `data`. */
  type: string;
  codec: string;
  /** `(attached pic)`: an image stored in the container, not the programme. */
  attachedPic: boolean;
  width?: number;
  height?: number;
  filename?: string;
  mimetype?: string;
}

const STREAM_LINE = /^\s*Stream #0:(\d+)(?:\[[^\]]*\])?(?:\([^)]*\))?:\s*(\w+):\s*([^\s,]+)(.*)$/;
const METADATA_LINE = /^\s{4,}(filename|mimetype)\s*:\s*(.+?)\s*$/i;

/**
 * Streams out of ffmpeg's banner.
 *
 * Matroska stores cover art as attachments. ffmpeg 6 exposes an image
 * attachment as a `Video: mjpeg … (attached pic)` stream carrying its
 * `filename`/`mimetype` metadata, and any other attachment (fonts, mostly) as
 * an `Attachment:` stream — both shapes are recognised, recorded from real
 * output in `__tests__/fixtures/metadata/ffmpeg-banner-*.txt`.
 */
export function parseFfmpegStreams(banner: string): FfmpegStream[] {
  const streams: FfmpegStream[] = [];
  let current: FfmpegStream | null = null;
  for (const line of banner.split(/\r?\n/)) {
    const stream = STREAM_LINE.exec(line);
    if (stream) {
      const rest = stream[4] ?? '';
      const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(rest);
      current = {
        index: Number(stream[1]),
        type: (stream[2] ?? '').toLowerCase(),
        codec: (stream[3] ?? '').toLowerCase(),
        attachedPic: /\(attached pic\)/i.test(rest),
      };
      if (size) {
        current.width = Number(size[1]);
        current.height = Number(size[2]);
      }
      streams.push(current);
      continue;
    }
    const meta = METADATA_LINE.exec(line);
    if (meta && current) {
      if (meta[1]?.toLowerCase() === 'filename') current.filename = meta[2];
      else current.mimetype = meta[2]?.toLowerCase();
    }
  }
  return streams;
}

const IMAGE_MIME = /^image\/(jpe?g|png|webp|bmp)$/i;

function isImageStream(stream: FfmpegStream): boolean {
  if (stream.type === 'video' && stream.attachedPic) return true;
  return stream.type === 'attachment' && IMAGE_MIME.test(stream.mimetype ?? '');
}

/**
 * Which embedded image is the poster and which the backdrop.
 *
 * The Matroska attachment convention names them: `cover.jpg` is the portrait
 * cover, `cover_land.jpg` the landscape one, `small_cover*` a thumbnail. Past
 * the names, shape decides — portrait for a poster, a wide 16:9-ish image for
 * a backdrop — so an unconventionally named cover is still used.
 */
export function pickEmbeddedArtwork(streams: readonly FfmpegStream[]): { poster?: FfmpegStream; backdrop?: FfmpegStream } {
  const images = streams.filter(isImageStream);
  const name = (stream: FfmpegStream): string => (stream.filename ?? '').toLowerCase();
  const small = (stream: FfmpegStream): boolean => name(stream).startsWith('small_');
  const landscape = (stream: FfmpegStream): boolean =>
    typeof stream.width === 'number' && typeof stream.height === 'number'
    && stream.width >= stream.height * 1.3 && stream.width >= 640;
  const portrait = (stream: FfmpegStream): boolean =>
    typeof stream.width === 'number' && typeof stream.height === 'number' && stream.height > stream.width;

  const poster = images.find((s) => /^cover\.(jpe?g|png|webp)$/.test(name(s)))
    ?? images.find((s) => !small(s) && /cover|poster|folder/.test(name(s)) && !/land|fanart|backdrop/.test(name(s)))
    ?? images.find((s) => !small(s) && portrait(s));
  const backdrop = images.find((s) => s !== poster && /cover_land|fanart|backdrop|background/.test(name(s)))
    ?? images.find((s) => s !== poster && !small(s) && landscape(s));
  return { poster, backdrop };
}

const VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.m4v', '.avi', '.mov', '.webm', '.ts', '.m2ts', '.wmv', '.flv', '.mpg', '.mpeg', '.ogv',
]);
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Sidecar image names, most specific first. The per-file names
 * (`<video>-poster.jpg`, Kodi's convention) are always trusted; the folder
 * names (`poster.jpg`, `folder.jpg`, `cover.jpg`) only in a folder that holds
 * nothing but this title — a `poster.jpg` in a shared Downloads folder is
 * somebody else's poster.
 */
function sidecarNames(base: string, kind: 'poster' | 'backdrop', dedicated: boolean): string[] {
  const own = kind === 'poster'
    ? [`${base}-poster`, `${base}-cover`, `${base}.poster`]
    : [`${base}-fanart`, `${base}-backdrop`, `${base}-background`];
  const folder = kind === 'poster'
    ? ['poster', 'folder', 'cover', 'movie', 'show']
    : ['fanart', 'backdrop', 'background', 'landscape'];
  return dedicated ? [...own, ...folder] : own;
}

/**
 * Sidecar poster/backdrop files beside a video, by the names Plex, Jellyfin
 * and Kodi write. Case-insensitive on every platform: the directory is listed
 * once and compared lower-cased.
 */
export function findSidecarArtwork(
  videoPath: string,
  options: { dedicatedFolder: boolean },
): { poster?: string; backdrop?: string } {
  const dir = path.dirname(videoPath);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return {};
  }
  const byLower = new Map(entries.map((entry) => [entry.toLowerCase(), entry] as const));
  const base = path.basename(videoPath, path.extname(videoPath)).toLowerCase();
  const find = (kind: 'poster' | 'backdrop'): string | undefined => {
    for (const stem of sidecarNames(base, kind, options.dedicatedFolder)) {
      for (const extension of IMAGE_EXTENSIONS) {
        const hit = byLower.get(`${stem}${extension}`);
        if (hit && fileHasBytes(path.join(dir, hit))) return path.join(dir, hit);
      }
    }
    return undefined;
  };
  return { poster: find('poster'), backdrop: find('backdrop') };
}

/**
 * Whether every video in a folder belongs to the given set — the condition for
 * trusting a generic `poster.jpg` there.
 */
export function folderHoldsOnly(dir: string, videoPaths: readonly string[]): boolean {
  const own = new Set(videoPaths.map((file) => path.resolve(file).toLowerCase()));
  try {
    return fs.readdirSync(dir).every((entry) => {
      if (!VIDEO_EXTENSIONS.has(path.extname(entry).toLowerCase())) return true;
      return own.has(path.resolve(dir, entry).toLowerCase());
    });
  } catch {
    return false;
  }
}

/**
 * Cache name for a locally derived image, keyed on the source's identity
 * (path, size, mtime) so replacing `poster.jpg` produces a new file rather
 * than serving the old one forever.
 */
function localArtName(kind: string, source: string, variant = ''): string {
  let stamp = '';
  try {
    const stat = fs.statSync(source);
    stamp = `${stat.size}:${Math.round(stat.mtimeMs)}`;
  } catch {
    /* an unreadable source simply gets an unstamped name */
  }
  const hash = crypto.createHash('sha1').update(`${kind}\0${source}\0${variant}\0${stamp}`).digest('hex').slice(0, 16);
  return `local-${kind}-${hash}.jpg`;
}

/** Re-encodes any image ffmpeg can read into a bounded JPEG. */
async function writeJpeg(inputArgs: string[], out: string, maxWidth: number): Promise<boolean> {
  const tmp = `${out}.tmp.jpg`;
  const { code } = await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error', ...inputArgs,
    '-frames:v', '1', '-vf', `scale='min(${maxWidth},iw)':-2`, '-q:v', '3', '-f', 'image2', tmp,
  ]);
  if (code !== 0 || fileSize(tmp) < 512) {
    safeUnlink(tmp);
    return false;
  }
  try {
    fs.renameSync(tmp, out);
    return true;
  } catch {
    safeUnlink(tmp);
    return false;
  }
}

const POSTER_WIDTH = 600;
const BACKDROP_WIDTH = 1280;

export interface LocalArtworkRequest {
  /** The title's files; the first one is inspected for embedded art. */
  files: readonly string[];
  /** Which images are still wanted. */
  want: { poster: boolean; backdrop: boolean };
}

/**
 * A poster and backdrop from the files themselves — for a film without a TMDB
 * key, a title no provider knows, or anything whose provider has no art.
 *
 * Sidecar images first (a `poster.jpg` somebody put there on purpose), then
 * the cover attached inside an MKV. Returned paths are relative to userData,
 * like every provider image, so they persist in `posterPath`/`backdropPath`.
 * A frame grab is *not* made here: that stays the `media:artwork` fallback
 * when `posterPath` is empty, where it is also the per-episode still.
 */
export async function findLocalArtwork(request: LocalArtworkRequest): Promise<{ posterPath?: string; backdropPath?: string }> {
  const first = request.files.find((file) => file && fs.existsSync(file));
  if (!first || (!request.want.poster && !request.want.backdrop)) return {};
  const result: { posterPath?: string; backdropPath?: string } = {};
  try {
    fs.mkdirSync(artworkDir(), { recursive: true });
  } catch {
    return {};
  }

  const save = async (
    kind: 'poster' | 'backdrop',
    source: string,
    inputArgs: string[],
  ): Promise<string | undefined> => {
    const name = localArtName(kind, source, inputArgs.join(' '));
    const absolute = path.join(artworkDir(), name);
    const relative = path.join('artwork', name);
    if (fileHasBytes(absolute)) return relative;
    await acquire();
    try {
      return (await writeJpeg(inputArgs, absolute, kind === 'poster' ? POSTER_WIDTH : BACKDROP_WIDTH))
        ? relative
        : undefined;
    } finally {
      release();
    }
  };

  const dedicated = folderHoldsOnly(path.dirname(first), request.files);
  const sidecar = findSidecarArtwork(first, { dedicatedFolder: dedicated });
  if (request.want.poster && sidecar.poster) {
    result.posterPath = await save('poster', sidecar.poster, ['-i', sidecar.poster]);
  }
  if (request.want.backdrop && sidecar.backdrop) {
    result.backdropPath = await save('backdrop', sidecar.backdrop, ['-i', sidecar.backdrop]);
  }

  const stillWanted = (request.want.poster && !result.posterPath) || (request.want.backdrop && !result.backdropPath);
  if (stillWanted && path.extname(first).toLowerCase() === '.mkv') {
    await acquire();
    let banner = '';
    try {
      banner = (await runFfmpeg(['-hide_banner', '-i', first])).stderr;
    } finally {
      release();
    }
    const embedded = pickEmbeddedArtwork(parseFfmpegStreams(banner));
    const extract = async (kind: 'poster' | 'backdrop', stream: FfmpegStream): Promise<string | undefined> => {
      if (stream.type === 'video') return save(kind, first, ['-i', first, '-map', `0:${stream.index}`]);
      // A non-image-typed attachment: dump the bytes, then re-encode them.
      const dumped = path.join(artworkDir(), `${localArtName(`${kind}-raw`, first)}.bin`);
      await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', `-dump_attachment:${stream.index}`, dumped, '-i', first]);
      try {
        return fileHasBytes(dumped) ? await save(kind, first, ['-i', dumped]) : undefined;
      } finally {
        safeUnlink(dumped);
      }
    };
    if (request.want.poster && !result.posterPath && embedded.poster) {
      result.posterPath = await extract('poster', embedded.poster);
    }
    if (request.want.backdrop && !result.backdropPath && embedded.backdrop) {
      result.backdropPath = await extract('backdrop', embedded.backdrop);
    }
  }

  if (!result.posterPath) delete result.posterPath;
  if (!result.backdropPath) delete result.backdropPath;
  return result;
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
