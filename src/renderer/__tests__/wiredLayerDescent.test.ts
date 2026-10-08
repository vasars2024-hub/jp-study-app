// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  computeSignalDepth,
  isUnlocked,
  LAYER_COUNT,
  LAYER_THRESHOLDS,
  LAYER_UNLOCKS,
  layerForDepth,
  layerProgress,
  nextLayerThreshold,
  normalizeLayerRecord,
  reconcileLayer,
  formatLayer,
  wallpaperDepth,
  type SignalInputs,
} from '../wiredMechanics/layer';
import { normalizeWiredMechanicsSettings, WIRED_MECH_DEFAULTS } from '../wiredMechanics/settings';

const ZERO: SignalInputs = { known: 0, familiar: 0, passedReviews: 0, daysActive: 0, streak: 0 };

describe('signal depth formula', () => {
  it('is zero for no progress and ignores garbage input', () => {
    expect(computeSignalDepth(ZERO)).toBe(0);
    expect(computeSignalDepth({ known: -5, familiar: NaN, passedReviews: Infinity, daysActive: -1, streak: 0 })).toBe(0);
  });

  it('weights each term as documented', () => {
    expect(computeSignalDepth({ ...ZERO, known: 100 })).toBe(100);
    expect(computeSignalDepth({ ...ZERO, familiar: 101 })).toBe(50);
    expect(computeSignalDepth({ ...ZERO, passedReviews: 41 })).toBe(10);
    expect(computeSignalDepth({ ...ZERO, daysActive: 3 })).toBe(15);
    expect(computeSignalDepth({ ...ZERO, streak: 4 })).toBe(8);
  });

  it('caps the word and streak terms', () => {
    expect(computeSignalDepth({ ...ZERO, known: 41_535 })).toBe(2500);
    expect(computeSignalDepth({ ...ZERO, familiar: 9_999 })).toBe(500);
    expect(computeSignalDepth({ ...ZERO, streak: 400 })).toBe(60);
  });

  it('is monotonic: raising any input never lowers depth', () => {
    const keys: Array<keyof SignalInputs> = ['known', 'familiar', 'passedReviews', 'daysActive', 'streak'];
    const base: SignalInputs = { known: 300, familiar: 120, passedReviews: 900, daysActive: 40, streak: 6 };
    for (const key of keys) {
      let prev = computeSignalDepth(base);
      for (let step = 1; step <= 50; step++) {
        const next = computeSignalDepth({ ...base, [key]: base[key] + step * 37 });
        expect(next).toBeGreaterThanOrEqual(prev);
        prev = next;
      }
    }
  });
});

describe('layer mapping', () => {
  it('has 13 strictly increasing thresholds starting at 0', () => {
    expect(LAYER_THRESHOLDS).toHaveLength(LAYER_COUNT);
    expect(LAYER_THRESHOLDS[0]).toBe(0);
    for (let i = 1; i < LAYER_THRESHOLDS.length; i++) expect(LAYER_THRESHOLDS[i]).toBeGreaterThan(LAYER_THRESHOLDS[i - 1]);
  });

  it('maps depth to layers at the exact thresholds', () => {
    expect(layerForDepth(0)).toBe(1);
    expect(layerForDepth(29)).toBe(1);
    expect(layerForDepth(30)).toBe(2);
    expect(layerForDepth(4999)).toBe(12);
    expect(layerForDepth(5000)).toBe(13);
    expect(layerForDepth(1e9)).toBe(13);
  });

  it('reports the next threshold and progress', () => {
    expect(nextLayerThreshold(1)).toBe(30);
    expect(nextLayerThreshold(13)).toBeNull();
    expect(layerProgress(15, 1)).toBeCloseTo(0.5);
    expect(layerProgress(99999, 13)).toBe(1);
    expect(formatLayer(7)).toBe('LAYER:07');
    expect(formatLayer(99)).toBe('LAYER:13');
  });
});

describe('never regress', () => {
  it('first reconcile is a silent calibration at the computed layer', () => {
    const r = reconcileLayer(null, 700, 1000);
    expect(r.calibrated).toBe(true);
    expect(r.crossed).toEqual([]);
    expect(r.record).toEqual({ maxLayer: 7, maxDepth: 700, calibratedAt: 1000 });
  });

  it('a lower depth (streak lost, store wiped) keeps the deepest layer', () => {
    const stored = { maxLayer: 9, maxDepth: 1500, calibratedAt: 1 };
    const r = reconcileLayer(stored, 0, 2);
    expect(r.record.maxLayer).toBe(9);
    expect(r.record.maxDepth).toBe(1500);
    expect(r.crossed).toEqual([]);
    expect(r.calibrated).toBe(false);
  });

  it('descending lists every layer crossed, in order', () => {
    const stored = { maxLayer: 3, maxDepth: 90, calibratedAt: 1 };
    const r = reconcileLayer(stored, 460, 2);
    expect(r.record.maxLayer).toBe(6);
    expect(r.crossed).toEqual([4, 5, 6]);
  });

  it('normalizes stored records and rejects junk', () => {
    expect(normalizeLayerRecord(null)).toBeNull();
    expect(normalizeLayerRecord({ maxLayer: 'x' })).toBeNull();
    expect(normalizeLayerRecord({ maxLayer: 40, maxDepth: -3 })).toEqual({ maxLayer: 13, maxDepth: 0, calibratedAt: 0 });
  });
});

describe('unlocks', () => {
  it('every layer from 2 to 13 opens exactly one real thing', () => {
    for (let l = 2; l <= LAYER_COUNT; l++) expect(LAYER_UNLOCKS.filter((u) => u.layer === l)).toHaveLength(1);
  });

  it('gates commands, channels, cursor and wallpaper depth by layer', () => {
    expect(isUnlocked(1, 'command', 'trace')).toBe(false);
    expect(isUnlocked(2, 'command', 'trace')).toBe(true);
    expect(isUnlocked(4, 'channel', 'reverse')).toBe(false);
    expect(isUnlocked(5, 'channel', 'reverse')).toBe(true);
    expect(isUnlocked(8, 'cursor', 'reticle')).toBe(true);
    expect(isUnlocked(1, 'command', 'lookup')).toBe(true);
    expect(wallpaperDepth(1)).toBe(0);
    expect(wallpaperDepth(3)).toBe(1);
    expect(wallpaperDepth(9)).toBe(3);
    expect(wallpaperDepth(13)).toBe(4);
  });
});

describe('mechanics settings', () => {
  it('defaults on with a 30-minute intercept limit', () => {
    expect(normalizeWiredMechanicsSettings(undefined)).toEqual(WIRED_MECH_DEFAULTS);
    expect(WIRED_MECH_DEFAULTS.interceptIntervalMin).toBe(30);
  });

  it('keeps explicit offs and rejects unknown intervals / cursors', () => {
    const s = normalizeWiredMechanicsSettings({ intercepts: false, interceptIntervalMin: 7, cursor: 'laser' });
    expect(s.intercepts).toBe(false);
    expect(s.interceptIntervalMin).toBe(30);
    expect(s.cursor).toBe('navi');
    expect(normalizeWiredMechanicsSettings({ interceptIntervalMin: 120 }).interceptIntervalMin).toBe(120);
  });
});
