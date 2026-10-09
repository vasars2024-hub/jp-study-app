/**
 * The reader's Collection drawer must not lie over the page it was opened from.
 *
 * Found by the headless e2e harness (tools/e2e, flow `epub`): mining a word opens the
 * Collection drawer (360px, absolutely positioned on the right). On a vertical-rl book,
 * whose first column sits at the right edge, the whole visible page went under the drawer
 * and the reader looked blank. The page now yields the strip on a wide window.
 *
 * Two traps this pins, both measured live:
 *  - the class must follow `collectionOpen` on the scroller the reader pages with;
 *  - the rule must set a WIDTH: in a vertical-rl scroller the horizontal size is the block
 *    size, and Chromium sized the absolutely positioned box from its content — `right:
 *    360px` computed and changed nothing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('reader Collection drawer layout', () => {
  it('NovelReader marks both scrollers while the Collection is open', () => {
    const src = read('views/NovelReader.tsx');
    expect(src).toContain("className={`novel-scroller${collectionOpen ? ' beside-collection' : ''}`}");
    expect(src).toContain("className={`novel-scroller novel-link-view${collectionOpen ? ' beside-collection' : ''}`}");
  });

  it('the stylesheet narrows the scroller by width, on wide windows only', () => {
    const css = read('styles.css');
    const at = css.indexOf('.novel-scroller.beside-collection');
    expect(at).toBeGreaterThan(0);
    const media = css.lastIndexOf('@media', at);
    expect(css.slice(media, at)).toMatch(/@media \(min-width: 900px\)\s*\{\s*$/);
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toMatch(/width:\s*calc\(100% - min\(360px, 94vw\)\)/);
    expect(rule).toMatch(/right:\s*auto/);
    // The drawer it makes room for is that wide.
    const drawer = css.slice(css.indexOf('.reader-collection {'));
    expect(drawer.slice(0, drawer.indexOf('}'))).toContain('width: min(360px, 94vw)');
  });
});
