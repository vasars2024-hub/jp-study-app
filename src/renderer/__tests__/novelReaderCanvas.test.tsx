// @vitest-environment jsdom
/**
 * L6's Gate on its second surface — Novels — and the first RUN of the harness
 * rather than a BUILD. Everything about mounting a reading surface at a chosen
 * width lives in `helpers/readingCanvasSurface`; this file is the surface's own
 * numbers.
 *
 * The defect being closed: bookmarks, book translation and reading settings were
 * `.settings-panel` popovers — `position: absolute; right: 0; width: 264px` —
 * hung off the reader toolbar and floating over the page. At a 640px pop-out,
 * which is a size this reader is routinely opened at, 264 of 640px is 41% of the
 * text covered, and nothing in the old markup could know that because nothing
 * measured anything.
 *
 * The negative control is the FIRST test: it removes the migration's own
 * mechanism (the canvas measures 0, as it does before layout) and asserts the
 * tool is not placed at all. Without it, "docked at 1200" and "sheet at 640" are
 * both satisfiable by a component that happens to render one thing at each width
 * for unrelated reasons.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import type { LibraryItem } from '../../shared/types';
import {
  createReadingSurfaceHarness,
  expectDismissRestoresDocument,
  expectPlacement,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function bookItem(): LibraryItem {
  return {
    id: 'book-1',
    title: 'クビシメロマンチスト',
    kind: 'book',
    createdAt: 0,
    epubFile: 'original.epub',
    progress: { location: 'p:0:0', percent: 0 },
  } as unknown as LibraryItem;
}

let harness: ReadingSurfaceHarness | null = null;

async function mountReader(width: number): Promise<ReadingSurfaceHarness> {
  const { default: NovelReader } = await import('../views/NovelReader');
  harness = createReadingSurfaceHarness({
    render: () => createElement(NovelReader, { item: bookItem(), onClose: () => undefined }),
    ready: (container) => container.querySelector('.settings-anchor') !== null,
  });
  await harness.mount(width);
  return harness;
}

beforeEach(() => {
  installResizeObserver();
  installReadingSurfaceApi({
    // Resolves, unlike the progress-guard test's pending promise: the toolbar
    // has to exist and the tools have to be openable.
    readBook: async () => null,
    setProgress: vi.fn(),
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** The three toolbar triggers, in DOM order. Selecting by label is not safe: it is localised. */
const TRIGGER = '.settings-anchor button[aria-pressed]';
const BOOKMARKS = 0;
const TRANSLATE = 1;
const SETTINGS = 2;

describe('NovelReader through the L6 reading canvas', () => {
  it('places no tool at all before the canvas has been measured', async () => {
    // The negative control. Width 0 is what the real first paint reports, and
    // the honest answer is "no placement decided yet" — not a guessed `wide`,
    // which would dock a 264px panel into a 400px pop-out for one frame.
    const h = await mountReader(0);
    await h.click(TRIGGER, BOOKMARKS);
    expect(h.tool('bookmarks')).toBe(null);
    expect(h.doc().hasAttribute('inert')).toBe(false);
    expect(h.doc().dataset.contentWidth).toBe(undefined);
  });

  it('docks bookmarks beside the page on a wide canvas', async () => {
    const h = await mountReader(1200);
    await h.click(TRIGGER, BOOKMARKS);
    // 1200 - 264 - 12 gutter. The page keeps 924, far above its 384 floor.
    expectPlacement(h, 'bookmarks', { placement: 'docked', contentWidth: 924, toolWidth: 264 });
    // The scroller is the document's child, not the canvas's: `.novel-scroller`
    // is `position: absolute; inset: 0`, so without `position: relative` on the
    // document region it would resolve against the whole canvas and paint the
    // page straight over the tool just docked beside it.
    expect(h.doc().querySelector('.novel-scroller')).not.toBe(null);
  });

  it('takes only the slack at the pop-out width, never the page floor', async () => {
    /*
     * MEASURED, AND IT CORRECTED THIS TEST'S FIRST GUESS. 640px was written up
     * as the sheet case, because that is the width at which the old popover
     * covered 264 of 640 = 41% of the text. The resolver docks here instead:
     * room = 640 - 12 gutter - 384 floor = 244, which clears bookmarks' 200
     * floor, so the tool takes 244 rather than its preferred 264 and the page
     * keeps exactly 384. That is the better outcome and the reason the contract
     * clamps to `room`: 0% of the text is covered where 41% was, and the page
     * stays visible instead of being set aside.
     */
    const h = await mountReader(640);
    await h.click(TRIGGER, BOOKMARKS);
    expectPlacement(h, 'bookmarks', { placement: 'docked', contentWidth: 384, toolWidth: 244 });
  });

  it('turns a tool into a dismissible sheet once the page cannot keep its floor', async () => {
    // 500 - 12 - 384 = 104, under every tool's floor, so there is no honest
    // dock left and the page is set aside outright rather than squeezed.
    const h = await mountReader(500);
    await h.click(TRIGGER, BOOKMARKS);
    expectPlacement(h, 'bookmarks', { placement: 'sheet', contentWidth: 500 });
    await expectDismissRestoresDocument(h, 'bookmarks');
  });

  it('lets each tool set its own floor, so the same width decides differently', async () => {
    // The proof that `minWidth` is per tool and load-bearing rather than
    // decoration: at 620 the room is 224. Bookmarks (floor 200) docks; the
    // translate panel (floor 240, because its range rows put two number inputs
    // and a button on one line) does not and becomes a sheet.
    const h = await mountReader(620);
    await h.click(TRIGGER, BOOKMARKS);
    expect(h.tool('bookmarks')!.dataset.placement).toBe('docked');
    await h.click(TRIGGER, BOOKMARKS);
    await h.click(TRIGGER, TRANSLATE);
    expectPlacement(h, 'translate', { placement: 'sheet', contentWidth: 620 });
  });

  it('does not take the dock away from a tool the reader is already using', async () => {
    /*
     * First-come docking, which is the whole reason the reader tracks open
     * order. Bookmarks opens first and docks at 264 (page 924). Reading settings
     * opens second: room is 924 - 12 - 384 = 528, so it docks too at 280 (page
     * 632). Translate opens third: room is 632 - 12 - 384 = 236, under its 240
     * floor, so it is the one that becomes a sheet — and the two already in use
     * keep their exact widths rather than being re-ranked under the newcomer.
     */
    const h = await mountReader(1200);
    await h.click(TRIGGER, BOOKMARKS);
    await h.click(TRIGGER, SETTINGS);
    expect(h.tool('bookmarks')!.style.width).toBe('264px');
    expect(h.tool('reader-settings')!.style.width).toBe('280px');
    expect(h.doc().dataset.contentWidth).toBe('632');
    await h.click(TRIGGER, TRANSLATE);
    expect(h.tool('translate')!.dataset.placement).toBe('sheet');
    expect(h.tool('bookmarks')!.style.width).toBe('264px');
    expect(h.tool('reader-settings')!.style.width).toBe('280px');
  });

  it('keeps the document node across dock, sheet and dismissal', async () => {
    const h = await mountReader(1200);
    const scroller = h.doc().querySelector('.novel-scroller');
    await h.click(TRIGGER, BOOKMARKS);
    await h.resize(500);
    expect(h.tool('bookmarks')!.dataset.placement).toBe('sheet');
    await expectDismissRestoresDocument(h, 'bookmarks');
    // Same node throughout: an epub rendition, the scroll offset and any
    // in-flight capture live on it, and a remount silently drops all three.
    expect(h.doc().querySelector('.novel-scroller')).toBe(scroller);
  });

  it('leaves the toolbar with no popover left to reintroduce the bug', async () => {
    const h = await mountReader(1200);
    expect(h.container.querySelectorAll('.reader-bar .settings-panel').length).toBe(0);
    expect(h.container.querySelectorAll('.reader-bar .panel-backdrop').length).toBe(0);
    // The triggers survive — a migration that removed the route to the tool
    // would satisfy "no tool obscures the document" by deleting the feature.
    expect(h.container.querySelectorAll(TRIGGER).length).toBe(3);
  });
});
