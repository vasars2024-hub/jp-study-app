import { describe, expect, it } from 'vitest';
import {
  READING_CANVAS_POLICY,
  readingCanvasReflows,
  readingCanvasViolations,
  resolveReadingCanvas,
  type ReadingToolSpec,
} from '../liquidReadingCanvas';

/** The size the reader's own `.settings-panel` actually is today. */
const SETTINGS: ReadingToolSpec = { id: 'settings', minWidth: 264, preferredWidth: 264 };
const BOOKMARKS: ReadingToolSpec = { id: 'bookmarks', minWidth: 240, preferredWidth: 300 };
const NARROW: ReadingToolSpec = { id: 'narrow', minWidth: 96, preferredWidth: 96 };

describe('resolveReadingCanvas', () => {
  it('gives the whole canvas to the document when no tool is open', () => {
    const layout = resolveReadingCanvas(1200, []);
    expect(layout.contentWidth).toBe(1200);
    expect(layout.documentCovered).toBe(false);
    expect(layout.tools).toEqual([]);
    expect(readingCanvasViolations(layout, 1200)).toEqual([]);
  });

  it('docks a tool when the document keeps its minimum', () => {
    const layout = resolveReadingCanvas(1200, [SETTINGS]);
    expect(layout.tools).toEqual([{ id: 'settings', placement: 'docked', width: 264, side: 'trailing' }]);
    expect(layout.contentWidth).toBe(1200 - 264 - READING_CANVAS_POLICY.gutter);
    expect(layout.documentCovered).toBe(false);
    expect(readingCanvasViolations(layout, 1200)).toEqual([]);
  });

  it('turns the same tool into a full-canvas sheet when the document cannot keep its minimum', () => {
    // 640 - 12 gutter - 384 floor = 244, under the tool's 264 minimum.
    const layout = resolveReadingCanvas(640, [SETTINGS]);
    expect(layout.tools).toEqual([{ id: 'settings', placement: 'sheet', width: 640, side: 'trailing' }]);
    expect(layout.contentWidth).toBe(640);
    expect(layout.activeSheetId).toBe('settings');
    expect(layout.documentCovered).toBe(true);
    expect(readingCanvasViolations(layout, 640)).toEqual([]);
  });

  it('never partially covers: every tool is docked beside the document or spans it entirely', () => {
    const widths = [320, 420, 520, 640, 720, 820, 1024, 1280, 1600, 2560];
    const combos: ReadingToolSpec[][] = [
      [SETTINGS],
      [BOOKMARKS],
      [SETTINGS, BOOKMARKS],
      [BOOKMARKS, SETTINGS, NARROW],
    ];
    for (const width of widths) {
      for (const combo of combos) {
        const layout = resolveReadingCanvas(width, combo);
        for (const tool of layout.tools) {
          expect(['docked', 'sheet']).toContain(tool.placement);
          if (tool.placement === 'sheet') expect(tool.width).toBe(layout.contentWidth);
        }
        const expected = width >= READING_CANVAS_POLICY.minContentWidth ? [] : ['viewport-below-minimum'];
        expect({ width, ids: combo.map((c) => c.id), v: readingCanvasViolations(layout, width) })
          .toEqual({ width, ids: combo.map((c) => c.id), v: expected });
      }
    }
  });

  it('keeps the first-opened tool docked when a second one no longer fits', () => {
    // 900: settings docks and leaves 624; bookmarks then needs 240 of the 228 remaining.
    const layout = resolveReadingCanvas(900, [SETTINGS, BOOKMARKS]);
    expect(layout.tools[0]).toEqual({ id: 'settings', placement: 'docked', width: 264, side: 'trailing' });
    expect(layout.tools[1].placement).toBe('sheet');
    expect(layout.activeSheetId).toBe('bookmarks');
  });

  it('lets a narrow tool dock after a wider one became a sheet, and the sheet still spans the canvas', () => {
    const layout = resolveReadingCanvas(640, [SETTINGS, NARROW]);
    expect(layout.tools[0].placement).toBe('sheet');
    expect(layout.tools[1]).toEqual({ id: 'narrow', placement: 'docked', width: 96, side: 'trailing' });
    // The sheet's width was recomputed after the dock, not left at the pre-dock canvas.
    expect(layout.tools[0].width).toBe(layout.contentWidth);
    expect(layout.tools[0].width).toBe(640 - 96 - READING_CANVAS_POLICY.gutter);
    expect(readingCanvasViolations(layout, 640)).toEqual([]);
  });

  it('shrinks a tool to its minimum rather than taking the document below the floor', () => {
    // 660: room = 660 - 12 - 384 = 264 exactly, so bookmarks docks at 264, not its preferred 300.
    const layout = resolveReadingCanvas(660, [BOOKMARKS]);
    expect(layout.tools[0]).toEqual({ id: 'bookmarks', placement: 'docked', width: 264, side: 'trailing' });
    expect(layout.contentWidth).toBe(READING_CANVAS_POLICY.minContentWidth);
    expect(readingCanvasViolations(layout, 660)).toEqual([]);
  });
});

describe('the measure clamp — the Gate\'s "legible and stable" half', () => {
  it('stops widening the column past the maximum however wide the canvas gets', () => {
    for (const width of [800, 1280, 1920, 3440]) {
      const layout = resolveReadingCanvas(width, []);
      expect(layout.measureWidth).toBe(READING_CANVAS_POLICY.maxContentWidth);
    }
  });

  it('does not reflow the reader when a tool docks into slack margin', () => {
    const before = resolveReadingCanvas(1600, []);
    const after = resolveReadingCanvas(1600, [SETTINGS]);
    expect(readingCanvasReflows(before, after)).toBe(false);
    expect(after.measureWidth).toBe(before.measureWidth);
  });

  it('does reflow when the canvas has no slack, and says so rather than hiding it', () => {
    const before = resolveReadingCanvas(900, []);
    const after = resolveReadingCanvas(900, [SETTINGS]);
    expect(after.contentWidth).toBe(624);
    expect(readingCanvasReflows(before, after)).toBe(true);
  });

  it('does not reflow when the tool becomes a sheet — dismissing it restores the same lines', () => {
    const before = resolveReadingCanvas(640, []);
    const after = resolveReadingCanvas(640, [SETTINGS]);
    expect(readingCanvasReflows(before, after)).toBe(false);
    expect(after.contentWidth).toBe(before.contentWidth);
  });
});

describe('readingCanvasViolations — the negative control', () => {
  it('reports a hand-built partial cover that the resolver can never produce', () => {
    const legal = resolveReadingCanvas(1200, [SETTINGS]);
    expect(readingCanvasViolations(legal, 1200)).toEqual([]);

    const partial = {
      ...legal,
      tools: [{ id: 'settings', placement: 'sheet' as const, width: 264, side: 'trailing' as const }],
      activeSheetId: 'settings',
      documentCovered: true,
    };
    expect(readingCanvasViolations(partial, 1200)).toContain('sheet-not-full-canvas:settings');
  });

  it('reports a document squeezed under the floor at a width that could have afforded it', () => {
    const squeezed = {
      contentWidth: 200,
      measureWidth: 200,
      tools: [{ id: 'settings', placement: 'docked' as const, width: 988, side: 'trailing' as const }],
      activeSheetId: null,
      documentCovered: false,
    };
    expect(readingCanvasViolations(squeezed, 1200)).toContain('content-below-minimum');
  });

  it('distinguishes a squeeze from a canvas that was never wide enough', () => {
    const layout = resolveReadingCanvas(320, []);
    expect(readingCanvasViolations(layout, 320)).toEqual(['viewport-below-minimum']);
  });

  it('reports a measure wider than the region it sits in', () => {
    const layout = resolveReadingCanvas(1200, []);
    expect(readingCanvasViolations({ ...layout, measureWidth: 900 }, 1200)).toContain(
      'measure-above-maximum',
    );
    expect(
      readingCanvasViolations({ ...layout, contentWidth: 600, measureWidth: 700 }, 1200),
    ).toContain('measure-exceeds-content');
  });
});

/**
 * L6's fifth surface, the visual novel panel, is the first reading surface whose
 * side tool is its library — navigation INTO the document, which belongs on the
 * leading edge. The field is deliberately inert to the arithmetic; these say so
 * with numbers rather than with a comment.
 */
describe('side — which edge a docked tool takes', () => {
  const LIBRARY = { id: 'library', minWidth: 220, preferredWidth: 290, side: 'leading' as const };

  it('defaults to trailing, so every surface migrated before the field is unchanged', () => {
    const layout = resolveReadingCanvas(1200, [SETTINGS]);
    expect(layout.tools[0].side).toBe('trailing');
    expect(readingCanvasViolations(layout, 1200)).toEqual([]);
  });

  it('echoes a declared leading side back', () => {
    const layout = resolveReadingCanvas(1200, [LIBRARY]);
    expect(layout.tools[0]).toEqual({ id: 'library', placement: 'docked', width: 290, side: 'leading' });
  });

  it('does not change the geometry at all — the same widths with the side flipped', () => {
    const leading = resolveReadingCanvas(1200, [LIBRARY]);
    const trailing = resolveReadingCanvas(1200, [{ ...LIBRARY, side: 'trailing' }]);
    expect(leading.contentWidth).toBe(trailing.contentWidth);
    expect(leading.measureWidth).toBe(trailing.measureWidth);
    expect(leading.tools[0].width).toBe(trailing.tools[0].width);
    // The control: something DID differ, so the three equalities above are not
    // comparing an object with itself.
    expect(leading.tools[0].side).not.toBe(trailing.tools[0].side);
  });

  it('keeps docking first-come rather than re-ranking a leading tool ahead of an open one', () => {
    // 1200 − 264 − 12 = 924 left; the library asks 290 and gets it. Open order,
    // not side order: settings is still the tool that took the first track.
    const layout = resolveReadingCanvas(1200, [SETTINGS, LIBRARY]);
    expect(layout.tools.map((t) => [t.id, t.width])).toEqual([['settings', 264], ['library', 290]]);
    expect(layout.contentWidth).toBe(1200 - 264 - 12 - 290 - 12);
    expect(readingCanvasViolations(layout, 1200)).toEqual([]);
  });

  it('carries the declared side through a sheet rather than rewriting it', () => {
    // 600 − 12 − 384 = 204 < the library's 220 floor, so it is a sheet. `side`
    // is then unobservable, and reporting a value the geometry never used would
    // be a fabricated number in a module whose whole job is honest ones.
    const layout = resolveReadingCanvas(600, [LIBRARY]);
    expect(layout.tools[0].placement).toBe('sheet');
    expect(layout.tools[0].side).toBe('leading');
    expect(readingCanvasViolations(layout, 600)).toEqual([]);
  });
});
