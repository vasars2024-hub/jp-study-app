// @vitest-environment jsdom
/**
 * L6's Gate on its third surface — the classic Library shelf. A RUN of
 * `helpers/readingCanvasSurface`, not a build: this file carries no plumbing.
 *
 * The defect is the one Captures had, in a different stylesheet.
 * `.lib-shell[data-drawer='open']` was `grid-template-columns: minmax(0, 1fr)
 * 262px` with a `@media (max-width: 900px)` stack, and a media query reads the
 * WINDOW. This view renders inside the Reading Finder's 820px pane and in
 * pop-outs, so at a 600px pane inside a 1264px window the query never fired: the
 * drawer kept its whole 262px column and a five-column list row was left ~322px.
 *
 * It also proves the one thing this surface needed that the first two did not —
 * `scroll="page"`. The classic shelf scrolls the page rather than a bounded
 * stage, so a stretched docked tool would scroll its own contents off the top of
 * a list that can be thousands of pixels tall.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import {
  createReadingSurfaceHarness,
  expectDismissRestoresDocument,
  expectPlacement,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = [
  {
    id: 'book-1',
    title: '悪の教典 02',
    kind: 'book',
    createdAt: 1_700_000_000_000,
    epubFile: 'a.epub',
    progress: { location: 'p:0:0', percent: 0.02 },
  },
  {
    id: 'book-2',
    title: 'コンビニ人間',
    kind: 'book',
    createdAt: 1_700_000_001_000,
    epubFile: 'b.epub',
    progress: { location: 'p:0:0', percent: 0.5 },
  },
];

let harness: ReadingSurfaceHarness | null = null;

async function mountLibrary(width: number): Promise<ReadingSurfaceHarness> {
  const { default: LibraryView } = await import('../views/LibraryView');
  harness = createReadingSurfaceHarness({
    render: () => createElement(LibraryView, { onOpen: () => undefined }),
    ready: (container) => container.querySelector('.lib-shell') !== null,
  });
  await harness.mount(width);
  // The classic shelf opens in grid layout and the drawer belongs to the list.
  const list = harness.container.querySelector<HTMLElement>('[data-library-layout="list"]');
  if (list) await harness.click('[data-library-layout="list"]');
  return harness;
}

/** Selecting a row is what opens the drawer; there is no separate toggle. */
async function selectFirstRow(h: ReadingSurfaceHarness): Promise<void> {
  await h.click('.lib-list-row:not(.lib-list-head)');
}

beforeEach(() => {
  installResizeObserver();
  installReadingSurfaceApi({
    // `syncLibrary` is the one the view actually awaits (`LibraryView.tsx:212`),
    // and the inert default resolves `null`, which `enrichInboxItems` spreads.
    syncLibrary: async () => ITEMS,
    getWatchFolder: async () => null,
    getLibraryFolders: async () => [],
    onLibraryChanged: () => () => undefined,
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('the classic Library shelf through the L6 reading canvas', () => {
  it('renders the shelf as the canvas, page-scrolled', async () => {
    const h = await mountLibrary(1200);
    const canvas = h.container.querySelector<HTMLElement>('.lib-shell');
    expect(canvas).not.toBe(null);
    expect(canvas!.classList.contains('lq-reading')).toBe(true);
    // The whole reason this surface needed a new option: `contained` would
    // stretch the drawer to the height of the list and scroll its contents away.
    expect(canvas!.dataset.scroll).toBe('page');
    // `data-drawer` survives as state; nothing sizes a track from it any more.
    expect(canvas!.dataset.drawer).toBe('closed');
  });

  it('places no tool until a row is selected', async () => {
    // The negative control for this surface: the canvas is present and measured
    // at a width that could easily dock, and it still places nothing, because
    // an unselected shelf has no detail to show. A surface that rendered a tool
    // here would be inventing one.
    const h = await mountLibrary(1200);
    expect(h.tool('library-detail')).toBe(null);
    expect(h.doc().hasAttribute('inert')).toBe(false);
  });

  it('docks the detail drawer beside the list on a wide shelf', async () => {
    const h = await mountLibrary(1200);
    await selectFirstRow(h);
    // 1200 - 262 - 12 gutter. The list keeps 926, far above its 384 floor.
    expectPlacement(h, 'library-detail', {
      placement: 'docked',
      contentWidth: 926,
      toolWidth: 262,
    });
  });

  it('gives the list the whole pane at the width the old media query missed', async () => {
    // 600 - 12 - 384 = 204, under the drawer's 220 floor. The old stylesheet
    // took its 262px here regardless, because `window.innerWidth` was 1264.
    const h = await mountLibrary(600);
    await selectFirstRow(h);
    expectPlacement(h, 'library-detail', { placement: 'sheet', contentWidth: 600 });
    await expectDismissRestoresDocument(h, 'library-detail');
  });
});
