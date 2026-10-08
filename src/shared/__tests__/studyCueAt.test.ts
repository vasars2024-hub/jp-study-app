/**
 * The lingering study line: the line the study tools act on between two lines and right
 * after auto-pause, when nothing is audible. See `studyCueAt` in shared/videoCoreStudy.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  activeCueGroupEndSec,
  lastStartedCueIndex,
  nextCueStartSec,
  sameStudyCue,
  studyCueAt,
  type VideoCoreStudyCue,
} from '../videoCoreStudy';

function cue(index: number, startMs: number, endMs: number, text = `line ${index}`): VideoCoreStudyCue {
  return { index, trackNumber: 1, startMs, endMs, text };
}

const CUES = [
  cue(0, 1_000, 3_000, 'おはよう'),
  cue(1, 5_000, 7_000, '元気？'),
  // Back to back with 1: starts exactly as 1 ends.
  cue(2, 7_000, 9_000, 'うん'),
  cue(3, 12_000, 14_000, '{\\p1}m 0 0 l 10 10{\\p0}'),
  cue(4, 20_000, 22_000, 'じゃあね'),
];

describe('studyCueAt', () => {
  it('is the active line while one is playing', () => {
    expect(studyCueAt(CUES, 2, 0)?.index).toBe(0);
    expect(studyCueAt(CUES, 6.5, 0)?.index).toBe(1);
  });

  it('holds the line just heard until the next one starts', () => {
    // 3.0 s is the exact end of line 0: activation is end-exclusive, so this is the gap.
    expect(studyCueAt(CUES, 3, 0)?.index).toBe(0);
    expect(studyCueAt(CUES, 4.9, 0)?.index).toBe(0);
    expect(studyCueAt(CUES, 5, 0)?.index).toBe(1);
  });

  it('hands over between back-to-back lines with no gap at all', () => {
    expect(studyCueAt(CUES, 6.999, 0)?.index).toBe(1);
    expect(studyCueAt(CUES, 7, 0)?.index).toBe(2);
  });

  it('is nothing before the first line, and nothing after a seek until a line plays', () => {
    expect(studyCueAt(CUES, 0.5, 0)).toBeNull();
    expect(studyCueAt(CUES, 4, 0, { linger: false })).toBeNull();
    // An active line is the study line whatever the linger flag says.
    expect(studyCueAt(CUES, 6, 0, { linger: false })?.index).toBe(1);
  });

  it('never lingers on a line with no readable text (an ASS drawing)', () => {
    // 15 s: line 3 (a drawing) ended last; the readable line before it is held instead.
    expect(studyCueAt(CUES, 15, 0)?.index).toBe(2);
  });

  it('applies the subtitle delay the same way activation does', () => {
    // +0.5 s delay: line 0 plays from 1.5 to 3.5 on the video clock.
    expect(studyCueAt(CUES, 3.2, 0.5)?.index).toBe(0);
    expect(studyCueAt(CUES, 1.2, 0.5)).toBeNull();
  });

  it('copes with an empty track and a non-finite clock', () => {
    expect(studyCueAt([], 3, 0)).toBeNull();
    expect(studyCueAt(CUES, Number.NaN, 0)).toBeNull();
  });
});

describe('cue timeline helpers', () => {
  it('finds the last started line by binary search', () => {
    expect(lastStartedCueIndex(CUES, 0)).toBe(-1);
    expect(lastStartedCueIndex(CUES, 5_000)).toBe(1);
    expect(lastStartedCueIndex(CUES, 99_000)).toBe(4);
  });

  it('ends a spoken stretch at an overlap, not at a back-to-back start', () => {
    expect(activeCueGroupEndSec(CUES, 6, 0)).toBe(7);
    const overlapping = [cue(0, 1_000, 5_000), cue(1, 4_000, 8_000), cue(2, 8_000, 9_000)];
    // Line 1 cuts into line 0, so the stretch runs to 8 s — and stops there, because
    // line 2 only starts as line 1 ends.
    expect(activeCueGroupEndSec(overlapping, 2, 0)).toBe(8);
    expect(activeCueGroupEndSec(CUES, 4, 0)).toBeNull();
  });

  it('knows when the next line starts', () => {
    expect(nextCueStartSec(CUES, 3.5, 0)).toBe(5);
    expect(nextCueStartSec(CUES, 21, 0)).toBeNull();
  });

  it('compares lines by content, not identity', () => {
    expect(sameStudyCue(cue(1, 5_000, 7_000, 'a'), cue(1, 5_000, 7_000, 'a'))).toBe(true);
    expect(sameStudyCue(cue(1, 5_000, 7_000, 'a'), cue(1, 5_000, 7_000, 'b'))).toBe(false);
    expect(sameStudyCue(null, null)).toBe(true);
    expect(sameStudyCue(null, cue(1, 0, 1))).toBe(false);
  });
});
