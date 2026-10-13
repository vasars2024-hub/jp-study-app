/**
 * Character anchors for the novel reader's saved position.
 *
 * The reader used to persist `p:<part>:<fraction>` where the fraction was a
 * *geometric* one: how far through the part's laid-out extent (or its page
 * grid) the viewport was. Change the font size, line height, margins or the
 * window and the same fraction lands on different text (scorecard: "position
 * is saved as chapter plus scroll fraction ... so it drifts when the font
 * changes"). Here the fraction means "this far through the part's characters":
 * the first readable character at the viewport's reading start is located, its
 * index among the part's characters is stored, and on restore that character
 * is found again and brought to the reading start, whatever the layout now is.
 *
 * The stored string keeps its `p:<part>:<fraction>` shape, so older saves (a
 * geometric fraction, which is close to a character fraction) still restore to
 * about the right place and nothing downstream has to change.
 *
 * Geometry is injected (`CharDistance`) so the search is testable without a
 * layout engine.
 */

/** Text that is not part of the running text: furigana and inserted translations. */
const SKIP_SELECTOR = 'rt, rp, .novel-translation-block';

export interface CharPos {
  node: Text;
  offset: number;
  /** UTF-16 code units this character spans (2 for a surrogate pair). */
  length: number;
}

function isSpace(code: number): boolean {
  return (
    code === 0x20 ||
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0d ||
    code === 0x0c ||
    code === 0xa0 ||
    code === 0x3000 ||
    code === 0x200b
  );
}

/**
 * Every non-space character of `root`'s running text, in document order. Ruby
 * readings and translation blocks are skipped, so hiding furigana or switching
 * the translation mode does not move an anchor.
 */
export function anchorChars(root: Element): CharPos[] {
  const out: CharPos[] = [];
  const doc = root.ownerDocument;
  if (!doc) return out;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    const skip = text.parentElement?.closest(SKIP_SELECTOR);
    if (skip && root.contains(skip)) continue;
    const data = text.data;
    for (let i = 0; i < data.length; i++) {
      const code = data.charCodeAt(i);
      if (isSpace(code)) continue;
      const pair = code >= 0xd800 && code <= 0xdbff && i + 1 < data.length;
      out.push({ node: text, offset: i, length: pair ? 2 : 1 });
      if (pair) i++;
    }
  }
  return out;
}

/**
 * Distance of a character's leading edge from the start of the scroll space,
 * along the reading axis, or null when it has no box (collapsed, hidden).
 * Must be non-decreasing in document order for the binary search to hold.
 */
export type CharDistance = (pos: CharPos) => number | null;

/**
 * A character this far before the reading start still counts as on screen
 * (sub-pixel rounding on the page grid). Kept well under one line advance so
 * a save never re-anchors on the line before the one shown.
 */
export const ANCHOR_SLACK_PX = 2;

/**
 * Scroll modes: how far inside the reading start a restored character is
 * placed — half an em, so the ruby drawn beside/above its line is not clipped.
 * Smaller than any line advance (line-height >= 1em), so saving again at once
 * picks the same line.
 */
export function readingStartPadPx(fontSizePx: number): number {
  return Number.isFinite(fontSizePx) && fontSizePx > 0 ? Math.round(fontSizePx * 0.5) : 8;
}

/** How far past an unmeasurable character the search looks for a measurable one. */
const MEASURE_SCAN = 16;

function measureFrom(
  chars: readonly CharPos[],
  distance: CharDistance,
  from: number,
  limit: number,
): { index: number; d: number } | null {
  const end = Math.min(limit, from + MEASURE_SCAN);
  for (let i = from; i < end; i++) {
    const d = distance(chars[i]);
    if (d !== null && Number.isFinite(d)) return { index: i, d };
  }
  return null;
}

/**
 * Index of the first character whose distance is at least `target`
 * (`chars.length` when every character is before it).
 */
export function firstCharAtOrAfter(
  chars: readonly CharPos[],
  distance: CharDistance,
  target: number,
): number {
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const m = measureFrom(chars, distance, mid, hi);
    if (!m || m.d >= target) hi = mid;
    else lo = m.index + 1;
  }
  return lo;
}

/** The character fraction (0..1) of the first character at or after `target`, or null for no text. */
export function charFractionAt(root: Element, distance: CharDistance, target: number): number | null {
  const chars = anchorChars(root);
  if (!chars.length) return null;
  const index = firstCharAtOrAfter(chars, distance, target);
  if (index >= chars.length) return 1;
  // Landed in text with no boxes (or no layout at all): no anchor, the caller
  // keeps its geometric fraction rather than storing a guess.
  if (!measureFrom(chars, distance, index, chars.length)) return null;
  return index / chars.length;
}

/**
 * The distance of the character a stored fraction names, or null when the
 * part has no measurable text (the caller falls back to the geometric fraction).
 */
export function distanceOfCharFraction(
  root: Element,
  distance: CharDistance,
  fraction: number,
): number | null {
  const chars = anchorChars(root);
  if (!chars.length || !Number.isFinite(fraction)) return null;
  const index = Math.min(chars.length - 1, Math.max(0, Math.round(fraction * chars.length)));
  return measureFrom(chars, distance, index, chars.length)?.d ?? null;
}

/**
 * The page (0-based) a distance falls on, for a page grid of `step` px.
 * A small tolerance keeps a line that starts a hair before the boundary on
 * the page it is drawn on.
 */
export function pageOfDistance(d: number, step: number, pages: number): number {
  if (!(step > 0) || pages <= 1) return 0;
  return Math.min(pages - 1, Math.max(0, Math.floor((d + 2) / step)));
}

/**
 * A `CharDistance` over live layout: the character's leading edge relative to
 * the scroller's reading start, plus the scroller's current offset, so the
 * value does not depend on how far the reader is scrolled. Vertical text reads
 * from the right edge; horizontal scroll from the top; horizontal pages
 * (columns) from the left.
 */
export function liveCharDistance(
  scroller: HTMLElement,
  mode: 'vertical' | 'horizontal-scroll' | 'horizontal-paged',
  offsetPx: number,
): CharDistance {
  const view = scroller.getBoundingClientRect();
  const range = scroller.ownerDocument.createRange();
  // No layout engine (jsdom): no character geometry, so callers fall back.
  if (typeof range.getBoundingClientRect !== 'function') return () => null;
  return (pos) => {
    try {
      range.setStart(pos.node, pos.offset);
      range.setEnd(pos.node, pos.offset + pos.length);
    } catch {
      return null;
    }
    const r = range.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const rel =
      mode === 'vertical' ? view.right - r.right : mode === 'horizontal-scroll' ? r.top - view.top : r.left - view.left;
    return offsetPx + rel;
  };
}
