import { describe, expect, it } from 'vitest';
import {
  CLIP_PAD_MAX_MS,
  clipPaddingFromPreferences,
  DEFAULT_CLIP_PADDING,
  paddedCueRange,
} from '../clipPadding';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

const cue = (index: number, startMs: number, endMs: number, text = `line ${index}`): VideoCoreStudyCue => ({
  index,
  trackNumber: 1,
  text,
  startMs,
  endMs,
});

describe('clipPaddingFromPreferences', () => {
  it('defaults to the one-key mine padding it replaces', () => {
    expect(clipPaddingFromPreferences({})).toEqual(DEFAULT_CLIP_PADDING);
    expect(clipPaddingFromPreferences(null)).toEqual({ beforeMs: 250, afterMs: 350, stopAtNeighbours: true });
  });

  it('clamps and snaps hand-edited values', () => {
    const padding = clipPaddingFromPreferences({
      clipPadBeforeMs: -40,
      clipPadAfterMs: 999_999,
      clipPadStopAtNeighbours: false,
    });
    expect(padding).toEqual({ beforeMs: 0, afterMs: CLIP_PAD_MAX_MS, stopAtNeighbours: false });
    expect(clipPaddingFromPreferences({ clipPadBeforeMs: 123 }).beforeMs).toBe(100);
    expect(clipPaddingFromPreferences({ clipPadAfterMs: 'lots' }).afterMs).toBe(350);
  });
});

describe('paddedCueRange', () => {
  const padding = { beforeMs: 500, afterMs: 800, stopAtNeighbours: true };

  it('pads by the setting and applies the subtitle delay', () => {
    const range = paddedCueRange(cue(1, 10_000, 12_000), [], 0.5, padding);
    expect(range).toMatchObject({ cueStartSec: 10.5, cueEndSec: 12.5, padBeforeSec: 0.5, padAfterSec: 0.8 });
    expect(range.startSec).toBeCloseTo(10);
    expect(range.endSec).toBeCloseTo(13.3);
  });

  it('stops the padding at the previous line end and the next line start', () => {
    const lines = [cue(0, 8_000, 9_800), cue(1, 10_000, 12_000), cue(2, 12_300, 14_000)];
    const range = paddedCueRange(lines[1], lines, 0, padding);
    expect(range.padBeforeSec).toBeCloseTo(0.2);
    expect(range.padAfterSec).toBeCloseTo(0.3);
    expect(range.startSec).toBeCloseTo(9.8);
    expect(range.endSec).toBeCloseTo(12.3);
  });

  it('pads into neighbours when the learner turned the limit off', () => {
    const lines = [cue(0, 8_000, 9_800), cue(1, 10_000, 12_000), cue(2, 12_300, 14_000)];
    const range = paddedCueRange(lines[1], lines, 0, { ...padding, stopAtNeighbours: false });
    expect(range.padBeforeSec).toBeCloseTo(0.5);
    expect(range.padAfterSec).toBeCloseTo(0.8);
  });

  it('ignores overlapping lines, signs and empty events as neighbours', () => {
    const lines = [
      cue(0, 9_000, 11_000, 'overlapping speaker'),
      cue(1, 10_000, 12_000),
      cue(2, 12_100, 13_000, '{\\pos(10,10)}看板'),
      cue(3, 12_050, 12_900, '   '),
    ];
    const range = paddedCueRange(lines[1], lines, 0, padding);
    expect(range.padBeforeSec).toBeCloseTo(0.5);
    expect(range.padAfterSec).toBeCloseTo(0.8);
  });

  it('never asks for time before the file', () => {
    const range = paddedCueRange(cue(0, 200, 1_000), [], 0, padding);
    expect(range.startSec).toBe(0);
    expect(range.padBeforeSec).toBeCloseTo(0.2);
  });
});
