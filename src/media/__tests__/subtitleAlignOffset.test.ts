import { describe, expect, it } from 'vitest';
import { delayToAlignLine } from '../subtitleAlignOffset';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

const cue = (index: number, startMs: number, endMs: number, text = `line ${index}`): VideoCoreStudyCue => ({
  index,
  trackNumber: 1,
  text,
  startMs,
  endMs,
});

const track = [cue(0, 10_000, 12_000), cue(1, 14_000, 16_000), cue(2, 20_000, 22_000)];

describe('delayToAlignLine — "this line starts now"', () => {
  it('pulls the next line to now when the subtitles are late', () => {
    // At 12.5 s the second line is being spoken, but its subtitle is due at 14 s.
    expect(delayToAlignLine(track, 12.5, 0, 'next')).toBe(-1.5);
  });

  it('respects the delay already in force', () => {
    // With +1 s already applied, the next line is shown at 15 s; pulling it to 13 s means a delay of -1 s.
    expect(delayToAlignLine(track, 13, 1, 'next')).toBe(-1);
  });

  it('pushes the previous line to now when the subtitles are early', () => {
    // At 15 s line 1 is on screen, but the voice is still saying line 0.
    expect(delayToAlignLine(track, 15, 0, 'previous')).toBe(5);
  });

  it('in a gap, "previous" is the line just shown', () => {
    expect(delayToAlignLine(track, 17, 0, 'previous')).toBe(3);
  });

  it('skips signs and empty events, and answers null when there is no such line', () => {
    const withSign = [cue(5, 13_000, 13_500, '{\\pos(1,1)}看板'), ...track];
    expect(delayToAlignLine(withSign, 12.5, 0, 'next')).toBe(-1.5);
    expect(delayToAlignLine(track, 30, 0, 'next')).toBeNull();
    expect(delayToAlignLine(track, 5, 0, 'previous')).toBeNull();
    expect(delayToAlignLine([], 5, 0, 'next')).toBeNull();
  });

  it('stays inside the manual control\'s ±10 s', () => {
    expect(delayToAlignLine(track, 100, 0, 'previous')).toBe(10);
  });
});
