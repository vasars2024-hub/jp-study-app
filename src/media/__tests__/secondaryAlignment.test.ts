import { describe, expect, it } from 'vitest';
import { alignedSecondaryCues } from '../secondaryAlignment';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

const cue = (index: number, startMs: number, endMs: number, text: string, trackNumber = 2): VideoCoreStudyCue => ({
  index,
  trackNumber,
  text,
  startMs,
  endMs,
});

const ja = (startMs: number, endMs: number): VideoCoreStudyCue => cue(0, startMs, endMs, '日本語', 1);

describe('alignedSecondaryCues — the translation of THIS line', () => {
  const english = [
    cue(0, 9_800, 12_100, 'Where are you going?'),
    cue(1, 12_300, 15_000, 'To the station.'),
    cue(2, 15_200, 17_000, 'Wait for me!'),
  ];

  it('picks the cue that matches the line even when the edges differ', () => {
    expect(alignedSecondaryCues(ja(10_000, 12_000), english).map((c) => c.text)).toEqual(['Where are you going?']);
  });

  it('does not hand the next line\'s translation to a line it only grazes', () => {
    // The Japanese line overlaps the next English cue by 200 ms; that cue is not its translation.
    expect(alignedSecondaryCues(ja(10_000, 12_500), english).map((c) => c.text)).toEqual(['Where are you going?']);
  });

  it('joins two translation cues that split one line', () => {
    expect(alignedSecondaryCues(ja(12_200, 17_100), english).map((c) => c.text)).toEqual(['To the station.', 'Wait for me!']);
  });

  it('gives each of two lines the translation cue that spans both', () => {
    const spanning = [cue(0, 20_000, 26_000, 'One long English line.')];
    expect(alignedSecondaryCues(ja(20_100, 22_900), spanning)).toHaveLength(1);
    expect(alignedSecondaryCues(ja(23_100, 25_800), spanning)).toHaveLength(1);
  });

  it('falls back to the best overlap, and to nothing when nothing overlaps', () => {
    const offset = [cue(0, 11_500, 20_000, 'Long and late')];
    expect(alignedSecondaryCues(ja(10_000, 12_000), offset).map((c) => c.text)).toEqual(['Long and late']);
    expect(alignedSecondaryCues(ja(30_000, 31_000), english)).toEqual([]);
    expect(alignedSecondaryCues(null, english)).toEqual([]);
  });
});
