import { describe, expect, it } from 'vitest';
import {
  dismissVideoCoreTimingRepair,
  recordVideoCoreTimingAdjustment,
  shouldSuggestVideoCoreTimingRepair,
  VIDEO_CORE_TIMING_SAMPLE_LIMIT,
  VIDEO_CORE_TIMING_WINDOW_MS,
  videoCoreDriftDelaySec,
  videoCoreTimingDrift,
  type VideoCoreTimingSignal,
} from '../videoCoreStudy';

const START = 1_700_000_000_000;

/** Folds explicit ±0.1s activations into one signal, one second apart. */
function build(
  steps: Array<{ positionSec: number; delaySec: number; at?: number }>,
  trackNumber = 3,
): VideoCoreTimingSignal | null {
  return steps.reduce<VideoCoreTimingSignal | null>(
    (signal, step, index) => recordVideoCoreTimingAdjustment(
      signal,
      trackNumber,
      step.positionSec,
      step.delaySec,
      step.at ?? START + index * 1_000,
    ),
    null,
  );
}

/** A subtitle running 0.2s later every minute — the shape a fixed offset cannot hold. */
const driftingSteps = [
  { positionSec: 60, delaySec: 0.1 },
  { positionSec: 120, delaySec: 0.3 },
  { positionSec: 180, delaySec: 0.5 },
  { positionSec: 240, delaySec: 0.7 },
  { positionSec: 300, delaySec: 0.9 },
];

describe('videoCoreStudy timing repair', () => {
  it('records one explicit activation per call and keeps the samples in order', () => {
    const signal = build(driftingSteps);
    expect(signal?.changeCount).toBe(5);
    expect(signal?.trackNumber).toBe(3);
    expect(signal?.samples.map((sample) => sample.delaySec)).toEqual([0.1, 0.3, 0.5, 0.7, 0.9]);
    expect(signal?.firstChangeAt).toBe(START);
    expect(signal?.lastChangeAt).toBe(START + 4_000);
    expect(signal?.dismissed).toBe(false);
  });

  it('ignores an activation with no usable playback position or delay', () => {
    const signal = build(driftingSteps);
    const unusable = recordVideoCoreTimingAdjustment(signal, 3, Number.NaN, 1, START + 5_000);
    expect(unusable).toBe(signal);
    expect(recordVideoCoreTimingAdjustment(signal, 3, 360, Number.POSITIVE_INFINITY)).toBe(signal);
  });

  it('starts over when the user switches to a different subtitle track', () => {
    const signal = build(driftingSteps);
    const other = recordVideoCoreTimingAdjustment(signal, 4, 360, 1.1, START + 5_000);
    expect(other?.trackNumber).toBe(4);
    expect(other?.changeCount).toBe(1);
    expect(other?.samples).toHaveLength(1);
  });

  it('starts over once the evidence window has elapsed', () => {
    const signal = build(driftingSteps);
    const late = recordVideoCoreTimingAdjustment(
      signal,
      3,
      360,
      1.1,
      START + VIDEO_CORE_TIMING_WINDOW_MS + 1,
    );
    expect(late?.changeCount).toBe(1);
    expect(late?.firstChangeAt).toBe(START + VIDEO_CORE_TIMING_WINDOW_MS + 1);
  });

  it('keeps the sample list bounded while still counting every change', () => {
    const many = Array.from({ length: VIDEO_CORE_TIMING_SAMPLE_LIMIT + 4 }, (_, index) => ({
      positionSec: 60 + index * 60,
      delaySec: Math.round((0.1 + index * 0.2) * 1000) / 1000,
    }));
    const signal = build(many);
    expect(signal?.samples).toHaveLength(VIDEO_CORE_TIMING_SAMPLE_LIMIT);
    expect(signal?.changeCount).toBe(VIDEO_CORE_TIMING_SAMPLE_LIMIT + 4);
    // The oldest corrections fall away; the newest anchor is retained.
    expect(signal?.samples[signal.samples.length - 1].positionSec)
      .toBe(60 + (VIDEO_CORE_TIMING_SAMPLE_LIMIT + 3) * 60);
  });

  it('measures the drift rate, its anchor, span and net correction', () => {
    const drift = videoCoreTimingDrift(build(driftingSteps), START + 5_000);
    expect(drift).not.toBeNull();
    expect(drift?.msPerMinute).toBe(200);
    expect(drift?.anchorPositionSec).toBe(300);
    expect(drift?.anchorDelaySec).toBe(0.9);
    expect(drift?.spanSec).toBe(240);
    expect(drift?.sampleCount).toBe(5);
    expect(drift?.netDelaySec).toBe(0.8);
  });

  it('withholds drift below the explicit-change threshold', () => {
    expect(videoCoreTimingDrift(build(driftingSteps.slice(0, 3)), START + 3_000)).toBeNull();
  });

  it('withholds drift when the corrections describe one moment, not a span', () => {
    const clustered = [
      { positionSec: 100, delaySec: 0.1 },
      { positionSec: 110, delaySec: 0.3 },
      { positionSec: 130, delaySec: 0.5 },
      { positionSec: 150, delaySec: 0.7 },
    ];
    expect(videoCoreTimingDrift(build(clustered), START + 4_000)).toBeNull();
  });

  it('withholds drift when the user is converging on one constant offset', () => {
    const converging = [
      { positionSec: 60, delaySec: 0.3 },
      { positionSec: 140, delaySec: 0.5 },
      { positionSec: 220, delaySec: 0.4 },
      { positionSec: 300, delaySec: 0.5 },
    ];
    expect(videoCoreTimingDrift(build(converging), START + 4_000)).toBeNull();
  });

  it('withholds drift when playback was seeked backwards between corrections', () => {
    const seeked = [
      { positionSec: 60, delaySec: 0.1 },
      { positionSec: 300, delaySec: 0.3 },
      { positionSec: 120, delaySec: 0.5 },
      { positionSec: 400, delaySec: 0.7 },
    ];
    expect(videoCoreTimingDrift(build(seeked), START + 4_000)).toBeNull();
  });

  it('withholds drift a constant offset still explains', () => {
    // 0.3s over 20 minutes is 15 ms/min — one saved offset covers that.
    const slow = [
      { positionSec: 300, delaySec: 0.1 },
      { positionSec: 600, delaySec: 0.2 },
      { positionSec: 900, delaySec: 0.3 },
      { positionSec: 1_500, delaySec: 0.4 },
    ];
    expect(videoCoreTimingDrift(build(slow), START + 4_000)).toBeNull();
  });

  it('withholds drift when a correction sits off the measured line', () => {
    const wandering = [
      { positionSec: 60, delaySec: 0.1 },
      { positionSec: 120, delaySec: 0.9 },
      { positionSec: 180, delaySec: 1.0 },
      { positionSec: 300, delaySec: 0.9 },
      { positionSec: 360, delaySec: 1.1 },
    ];
    expect(videoCoreTimingDrift(build(wandering), START + 5_000)).toBeNull();
  });

  it('withholds drift once the evidence window has passed', () => {
    const signal = build(driftingSteps);
    expect(videoCoreTimingDrift(signal, START + VIDEO_CORE_TIMING_WINDOW_MS + 1)).toBeNull();
  });

  it('suggests the repair only for undismissed evidence that is not already tracked', () => {
    const signal = build(driftingSteps);
    const drift = videoCoreTimingDrift(signal, START + 5_000);
    expect(shouldSuggestVideoCoreTimingRepair(signal, drift, false)).toBe(true);
    expect(shouldSuggestVideoCoreTimingRepair(signal, drift, true)).toBe(false);
    expect(shouldSuggestVideoCoreTimingRepair(signal, null, false)).toBe(false);
    expect(shouldSuggestVideoCoreTimingRepair(null, drift, false)).toBe(false);
    expect(shouldSuggestVideoCoreTimingRepair(
      dismissVideoCoreTimingRepair(signal),
      drift,
      false,
    )).toBe(false);
  });

  it('dismissal keeps the evidence intact and survives a null signal', () => {
    const signal = build(driftingSteps);
    const dismissed = dismissVideoCoreTimingRepair(signal);
    expect(dismissed?.dismissed).toBe(true);
    expect(dismissed?.samples).toEqual(signal?.samples);
    expect(dismissVideoCoreTimingRepair(null)).toBeNull();
  });

  it('projects the compensating delay forward from the newest manual correction', () => {
    const drift = videoCoreTimingDrift(build(driftingSteps), START + 5_000);
    expect(drift).not.toBeNull();
    if (!drift) return;
    expect(videoCoreDriftDelaySec(drift, 300)).toBe(0.9);
    expect(videoCoreDriftDelaySec(drift, 360)).toBe(1.1);
    expect(videoCoreDriftDelaySec(drift, 600)).toBe(1.9);
    // Behind the anchor the same line applies in reverse.
    expect(videoCoreDriftDelaySec(drift, 240)).toBe(0.7);
  });

  it('never projects past the manual control range, or off a broken clock', () => {
    const drift = videoCoreTimingDrift(build(driftingSteps), START + 5_000);
    expect(drift).not.toBeNull();
    if (!drift) return;
    expect(videoCoreDriftDelaySec(drift, 100_000)).toBe(10);
    expect(videoCoreDriftDelaySec(drift, Number.NaN)).toBe(drift.anchorDelaySec);
  });
});
