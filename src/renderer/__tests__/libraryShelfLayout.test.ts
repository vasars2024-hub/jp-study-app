/**
 * The Library's cover-first shelf and its contextual detail drawer.
 *
 * Track 4 of the Main V1 plan asks to "replace the dense permanent three-pane
 * table with a cover-first grid plus strong compact list and a contextual
 * detail drawer". Three things have to hold for that sentence to be true, and
 * each is guarded below:
 *
 *   1. the grid is the *default* shape, and the table survives as a real
 *      alternative rather than being deleted;
 *   2. selection is resolved against what is on screen, with no fallback to the
 *      first item — the fallback is what made the old inspector permanent;
 *   3. the workbench publishes that state so the layout actually gives the
 *      column back, instead of leaving an empty pane where the drawer was.
 *
 * (2) is real logic and is tested as such. (1) and (3) are a markup/CSS
 * contract, which jsdom cannot observe here — LibraryView reaches for
 * `window.api` in its first effect and cannot be mounted by a unit test — so
 * they are read from source, the same way `videoStudyLayout.test.ts` reads a
 * geometry contract it cannot render.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_LIBRARY_LAYOUT,
  LIBRARY_LAYOUTS,
  drawerState,
  resolveSelection,
} from '../utils/libraryShelf';

const SRC = resolve(__dirname, '../..');
const VIEW = readFileSync(resolve(SRC, 'renderer/views/LibraryView.tsx'), 'utf8');
const CSS = readFileSync(resolve(SRC, 'renderer/theme/aero-apps.css'), 'utf8');
const CLASSIC_CSS = readFileSync(resolve(SRC, 'renderer/styles.css'), 'utf8');

const item = (id: string) => ({ id, title: id });

describe('library shelf layout', () => {
  it('offers exactly the two shapes the plan names, covers first', () => {
    expect(LIBRARY_LAYOUTS).toEqual(['grid', 'list']);
    expect(DEFAULT_LIBRARY_LAYOUT).toBe('grid');
  });

  it('renders the cover grid for grid and keeps the compact table for list', () => {
    expect(VIEW).toContain("layout === 'grid' ? (");
    expect(VIEW).toContain('className="aero-library-grid"');
    expect(VIEW).toContain('<LibraryTile');
    // The dense table is a peer shape, not a casualty.
    expect(VIEW).toContain('className="aero-library-table"');
  });

  it('gives each shape a switch that says which one is showing', () => {
    expect(VIEW).toContain('aria-pressed={layout === mode}');
    expect(VIEW).toContain("t(`library.layout.${mode}`)");
  });
});

describe('contextual detail drawer', () => {
  it('has no selection until one is made', () => {
    expect(resolveSelection([item('a'), item('b')], null)).toBeNull();
  });

  it('resolves the selected item when it is on screen', () => {
    expect(resolveSelection([item('a'), item('b')], 'b')).toEqual(item('b'));
  });

  it('drops a selection the visible set no longer contains', () => {
    // Removed, filtered out by folder, or excluded by a level/language chip:
    // all three arrive here as an id with nothing behind it.
    expect(resolveSelection([item('a')], 'gone')).toBeNull();
    expect(resolveSelection([], 'a')).toBeNull();
  });

  it('never substitutes a different book for the one that was asked for', () => {
    // The regression this replaces: `?? visible[0]` meant closing the drawer
    // re-opened it on the first item, and a filtered-out selection silently
    // detailed someone else's book.
    expect(resolveSelection([item('a'), item('b')], 'gone')).not.toEqual(item('a'));
  });

  it('publishes open only when something is selected', () => {
    expect(drawerState(item('a'))).toBe('open');
    expect(drawerState(null)).toBe('closed');
    expect(drawerState(undefined)).toBe('closed');
  });

  it('mounts the drawer conditionally and gives it a way out', () => {
    expect(VIEW).toContain('{selectedItem && (');
    expect(VIEW).toContain('className="aero-library-drawer-close"');
    expect(VIEW).toContain('onClick={() => setSelectedId(null)}');
    // The old always-present pane resolved through a first-item fallback.
    expect(VIEW).not.toContain('?? visible[0]');
  });

  it('takes the column back when the drawer is closed', () => {
    const rule = CSS.match(
      /\.aero-library-workbench\[data-drawer='closed'\]\s*\{([^}]*)\}/,
    );
    expect(rule, 'aero-apps.css must narrow the workbench when no drawer is open').not.toBeNull();
    // Two tracks, not three: the tree and the shelf.
    expect(rule?.[1]).toContain('grid-template-columns: 190px minmax(340px, 1fr)');
  });

  it('lays the shelf out as a responsive cover grid', () => {
    const rule = CSS.match(/:root\[data-materials='aero'\] \.aero-library-grid\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule?.[1]).toContain('repeat(auto-fill, minmax(');
  });
});

/**
 * The Aero workbench is behind a secret material set; the shell users actually
 * run is the Study OS one, and the plan's bullet is about the product, not
 * about a theme. So the same two shapes and the same drawer exist there too,
 * built from the same `detailBody`/`drawerHead`/`layoutSwitch` values rather
 * than a second copy that can drift.
 */
describe('the Study OS shell gets the same shapes', () => {
  it('shares one drawer body and one layout switch between both shells', () => {
    // Still ONE `detailBody`, still consumed twice — but the classic shell now
    // hands it to the L6 canvas as a tool's `content` rather than mounting it in
    // its own `<aside>`, so the second reference is `content: detailBody`.
    expect(VIEW.match(/\{detailBody\}/g)?.length).toBe(1);
    expect(VIEW.match(/content: detailBody,/g)?.length).toBe(1);
    // `drawerHead` is deliberately NOT reused in the canvas tool: the tool head
    // already renders the title and the close, and two stacked heads is how a
    // migration adds chrome while claiming to remove it.
    expect(VIEW.match(/\{drawerHead\}/g)?.length).toBe(1);
    expect(VIEW.match(/\{layoutSwitch\}/g)?.length).toBe(2);
  });

  it('renders a compact list beside the classic cover grid', () => {
    expect(VIEW).toContain("layout === 'list' ? (");
    expect(VIEW).toContain('className="lib-list"');
    expect(VIEW).toContain('className="grid"');
  });

  it('keeps the classic drawer out of grid mode, where selection means OCR', () => {
    // `selectedId` doubles as the inline BookOcrPanel toggle on a grid card;
    // mounting the drawer on it too would answer one click with two panels.
    // The rule survived the L6 canvas migration — only its expression moved,
    // from a conditional `<aside>` to a conditional entry in `libraryTools`.
    expect(VIEW).toContain("if (layout === 'list' && selectedItem) {");
    expect(VIEW).toContain("drawerState(layout === 'list' ? selectedItem : null)");
  });

  it('has no window-width media query left to size the drawer', () => {
    /*
     * Replaces "gives the classic shell the drawer column only when it is open",
     * which asserted the defect. `.lib-shell[data-drawer='open']` was
     * `grid-template-columns: minmax(0, 1fr) 262px` with a
     * `@media (max-width: 900px)` stack, and a media query reads the WINDOW —
     * this view renders in the Reading Finder's 820px pane and in pop-outs, so
     * at a 600px pane inside a 1264px window the query never fired and a
     * five-column list row was left ~322px. L6's canvas measures the element.
     */
    // Comments stripped first: the replacement comment NAMES the deleted rule
    // so the next worker knows why it went, and a raw text match would then
    // read the explanation as the defect.
    const rules = CLASSIC_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toMatch(/\.lib-shell\[data-drawer='open'\]/);
    expect(rules).not.toMatch(/@media[^{]*\{\s*\.lib-shell/);
    // `data-drawer` itself stays: it is state the Aero workbench and these
    // tests read. What is gone is anything sizing a track from it.
    expect(VIEW).toContain('data-drawer={drawerState(');
    expect(VIEW).toContain('policy={READING_CANVAS_FILL_POLICY}');
    expect(VIEW).toContain('scroll="page"');
  });

  it('sizes the compact-list thumbnail outside the Aero-only rule', () => {
    // `.aero-library-thumb` gets its box from a `:root[data-materials='aero']`
    // rule; without a classic one the list paints a zero-height gradient.
    const rule = CLASSIC_CSS.match(/\n\.lib-list-title \.aero-library-thumb\s*\{([^}]*)\}/);
    expect(rule, 'the classic list must size its own thumbnail').not.toBeNull();
    expect(rule?.[1]).toMatch(/height:\s*\d+px/);
  });
});
