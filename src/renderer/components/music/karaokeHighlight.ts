/**
 * Word-timed karaoke over a TOKENISED lyric line (known-word colouring, furigana).
 *
 * The tokenised line is `SubtitleCueLine`'s DOM — ruby, per-token spans — so LRC word
 * boundaries cannot be cut into it as elements. The CSS Custom Highlight API paints a
 * Range instead, without touching React's nodes: everything after the sung characters
 * is registered as `::highlight(music-karaoke-ahead)` and drawn dimmer, so the line
 * fills in word by word and keeps its known-word marks and readings throughout.
 *
 * Characters are counted without whitespace and without `<rt>`/`<rp>` text, so the
 * count taken from the LRC words lines up with the rendered base text.
 */
import { useLayoutEffect, type RefObject } from 'react';

export const KARAOKE_AHEAD_HIGHLIGHT = 'music-karaoke-ahead';

interface HighlightRegistry {
  set(name: string, value: unknown): void;
  delete(name: string): void;
}

function registry(): { highlights: HighlightRegistry; Highlight: new (...ranges: Range[]) => unknown } | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Highlight = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  return css?.highlights && Highlight ? { highlights: css.highlights, Highlight } : null;
}

/** Whether this renderer can paint per-word karaoke over a tokenised line. */
export function karaokeHighlightSupported(): boolean {
  return registry() !== null;
}

/** Characters of `text` that count: everything but whitespace. */
export function karaokeCharCount(text: string): number {
  return text.replace(/\s+/g, '').length;
}

/**
 * The Range covering everything in `root` after the first `sungChars` counted
 * characters, or null when nothing is left unsung.
 */
export function karaokeAheadRange(root: Element, sungChars: number): Range | null {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    // Furigana is not part of the line's text; it is painted with its base below.
    acceptNode: (node) => (node.parentElement?.closest('rt, rp') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let seen = 0;
  let last: Text | null = null;
  let start: { node: Text; offset: number } | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    last = node;
    if (start) continue;
    const text = node.data;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      if (seen === sungChars) {
        start = { node, offset: i };
        break;
      }
      seen += 1;
    }
  }
  if (!start || !last) return null;
  const range = doc.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(root, root.childNodes.length);
  return range;
}

const contributions = new Map<symbol, Range>();

function publish(): void {
  const reg = registry();
  if (!reg) return;
  if (contributions.size === 0) reg.highlights.delete(KARAOKE_AHEAD_HIGHLIGHT);
  else reg.highlights.set(KARAOKE_AHEAD_HIGHLIGHT, new reg.Highlight(...contributions.values()));
}

/**
 * Paint everything in `ref` after `sungChars` characters as "still to come". `null`
 * clears it. Re-measured after every render, since the tokenised line is lazy and
 * may swap its fallback text for tokens at any time.
 */
export function useKaraokeAhead(ref: RefObject<Element | null>, sungChars: number | null): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sungChars === null || !registry()) return undefined;
    const key = Symbol('karaoke');
    const range = karaokeAheadRange(el, sungChars);
    if (range) contributions.set(key, range);
    publish();
    return () => {
      contributions.delete(key);
      publish();
    };
  });
}
