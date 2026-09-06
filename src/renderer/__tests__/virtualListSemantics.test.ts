/**
 * Windowing is invisible to sighted users and destroys a screen reader's model
 * of the collection unless the component says what it did.
 *
 * A `VirtualList` replaces `<ul>/<li>` with slot `div`s, so without a declared
 * role a library of 883 is not a list at all, and even with `listitem` restored
 * it announces "3 of 20" — the RENDERED count — rather than the real size. The
 * primitive takes `listRole`/`itemRole` and emits `aria-setsize` from
 * `items.length` (see `immersionRailWindowing.test.tsx` for that behaviour).
 *
 * This file is the latch on the CALL SITES, because the primitive supporting it
 * is worth nothing if a new list forgets to ask. Every `<VirtualList` in the
 * tree must be accounted for below: either it declares list semantics, or it
 * declares a richer role of its own on the row it renders.
 *
 * When this fails on a NEW call site that is genuinely a list, the fix is two
 * props, not an entry here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '..', '..');

/**
 * A call site that renders its own richer role must NOT be given `listitem` —
 * a `row` inside a `list` is invalid ARIA. Detected from the tag, not from a
 * file allowlist, because `ResultPanels.tsx` alone holds two grids AND a log
 * console and a per-file rule would have excused the log along with them.
 *
 * That gap is now CLOSED, and the shape of the fix is why it needed its own
 * decision rather than a copy of the list one. `listRole`/`itemRole` puts the
 * role ON the slot; a grid cannot, because the row role belongs to the caller
 * and a row inside a row is nonsense. So `gridRole="rowgroup"` makes the
 * container a rowgroup and every box beneath it — spacer, offset AND slot —
 * `presentation`, which re-parents the caller's own rows onto it. The count then
 * has nowhere to live inside the component either: it is `aria-rowcount` on the
 * caller's table and `aria-rowindex` on each row, asserted below, because a
 * windowed table without them announces the twenty rows in the DOM.
 */
const OWN_ROW_ROLE = /role="(row|option|treeitem|tab|menuitem|gridcell)"/;

/**
 * A caller may render its row through a NAMED function rather than inline JSX, and two
 * call sites may share one. `YouTubePlaylistsView` does both: `renderVideoRow` serves
 * the News grid and the Playlist grid, and it is where `role="row"` lives — D91, where
 * the row had to become focusable and selectable and `role="button"` was rejected
 * because it would have made the row's three action buttons presentational.
 *
 * So resolve each tag's ROW SOURCE: `'inline'`, or the same-file function it delegates
 * to. `null` means the tag declares no row role by either route, which is the defect
 * this file exists to catch. A widening of the SCAN, not of the rule — a delegated
 * renderer still has to carry the role; it is looked up instead of read in place.
 */
function rowSource(tag: string, source: string): string | null {
  if (OWN_ROW_ROLE.test(tag)) return 'inline';
  const name = /renderItem=\{\s*\([^)]*\)\s*=>\s*([A-Za-z_$][\w$]*)\s*\(/.exec(tag)?.[1];
  if (!name) return null;
  const at = source.search(new RegExp(`(const|function)\\s+${name}\\b`));
  if (at < 0) return null;
  // Bounded slice: enough to hold one renderer, not the whole file.
  return OWN_ROW_ROLE.test(source.slice(at, at + 4000)) ? name : null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

/** The props of one `<VirtualList ... >` opening tag, from a file's text. */
function virtualListTags(source: string): string[] {
  const tags: string[] = [];
  const re = /<VirtualList\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    // Walk to the matching `>` of the opening tag, skipping braced expressions
    // so a `style={{ ... }}` containing `>` cannot end it early.
    let depth = 0;
    let i = m.index + '<VirtualList'.length;
    for (; i < source.length; i += 1) {
      const c = source[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    tags.push(source.slice(m.index, i));
  }
  return tags;
}

describe('every windowed list declares what it is', () => {
  const files = walk(SRC).filter((f) => /<VirtualList\b/.test(readFileSync(f, 'utf8')));

  it('finds the call sites at all, so an empty sweep cannot pass', () => {
    // A guard that scans nothing passes everything. This is that guard's guard.
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every call site either list semantics or a row role of its own', () => {
    const mute: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      const source = readFileSync(file, 'utf8');
      for (const tag of virtualListTags(source)) {
        const declaresList = /\bitemRole=/.test(tag) && /\blistRole=/.test(tag);
        if (declaresList) continue;
        // The renderItem arrow lives inside the opening tag's braces, so a row role
        // written in the row's own JSX is visible here — and one written in the named
        // renderer it delegates to is resolved from the same file.
        if (rowSource(tag, source)) continue;
        mute.push(`src/${rel}`);
      }
    }
    // Named, not counted: the message has to say which list went mute.
    expect(mute).toEqual([]);
  });

  it('resolves a DELEGATED row renderer, and does not just wave every tag through', () => {
    // The widening above is only sound if it still says no. Three checks, on the real
    // file: the two YouTube grids resolve to `renderVideoRow` by name; a tag whose
    // renderer has no row role resolves to null; and a tag that delegates to a function
    // this file does not define resolves to null too.
    const source = readFileSync(join(SRC, 'renderer/views/YouTubePlaylistsView.tsx'), 'utf8');
    const resolved = virtualListTags(source).map((tag) => rowSource(tag, source));
    expect(resolved).toEqual(['renderVideoRow', 'renderVideoRow']);

    const noRole = 'const renderPlain = (v) => <div>{v.t}</div>;';
    expect(rowSource('<VirtualList renderItem={(v) => renderPlain(v)}', noRole)).toBeNull();
    expect(rowSource('<VirtualList renderItem={(v) => renderElsewhere(v)}', source)).toBeNull();
    expect(rowSource('<VirtualList renderItem={(v) => <div>{v.t}</div>}', source)).toBeNull();
  });

  it('gives every windowed GRID a rowgroup, so its rows are not orphaned', () => {
    // A `row` must be owned by a table/grid/treegrid/rowgroup. Between the
    // caller's `role="table"` and its row sat four generic divs — its own
    // `.scr-tbody`, the scroll container, the spacer and the offset box — so
    // the table exposed no rows at all. `gridRole` is what re-parents them.
    const orphaned: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      const src = readFileSync(file, 'utf8');
      for (const tag of virtualListTags(src)) {
        if (/\blistRole=/.test(tag)) continue;
        if (!rowSource(tag, src)) continue;
        if (!/\bgridRole=/.test(tag)) orphaned.push(`src/${rel}`);
      }
    }
    expect(orphaned).toEqual([]);
  });

  it('gives every windowed grid a row COUNT and per-row index its DOM cannot supply', () => {
    // The grid analogue of `aria-setsize`, and it cannot come from the
    // component: both attributes live on markup the caller renders. A file that
    // windows a table and never says how many rows there are announces the
    // twenty in the DOM as the whole collection.
    const silent: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      const source = readFileSync(file, 'utf8');
      const grids = virtualListTags(source).filter(
        (tag) => !/\blistRole=/.test(tag) && rowSource(tag, source),
      );
      if (grids.length === 0) continue;
      // The right denominator for `aria-rowindex` is the number of DISTINCT row
      // renderers, not of call sites: two grids sharing one `renderVideoRow` need one
      // definition, and demanding two would be counting the same markup twice.
      const rowDefs = new Set(grids.map((tag) => rowSource(tag, source)));
      // Per file rather than per tag: the count sits on the table element, which
      // is outside the `<VirtualList` tag this sweep can see.
      // `ariaRowCount=` is the same declaration made THROUGH the component, for the
      // `gridRole="grid"` path where VirtualList itself is the grid and the caller has
      // no table element to hang the attribute on. The component emits
      // `aria-rowcount` from it, so the guarantee is identical.
      const counts =
        (source.match(/aria-rowcount=/g) ?? []).length + (source.match(/ariaRowCount=/g) ?? []).length;
      const indexes = (source.match(/aria-rowindex=/g) ?? []).length;
      if (counts < grids.length) silent.push(`src/${rel} (aria-rowcount ${counts} < ${grids.length} grids)`);
      // At least the windowed body row, per grid. Not two: `DeckWorkbenchBrowser`
      // keeps its column header OUTSIDE `role="grid"`, so it legitimately has no
      // header row to index and its rows start at 1 rather than 2.
      if (indexes < rowDefs.size) silent.push(`src/${rel} (aria-rowindex ${indexes} < ${rowDefs.size} row renderers)`);
    }
    expect(silent).toEqual([]);
  });

  it('the two roles are set together, never one without the other', () => {
    // `itemRole` alone puts `listitem` under a plain div, which is exactly the
    // broken ownership this is meant to fix; `listRole` alone gives an empty list.
    const half: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      for (const tag of virtualListTags(readFileSync(file, 'utf8'))) {
        const a = /\blistRole=/.test(tag);
        const b = /\bitemRole=/.test(tag);
        if (a !== b) half.push(`src/${rel}`);
      }
    }
    expect(half).toEqual([]);
  });
});
