import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECORDER_SETTINGS,
  OrderedChunkSink,
  canRecorderJobTransition,
  canRecorderTransition,
  diskSpaceVerdict,
  formatRecorderClock,
  freeBytesFromStatfs,
  isFullFrameCrop,
  nextDisplayId,
  normalizePartialMeta,
  normalizeRecorderSettings,
  nudgeRegion,
  parseFfmpegProbe,
  parseFfmpegProgressSeconds,
  pickRecorderMime,
  recordedMs,
  recorderFinalizeArgs,
  recorderLimitReached,
  recordingBaseName,
  regionFromDrag,
  regionToCropPx,
  resizeRegion,
  resolveRecorderRepeat,
  toDisplayLocal,
  toGlobal,
  uniqueRecordingFileName,
} from '../regionRecorder';

describe('regionToCropPx — DIP region onto captured pixels', () => {
  const region = { x: 100, y: 50, width: 640, height: 360 };

  it.each([
    [1, { width: 1920, height: 1080 }, { width: 1920, height: 1080 }, { x: 100, y: 50, width: 640, height: 360 }],
    // 125%: a 2560×1440 panel is 2048×1152 DIP.
    [1.25, { width: 2048, height: 1152 }, { width: 2560, height: 1440 }, { x: 124, y: 62, width: 800, height: 450 }],
    // 150%: 2880×1620 physical, 1920×1080 DIP.
    [1.5, { width: 1920, height: 1080 }, { width: 2880, height: 1620 }, { x: 150, y: 74, width: 960, height: 540 }],
    // 200%: 3840×2160 physical, 1920×1080 DIP.
    [2, { width: 1920, height: 1080 }, { width: 3840, height: 2160 }, { x: 200, y: 100, width: 1280, height: 720 }],
  ])('scales by frame size ÷ display size at %s×', (_scale, display, frame, expected) => {
    expect(regionToCropPx(region, display, frame)).toEqual(expected);
  });

  it('uses the frame, not a scale factor: a capturer that delivers DIP-size frames needs no scaling', () => {
    expect(regionToCropPx(region, { width: 1920, height: 1080 }, { width: 1920, height: 1080 })).toEqual(region);
  });

  it('handles non-uniform scaling per axis', () => {
    const crop = regionToCropPx({ x: 10, y: 10, width: 100, height: 100 }, { width: 1000, height: 500 }, { width: 2000, height: 750 });
    expect(crop).toEqual({ x: 20, y: 14, width: 200, height: 150 });
  });

  it('every number is even, even for odd regions and odd frames', () => {
    const crop = regionToCropPx({ x: 33, y: 17, width: 401, height: 223 }, { width: 1366, height: 768 }, { width: 1707, height: 960 })!;
    for (const n of [crop.x, crop.y, crop.width, crop.height]) expect(n % 2).toBe(0);
  });

  it('a whole odd-sized monitor becomes the largest even frame', () => {
    const crop = regionToCropPx({ x: 0, y: 0, width: 1365, height: 767 }, { width: 1365, height: 767 }, { width: 1365, height: 767 })!;
    expect(crop).toEqual({ x: 0, y: 0, width: 1364, height: 766 });
    expect(isFullFrameCrop(crop, { width: 1365, height: 767 })).toBe(true);
  });

  it('clamps a region that hangs over the edge, and refuses one entirely outside', () => {
    expect(regionToCropPx({ x: 1800, y: 1000, width: 400, height: 400 }, { width: 1920, height: 1080 }, { width: 1920, height: 1080 }))
      .toEqual({ x: 1800, y: 1000, width: 120, height: 80 });
    expect(regionToCropPx({ x: -50, y: -50, width: 100, height: 100 }, { width: 1920, height: 1080 }, { width: 1920, height: 1080 }))
      .toEqual({ x: 0, y: 0, width: 50, height: 50 });
    expect(regionToCropPx({ x: 3000, y: 0, width: 100, height: 100 }, { width: 1920, height: 1080 }, { width: 1920, height: 1080 })).toBeNull();
  });

  it('refuses non-finite input rather than producing a garbage crop', () => {
    expect(regionToCropPx({ x: NaN, y: 0, width: 10, height: 10 }, { width: 100, height: 100 }, { width: 100, height: 100 })).toBeNull();
    expect(regionToCropPx(region, { width: 0, height: 1080 }, { width: 1920, height: 1080 })).toBeNull();
    expect(regionToCropPx(region, { width: 1920, height: 1080 }, { width: Infinity, height: 1080 })).toBeNull();
  });
});

describe('monitors with negative origins', () => {
  // A monitor left of and above the primary one.
  const left = { x: -2560, y: -360, width: 2560, height: 1440 };

  it('a global rectangle becomes display-local and back', () => {
    const local = toDisplayLocal({ x: -2000, y: -100, width: 300, height: 200 }, left);
    expect(local).toEqual({ x: 560, y: 260, width: 300, height: 200 });
    expect(toGlobal(local, left)).toEqual({ x: -2000, y: -100, width: 300, height: 200 });
  });

  it('a display-local region crops the same however the monitor is placed', () => {
    const local = { x: 560, y: 260, width: 300, height: 200 };
    expect(regionToCropPx(local, left, { width: 3200, height: 1800 }))
      .toEqual(regionToCropPx(local, { width: 2560, height: 1440 }, { width: 3200, height: 1800 }));
  });

  it('Tab walks the monitors in reading order and wraps', () => {
    const displays = [
      { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      { id: 2, bounds: left },
      { id: 3, bounds: { x: 1920, y: 0, width: 1280, height: 1024 } },
    ];
    expect(nextDisplayId(displays, 2)).toBe(1);
    expect(nextDisplayId(displays, 1)).toBe(3);
    expect(nextDisplayId(displays, 3)).toBe(2);
    expect(nextDisplayId([], 1)).toBeNull();
  });
});

describe('drawing and nudging', () => {
  const display = { width: 1920, height: 1080 };

  it('normalizes a drag from any corner, clamps it, and applies the 12 px floor', () => {
    expect(regionFromDrag({ x: 500, y: 400 }, { x: 100, y: 100 }, display)).toEqual({ x: 100, y: 100, width: 400, height: 300 });
    expect(regionFromDrag({ x: 1800, y: 1000 }, { x: 2500, y: 1500 }, display)).toEqual({ x: 1800, y: 1000, width: 120, height: 80 });
    expect(regionFromDrag({ x: 10, y: 10 }, { x: 21, y: 300 }, display)).toBeNull();
    expect(regionFromDrag({ x: 10, y: 10 }, { x: 22, y: 22 }, display)).toEqual({ x: 10, y: 10, width: 12, height: 12 });
  });

  it('arrows move the box without leaving the display; shift+arrows resize it', () => {
    const r = { x: 5, y: 5, width: 100, height: 100 };
    expect(nudgeRegion(r, -10, -10, display)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(nudgeRegion(r, 5000, 0, display)).toEqual({ x: 1820, y: 5, width: 100, height: 100 });
    expect(resizeRegion(r, -500, 10, display)).toEqual({ x: 5, y: 5, width: 12, height: 110 });
  });

  it('repeat only replays a region whose display still exists and still fits it', () => {
    const displays = [{ id: 7, bounds: { x: 0, y: 0, width: 1280, height: 720 } }];
    expect(resolveRecorderRepeat({ displayId: 7, x: 10, y: 10, width: 200, height: 100 }, displays)?.region)
      .toEqual({ x: 10, y: 10, width: 200, height: 100 });
    expect(resolveRecorderRepeat({ displayId: 8, x: 10, y: 10, width: 200, height: 100 }, displays)).toBeNull();
    expect(resolveRecorderRepeat({ displayId: 7, x: 1200, y: 10, width: 200, height: 100 }, displays)).toBeNull();
    expect(resolveRecorderRepeat(null, displays)).toBeNull();
  });
});

describe('the state machine', () => {
  it('allows the live path and refuses shortcuts through it', () => {
    expect(canRecorderTransition('idle', 'selecting')).toBe(true);
    expect(canRecorderTransition('selecting', 'starting')).toBe(true);
    expect(canRecorderTransition('starting', 'recording')).toBe(true);
    expect(canRecorderTransition('recording', 'paused')).toBe(true);
    expect(canRecorderTransition('paused', 'recording')).toBe(true);
    expect(canRecorderTransition('recording', 'idle')).toBe(true);
    expect(canRecorderTransition('idle', 'recording')).toBe(false);
    expect(canRecorderTransition('idle', 'paused')).toBe(false);
    expect(canRecorderTransition('selecting', 'recording')).toBe(false);
  });

  it('jobs only move forward, and a failed one can only be retried from the start', () => {
    expect(canRecorderJobTransition('finalizing', 'importing')).toBe(true);
    expect(canRecorderJobTransition('importing', 'transcribing')).toBe(true);
    expect(canRecorderJobTransition('transcribing', 'ready')).toBe(true);
    expect(canRecorderJobTransition('ready', 'finalizing')).toBe(false);
    expect(canRecorderJobTransition('error', 'finalizing')).toBe(true);
    expect(canRecorderJobTransition('error', 'ready')).toBe(false);
  });
});

describe('settings', () => {
  it('defaults: system audio, 30 fps, two hours, transcribe and open', () => {
    expect(DEFAULT_RECORDER_SETTINGS).toMatchObject({ audio: 'system', fps: 30, maxMinutes: 120, autoTranscribe: true, autoOpen: true });
  });

  it('keeps what is valid and drops what is not', () => {
    const s = normalizeRecorderSettings({ audio: 'both', fps: 31, maxMinutes: 9999, micGain: -4, quality: 'ultra', folder: '  D:/Rec  ' });
    expect(s.audio).toBe('both');
    expect(s.fps).toBe(30);
    expect(s.maxMinutes).toBe(240);
    expect(s.micGain).toBe(0);
    expect(s.quality).toBe('standard');
    expect(s.folder).toBe('D:/Rec');
    expect(normalizeRecorderSettings('nonsense')).toEqual(DEFAULT_RECORDER_SETTINGS);
    expect(normalizeRecorderSettings({ lastRegion: { displayId: 1, x: 0, y: 0, width: 5, height: 5 } }).lastRegion).toBeNull();
  });
});

describe('MediaRecorder MIME choice', () => {
  it('prefers VP9 + Opus, then VP8 + Opus, then anything WebM', () => {
    expect(pickRecorderMime(() => true)).toBe('video/webm;codecs=vp9,opus');
    expect(pickRecorderMime((m) => !m.includes('vp9'))).toBe('video/webm;codecs=vp8,opus');
    expect(pickRecorderMime((m) => m === 'video/webm')).toBe('video/webm');
  });

  it('falls back to the engine default, and survives a throwing probe', () => {
    expect(pickRecorderMime(() => false)).toBe('');
    expect(pickRecorderMime((m) => {
      if (m.includes('vp9')) throw new Error('boom');
      return true;
    })).toBe('video/webm;codecs=vp8,opus');
  });
});

describe('ffmpeg', () => {
  it('builds the H.264/AAC faststart command with the crop when one is needed', () => {
    const args = recorderFinalizeArgs({ input: 'in.webm', output: 'out.mp4', crop: { x: 2, y: 4, width: 640, height: 360 }, hasAudio: true, quality: 'standard' });
    expect(args.join(' ')).toContain('-vf crop=640:360:2:4');
    expect(args.join(' ')).toContain('-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p');
    expect(args.join(' ')).toContain('-c:a aac');
    expect(args.join(' ')).toContain('-movflags +faststart');
    expect(args.join(' ')).toContain('-progress pipe:1');
    expect(args.at(-1)).toBe('out.mp4');
  });

  it('without audio drops the audio map and stream; without a crop still trims to even sizes', () => {
    const args = recorderFinalizeArgs({ input: 'in.webm', output: 'out.mp4', crop: null, hasAudio: false, quality: 'high' });
    expect(args).toContain('-an');
    expect(args).not.toContain('0:a:0');
    expect(args).toContain('crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0');
    expect(args).toContain('18');
  });

  it('reads progress in microseconds or as a clock', () => {
    expect(parseFfmpegProgressSeconds('frame=10\nout_time_us=2500000\nprogress=continue\n')).toBe(2.5);
    expect(parseFfmpegProgressSeconds('out_time_ms=1000000\nout_time_ms=3000000\n')).toBe(3);
    expect(parseFfmpegProgressSeconds('out_time=00:01:02.500000\n')).toBe(62.5);
    expect(parseFfmpegProgressSeconds('progress=end\n')).toBeNull();
  });

  it('probes duration and streams from the input section only', () => {
    const stderr = [
      'Input #0, matroska,webm, from \'a.webm\':',
      '  Duration: 00:00:06.04, start: 0.000000, bitrate: N/A',
      '  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv), 640x360, SAR 1:1 DAR 16:9, 30 fps',
      'Output #0, null, to \'pipe:\':',
      '  Stream #0:1: Audio: pcm_s16le',
    ].join('\n');
    expect(parseFfmpegProbe(stderr)).toEqual({ durationSec: 6.04, hasVideo: true, hasAudio: false, width: 640, height: 360 });
  });
});

describe('files, disk and time', () => {
  it('names a recording by its local start time, and never collides', () => {
    const at = new Date(2026, 9, 8, 14, 3, 22);
    expect(recordingBaseName(at)).toBe('Gum Recording 2026-10-08 140322');
    const taken = new Set(['Gum Recording 2026-10-08 140322.mp4', 'Gum Recording 2026-10-08 140322 (2).mp4']);
    expect(uniqueRecordingFileName(recordingBaseName(at), 'mp4', (n) => taken.has(n))).toBe('Gum Recording 2026-10-08 140322 (3).mp4');
    expect(uniqueRecordingFileName('a:b?', 'mp4', () => false)).toBe('a b.mp4');
  });

  it('reads free space from statfs, and an unreadable drive never blocks a recording', () => {
    expect(freeBytesFromStatfs({ bavail: 10n, bsize: 4096n })).toBe(40960);
    expect(diskSpaceVerdict(500 * 1024 * 1024)).toBe('low');
    expect(diskSpaceVerdict(5 * 1024 * 1024 * 1024)).toBe('ok');
    expect(diskSpaceVerdict(null)).toBe('unknown');
  });

  it('counts recorded time, not paused time, against the limit', () => {
    expect(recordedMs(0, 10_000, 3_000, null)).toBe(7_000);
    expect(recordedMs(0, 10_000, 3_000, 8_000)).toBe(5_000);
    expect(recorderLimitReached(120 * 60_000, 120)).toBe(true);
    expect(recorderLimitReached(120 * 60_000 - 1, 120)).toBe(false);
    expect(formatRecorderClock(65_000)).toBe('1:05');
    expect(formatRecorderClock(3_725_000)).toBe('1:02:05');
  });

  it('accepts a sound partial-file record and rejects a hostile one', () => {
    expect(normalizePartialMeta({ version: 1, id: 'rec-abc-1', startedAt: 5, crop: { x: 3, y: 1, width: 101, height: 51 }, hasAudio: true }))
      .toMatchObject({ id: 'rec-abc-1', crop: { x: 2, y: 0, width: 100, height: 50 }, hasAudio: true, complete: false });
    expect(normalizePartialMeta({ version: 1, id: '../../evil', startedAt: 5 })).toBeNull();
    expect(normalizePartialMeta({ version: 2, id: 'rec-a', startedAt: 5 })).toBeNull();
  });
});

describe('OrderedChunkSink', () => {
  it('writes in sequence order whatever order the chunks arrive in', async () => {
    const out: number[] = [];
    const sink = new OrderedChunkSink<number>(async (n) => { out.push(n); });
    sink.push(2, 2);
    sink.push(0, 0);
    sink.push(3, 3);
    sink.push(1, 1);
    await sink.settle();
    expect(out).toEqual([0, 1, 2, 3]);
    expect(sink.expected).toBe(4);
  });

  it('drops repeats and stale numbers', async () => {
    const out: number[] = [];
    const sink = new OrderedChunkSink<number>(async (n) => { out.push(n); });
    sink.push(0, 0);
    sink.push(0, 99);
    sink.push(1, 1);
    sink.push(1, 98);
    await sink.settle();
    expect(out).toEqual([0, 1]);
  });

  it('a chunk that never arrives is a failure, not a silent hole', async () => {
    const errors: string[] = [];
    const sink = new OrderedChunkSink<number>(async () => undefined, (e) => errors.push(e.message), 3);
    for (let i = 1; i <= 4; i += 1) sink.push(i, i);
    await sink.settle();
    expect(errors).toEqual(['chunk 0 never arrived']);
    expect(sink.error).not.toBeNull();
  });

  it('a failed write stops every later write', async () => {
    const out: number[] = [];
    const errors: string[] = [];
    const sink = new OrderedChunkSink<number>(async (n) => {
      if (n === 1) throw new Error('ENOSPC');
      out.push(n);
    }, (e) => errors.push(e.message));
    sink.push(0, 0);
    sink.push(1, 1);
    sink.push(2, 2);
    await sink.settle();
    expect(out).toEqual([0]);
    expect(errors).toEqual(['ENOSPC']);
  });
});
