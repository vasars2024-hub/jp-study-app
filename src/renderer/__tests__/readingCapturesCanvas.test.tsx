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
import {
  READING_PASSAGE_ROUTE,
  type ReadingPassageHandoff,
} from '../../shared/readingPassageHandoff';
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

const LARGE_HISTORY = Array.from({ length: 60 }, (_, index) => ({
  captureId: `cap-${index}`,
  text: `履歴の文章 ${index}`,
  source: 'screen',
  sourceLabel: `Screen ${index}`,
  capturedAt: 1_700_000_000_000 + index,
}));

/**
 * A staged lens passage, exactly as `readingPassageHandoffTake` hands one back.
 * Deliberately not one of the two history rows: the deep link has to be visible
 * as a change, not as a re-selection of what was already showing.
 */
const PASSAGE: ReadingPassageHandoff = {
  route: READING_PASSAGE_ROUTE,
  text: '検証用の文章です。これはディープリンクが届いた先を見るためだけに作られました。',
  kind: 'paragraph',
  lines: ['検証用の文章です。これはディープリンクが届いた先を見るためだけに作られました。'],
  source: 'clipboard',
  sourceLabel: 'Deep link probe',
  captureId: 'cap-deep-link',
  language: 'ja',
  stagedAt: 1_700_000_002_000,
};

let harness: ReadingSurfaceHarness | null = null;
/** Read at every render, so a re-render can deliver a passage without remounting. */
let passage: ReadingPassageHandoff | null = null;
let historyRows = HISTORY;

async function mountAt(width: number): Promise<ReadingSurfaceHarness> {
  harness = createReadingSurfaceHarness({
    render: () => <ReadingCapturesView passage={passage} />,
    ready: (container) => container.querySelector('.reading-captures-row') !== null,
  });
  await harness.mount(width);
  return harness;
}

/** Deliver a staged passage to a mounted surface, at the width it is already at. */
async function deliverPassage(h: ReadingSurfaceHarness, width: number): Promise<void> {
  passage = PASSAGE;
  await h.mount(width);
}

beforeEach(() => {
  installResizeObserver();
  historyRows = HISTORY;
  installReadingSurfaceApi({ lensHistoryList: async () => historyRows });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  passage = null;
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

  it.each([500, 1200])('reveals a selected capture at %i px without removing docked navigation', async (width) => {
    const h = await mountAt(width);
    const row = h.container.querySelectorAll<HTMLButtonElement>('.reading-captures-row')[1];
    const title = row.querySelector('.reading-captures-row-title')!.textContent;
    await h.click('.reading-captures-row', 1);

    expect(h.container.querySelector('.reading-captures-reader-head h2')!.textContent).toBe(title);
    expect(h.doc().hasAttribute('inert')).toBe(false);
    expect(h.doc().getAttribute('aria-hidden')).toBe(null);
    if (width === 500) {
      expect(h.tool('captures')).toBe(null);
      await h.click(TOGGLE);
      expect(h.tool('captures')!.dataset.placement).toBe('sheet');
    } else {
      expect(h.tool('captures')!.dataset.placement).toBe('docked');
    }
    expect(h.container.querySelector('.reading-captures-row[aria-current="true"] .reading-captures-row-title')!.textContent).toBe(title);
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

  it('windows a full capture history while preserving its accessible size', async () => {
    historyRows = LARGE_HISTORY;
    const h = await mountAt(1200);
    const rendered = h.container.querySelectorAll('.reading-captures-row');
    const firstSlot = rendered[0]?.closest('[role="listitem"]');

    // jsdom reports a zero-height viewport, so VirtualList renders only its 12-row
    // overscan. Rendering all 60 is the exact regression this assertion catches.
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(LARGE_HISTORY.length);
    expect(firstSlot?.getAttribute('aria-setsize')).toBe(String(LARGE_HISTORY.length));
    expect(firstSlot?.getAttribute('aria-posinset')).toBe('1');
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

  it('uncovers the document when a deep-linked passage arrives under a sheet', async () => {
    // L6 bullet 2's "deep-link", measured live before this existed: staging a
    // passage through `readingPassageHandoffStage` put the section on
    // `captures`, the reader head on the new label and `aria-current` on the new
    // row — all correct — while the canvas read `data-covered="true"` and the
    // document was `inert`. The user asked to read a passage and got the index.
    const h = await mountAt(500);
    expectPlacement(h, 'captures', { placement: 'sheet', contentWidth: 500 });

    await deliverPassage(h, 500);

    expect(h.tool('captures')).toBe(null);
    expect(h.doc().hasAttribute('inert')).toBe(false);
    expect(h.doc().getAttribute('aria-hidden')).toBe(null);
    // The passage itself, not just an uncovered empty reader.
    expect(h.container.querySelector('.reading-captures-reader-head h2')!.textContent).toBe(
      PASSAGE.sourceLabel,
    );
    expect(h.container.querySelector('.reading-captures-passage')!.textContent).toBe(PASSAGE.text);
    // Reversible: the reopen control is in the reader's own header, which is
    // only reachable because the document is live again.
    await h.click(TOGGLE);
    expect(h.tool('captures')!.dataset.placement).toBe('sheet');
  });

  it('leaves a DOCKED list alone when the same passage arrives', async () => {
    // The negative control the fix needs, and the one that decides whether it is
    // a fix or a new defect: a docked list is beside the document, not over it,
    // so closing it would throw away the navigation for nothing. Same passage,
    // same code path, opposite outcome — driven by placement alone.
    const h = await mountAt(1200);
    expectPlacement(h, 'captures', { placement: 'docked', contentWidth: 928, toolWidth: 260 });

    await deliverPassage(h, 1200);

    expect(h.tool('captures')).not.toBe(null);
    expect(h.tool('captures')!.dataset.placement).toBe('docked');
    expect(h.doc().hasAttribute('inert')).toBe(false);
    expect(h.container.querySelector('.reading-captures-reader-head h2')!.textContent).toBe(
      PASSAGE.sourceLabel,
    );
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
