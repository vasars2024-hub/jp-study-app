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
 * Known gap, recorded rather than quietly patched: for those grids the two
 * structural wrappers `VirtualList` puts between container and slot are only
 * marked `presentation` when `listRole` is set, so the `grid`→`row` ownership
 * chain has the same break this file exists to prevent. Closing it needs a
 * `gridRole` decision, not a copy of the list one.
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
