/**
 * The bound on a frame that is about to leave the machine as a picture.
 *
 * Only the policy is pinned here — the scaling arithmetic and the ladder's verdict.
 * The drawing half needs a real 2D context, which the node environment this file
 * runs in does not have; what it would prove (that `drawImage` draws) is the
 * browser's own contract, while what can silently go wrong is a frame that is
 * upscaled, an encode that is accepted over the lane's limit, or a ladder that
 * gives up on its first rung. Those are all here.
 */
import { describe, expect, it } from 'vitest';
import { AGENT_EXECUTION_IMAGE_BYTES_LIMIT } from '../shared/agentExecutionBridge';
import {
  AGENT_FRAME_ENCODE_LADDER,
  AGENT_FRAME_TARGET_BYTES,
  acceptFrameAttempt,
  frameScaleTo,
} from './cueFrameCapture';

const LAST = AGENT_FRAME_ENCODE_LADDER.length - 1;

describe('frameScaleTo', () => {
  it('fits a 1080p frame inside the ceiling while keeping its aspect ratio', () => {
    expect(frameScaleTo(1920, 1080, 1280)).toEqual({ width: 1280, height: 720 });
  });

  it('fits a 4K frame too — the case that would otherwise blow the 4 MiB bound', () => {
    expect(frameScaleTo(3840, 2160, 1280)).toEqual({ width: 1280, height: 720 });
  });

  it('scales on the LONG side, so a vertical frame is bounded by its height', () => {
    expect(frameScaleTo(1080, 1920, 1280)).toEqual({ width: 720, height: 1280 });
  });

  it('never upscales: a small stream stays its own size', () => {
    // Spending bytes on invented pixels would be the opposite of what this is for.
    expect(frameScaleTo(640, 360, 1280)).toEqual({ width: 640, height: 360 });
  });

  it('keeps at least one pixel on an extremely wide frame', () => {
    const size = frameScaleTo(4000, 1, 800);
    expect(size).toEqual({ width: 800, height: 1 });
  });

  it('refuses a frame with no dimensions, rather than encoding a blank canvas', () => {
    // What a <video> reports before its first decoded frame.
    expect(frameScaleTo(0, 0, 1280)).toBeNull();
    expect(frameScaleTo(Number.NaN, Number.NaN, 1280)).toBeNull();
  });
});

describe('acceptFrameAttempt', () => {
  it('takes the first rung when it already fits the target', () => {
    expect(acceptFrameAttempt(AGENT_FRAME_TARGET_BYTES - 1, 0)).toBe('accept');
    expect(acceptFrameAttempt(AGENT_FRAME_TARGET_BYTES, 0)).toBe('accept');
  });

  it('retries a rung that overshot, so the ladder is not decorative', () => {
    expect(acceptFrameAttempt(AGENT_FRAME_TARGET_BYTES + 1, 0)).toBe('retry');
    expect(acceptFrameAttempt(3 * 1024 * 1024, LAST - 1)).toBe('retry');
  });

  it('stops holding the target against the last rung — there is nothing left to try', () => {
    expect(acceptFrameAttempt(AGENT_FRAME_TARGET_BYTES + 1, LAST)).toBe('accept');
    expect(acceptFrameAttempt(AGENT_EXECUTION_IMAGE_BYTES_LIMIT, LAST)).toBe('accept');
  });

  it('refuses over the lane’s own bound rather than staging what it will reject', () => {
    expect(acceptFrameAttempt(AGENT_EXECUTION_IMAGE_BYTES_LIMIT + 1, LAST)).toBe('refuse');
  });

  it('refuses an unmeasurable encode on the last rung and retries it before that', () => {
    // `toDataURL` answering `data:,` measures as nothing. On an earlier rung that is
    // worth another go at a different size; on the last one it is not a picture.
    expect(acceptFrameAttempt(0, 0)).toBe('retry');
    expect(acceptFrameAttempt(0, LAST)).toBe('refuse');
    expect(acceptFrameAttempt(Number.NaN, LAST)).toBe('refuse');
  });
});

describe('the ladder itself', () => {
  it('gets smaller and lossier at every step, so retrying can actually help', () => {
    for (let index = 1; index < AGENT_FRAME_ENCODE_LADDER.length; index += 1) {
      const previous = AGENT_FRAME_ENCODE_LADDER[index - 1];
      const rung = AGENT_FRAME_ENCODE_LADDER[index];
      expect(rung.longestSide).toBeLessThanOrEqual(previous.longestSide);
      expect(rung.quality).toBeLessThan(previous.quality);
    }
  });

  it('aims well under the lane’s hard bound, leaving room for a second image', () => {
    expect(AGENT_FRAME_TARGET_BYTES * 2).toBeLessThan(AGENT_EXECUTION_IMAGE_BYTES_LIMIT);
  });
});
