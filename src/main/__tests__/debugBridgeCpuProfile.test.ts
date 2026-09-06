import { describe, expect, it } from 'vitest';
import { summarizeCpuProfile } from '../debugBridge';

/**
 * `/cpu-profile`'s reduction, tested where the mistakes actually are.
 *
 * The route itself needs a live renderer and CDP, so it is not testable here. The fold from
 * a CDP `Profiler.Profile` to "which function held the CPU" is pure, and it is the half that
 * silently returns a plausible WRONG answer: V8's `samples` array holds node IDs, and every
 * naive reduction treats them as indices into `nodes`. The fixtures below are built so that
 * an index-based reduction produces a different, confident, wrong function name.
 */

/** Ids deliberately NOT equal to their array index, and not in ascending order. */
const PROFILE = {
  startTime: 1_000_000,
  endTime: 1_120_000,
  nodes: [
    { id: 7, callFrame: { functionName: '(root)', url: '', lineNumber: -1 } },
    { id: 3, callFrame: { functionName: 'filterSites', url: 'http://x/Immersion.tsx', lineNumber: 148 } },
    { id: 9, callFrame: { functionName: 'commitRoot', url: 'http://x/react-dom.js', lineNumber: 26000 } },
    { id: 1, callFrame: { functionName: '(garbage collector)', url: '', lineNumber: -1 } },
  ],
  //            root  filter  commit  commit  gc     commit
  samples: [7, 3, 9, 9, 1, 9],
  // microseconds BEFORE the sample at the same index
  timeDeltas: [1_000, 2_000, 30_000, 30_000, 7_000, 30_000],
};

describe('summarizeCpuProfile', () => {
  it('attributes self time by node ID, not by array position', () => {
    const out = summarizeCpuProfile(PROFILE);
    const top = out.frames[0];
    expect(top.fn).toBe('commitRoot');
    expect(top.selfMs).toBe(90);
    // Index-based reduction would have read nodes[9] (undefined) or nodes[3] ('(garbage
    // collector)') for the busiest sample. Naming the runner-up proves the map, not the sort.
    expect(out.frames.map((f) => f.fn)).toEqual([
      'commitRoot',
      '(garbage collector)',
      'filterSites',
      '(root)',
    ]);
  });

  it('pairs each timeDelta with the sample at the same index', () => {
    const out = summarizeCpuProfile(PROFILE);
    const byFn = Object.fromEntries(out.frames.map((f) => [f.fn, f]));
    expect(byFn.filterSites.selfMs).toBe(2);
    expect(byFn['(garbage collector)'].selfMs).toBe(7);
    expect(byFn['(root)'].selfMs).toBe(1);
    expect(out.totalSamples).toBe(6);
  });

  it('reports percentages against the profiled total, and the wall clock from start/end', () => {
    const out = summarizeCpuProfile(PROFILE);
    // 90 of 100 ms of SAMPLED time.
    expect(out.frames[0].selfPct).toBe(90);
    // 120 ms of wall clock — deliberately larger than the sampled 100 ms, because a profile
    // that spent 20 ms outside any sample is exactly the case where the two must not be conflated.
    expect(out.durationMs).toBe(120);
  });

  it('keeps synthetic frames rather than filtering them away', () => {
    // "(garbage collector) 60%" is the finding, not noise to be hidden. A reduction that drops
    // frames with no url reports a surface as fast and leaves the cost unnamed.
    const out = summarizeCpuProfile(PROFILE);
    expect(out.frames.some((f) => f.fn === '(garbage collector)')).toBe(true);
    expect(out.frames.some((f) => f.fn === '(root)')).toBe(true);
  });

  it('honours `top` and returns the BUSIEST rows, not the first ones', () => {
    const out = summarizeCpuProfile(PROFILE, 2);
    expect(out.frames).toHaveLength(2);
    expect(out.frames.map((f) => f.fn)).toEqual(['commitRoot', '(garbage collector)']);
  });

  it('survives an idle profile - the route\'s own negative control', () => {
    // Profiling a window that does nothing must return an empty, honest result rather than
    // dividing by zero and reporting NaN% against a fabricated frame.
    const out = summarizeCpuProfile({ nodes: [{ id: 1, callFrame: { functionName: '(program)' } }], samples: [], timeDeltas: [], startTime: 0, endTime: 5_000 });
    expect(out.frames).toEqual([]);
    expect(out.totalSamples).toBe(0);
    expect(out.durationMs).toBe(5);
  });

  it('does not invent a frame for a sample whose node is missing', () => {
    const out = summarizeCpuProfile({
      nodes: [{ id: 2, callFrame: { functionName: 'known', url: 'u', lineNumber: 0 } }],
      samples: [2, 99],
      timeDeltas: [1_000, 5_000],
    });
    const orphan = out.frames.find((f) => f.fn === '(anonymous)');
    expect(orphan).toBeDefined();
    expect(orphan?.selfMs).toBe(5);
    expect(orphan?.url).toBe('');
    // The orphan is REPORTED, not dropped: 5 of the 6 ms belong to it, and a reduction that
    // silently discards it would say `known` held 100% of a profile it held 17% of.
    expect(out.frames.find((f) => f.fn === 'known')?.selfPct).toBeCloseTo(16.7, 0);
  });
});
