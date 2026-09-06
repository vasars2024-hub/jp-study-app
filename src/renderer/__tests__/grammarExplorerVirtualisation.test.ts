/**
 * The Grammar explorer's catalogue is windowed by `VirtualList`, and until
 * 2026-08-25 that windowing was present and INERT.
 *
 * Measured live that day, Grammar in an 820x580 window with no filter:
 * **2,410 `.gram-x-row` elements and 19,352 DOM nodes**, `.gram-view` 139,966 px
 * tall inside a 545 px `.fwin-body`. The cause is not `VirtualList` — it is that
 * a windowed list can only window what it can MEASURE. `.gram-view` was a plain
 * block, so `.gram-x` grew to its own content, `useElementSize` reported the full
 * content height as the viewport, and `visibleCount` covered the whole corpus.
 * After the fix: **18 rows and 216 nodes**, `.gram-view` 513 px. The same runtime
 * negative control both ways — setting `.gram-view { height: auto; display: block }`
 * live reproduced 2,410/19,352 exactly, and removing it returned 18/216.
 *
 * Layout is not testable in jsdom, so this guard holds the three source facts the
 * fix consists of. Each one alone silently restores the defect:
 *   1. the bounding rules exist on `gram-view--explorer`;
 *   2. `GrammarView` actually emits that class, and only for explorer mode;
 *   3. `.gram-x-list` is a flex column whose child is told to fill it — without
 *      this the `overflow-y: auto` container `VirtualList` renders grows to its
 *      own content and defeats the bound one level lower.
 * Plus `scrollToIndex`, which only became load-bearing once the list really
 * windows: the focused row can now be outside the rendered range.
 *
 * TRAP (banked, this repo): read CSS with line endings normalised. Fresh
 * worktrees check out CRLF and the shared tree is LF, so a raw-substring guard
 * passes only where it was written.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string =>
  readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n?/g, '\n');

const css = read('styles.css');
const grammarView = read('views/GrammarView.tsx');
const explorer = read('components/grammar/GrammarExplorer.tsx');

/** The declaration block for a selector, as a flat `prop: value` list. */
function block(source: string, selector: string): string[] {
  const start = source.indexOf(`\n${selector} {`);
  expect(start, `selector ${selector} is not in styles.css`).toBeGreaterThan(-1);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source
    .slice(open + 1, close)
    .split(';')
    .map((d) => d.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

describe('grammar explorer virtualisation', () => {
  it('bounds the explorer view to its host so the list has a real viewport', () => {
    const decls = block(css, '.gram-view--explorer');
    expect(decls).toContain('display: flex');
    expect(decls).toContain('flex-direction: column');
    expect(decls).toContain('height: 100%');
  });

  it('every mode that windows the corpus gets the bounding class', () => {
    // Both modes that mount a `VirtualList` over the 2,410-point corpus, and only
    // those. Guides and Review render prose and a small due-set, so bounding them
    // would clip rather than window.
    //
    // `practice` was missing here until 2026-09-06 and the defect this whole file
    // guards was still live one tab over: `.gx-practice-virtual` measured 125,322 px
    // with `clientHeight === scrollHeight`, 2,410 checkboxes, 13,544 DOM nodes.
    // Asserting only `grammar` is what let that survive, so the assertion is now on
    // the SET of bounded modes rather than on the one that was fixed first.
    expect(grammarView).toContain(
      "`gram-view${mode === 'grammar' || mode === 'practice' ? ' gram-view--explorer' : ''}`",
    );
    expect(grammarView).not.toContain('className="gram-view"');
  });

  it('the practice panel is already written to pass a bound down to its list', () => {
    // The mode class alone fixed it live, which is only true because every step
    // between the host and the scroller already forwards the bound. Any one of
    // these silently restores the defect while the class stays in place.
    expect(block(css, '.gx-practice')).toEqual(
      expect.arrayContaining(['display: flex', 'flex-direction: column', 'min-height: 0', 'height: 100%']),
    );
    expect(block(css, '.gx-practice-layout')).toEqual(
      expect.arrayContaining(['min-height: 0', 'flex: 1']),
    );
    expect(block(css, '.gx-practice-list')).toEqual(
      expect.arrayContaining(['display: flex', 'flex-direction: column', 'min-height: 0']),
    );
    expect(block(css, '.gx-practice-virtual')).toEqual(expect.arrayContaining(['flex: 1']));
  });

  it('makes the list column the scroller instead of its overflowing child', () => {
    const list = block(css, '.gram-x-list');
    expect(list).toContain('display: flex');
    expect(list).toContain('flex-direction: column');
    expect(list).toContain('overflow: hidden');
    expect(list).toContain('min-height: 0');

    // Without this the VirtualList container is `height: auto` and grows to
    // content again — the bound one level up buys nothing.
    const child = block(css, '.gram-x-list > *');
    expect(child).toContain('flex: 1 1 auto');
    expect(child).toContain('min-height: 0');
  });

  it('keeps the focused row inside the rendered window', () => {
    // Load-bearing only after the list really windows: before the fix every row
    // was in the DOM, so a selection could never fall outside it.
    expect(explorer).toContain('scrollToIndex={focusedIndex}');
    expect(explorer).toMatch(/const focusedIndex = useMemo\(/);
  });
});
