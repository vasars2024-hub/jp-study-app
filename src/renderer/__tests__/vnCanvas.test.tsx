// @vitest-environment jsdom
/**
 * L6's Gate on its sixth surface — the visual novel panel. A RUN of
 * `helpers/readingCanvasSurface`: no plumbing, no new probe.
 *
 * Two things make this surface different from the five before it, and both are
 * asserted here rather than described:
 *
 * 1. ITS TOOL IS ON THE LEADING EDGE. The library navigates INTO the document;
 *    bookmarks, translate and reader settings act ON it. `side: 'leading'` moves
 *    the tool in the DOM, not with CSS `order`, so reading order and visual
 *    order stay the same — `precedesTheDocument` is the assertion, and the
 *    trailing case is its control.
 * 2. THE LIBRARY HAS NO CLOSE OF ITS OWN. It was always visible, so the
 *    contract's required `onClose` needed a real control: a header toggle with
 *    `aria-pressed`, whose two states are both asserted.
 *
 * The defect being repaired is the one Captures and Library had:
 * `.visual-novel-layout` was `minmax(220px, 290px) minmax(0, 1fr)` with a
 * `@media (max-width: 760px)` stack. The query reads the WINDOW while this panel
 * renders inside the Immersion floating window, so in a 600px pane inside a
 * 1264px window it never fires and the workspace absorbs the whole shortfall.
 *
 * FILL policy, not the prose default: the workspace is a dense tool surface —
 * route tables, capture lists, metadata forms — and a 760px measure clamp would
 * centre a settings form in a 1200px canvas. The `--lq-reading-measure: none`
 * assertion is what proves the fill policy is the one actually in force.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
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

/**
 * A whole entry, not a partial one. `rankVisualNovelEntries` iterates
 * `entry.genres` and `entry.tags` and `capturesForVisualNovel` reads
 * `database.captures`, so a fixture with only the fields the LAYOUT needs
 * throws inside a `useMemo` and the surface never mounts — a red that reads
 * like a layout defect and is not one.
 */
function entry(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    japaneseTitle: '',
    englishTitle: '',
    alternativeTitles: [],
    developer: '',
    publisher: '',
    releaseDate: '',
    originalPlatform: '',
    platforms: [],
    genres: [],
    tags: [],
    themes: [],
    synopsis: '',
    characters: [],
    chapters: [],
    routes: [],
    releases: [],
    communityReports: [],
    estimatedPlaytimeHours: 0,
    sourceIds: {},
    sourceUrl: '',
    coverImageUrl: '',
    backgroundImageUrls: [],
    screenshotUrls: [],
    communityRating: null,
    communityVoteCount: 0,
    installPath: '',
    executablePath: '',
    engine: 'kirikiri',
    engineCompatibility: 'supported',
    version: '',
    language: 'ja',
    status: 'reading',
    currentRouteId: '',
    currentChapter: '',
    currentScene: '',
    completionPct: 0,
    totalPlaytimeSec: 0,
    lastPlayedAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

const DATABASE = {
  version: 1,
  captures: [],
  entries: [
    entry({ id: 'vn-1', title: 'Clannad', japaneseTitle: 'クラナド', completionPct: 42, totalPlaytimeSec: 7200 }),
    entry({ id: 'vn-2', title: 'Steins;Gate', japaneseTitle: 'シュタインズ・ゲート', status: 'planned' }),
  ],
};

const TOGGLE = '.visual-novel-panel-tools button[aria-pressed]';

let harness: ReadingSurfaceHarness | null = null;

async function mountPanel(width: number): Promise<ReadingSurfaceHarness> {
  // Dynamic, after the `window.api` stub exists: this panel's imports reach for
  // it at module-eval time, not only inside effects.
  const { default: VisualNovelPanel } = await import('../components/immersion/VisualNovelPanel');
  harness = createReadingSurfaceHarness({
    render: () => createElement(VisualNovelPanel, { onClose: () => undefined }),
    ready: (container) => container.querySelector('.lq-reading.visual-novel-layout') !== null,
  });
  await harness.mount(width);
  return harness;
}

/**
 * Where the tool sits relative to the document, in the DOM. `order` would move
 * the painted box and leave this answer unchanged, which is exactly why the
 * assertion is written against document position rather than against a rect.
 */
function precedesTheDocument(h: ReadingSurfaceHarness, id: string): boolean {
  const doc = h.doc();
  const tool = h.tool(id);
  expect(tool, `tool "${id}" is not rendered`).not.toBe(null);
  return Boolean(doc.compareDocumentPosition(tool!) & Node.DOCUMENT_POSITION_PRECEDING);
}

beforeEach(() => {
  // The panel persists "library shown" (vn-panel-state); a test that dismisses
  // the library sheet must not start the next one with it hidden.
  localStorage.removeItem('vn-panel-state');
  installResizeObserver();
  installReadingSurfaceApi({
    visualNovelList: async () => DATABASE,
    onVisualNovelChanged: () => () => undefined,
    onVisualNovelHookChanged: () => () => undefined,
    visualNovelHookState: async () => ({ active: false }),
    visualNovelSessionState: async () => ({ startedAt: null }),
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('the visual novel panel through the L6 reading canvas', () => {
  it('renders the layout as the canvas, under the fill policy', async () => {
    const h = await mountPanel(1200);
    const canvas = h.container.querySelector<HTMLElement>('.visual-novel-layout');
    expect(canvas).not.toBe(null);
    expect(canvas!.classList.contains('lq-reading')).toBe(true);
    // Fill, not prose: `none` is only emitted for an infinite `maxContentWidth`.
    expect(h.doc().style.getPropertyValue('--lq-reading-measure')).toBe('none');
    // The workspace is the document region's content, not a canvas sibling.
    expect(h.doc().querySelector('.visual-novel-workspace')).not.toBe(null);
  });

  it('docks the library on the LEADING edge, before the document in the DOM', async () => {
    const h = await mountPanel(1200);
    // 1200 − 290 − 12 = 898 for the workspace; 290 is the grid's own max track.
    expectPlacement(h, 'library', { placement: 'docked', contentWidth: 898, toolWidth: 290 });
    expect(h.tool('library')!.dataset.side).toBe('leading');
    expect(precedesTheDocument(h, 'library')).toBe(true);
    // Both entries are still in the list — the migration moved the library, it
    // did not shorten it.
    expect(h.tool('library')!.querySelectorAll('.visual-novel-library li').length).toBe(2);
  });

  it('keeps the library wrapper, because every one of its rules is a descendant selector', async () => {
    // `.visual-novel-library ul`, `li > button`, `li span`. Dropping the class
    // to render a bare fragment would unstyle the whole list while the layout
    // still looked correct in a screenshot.
    const h = await mountPanel(1200);
    const wrapper = h.tool('library')!.querySelector('.visual-novel-library');
    expect(wrapper).not.toBe(null);
    expect(wrapper!.querySelector('.visual-novel-add')).not.toBe(null);
  });

  it('names the entry list and its rows, so they are reachable by anything but their title text', async () => {
    // Measured 2026-08-26: this was `<ul>` with a bare `<li><button className={
    // selected ? 'is-selected' : ''}>`, while every other list in the panel is
    // named. The one list of visual novels could only be found by its own
    // TRANSLATED title text — the defect `reader-back` fixed on the reader.
    const h = await mountPanel(1200);
    const list = h.tool('library')!.querySelector('ul.visual-novel-entries');
    expect(list).not.toBe(null);
    // The CSS reaches these rows structurally, so the nesting is pinned beside
    // the class rather than instead of it.
    expect(list!.parentElement!.classList.contains('visual-novel-library')).toBe(true);
    const rows = Array.from(h.tool('library')!.querySelectorAll('.visual-novel-entry'));
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.tagName === 'BUTTON' && r.parentElement!.tagName === 'LI')).toBe(true);
  });

  it('marks the selected entry in the accessibility tree, not only in the paint', async () => {
    const h = await mountPanel(1200);
    const rows = () => Array.from(h.tool('library')!.querySelectorAll<HTMLButtonElement>('.visual-novel-entry'));
    const selected = () => rows().filter((r) => r.classList.contains('is-selected'));
    expect(selected().length).toBe(1);
    expect(selected()[0].getAttribute('aria-current')).toBe('true');
    // Omitted, never `aria-current="false"`: a stale false on every other row is
    // what a screen reader reads as "several currents".
    expect(rows().filter((r) => !r.classList.contains('is-selected'))
      .every((r) => r.getAttribute('aria-current') === null)).toBe(true);

    const other = rows().find((r) => !r.classList.contains('is-selected'))!;
    const label = other.textContent;
    await h.click('.visual-novel-entry', rows().indexOf(other));
    expect(selected().length).toBe(1);
    expect(selected()[0].textContent).toBe(label);
    expect(selected()[0].getAttribute('aria-current')).toBe('true');
  });

  it('becomes a dismissible sheet in a pane the old media query could never see', async () => {
    // 600 − 12 − 384 = 204 < the library's 220 floor. The `@media (max-width:
    // 760px)` rule read `window.innerWidth`, which jsdom reports as 1024 here —
    // the same shape as the live 600px-pane-inside-a-1264px-window case.
    expect(window.innerWidth).toBeGreaterThan(760);
    const h = await mountPanel(600);
    expectPlacement(h, 'library', { placement: 'sheet', contentWidth: 600 });
    // A sheet has no side to REPORT — `data-side` is dropped, because there is
    // no edge it took. It stays in the leading GROUP all the same: crossing to
    // the trailing one is a different children array and so a remount, which is
    // the defect the subtree test below pins. Neither is observable here — the
    // sheet is `position: absolute; inset: 0` over an `inert` document — so this
    // assertion is about the DOM fact, not about anything the user can see.
    expect(h.tool('library')!.dataset.side).toBe(undefined);
    expect(precedesTheDocument(h, 'library')).toBe(true);
    await expectDismissRestoresDocument(h, 'library');
  });

  it('gives the always-visible library a real close: a header toggle with aria-pressed', async () => {
    const h = await mountPanel(1200);
    const toggle = () => h.container.querySelector<HTMLElement>(TOGGLE)!;
    expect(toggle().getAttribute('aria-pressed')).toBe('true');

    await h.click(TOGGLE);
    expect(h.tool('library')).toBe(null);
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    // Closing it gives the width back rather than leaving a hole.
    expect(h.doc().dataset.contentWidth).toBe('1200');

    await h.click(TOGGLE);
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expectPlacement(h, 'library', { placement: 'docked', contentWidth: 898, toolWidth: 290 });
  });

  it('keeps the workspace node across dock, sheet and restore', async () => {
    const h = await mountPanel(1200);
    const workspace = h.doc().querySelector('.visual-novel-workspace');
    expect(workspace).not.toBe(null);

    await h.resize(600);
    expectPlacement(h, 'library', { placement: 'sheet', contentWidth: 600 });
    // The document is covered, NOT unmounted: a remount would throw away the
    // selected entry, the capture in flight and the analysis state with it.
    expect(h.doc().querySelector('.visual-novel-workspace')).toBe(workspace);

    await h.resize(1200);
    expectPlacement(h, 'library', { placement: 'docked', contentWidth: 898, toolWidth: 290 });
    expect(h.doc().querySelector('.visual-novel-workspace')).toBe(workspace);
  });

  it('keeps the LIBRARY subtree too, when the leading dock becomes a sheet', async () => {
    // L6 bullet 2 on the tool side. The library is the surface where the user
    // scrolls a long list and then narrows the pane; a remount puts them back at
    // the top of it with the entry they were reaching for gone.
    const h = await mountPanel(1200);
    await expectToolSurvivesPlacementChange(h, 'library', { docked: 1200, sheet: 600 });
  });

  it('NEGATIVE CONTROL — the stylesheet no longer decides this layout', async () => {
    // The two rules that used to run it are gone. If either came back the canvas
    // and the grid would both be laying out the same box, and the resolver's
    // arithmetic would report a clean layout it does not control.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');
    expect(css).not.toMatch(/\.visual-novel-layout\s*\{[^}]*grid-template-columns/);
    expect(css).not.toMatch(/\.visual-novel-library\s*,\s*\.visual-novel-workspace/);
    // And the library keeps its own inner rules, which is the other half.
    expect(css).toMatch(/\.visual-novel-library li > button/);
  });

  it('holds the header controls to the pointer floor, and gives aria-pressed a visible state', async () => {
    // Measured live before this rule existed: BOTH header buttons were bare UA
    // buttons at 23x110 against the app's own 32px `--lq-hit-target`. Adding a
    // toggle beside one and leaving both under the floor would be shipping half
    // of a category-1 defect this slice introduced.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');
    expect(css).toMatch(
      /\.visual-novel-panel-tools button \{[^}]*min-height: var\(--lq-hit-target\)/,
    );
    // A toggle whose only pressed indication is in the accessibility tree is
    // not a toggle; live the pressed border is the accent and the other is not.
    expect(css).toMatch(/\.visual-novel-panel-tools button\[aria-pressed='true'\]/);
  });
});
