import { describe, expect, it } from 'vitest';
import { ICON_PRESETS, getIconPreset, iconPresetPositions } from '../desktopIconPresets';

// A desktop roughly the size of the live app's, with `large` icon metrics.
const DESK = { boundW: 1264, boundH: 765, iconW: 108, iconH: 104, grid: 0 as const };

describe('ICON_PRESETS', () => {
  it('offers exactly the five configurations the audit item asks for', () => {
    expect(ICON_PRESETS).toHaveLength(5);
    expect(ICON_PRESETS.map((p) => p.id)).toEqual(['study', 'immersion', 'media', 'everything', 'minimal']);
  });

  it('never lists the same app twice inside one preset', () => {
    for (const p of ICON_PRESETS) {
      expect(new Set(p.sections).size, `${p.id} has a duplicate section`).toBe(p.sections.length);
    }
  });

  it('gives every preset a non-empty section list and a sane column count', () => {
    for (const p of ICON_PRESETS) {
      expect(p.sections.length, p.id).toBeGreaterThan(0);
      expect(p.columns, p.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('resolves by id and refuses anything else', () => {
    expect(getIconPreset('minimal')?.sections).toEqual(['dictionary', 'reading', 'settings']);
    expect(getIconPreset('nope')).toBeNull();
    expect(getIconPreset(undefined)).toBeNull();
    expect(getIconPreset(null)).toBeNull();
  });
});

describe('iconPresetPositions', () => {
  it('honours the preset column count rather than filling the full height first', () => {
    // The bug this pins: deriving rows from the available height alone put 7 of
    // 8 icons in column 0 and 1 in column 1, ignoring `columns: 2`.
    const pos = iconPresetPositions(8, { ...DESK, columns: 2 });
    expect(pos.map((p) => p.x)).toEqual([16, 16, 16, 16, 124, 124, 124, 124]);
    expect(pos.map((p) => p.y)).toEqual([16, 120, 224, 328, 16, 120, 224, 328]);
  });

  it('steps by the icon box, so the arrangement follows the icon-size setting', () => {
    const large = iconPresetPositions(2, { ...DESK, columns: 1 });
    const small = iconPresetPositions(2, { ...DESK, iconW: 76, iconH: 72, columns: 1 });
    expect(large[1].y - large[0].y).toBe(104);
    expect(small[1].y - small[0].y).toBe(72);
  });

  it('adds columns rather than place an icon below the desktop', () => {
    // One column was asked for, but only 7 rows fit in 765px at 104px tall.
    const pos = iconPresetPositions(21, { ...DESK, columns: 1 });
    expect(pos).toHaveLength(21);
    const maxY = Math.max(...pos.map((p) => p.y));
    expect(maxY + DESK.iconH).toBeLessThanOrEqual(DESK.boundH);
    expect(new Set(pos.map((p) => p.x)).size).toBe(3);
  });

  it('places every icon at a distinct point', () => {
    for (const p of ICON_PRESETS) {
      const pos = iconPresetPositions(p.sections.length, { ...DESK, columns: p.columns });
      const seen = new Set(pos.map((q) => `${q.x},${q.y}`));
      expect(seen.size, `${p.id} overlaps`).toBe(p.sections.length);
    }
  });

  it('snaps to the grid when one is set', () => {
    const pos = iconPresetPositions(4, { ...DESK, grid: 24, columns: 2 });
    for (const p of pos) {
      expect(p.x % 24, `x ${p.x} off grid`).toBe(0);
      expect(p.y % 24, `y ${p.y} off grid`).toBe(0);
    }
  });

  it('keeps every icon inside the bounds even on a tiny desktop', () => {
    const pos = iconPresetPositions(21, { boundW: 300, boundH: 200, iconW: 108, iconH: 104, grid: 0, columns: 3 });
    expect(pos).toHaveLength(21);
    for (const p of pos) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + 108).toBeLessThanOrEqual(300);
      expect(p.y + 104).toBeLessThanOrEqual(200);
    }
  });

  it('returns nothing for an empty desktop', () => {
    expect(iconPresetPositions(0, { ...DESK, columns: 2 })).toEqual([]);
  });
});
