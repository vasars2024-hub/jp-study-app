/**
 * The rolling system-audio buffer: what "the last 8 seconds" and "this caption
 * line's audio" cut out of it, in samples and in wall-clock time.
 */
import { describe, expect, it } from 'vitest';
import {
  CAPTURE_SECONDS_DEFAULT,
  CAPTURE_SECONDS_MAX,
  CAPTURE_SECONDS_MIN,
  MINE_SECONDS_DEFAULT,
  PcmRecorder,
  PcmRing,
  base64ToBytes,
  bytesToBase64,
  clampCaptureSeconds,
  clampMineSeconds,
  decodeWav,
  downmix,
  encodeWav,
  isSilent,
  levelStats,
  resampleLinear,
  wavToMp3FfmpegArgs,
} from '../systemAudioRing';

const RATE = 1000; // 1 sample per ms keeps the arithmetic readable

/** A block whose samples count up from `from`, so a slice says which samples it holds. */
function ramp(from: number, n: number): Int16Array {
  return Int16Array.from({ length: n }, (_, i) => from + i);
}

describe('PcmRing', () => {
  it('holds what was written with a wall-clock timeline', () => {
    const ring = new PcmRing(RATE, 10);
    ring.write(ramp(0, 500), 10_500); // samples 0..499 end at t=10500
    expect(ring.length).toBe(500);
    expect(ring.durationMs).toBe(500);
    expect(ring.endWallMs).toBe(10_500);
    expect(ring.startWallMs).toBe(10_000);
  });

  it('cuts the last N seconds ending at the newest sample', () => {
    const ring = new PcmRing(RATE, 10);
    for (let k = 0; k < 8; k += 1) ring.write(ramp(k * 1000, 1000), 1_000 * (k + 1));
    const slice = ring.sliceLast(3)!;
    expect(slice.samples.length).toBe(3000);
    expect(slice.samples[0]).toBe(5000);
    expect(slice.samples[2999]).toBe(7999);
    expect(slice.startMs).toBe(5000);
    expect(slice.endMs).toBe(8000);
  });

  it('cuts a wall-clock range — the audio of one caption line', () => {
    const ring = new PcmRing(RATE, 10);
    ring.write(ramp(0, 6000), 106_000); // samples 0..5999 span t=100000..106000
    const slice = ring.sliceWall(102_000, 103_500)!;
    expect(slice.samples.length).toBe(1500);
    expect(slice.samples[0]).toBe(2000);
    expect(slice.startMs).toBe(102_000);
    expect(slice.endMs).toBe(103_500);
  });

  it('clamps a range to what is still held and refuses one wholly gone', () => {
    const ring = new PcmRing(RATE, 2); // holds 2 s
    ring.write(ramp(0, 5000), 5000);
    const slice = ring.sliceWall(0, 4000)!;
    expect(slice.startMs).toBe(3000); // the oldest held sample
    expect(slice.samples[0]).toBe(3000);
    expect(slice.samples.length).toBe(1000);
    expect(ring.sliceWall(0, 2000)).toBeNull();
  });

  it('wraps around its capacity and keeps sample order', () => {
    const ring = new PcmRing(RATE, 3);
    for (let k = 0; k < 7; k += 1) ring.write(ramp(k * 700, 700), 700 * (k + 1));
    const all = ring.sliceLast(3)!;
    expect(all.samples.length).toBe(3000);
    for (let i = 1; i < all.samples.length; i += 1) expect(all.samples[i]! - all.samples[i - 1]!).toBe(1);
    expect(all.samples[2999]).toBe(4899);
  });

  it('fills a real gap with silence so later audio keeps its time', () => {
    const ring = new PcmRing(RATE, 10);
    ring.write(ramp(1, 1000), 1000);
    ring.write(ramp(1, 1000), 4000); // 2 s with no callbacks in between
    const gap = ring.sliceWall(1000, 3000)!;
    expect(levelStats(gap.samples).peak).toBe(0);
    const after = ring.sliceWall(3000, 4000)!;
    expect(after.samples[0]).toBe(1);
  });

  it('treats a late callback as jitter, not a gap', () => {
    const ring = new PcmRing(RATE, 10);
    ring.write(ramp(0, 1000), 1000);
    ring.write(ramp(1000, 1000), 2100); // 100 ms late
    expect(ring.length).toBe(2000);
  });

  it('stores float input clipped to 16-bit', () => {
    const ring = new PcmRing(RATE, 1);
    ring.write(Float32Array.from([0, 0.5, -0.5, 2, -2]), 5);
    expect(Array.from(ring.sliceLast(1)!.samples)).toEqual([0, 16384, -16384, 32767, -32768]);
  });

  it('resizes to a shorter window keeping the newest audio and its times', () => {
    const ring = new PcmRing(RATE, 10);
    ring.write(ramp(0, 8000), 8000);
    ring.resize(3);
    expect(ring.capacity).toBe(3000);
    const slice = ring.sliceLast(10)!;
    expect(slice.samples[0]).toBe(5000);
    expect(slice.startMs).toBe(5000);
    ring.write(ramp(8000, 500), 8500);
    expect(ring.sliceLast(1)!.samples[999]).toBe(8499);
  });

  it('clear() forgets everything', () => {
    const ring = new PcmRing(RATE, 5);
    ring.write(ramp(1, 100), 100);
    ring.clear();
    expect(ring.length).toBe(0);
    expect(ring.sliceLast(1)).toBeNull();
  });
});

describe('PcmRecorder', () => {
  it('records until its cap and then stops taking audio', () => {
    const rec = new PcmRecorder(0, RATE, 2);
    expect(rec.write(ramp(0, 1500), 1500)).toBe(true);
    expect(rec.write(ramp(1500, 1500), 3000)).toBe(false);
    const slice = rec.finish();
    expect(slice.samples.length).toBe(2000);
    expect(slice.samples[1999]).toBe(1999);
    expect(slice.endMs).toBe(3000);
  });
});

describe('encoding helpers', () => {
  it('writes a WAV that decodes back to the same samples', () => {
    const samples = ramp(-50, 100);
    const wav = encodeWav(samples, 24_000);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(wav.length).toBe(44 + 200);
    const back = decodeWav(wav)!;
    expect(back.sampleRate).toBe(24_000);
    expect(Array.from(back.samples)).toEqual(Array.from(samples));
  });

  it('round-trips base64 without Buffer', () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => i % 251);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('resamples 24 kHz to the 16 kHz Whisper wants', () => {
    const out = resampleLinear(new Int16Array(24_000).fill(16384), 24_000);
    expect(out.length).toBe(16_000);
    expect(out[100]).toBeCloseTo(0.5, 3);
  });

  it('mixes stereo to mono', () => {
    expect(Array.from(downmix([Float32Array.from([1, 0]), Float32Array.from([0, 0])]))).toEqual([0.5, 0]);
  });

  it('calls near-silence silent and speech not', () => {
    expect(isSilent(levelStats(new Int16Array(1000)))).toBe(true);
    const tone = Int16Array.from({ length: 1000 }, (_, i) => Math.round(Math.sin(i / 5) * 8000));
    expect(isSilent(levelStats(tone))).toBe(false);
  });

  it('builds the sentence-deck MP3 encode reading stdin and writing stdout', () => {
    const args = wavToMp3FfmpegArgs(8);
    expect(args.slice(args.indexOf('-i'), args.indexOf('-i') + 2)).toEqual(['-i', 'pipe:0']);
    expect(args.at(-1)).toBe('pipe:1');
    expect(args).toContain('libmp3lame');
    expect(args.join(' ')).toContain('afade=t=out:st=7.940');
  });
});

describe('bounds', () => {
  it('keeps the buffer between 30 and 120 s and mining sane', () => {
    expect(clampCaptureSeconds(5)).toBe(CAPTURE_SECONDS_MIN);
    expect(clampCaptureSeconds(999)).toBe(CAPTURE_SECONDS_MAX);
    expect(clampCaptureSeconds('x')).toBe(CAPTURE_SECONDS_DEFAULT);
    expect(clampMineSeconds(undefined)).toBe(MINE_SECONDS_DEFAULT);
    expect(clampMineSeconds(8.4)).toBe(8);
  });
});
