import { describe, expect, it } from 'vitest';
import { sortReadingOrder } from '../readingOrder';
import type { MokuroBox } from '../mokuroTypes';

function box(id: string, b: MokuroBox) {
  return { id, box: b };
}

describe('sortReadingOrder', () => {
  it('returns single/empty input unchanged', () => {
    expect(sortReadingOrder([])).toEqual([]);
    const one = [box('a', [0, 0, 10, 10])];
    expect(sortReadingOrder(one)).toEqual(one);
  });

  it('orders a single tier right-to-left', () => {
    const regions = [
      box('left', [0, 0, 100, 100]),
      box('right', [200, 0, 300, 100]),
      box('mid', [100, 0, 200, 100]),
    ];
    const out = sortReadingOrder(regions).map((r) => r.id);
    expect(out).toEqual(['right', 'mid', 'left']);
  });

  it('orders multiple tiers top-to-bottom, each tier right-to-left', () => {
    const regions = [
      // Bottom tier (y ~400-500)
      box('bottom-left', [0, 400, 150, 500]),
      box('bottom-right', [200, 400, 350, 500]),
      // Top tier (y ~0-100)
      box('top-right', [200, 0, 350, 100]),
      box('top-left', [0, 0, 150, 100]),
    ];
    const out = sortReadingOrder(regions).map((r) => r.id);
    expect(out).toEqual(['top-right', 'top-left', 'bottom-right', 'bottom-left']);
  });

  it('does not let one tall region merge two independent tiers into a false zigzag', () => {
    // A tall left-column region spanning both visual rows should not force
    // the short right-side regions on either row into its own tier.
    const regions = [
      box('tall-left', [0, 0, 100, 500]),
      box('top-right', [200, 0, 300, 100]),
      box('bottom-right', [200, 400, 300, 500]),
    ];
    const out = sortReadingOrder(regions);
    // tall-left starts the sequence (earliest ymin); whichever tier it binds to,
    // the two right-side regions must still be internally top-then-bottom.
    const topIdx = out.findIndex((r) => r.id === 'top-right');
    const bottomIdx = out.findIndex((r) => r.id === 'bottom-right');
    expect(topIdx).toBeLessThan(bottomIdx);
  });

  it('is a pure function (does not mutate input array)', () => {
    const regions = [box('a', [0, 0, 10, 10]), box('b', [20, 0, 30, 10])];
    const copy = regions.slice();
    sortReadingOrder(regions);
    expect(regions).toEqual(copy);
  });
});
