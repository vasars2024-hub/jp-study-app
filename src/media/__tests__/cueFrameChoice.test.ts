import { describe, expect, it } from 'vitest';
import { cueFrameSec, planCueFrame } from '../cueFrameChoice';

const line = { startSec: 10, endSec: 12 };

describe('planCueFrame — the picture a mined card gets', () => {
  it('takes the frame on screen while playback is inside the line', () => {
    expect(planCueFrame({ ...line, currentSec: 11, frameReady: true, hasFile: true })).toEqual({ kind: 'element' });
  });

  it('takes the frame on screen where auto-pause stops (at the end)', () => {
    expect(planCueFrame({ ...line, currentSec: 11.985, frameReady: true, hasFile: true })).toEqual({ kind: 'element' });
    expect(planCueFrame({ ...line, currentSec: 12.2, frameReady: true, hasFile: true })).toEqual({ kind: 'element' });
  });

  it('cuts a frame from inside the line once playback has moved on (the old rule took the next shot)', () => {
    expect(planCueFrame({ ...line, currentSec: 13.5, frameReady: true, hasFile: true })).toEqual({ kind: 'file', atSec: 11 });
    expect(planCueFrame({ ...line, currentSec: 9, frameReady: true, hasFile: true })).toEqual({ kind: 'file', atSec: 11 });
  });

  it('cuts from the file when the element has no decoded frame', () => {
    expect(planCueFrame({ ...line, currentSec: 11, frameReady: false, hasFile: true })).toEqual({ kind: 'file', atSec: 11 });
  });

  it('keeps the looser on-screen window for a stream, and gives up beyond it', () => {
    expect(planCueFrame({ ...line, currentSec: 13.5, frameReady: true, hasFile: false })).toEqual({ kind: 'element' });
    expect(planCueFrame({ ...line, currentSec: 30, frameReady: true, hasFile: false })).toEqual({ kind: 'none' });
    expect(planCueFrame({ ...line, currentSec: null, frameReady: false, hasFile: false })).toEqual({ kind: 'none' });
  });
});

describe('cueFrameSec', () => {
  it('is the middle of the line, never negative', () => {
    expect(cueFrameSec(10, 12)).toBe(11);
    expect(cueFrameSec(-3, 1)).toBe(0.5);
    expect(cueFrameSec(5, Number.NaN)).toBe(5);
  });
});
