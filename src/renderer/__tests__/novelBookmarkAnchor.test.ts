// @vitest-environment jsdom
/**
 * Novel-reader bookmarks are character anchors (novelTextAnchor.ts), the same
 * as the saved position: a mark taken at one font size and window size lands
 * on the page holding the same character at another. Older marks stored a
 * geometric page fraction; they are rewritten as character marks once
 * resolved (`replaceBookmark`). Geometry is faked as in novelTextAnchor.test.ts:
 * a layout is "characters per line" and "px per line", as a reflow produces.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  anchorChars,
  charFractionAt,
  charFractionOfElementId,
  distanceOfCharFraction,
  pageOfDistance,
  type CharDistance,
  type CharPos,
} from '../novelTextAnchor';
import { addBookmark, loadBookmarks, replaceBookmark, type Bookmark } from '../bookmarks';

function part(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

function lineLayout(root: Element, perLine: number, advance: number): CharDistance {
  const chars = anchorChars(root);
  const index = new Map<CharPos['node'], Map<number, number>>();
  chars.forEach((c, i) => {
    if (!index.has(c.node)) index.set(c.node, new Map());
    index.get(c.node)!.set(c.offset, i);
  });
  return (pos) => {
    const i = index.get(pos.node)?.get(pos.offset);
    return i === undefined ? null : Math.floor(i / perLine) * advance;
  };
}

/** A paged layout: `perLine` chars per line, `linesPerPage` lines per page. */
function pagedLayout(root: Element, perLine: number, linePx: number, linesPerPage: number) {
  const distance = lineLayout(root, perLine, linePx);
  const step = linePx * linesPerPage;
  const lines = Math.ceil(anchorChars(root).length / perLine);
  const pages = Math.max(1, Math.ceil(lines / linesPerPage));
  return { distance, step, pages };
}

/** The bookmark the reader takes on `page`: the first character at that page's start. */
function bookmarkOnPage(root: Element, layout: ReturnType<typeof pagedLayout>, page: number): number {
  const frac = charFractionAt(root, layout.distance, page * layout.step - 2);
  expect(frac).not.toBeNull();
  return frac!;
}

/** Where the reader lands for a stored character fraction. */
function landingPage(root: Element, layout: ReturnType<typeof pagedLayout>, frac: number): number {
  const d = distanceOfCharFraction(root, layout.distance, frac);
  expect(d).not.toBeNull();
  return pageOfDistance(d!, layout.step, layout.pages);
}

function charIndexOnPage(root: Element, layout: ReturnType<typeof pagedLayout>, page: number): [number, number] {
  const chars = anchorChars(root);
  const first = Math.round(charFractionAt(root, layout.distance, page * layout.step - 2)! * chars.length);
  const next = page + 1 < layout.pages
    ? Math.round(charFractionAt(root, layout.distance, (page + 1) * layout.step - 2)! * chars.length)
    : chars.length;
  return [first, next];
}

const BOOK = Array.from({ length: 300 }, (_, i) => `<p>第${i}段落。吾輩は猫である。名前はまだ無い。<ruby>何処<rt>どこ</rt></ruby>で生れたかとんと見当がつかぬ。</p>`).join('');

describe('character-anchored bookmarks', () => {
  it('a mark lands on the page holding the same character after a font-size change', () => {
    const root = part(BOOK);
    const small = pagedLayout(root, 40, 20, 20); // small font: 40 chars per line
    const large = pagedLayout(root, 20, 32, 14); // large font: fewer chars per line, fewer lines
    const total = anchorChars(root).length;
    for (const page of [1, 2, Math.floor(small.pages / 2), small.pages - 1]) {
      const frac = bookmarkOnPage(root, small, page);
      const anchored = Math.round(frac * total);
      const landed = landingPage(root, large, frac);
      const [first, next] = charIndexOnPage(root, large, landed);
      expect(anchored).toBeGreaterThanOrEqual(first);
      expect(anchored).toBeLessThan(next);
    }
  });

  it('a mark lands on the same character after a window-size change, and back again', () => {
    const root = part(BOOK);
    const wide = pagedLayout(root, 60, 24, 24);
    const narrow = pagedLayout(root, 25, 24, 30);
    const total = anchorChars(root).length;
    const frac = bookmarkOnPage(root, wide, 3);
    const anchored = Math.round(frac * total);
    const onNarrow = landingPage(root, narrow, frac);
    const [first, next] = charIndexOnPage(root, narrow, onNarrow);
    expect(anchored).toBeGreaterThanOrEqual(first);
    expect(anchored).toBeLessThan(next);
    // Back to the first layout: exactly the page the mark was taken on.
    expect(landingPage(root, wide, frac)).toBe(3);
  });

  it('a TOC entry pointing at a heading inside a part lands on its first character', () => {
    const root = part('<p>前書きの文章。</p><h2 id="ch2">第二章</h2><p>本文。</p>');
    const frac = charFractionOfElementId(root, 'ch2');
    const chars = anchorChars(root);
    expect(frac).not.toBeNull();
    const at = Math.round(frac! * chars.length);
    expect(chars[at].node.data[chars[at].offset]).toBe('第');
    expect(charFractionOfElementId(root, 'missing')).toBeNull();
  });
});

describe('bookmark storage', () => {
  beforeEach(() => localStorage.clear());

  it('stores a character mark and rewrites an older geometric mark in place of the old one', () => {
    const old: Bookmark = { cfi: 'p:2:0.5000', label: 'old name', percent: 0.4, createdAt: 1 };
    const other: Bookmark = { cfi: 'p:0:0.100000', anchor: 'char', label: 'a', percent: 0.05, createdAt: 2 };
    addBookmark('book', old);
    addBookmark('book', other);
    const resolved: Bookmark = { cfi: 'p:2:0.481234', anchor: 'char', label: 'old name', percent: 0.39, createdAt: 1 };
    const list = replaceBookmark('book', old.cfi, resolved);
    expect(list.map((b) => b.cfi)).toEqual(['p:0:0.100000', 'p:2:0.481234']);
    expect(loadBookmarks('book')).toEqual(list);
    expect(loadBookmarks('book')[1]).toMatchObject({ anchor: 'char', label: 'old name', createdAt: 1 });
  });

  it('replacing onto an existing mark keeps one copy, and a missing mark is a no-op', () => {
    const a: Bookmark = { cfi: 'p:1:0.2000', label: 'a', percent: 0.2, createdAt: 1 };
    const b: Bookmark = { cfi: 'p:1:0.200000', anchor: 'char', label: 'b', percent: 0.2, createdAt: 2 };
    addBookmark('book', a);
    addBookmark('book', b);
    expect(replaceBookmark('book', a.cfi, { ...b })).toHaveLength(1);
    expect(replaceBookmark('book', 'p:9:0.1', { ...b, cfi: 'p:9:0.2' })).toHaveLength(1);
  });
});

describe('liveCharDistance under a UI zoom', () => {
  it('converts zoomed client rects back to layout px, so a page-2 character stays on page 2', async () => {
    const { liveCharDistance } = await import('../novelTextAnchor');
    const scroller = part('<p>猫</p>');
    // Layout: 1000 px wide pages. The shell zooms the app to 80 %, so client rects are 0.8×.
    Object.defineProperty(scroller, 'offsetWidth', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'offsetHeight', { configurable: true, value: 600 });
    scroller.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 480, width: 800, height: 480, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const proto = Range.prototype as unknown as { getBoundingClientRect?: () => DOMRect };
    const had = proto.getBoundingClientRect;
    // The character sits 1100 layout px in (page 2 of 1000 px pages): 880 visual px.
    proto.getBoundingClientRect = () => ({ left: 880, top: 10, right: 890, bottom: 20, width: 10, height: 10, x: 880, y: 10, toJSON: () => ({}) }) as DOMRect;
    try {
      const distance = liveCharDistance(scroller, 'horizontal-paged', 0);
      const d = distance(anchorChars(scroller)[0]);
      expect(d).toBeCloseTo(1100, 5);
      expect(pageOfDistance(d!, 1000, 3)).toBe(1);
    } finally {
      if (had) proto.getBoundingClientRect = had;
      else delete proto.getBoundingClientRect;
    }
  });
});
