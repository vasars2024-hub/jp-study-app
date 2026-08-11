import { describe, expect, it } from 'vitest';
import { orderReadingLensLines, type ReadingLensPositionedLine } from '../readingLensLineOrder';

interface TestLine extends ReadingLensPositionedLine {
  id: string;
}

const line = (
  id: string,
  box: [number, number, number, number],
  vertical = false,
): TestLine => ({ id, box, vertical });

const ids = (lines: readonly TestLine[]): string[] => lines.map((item) => item.id);

describe('Reading Lens line order', () => {
  it('orders horizontal rows top-to-bottom', () => {
    const ordered = orderReadingLensLines([
      line('third', [10, 80, 120, 20]),
      line('first', [10, 10, 120, 20]),
      line('second', [10, 45, 120, 20]),
    ]);

    expect(ids(ordered)).toEqual(['first', 'second', 'third']);
  });

  it('orders fragments in one horizontal row left-to-right despite small baseline skew', () => {
    const ordered = orderReadingLensLines([
      line('right', [110, 23, 80, 20]),
      line('next-row', [10, 58, 180, 20]),
      line('left', [10, 20, 80, 20]),
    ]);

    expect(ids(ordered)).toEqual(['left', 'right', 'next-row']);
  });

  it('orders vertical columns right-to-left', () => {
    const ordered = orderReadingLensLines([
      line('left-column', [30, 10, 20, 180], true),
      line('right-column', [100, 10, 20, 180], true),
      line('middle-column', [65, 10, 20, 180], true),
    ]);

    expect(ids(ordered)).toEqual(['right-column', 'middle-column', 'left-column']);
  });

  it('orders fragments in one vertical column top-to-bottom', () => {
    const ordered = orderReadingLensLines([
      line('bottom', [98, 110, 20, 80], true),
      line('left-column', [50, 10, 20, 180], true),
      line('top', [100, 10, 20, 80], true),
    ]);

    expect(ids(ordered)).toEqual(['top', 'bottom', 'left-column']);
  });

  it('preserves provider order for mixed-orientation layouts', () => {
    const mixed = [
      line('horizontal-title', [10, 90, 180, 20]),
      line('vertical-dialogue', [140, 10, 20, 160], true),
    ];

    expect(ids(orderReadingLensLines(mixed))).toEqual(['horizontal-title', 'vertical-dialogue']);
  });

  it('preserves provider order when any geometry is unusable', () => {
    const invalid = [
      line('valid', [10, 30, 100, 20]),
      line('invalid', [10, Number.NaN, 100, 20]),
    ];

    expect(ids(orderReadingLensLines(invalid))).toEqual(['valid', 'invalid']);
  });
});
