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
        // The renderItem arrow lives inside the opening tag's braces, so a row
        // role written in the row's own JSX is visible here.
        if (OWN_ROW_ROLE.test(tag)) continue;
        mute.push(`src/${rel}`);
      }
    }
    // Named, not counted: the message has to say which list went mute.
    expect(mute).toEqual([]);
  });

  it('gives every windowed GRID a rowgroup, so its rows are not orphaned', () => {
    // A `row` must be owned by a table/grid/treegrid/rowgroup. Between the
    // caller's `role="table"` and its row sat four generic divs — its own
    // `.scr-tbody`, the scroll container, the spacer and the offset box — so
    // the table exposed no rows at all. `gridRole` is what re-parents them.
    const orphaned: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      for (const tag of virtualListTags(readFileSync(file, 'utf8'))) {
        if (/\blistRole=/.test(tag)) continue;
        if (!OWN_ROW_ROLE.test(tag)) continue;
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
        (tag) => !/\blistRole=/.test(tag) && OWN_ROW_ROLE.test(tag),
      );
      if (grids.length === 0) continue;
      // Per file rather than per tag: the count sits on the table element, which
      // is outside the `<VirtualList` tag this sweep can see.
      const counts = (source.match(/aria-rowcount=/g) ?? []).length;
      const indexes = (source.match(/aria-rowindex=/g) ?? []).length;
      if (counts < grids.length) silent.push(`src/${rel} (aria-rowcount ${counts} < ${grids.length} grids)`);
      // At least the windowed body row, per grid. Not two: `DeckWorkbenchBrowser`
      // keeps its column header OUTSIDE `role="grid"`, so it legitimately has no
      // header row to index and its rows start at 1 rather than 2.
      if (indexes < grids.length) silent.push(`src/${rel} (aria-rowindex ${indexes} < ${grids.length})`);
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
