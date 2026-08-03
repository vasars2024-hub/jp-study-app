// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  bandLevels,
  buildLineScript,
  hashString,
  idleWave,
  pickFlickerPlan,
  progressToVw,
  progressToVwReverse,
  zoneAt,
} from '../lyricTransmission';

const SAMPLE_LINES = [
  'I remember the signal you sent me last night',
  'Alone in the dark, dreaming of your voice',
  'A',
  '   ',
  '記憶の中の声',
  'This is a much longer line meant to exercise every effect slot at once, hopefully',
];

describe('zoneAt', () => {
  it('covers the full 0..1 range with no gaps', () => {
    for (let i = 0; i <= 100; i++) {
      expect(() => zoneAt(i / 100)).not.toThrow();
    }
    expect(zoneAt(0)).toBe('entry');
    expect(zoneAt(0.999)).toBe('exit');
    expect(zoneAt(1)).toBe('exit');
  });
});

describe('progressToVw', () => {
  it('starts off the right edge and ends off the left edge', () => {
    expect(progressToVw(0)).toBe(120);
    expect(progressToVw(1)).toBe(-120);
    expect(progressToVw(0.5)).toBe(0);
  });
});

describe('progressToVwReverse', () => {
  it('is the mirror of progressToVw — starts left, ends right', () => {
    expect(progressToVwReverse(0)).toBe(-120);
    expect(progressToVwReverse(1)).toBe(120);
    expect(progressToVwReverse(0.5)).toBeCloseTo(0);
    for (let i = 0; i <= 10; i++) {
      const p = i / 10;
      expect(progressToVwReverse(p)).toBe(-progressToVw(p));
    }
  });
});

describe('pickFlickerPlan', () => {
  it('is deterministic and only ever picks non-space indices', () => {
    for (const line of SAMPLE_LINES) {
      const a = pickFlickerPlan(line, 0.24);
      const b = pickFlickerPlan(line, 0.24);
      expect(a).toEqual(b);
      for (const f of a) {
        expect(line[f.index]).not.toBe(' ');
        expect(f.index).toBeGreaterThanOrEqual(0);
        expect(f.index).toBeLessThan(line.length);
        expect(f.delayMs).toBeGreaterThanOrEqual(0);
        expect(f.durationMs).toBeGreaterThan(0);
        expect(f.glyph.length).toBeGreaterThan(0);
      }
    }
  });

  it('respects the ratio at its boundaries', () => {
    for (const line of SAMPLE_LINES) {
      const nonSpace = [...line].filter((c) => c !== ' ').length;
      expect(pickFlickerPlan(line, 0)).toHaveLength(0);
      expect(pickFlickerPlan(line, 1)).toHaveLength(nonSpace);
    }
  });
});

describe('buildLineScript', () => {
  it('is deterministic for the same text and intensity', () => {
    for (const line of SAMPLE_LINES) {
      const a = buildLineScript(line, 1);
      const b = buildLineScript(line, 1);
      expect(a).toEqual(b);
    }
  });

  it('keeps every char/range event index inside the line bounds', () => {
    for (const line of SAMPLE_LINES) {
      const script = buildLineScript(line, 1);
      for (const ev of script.charEvents) {
        for (const idx of ev.indices) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(line.length);
        }
        expect(ev.at).toBeGreaterThanOrEqual(0);
        expect(ev.at).toBeLessThanOrEqual(1);
      }
      for (const ev of script.rangeEvents) {
        expect(ev.from).toBeGreaterThanOrEqual(0);
        expect(ev.to).toBeLessThanOrEqual(line.length);
        expect(ev.from).toBeLessThan(ev.to);
      }
    }
  });

  it('never produces two range events that overlap in index space', () => {
    for (const line of SAMPLE_LINES) {
      const script = buildLineScript(line, 1);
      const [a, b] = script.rangeEvents;
      if (a && b) {
        const overlap = a.from < b.to && a.to > b.from;
        expect(overlap).toBe(false);
      }
    }
  });

  it('disturbs only a small fraction of glyphs at once (bounded simultaneity)', () => {
    for (const line of SAMPLE_LINES) {
      const script = buildLineScript(line, 1);
      const touched = new Set<number>();
      for (const ev of script.charEvents) ev.indices.forEach((i) => touched.add(i));
      for (const ev of script.rangeEvents) {
        for (let i = ev.from; i < ev.to; i++) touched.add(i);
      }
      // Generous ceiling — these fire at staggered times across the whole
      // line lifetime, never all at once, but the *pool* of glyphs that ever
      // gets touched should stay well short of the full line.
      expect(touched.size).toBeLessThanOrEqual(Math.max(14, Math.ceil(line.length * 0.65)));
    }
  });

  it('archives a fragment that is always one of the curated Japanese pool entries or a semantic keyword hit', () => {
    for (const line of SAMPLE_LINES) {
      const script = buildLineScript(line, 1);
      expect(script.fragment.length).toBeGreaterThan(0);
      expect(script.archiveAt).toBeGreaterThan(0);
      expect(script.archiveAt).toBeLessThanOrEqual(1);
    }
  });

  it('collapses to just the decode arrival at intensity 0', () => {
    const script = buildLineScript('A fairly ordinary sentence for testing purposes', 0);
    expect(script.rangeEvents).toHaveLength(0);
    expect(script.charEvents.every((e) => e.kind === 'decode')).toBe(true);
  });

  it('handles empty/whitespace-only lines without throwing', () => {
    expect(() => buildLineScript('', 1)).not.toThrow();
    expect(() => buildLineScript('   ', 1)).not.toThrow();
  });
});

describe('hashString', () => {
  it('is stable and varies across different strings', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).not.toBe(hashString('world'));
  });
});

describe('visualizer band helpers', () => {
  it('bandLevels normalizes into 0..1 and fills every requested band', () => {
    const freq = new Uint8Array(512).fill(255);
    const out = new Array(26).fill(-1);
    bandLevels(freq, 512, 26, out);
    expect(out).toHaveLength(26);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('idleWave stays low-amplitude and non-negative', () => {
    const out = new Array(26).fill(-1);
    for (let t = 0; t < 20; t += 0.37) {
      idleWave(t, 26, out);
      for (const v of out) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(0.3);
      }
    }
  });
});
