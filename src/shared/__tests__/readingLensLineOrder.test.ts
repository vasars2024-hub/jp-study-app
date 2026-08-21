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

  it('preserves provider order when mixed-orientation blocks overlap', () => {
    // A horizontal sound effect painted across a vertical bubble: no rule here
    // can say which the eye takes first, so the provider keeps the call.
    const mixed = [
      line('horizontal-title', [10, 90, 180, 20]),
      line('vertical-dialogue', [140, 10, 20, 160], true),
    ];

    expect(ids(orderReadingLensLines(mixed))).toEqual(['horizontal-title', 'vertical-dialogue']);
  });

  it('keeps provider order over an overlap even when geometry would swap it', () => {
    // Drop the separability gate and this one flips: the page runs vertically,
    // the two blocks share a band, and the effect reaches further right. The
    // case above stays provider-ordered either way, so it cannot catch that.
    const overlapping = [
      line('bubble', [140, 10, 18, 150], true),
      line('effect', [120, 60, 90, 16]),
    ];

    expect(ids(orderReadingLensLines(overlapping))).toEqual(['bubble', 'effect']);
  });

  it('reads separable mixed blocks right-to-left when the page runs vertically', () => {
    const panel = [
      line('sound-effect', [10, 20, 60, 18]),
      line('bubble-left', [130, 20, 18, 150], true),
      line('bubble-right', [152, 20, 18, 150], true),
    ];

    // Vertical text outweighs the effect, so the bubbles come first, and within
    // the merged bubble block the right column leads.
    expect(ids(orderReadingLensLines(panel))).toEqual([
      'bubble-right',
      'bubble-left',
      'sound-effect',
    ]);
  });

  it('reads separable mixed blocks left-to-right when the page runs horizontally', () => {
    const page = [
      line('vertical-caption', [250, 20, 16, 40], true),
      line('paragraph', [10, 20, 200, 18]),
    ];

    expect(ids(orderReadingLensLines(page))).toEqual(['paragraph', 'vertical-caption']);
  });

  it('reads mixed blocks in separate bands top-to-bottom regardless of direction', () => {
    const page = [
      line('lower-effect', [10, 200, 60, 18]),
      line('upper-column', [200, 10, 18, 120], true),
    ];

    expect(ids(orderReadingLensLines(page))).toEqual(['upper-column', 'lower-effect']);
  });

  it('preserves provider order when mixed orientations run exactly the same length', () => {
    const tied = [
      line('horizontal', [10, 200, 100, 18]),
      line('vertical', [200, 10, 18, 100], true),
    ];

    expect(ids(orderReadingLensLines(tied))).toEqual(['horizontal', 'vertical']);
  });

  it('does not let one square glyph turn a vertical bubble into a panel problem', () => {
    // Both engines guess `vertical` from the box's aspect ratio, so a trailing
    // 。 on its own comes back square and may be flagged horizontal. Let it vote
    // and this bubble goes down the panel path, which bands the glyph below the
    // whole block and reads it after the LEFT column instead of after the right.
    const bubble = [
      line('col-left', [100, 10, 18, 150], true),
      line('col-right', [122, 10, 18, 150], true),
      line('tail-glyph', [122, 165, 18, 18]),
    ];

    expect(ids(orderReadingLensLines(bubble))).toEqual(['col-right', 'tail-glyph', 'col-left']);
  });

  it('preserves provider order when a tall block bands two stacked ones transitively', () => {
    // The exact boxes a live `web` capture of the mixed fixture returned. The
    // column spans both captions, so a single-band sort ordered them purely
    // across the page and the lower caption won by one pixel of x — the page
    // read bottom-line-first. Note the live capture did not itself change
    // behaviour: paddle already emitted these two captions bottom-first, so its
    // order and the buggy panel order agreed. The geometry is what is real.
    const captured = [
      line('upper-caption', [41, 103, 197, 32]),
      line('lower-caption', [40, 183, 163, 34]),
      line('column', [501, 58, 80, 225], true),
    ];

    expect(ids(orderReadingLensLines(captured))).toEqual([
      'upper-caption',
      'lower-caption',
      'column',
    ]);
  });

  it('preserves provider order when any geometry is unusable', () => {
    const invalid = [
      line('valid', [10, 30, 100, 20]),
      line('invalid', [10, Number.NaN, 100, 20]),
    ];

    expect(ids(orderReadingLensLines(invalid))).toEqual(['valid', 'invalid']);
  });
});
