// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __artworkTestables,
  findSidecarArtwork,
  folderHoldsOnly,
  frameVerdict,
  lumaStats,
  parseFfmpegStreams,
  pickEmbeddedArtwork,
  probeDurationSec,
} from '../mediaArtwork';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
vi.mock('ffmpeg-static', () => ({ default: '/nonexistent/ffmpeg' }));

const { acquire, release, maxConcurrent, activeCount, reset } = __artworkTestables;

describe('artwork concurrency limiter', () => {
  beforeEach(() => reset());

  it('lets the first MAX_CONCURRENT callers straight through', async () => {
    for (let i = 0; i < maxConcurrent; i += 1) await acquire();
    expect(activeCount()).toBe(maxConcurrent);
  });

  it('never exceeds the limit, even when a release and an acquire race', async () => {
    // The bug this guards: `release` used to decrement and *then* wake a waiter.
    // In the gap before the waiter resumed, a fresh `acquire` saw a free slot and
    // took it — so both proceeded and the pool drifted one over the limit. Over a
    // large import that leaks a slot per release, spawning more ffmpeg processes
    // than the limiter exists to allow.
    for (let i = 0; i < maxConcurrent; i += 1) await acquire();

    let waiterResumed = false;
    const waiter = acquire().then(() => { waiterResumed = true; });

    release();                 // hands the permit to the queued waiter
    const intruder = acquire(); // races for the slot that was just freed

    await waiter;
    expect(waiterResumed).toBe(true);
    expect(activeCount()).toBeLessThanOrEqual(maxConcurrent);

    // The intruder must still be queued, not running.
    let intruderResumed = false;
    void intruder.then(() => { intruderResumed = true; });
    await Promise.resolve();
    expect(intruderResumed).toBe(false);

    release();
    await intruder;
    expect(activeCount()).toBeLessThanOrEqual(maxConcurrent);
  });

  it('drains back to zero when every holder releases', async () => {
    for (let i = 0; i < maxConcurrent; i += 1) await acquire();
    for (let i = 0; i < maxConcurrent; i += 1) release();
    expect(activeCount()).toBe(0);
  });

  it('serves waiters in order', async () => {
    for (let i = 0; i < maxConcurrent; i += 1) await acquire();
    const order: number[] = [];
    const a = acquire().then(() => order.push(1));
    const b = acquire().then(() => order.push(2));
    release();
    await a;
    release();
    await b;
    expect(order).toEqual([1, 2]);
  });

  it('releases its permit when the probe bails on a missing file', async () => {
    // The early return happens before `acquire`, so nothing should be held.
    expect(await probeDurationSec('/definitely/not/here.mkv')).toBeNull();
    expect(activeCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Local art: embedded covers, sidecar images, and the frame-grab verdict
// ---------------------------------------------------------------------------

const banner = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures', 'metadata', name), 'utf8');

describe('parseFfmpegStreams (banners recorded from ffmpeg 6.1)', () => {
  it('reads an MKV cover as an attached-picture video stream with its name', () => {
    const streams = parseFfmpegStreams(banner('ffmpeg-banner-mkv-cover.txt'));
    expect(streams.map((stream) => stream.type)).toEqual(['video', 'audio', 'video', 'video']);
    expect(streams[0]).toMatchObject({ index: 0, codec: 'h264', attachedPic: false, width: 320, height: 240 });
    expect(streams[2]).toMatchObject({
      index: 2, codec: 'mjpeg', attachedPic: true, width: 300, height: 450, filename: 'cover.jpg', mimetype: 'image/jpeg',
    });
    expect(streams[3]).toMatchObject({ index: 3, attachedPic: true, filename: 'cover_land.jpg' });
  });

  it('reads a font as an attachment stream, which is never a cover', () => {
    const streams = parseFfmpegStreams(banner('ffmpeg-banner-mkv-font-cover.txt'));
    expect(streams[2]).toMatchObject({ type: 'attachment', filename: 'Arial.ttf', mimetype: 'application/x-truetype-font' });
    expect(pickEmbeddedArtwork(streams).poster?.index).toBe(3);
  });
});

describe('pickEmbeddedArtwork', () => {
  it('follows the Matroska names: cover.jpg is the poster, cover_land.jpg the backdrop', () => {
    const picked = pickEmbeddedArtwork(parseFfmpegStreams(banner('ffmpeg-banner-mkv-cover.txt')));
    expect(picked.poster?.filename).toBe('cover.jpg');
    expect(picked.backdrop?.filename).toBe('cover_land.jpg');
  });

  it('falls back to shape, ignores thumbnails and the programme itself', () => {
    const picked = pickEmbeddedArtwork([
      { index: 0, type: 'video', codec: 'h264', attachedPic: false, width: 1920, height: 1080 },
      { index: 3, type: 'video', codec: 'mjpeg', attachedPic: true, width: 120, height: 180, filename: 'small_cover.jpg' },
      { index: 4, type: 'video', codec: 'png', attachedPic: true, width: 1000, height: 1500, filename: 'art1.png' },
      { index: 5, type: 'attachment', codec: 'none', attachedPic: false, filename: 'wide.webp', mimetype: 'image/webp' },
    ]);
    expect(picked.poster?.index).toBe(4);
    // An image-typed attachment with no size is not assumed to be wide.
    expect(picked.backdrop).toBeUndefined();
  });

  it('finds nothing in a file with no images', () => {
    expect(pickEmbeddedArtwork(parseFfmpegStreams('  Stream #0:0: Video: h264, yuv420p, 1920x1080\n'))).toEqual({});
  });
});

describe('frame verdict', () => {
  it('measures brightness and spread of the greyscale probe', () => {
    expect(lumaStats(new Uint8Array(576).fill(10))).toEqual({ mean: 10, spread: 0 });
    const half = new Uint8Array(576).map((_, index) => (index % 2 ? 200 : 40));
    expect(lumaStats(half)).toEqual({ mean: 120, spread: 80 });
    expect(lumaStats(new Uint8Array(0))).toBeNull();
  });

  it('rejects a dark or flat frame however large its JPEG, and ranks a lit one above it', () => {
    const dark = frameVerdict(30_000, { mean: 12, spread: 20 });
    const flat = frameVerdict(30_000, { mean: 120, spread: 4 });
    const lit = frameVerdict(14_000, { mean: 110, spread: 45 });
    expect(dark.good).toBe(false);
    expect(flat.good).toBe(false);
    expect(lit.good).toBe(true);
    expect(lit.score).toBeGreaterThan(dark.score);
    expect(lit.score).toBeGreaterThan(flat.score);
  });

  it('keeps the old size-only rule when the probe failed', () => {
    expect(frameVerdict(13_000, null)).toEqual({ good: true, score: 13_000 });
    expect(frameVerdict(1_600, null)).toEqual({ good: false, score: 0 });
  });
});

describe('sidecar artwork', () => {
  const makeDir = (files: Record<string, number>): string => {
    const dir = mkdtempSync(join(tmpdir(), 'sidecar-'));
    for (const [name, size] of Object.entries(files)) writeFileSync(join(dir, name), Buffer.alloc(size, 1));
    return dir;
  };

  it('prefers the per-file name, and reads folder names case-insensitively', () => {
    const dir = makeDir({ 'Film.mkv': 10, 'Film-poster.jpg': 10, 'FOLDER.JPG': 10, 'fanart.png': 10 });
    const found = findSidecarArtwork(join(dir, 'Film.mkv'), { dedicatedFolder: true });
    expect(found.poster).toBe(join(dir, 'Film-poster.jpg'));
    expect(found.backdrop).toBe(join(dir, 'fanart.png'));
    rmSync(dir, { recursive: true, force: true });
  });

  it('trusts a generic poster.jpg only in a folder that holds nothing else', () => {
    const dir = makeDir({ 'A.mkv': 10, 'B.mp4': 10, 'poster.jpg': 10, 'empty-poster.jpg': 0 });
    expect(folderHoldsOnly(dir, [join(dir, 'A.mkv')])).toBe(false);
    expect(folderHoldsOnly(dir, [join(dir, 'A.mkv'), join(dir, 'B.mp4')])).toBe(true);
    expect(findSidecarArtwork(join(dir, 'A.mkv'), { dedicatedFolder: false }).poster).toBeUndefined();
    expect(findSidecarArtwork(join(dir, 'A.mkv'), { dedicatedFolder: true }).poster).toBe(join(dir, 'poster.jpg'));
    // A zero-byte sidecar is not art.
    expect(findSidecarArtwork(join(dir, 'empty.mkv'), { dedicatedFolder: false }).poster).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});
