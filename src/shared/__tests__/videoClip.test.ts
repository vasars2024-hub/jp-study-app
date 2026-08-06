import { describe, expect, it } from 'vitest';
import {
  MAX_CLIP_SEC,
  videoClipBounds,
  videoClipFfmpegArgs,
  videoClipFilename,
} from '../videoClip';

const FILE = 'C:\\anime\\episode 01.mkv';

describe('videoClipBounds', () => {
  it('pads both sides of the cue', () => {
    expect(videoClipBounds({ filePath: FILE, startSec: 10, endSec: 12, padSec: 0.5 }))
      .toEqual({ startSec: 9.5, durationSec: 3 });
  });

  it('never seeks before the start of the file', () => {
    // A cue at 0.2s with 0.5s of padding would otherwise ask ffmpeg for -0.3.
    const bounds = videoClipBounds({ filePath: FILE, startSec: 0.2, endSec: 1.2, padSec: 0.5 });
    expect(bounds.startSec).toBe(0);
    // The window still reaches the end of the cue — the clamp moves the start,
    // it does not shorten the clip from the front.
    expect(bounds.durationSec).toBe(1.7);
  });

  it('caps a mistimed cue instead of cutting a hundred-megabyte card', () => {
    const bounds = videoClipBounds({ filePath: FILE, startSec: 5, endSec: 5000 });
    expect(bounds.durationSec).toBe(MAX_CLIP_SEC);
  });

  it('survives a cue whose end precedes its start', () => {
    expect(videoClipBounds({ filePath: FILE, startSec: 12, endSec: 10, padSec: 0 }))
      .toEqual({ startSec: 10, durationSec: 2 });
  });

  it('keeps a zero-length cue playable rather than empty', () => {
    const bounds = videoClipBounds({ filePath: FILE, startSec: 30, endSec: 30, padSec: 0 });
    expect(bounds.durationSec).toBeGreaterThan(0);
  });
});

describe('videoClipFfmpegArgs', () => {
  const args = videoClipFfmpegArgs({ filePath: FILE, startSec: 10, endSec: 12, padSec: 0.5 });

  it('seeks by index — -ss must precede -i or the cut decodes from zero', () => {
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('9.500');
    expect(args[args.indexOf('-t') + 1]).toBe('3.000');
  });

  it('takes only the first video and audio stream', () => {
    // Episodes routinely carry a second audio track; without the maps every one
    // of them lands in the card.
    expect(args).toContain('0:v:0');
    expect(args).toContain('0:a:0?');
  });

  it('writes a pipe-safe container', () => {
    // A normal MP4 puts its index at the end and cannot be written to a pipe.
    expect(args[args.indexOf('-movflags') + 1]).toContain('frag_keyframe');
    expect(args.at(-1)).toBe('pipe:1');
  });

  it('passes the path as its own argument, never interpolated', () => {
    expect(args[args.indexOf('-i') + 1]).toBe(FILE);
  });

  it('clamps the downscale ceiling', () => {
    const tiny = videoClipFfmpegArgs({ filePath: FILE, startSec: 0, endSec: 1, maxHeight: 1 });
    const huge = videoClipFfmpegArgs({ filePath: FILE, startSec: 0, endSec: 1, maxHeight: 9000 });
    expect(tiny[tiny.indexOf('-vf') + 1]).toContain('120');
    expect(huge[huge.indexOf('-vf') + 1]).toContain('1080');
  });
});

describe('videoClipFilename', () => {
  it('is deterministic, so re-mining the same line overwrites', () => {
    expect(videoClipFilename('猫 が 好き', 12.34))
      .toBe(videoClipFilename('猫 が 好き', 12.34));
  });

  it('never emits a name Anki media cannot hold', () => {
    const name = videoClipFilename('../../etc/passwd\u0000', 1);
    expect(name).toMatch(/^jp-clip-[a-zA-Z0-9-]*-\d+\.mp4$/);
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });

  it('still produces a name when the seed has nothing usable in it', () => {
    expect(videoClipFilename('日本語だけ', 2)).toBe('jp-clip-clip-2000.mp4');
  });
});
