// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { AUDIO_EXT, MEDIA_EXT, VIDEO_EXT } from '../../shared/mediaKind';

type FixtureSpec = {
  extension: string;
  videoCodec?: string;
  audioCodec: string;
  sampleRate?: number;
};

const VIDEO_FIXTURES: FixtureSpec[] = [
  { extension: '.mp4', videoCodec: 'mpeg4', audioCodec: 'aac' },
  { extension: '.m4v', videoCodec: 'mpeg4', audioCodec: 'aac' },
  { extension: '.mov', videoCodec: 'mpeg4', audioCodec: 'aac' },
  { extension: '.webm', videoCodec: 'libvpx', audioCodec: 'libvorbis' },
  { extension: '.mkv', videoCodec: 'ffv1', audioCodec: 'pcm_s16le' },
  { extension: '.avi', videoCodec: 'mpeg4', audioCodec: 'pcm_s16le' },
  { extension: '.ogv', videoCodec: 'libtheora', audioCodec: 'libvorbis' },
  { extension: '.ts', videoCodec: 'mpeg2video', audioCodec: 'mp2' },
  // FLV/MP3 rejects 16 kHz audio. The source contract accepts the container,
  // and the product decode must still normalize its native 44.1 kHz to 16 kHz.
  { extension: '.flv', videoCodec: 'flv', audioCodec: 'libmp3lame', sampleRate: 44_100 },
  { extension: '.wmv', videoCodec: 'wmv2', audioCodec: 'wmav2' },
];

const AUDIO_FIXTURES: FixtureSpec[] = [
  { extension: '.mp3', audioCodec: 'libmp3lame' },
  { extension: '.m4a', audioCodec: 'aac' },
  { extension: '.aac', audioCodec: 'aac' },
  { extension: '.flac', audioCodec: 'flac' },
  { extension: '.wav', audioCodec: 'pcm_s16le' },
  { extension: '.ogg', audioCodec: 'libvorbis' },
  { extension: '.opus', audioCodec: 'libopus' },
];

const ffmpegPath = ffmpegStatic as unknown as string;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-media-transcription-matrix-'));

function run(args: string[]) {
  return spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], {
    encoding: null,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function makeFixture(spec: FixtureSpec): string {
  const file = path.join(root, `fixture${spec.extension}`);
  const sampleRate = spec.sampleRate ?? 16_000;
  const inputs = spec.videoCodec
    ? [
        '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10:d=0.4',
        '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=${sampleRate}:duration=0.4`,
        '-shortest', '-c:v', spec.videoCodec,
      ]
    : ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=${sampleRate}:duration=0.4`];
  const made = run([...inputs, '-c:a', spec.audioCodec, '-ar', String(sampleRate), '-y', file]);
  expect(made.status, made.stderr?.toString()).toBe(0);
  expect(fs.statSync(file).size).toBeGreaterThan(0);
  return file;
}

function decodeForWhisper(file: string) {
  return run(['-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1']);
}

describe('bundled ffmpeg transcription container matrix', () => {
  beforeAll(() => {
    expect(fs.existsSync(ffmpegPath)).toBe(true);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('covers every extension the media import contract advertises', () => {
    expect(new Set(VIDEO_FIXTURES.map(({ extension }) => extension))).toEqual(VIDEO_EXT);
    expect(new Set(AUDIO_FIXTURES.map(({ extension }) => extension))).toEqual(AUDIO_EXT);
    expect(new Set([...VIDEO_FIXTURES, ...AUDIO_FIXTURES].map(({ extension }) => extension))).toEqual(MEDIA_EXT);
  });

  it.each([...VIDEO_FIXTURES, ...AUDIO_FIXTURES])(
    'decodes $extension through the packaged 16 kHz mono float32 contract',
    (spec) => {
      const decoded = decodeForWhisper(makeFixture(spec));

      expect(decoded.status, decoded.stderr?.toString()).toBe(0);
      expect(decoded.stdout.byteLength).toBeGreaterThan(16_000);
      expect(decoded.stdout.byteLength % Float32Array.BYTES_PER_ELEMENT).toBe(0);
    },
  );

  it('rejects a corrupt supported container instead of returning empty success', () => {
    const corrupt = path.join(root, 'corrupt.mp4');
    fs.writeFileSync(corrupt, 'not media');

    const decoded = decodeForWhisper(corrupt);

    expect(decoded.status).not.toBe(0);
    expect(decoded.stdout.byteLength).toBe(0);
    expect(decoded.stderr.toString()).toMatch(/invalid|error|failed/i);
  });
});
