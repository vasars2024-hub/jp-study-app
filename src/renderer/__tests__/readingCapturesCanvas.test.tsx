// @vitest-environment jsdom
/**
 * L6's Gate on its first real surface — now expressed through the shared
 * harness rather than its own copy of the plumbing.
 *
 * The defect this migration fixes is not "the panel looked wrong". Captures was
 * a CSS grid with a `minmax(180px, 260px)` list column and a
 * `@media (max-width: 720px)` stack, and a media query reads the WINDOW. The
 * Reading workspace is regularly a pop-out or a docked pane, so at a 500px pane
 * inside a 1400px window the query never fired: the list kept its column and the
 * passage was left ~290px, about 17 characters a line at the 17px reading type.
 *
 * So the assertions are about the CANVAS's own width, at two widths, with the
 * narrow one being the case the old stylesheet got wrong. The stylesheet check
 * at the end is the regression latch — a future worker re-adding a window media
 * query to this surface reintroduces exactly this bug.
 *
 * Everything about mounting a reading surface at a chosen width now lives in
 * `helpers/readingCanvasSurface`, shared with Novels: this file was 140 lines and
 * about 90 of them were plumbing that the next four L6 surfaces would each have
 * paid again.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReadingCapturesView from '../views/ReadingCapturesView';
import {
  createReadingSurfaceHarness,
  expectDismissRestoresDocument,
  expectPlacement,
  expectToolSurvivesPlacementChange,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HISTORY = [
  {
    captureId: 'cap-1',
    text: '彼は図書館で本を読んでいた。',
    source: 'screen',
    sourceLabel: 'Screen',
    capturedAt: 1_700_000_000_000,
  },
  {
    captureId: 'cap-2',
    text: '窓の外では雨が降り続いていた。',
    source: 'screen',
    sourceLabel: 'Window',
    capturedAt: 1_700_000_001_000,
  },
];

let harness: ReadingSurfaceHarness | null = null;

async function mountAt(width: number): Promise<ReadingSurfaceHarness> {
  harness = createReadingSurfaceHarness({
    render: () => <ReadingCapturesView passage={null} />,
    ready: (container) => container.querySelector('.reading-captures-row') !== null,
  });
  await harness.mount(width);
  return harness;
}

beforeEach(() => {
  installResizeObserver();
  installReadingSurfaceApi({ lensHistoryList: async () => HISTORY });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  vi.restoreAllMocks();
});

const TOGGLE = '.reading-captures-list-toggle';

describe('Captures through the L6 reading canvas', () => {
  it('docks the capture list beside the passage on a wide canvas', async () => {
    const h = await mountAt(1200);
    // 1200 - 260 - 12 gutter. The passage keeps far more than its 384 floor.
    expectPlacement(h, 'captures', { placement: 'docked', contentWidth: 928, toolWidth: 260 });
    expect(h.container.querySelectorAll('.reading-captures-row').length).toBe(2);
  });

  it('gives the passage the whole pane at the width the old media query missed', async () => {
    const h = await mountAt(500);
    // The case the `@media (max-width: 720px)` stack never saw: a 500px pane
    // inside a wider window. The list is now a sheet, not a 260px column.
    expectPlacement(h, 'captures', { placement: 'sheet', contentWidth: 500 });
    // Dismissible, which is the difference from being squeezed: one click
    // returns the reader at the same 500px, on the same node.
    await expectDismissRestoresDocument(h, 'captures');
  });

  it('keeps a route back to the list after it is dismissed', async () => {
    const h = await mountAt(1200);
    const toggle = h.container.querySelector(TOGGLE) as HTMLButtonElement;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await h.click(TOGGLE);
    expect(h.tool('captures')).toBe(null);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await h.click(TOGGLE);
    expect(h.tool('captures')!.dataset.placement).toBe('docked');
    expect(h.container.querySelectorAll('.reading-captures-row').length).toBe(2);
  });

  it('keeps the capture list itself across a placement change', async () => {
    // Bullet 2's "capture" on the surface that owns it. This list is a scrolled
    // history; before `ReadingCanvas` grouped by declared side, narrowing the
    // pane rebuilt it and put the user back at the newest row.
    const h = await mountAt(1200);
    await expectToolSurvivesPlacementChange(h, 'captures', { docked: 1200, sheet: 500 });
    // And the rows are still the same two — a subtree that survived but emptied
    // would satisfy node identity and nothing a reader cares about.
    expect(h.container.querySelectorAll('.reading-captures-row').length).toBe(2);
  });

  it('keeps the list on the LEADING edge, where the grid column it replaced was', async () => {
    // A regression the migration introduced and nothing caught, because every
    // assertion about this surface was about WIDTH. Before it the markup was
    // `<aside className="reading-captures-list">` first and `<section
    // className="reading-captures-reader">` second against `minmax(180px, 260px)
    // minmax(0, 1fr)`, i.e. the list was the left column; `ReadingCanvas`
    // renders tools after the document, so the fix moved it to the right edge.
    const h = await mountAt(1200);
    const tool = h.tool('captures');
    expect(tool).not.toBe(null);
    expect(tool!.dataset.side).toBe('leading');
    expect(
      Boolean(h.doc().compareDocumentPosition(tool!) & Node.DOCUMENT_POSITION_PRECEDING),
    ).toBe(true);
  });

  it('has no window-width media query left to reintroduce the bug', () => {
    const css = readFileSync(
      resolve(__dirname, '..', 'views', 'readingCaptures.css'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/@media/);
    expect(css).not.toMatch(/grid-template-columns/);
  });
});
