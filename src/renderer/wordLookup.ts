// Click-to-lookup: resolve a single word/expression under the pointer (using
// kuromoji when available), highlight it in the text, and return popup coords.

import { tokenizeSync, tokenizerReady, type JpToken } from './tokenizer';
import { detectSentenceBounds, sentenceAt } from '../shared/sentenceBounds';

export interface WordLookupHit {
  /** Surface form shown in the popup title. */
  query: string;
  x: number;
  y: number;
  /** Sentence the word came from — for Anki context. */
  context?: string;
  /** Long intentional selection → open sentence translator instead. */
  translate?: boolean;
}

const BLOCK_SEL =
  'p, li, blockquote, h1, h2, h3, h4, .immersion-reader, .music-line, .media-subtitle, .media-subtrans, .ocr-text, [data-lookup-block]';
const CLICK_MAX_PX = 8;
const MARK_CLASS = 'lookup-mark';
const ACTIVE_CLASS = 'lookup-active';

let downX = 0;
let downY = 0;

export function noteLookupPointerDown(e: { clientX: number; clientY: number }): void {
  downX = e.clientX;
  downY = e.clientY;
}

export function isLookupClick(e: { clientX: number; clientY: number }): boolean {
  const dx = e.clientX - downX;
  const dy = e.clientY - downY;
  return dx * dx + dy * dy <= CLICK_MAX_PX * CLICK_MAX_PX;
}

/** Remove click-to-lookup styling (called only when a different word is chosen). */
export function clearLookupHighlight(doc: Document = document): void {
  doc.querySelectorAll(`.${ACTIVE_CLASS}`).forEach((el) => el.classList.remove(ACTIVE_CLASS));
  doc.querySelectorAll(`mark.${MARK_CLASS}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
  doc.defaultView?.getSelection()?.removeAllRanges();
}

function nearestBlock(node: Node): Element | null {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  return el?.closest(BLOCK_SEL) ?? el;
}

function sentenceAround(block: Element | null, needle: string): string {
  const text = (block?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!text || !needle) return text.slice(0, 140);
  const at = text.indexOf(needle);
  if (at === -1) return text.slice(0, 140);
  return sentenceAt(text, at, 160);
}

/**
 * DOM Range for the sentence under `offset` in a block's textContent.
 * Prefer this for highlight / collection; keep sentenceAround for Anki context strings.
 */
export function detectSentenceRange(block: Element, globalOffset: number): Range | null {
  const text = block.textContent ?? '';
  if (!text) return null;
  const { start, end } = detectSentenceBounds(text, globalOffset);
  if (end <= start) return null;
  return domRangeForSpan(block, start, end);
}

function isLikelySentence(text: string): boolean {
  const t = text.trim();
  if (t.length >= 14) return true;
  if (/[。．、，！？!?「」『』]/.test(t)) return true;
  if (/\s/.test(t) && t.length >= 8) return true;
  if (tokenizerReady() && /[぀-ヿ㐀-鿿]/.test(t)) {
    const toks = tokenizeSync(t).filter((tk) => tk.content || tk.surface.length > 1);
    if (toks.length > 2) return true;
  }
  return false;
}

function charOffsetInBlock(block: Element, target: Text, offsetInNode: number): number {
  const doc = block.ownerDocument;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let n = walker.nextNode();
  while (n) {
    if (n === target) return acc + offsetInNode;
    acc += (n.textContent ?? '').length;
    n = walker.nextNode();
  }
  return acc + offsetInNode;
}

function domRangeForSpan(block: Element, start: number, end: number): Range | null {
  const doc = block.ownerDocument;
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;
  let n = walker.nextNode() as Text | null;
  while (n) {
    const len = (n.textContent ?? '').length;
    if (!startNode && pos + len > start) {
      startNode = n;
      startOff = Math.max(0, start - pos);
    }
    if (pos + len >= end) {
      endNode = n;
      endOff = Math.max(0, end - pos);
      break;
    }
    pos += len;
    n = walker.nextNode() as Text | null;
  }
  if (!startNode || !endNode) return null;
  const range = doc.createRange();
  range.setStart(startNode, startOff);
  range.setEnd(endNode, endOff);
  return range;
}

function wkSpansInRange(range: Range, block: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  block.querySelectorAll<HTMLElement>('span.wk').forEach((wk) => {
    try {
      if (range.intersectsNode(wk)) out.push(wk);
    } catch {
      /* ignore */
    }
  });
  return out;
}

function applyLookupHighlight(range: Range, block: Element, doc: Document): DOMRect | null {
  clearLookupHighlight(doc);
  const wks = wkSpansInRange(range, block);
  if (wks.length) {
    wks.forEach((wk) => wk.classList.add(ACTIVE_CLASS));
    const rect = wks[0].getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
  }
  const mark = doc.createElement('mark');
  mark.className = MARK_CLASS;
  try {
    range.surroundContents(mark);
  } catch {
    const frag = range.extractContents();
    mark.appendChild(frag);
    range.insertNode(mark);
  }
  const rect = mark.getBoundingClientRect();
  return rect.width || rect.height ? rect : null;
}

function expandExpression(tokens: JpToken[], idx: number): [number, number] {
  let start = idx;
  let end = idx + 1;
  if (idx >= 2 && tokens[idx - 1].surface === 'の' && tokens[idx - 2].content) start = idx - 2;
  if (end + 1 < tokens.length && tokens[end].surface === 'の' && tokens[end + 1].content) end += 2;
  return [start, end];
}

function tokenSpanAt(block: Element, globalOffset: number): { start: number; end: number; query: string } | null {
  const text = (block.textContent ?? '').replace(/\r/g, '');
  if (!text) return null;

  if (tokenizerReady() && /[぀-ヿ㐀-鿿]/.test(text)) {
    const tokens = tokenizeSync(text);
    let pos = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      const tkEnd = pos + tk.surface.length;
      if (globalOffset >= pos && globalOffset < tkEnd) {
        let idx = i;
        if (!tk.content) {
          const next = tokens.findIndex((t, j) => j >= i && t.content);
          if (next >= 0) idx = next;
        }
        const [s, e] = expandExpression(tokens, idx);
        const start = tokens.slice(0, s).reduce((a, t) => a + t.surface.length, 0);
        const end = tokens.slice(0, e).reduce((a, t) => a + t.surface.length, 0);
        const query = tokens
          .slice(s, e)
          .map((t) => t.surface)
          .join('');
        if (query) return { start, end, query };
      }
      pos = tkEnd;
    }
  }

  return cjkSpanAt(text, globalOffset);
}

function cjkSpanAt(text: string, offset: number): { start: number; end: number; query: string } | null {
  const clamp = Math.min(Math.max(offset, 0), Math.max(0, text.length - 1));
  const isWord = (c: string) => /[぀-ヿ㐀-鿿々A-Za-z0-9]/.test(c);
  let start = clamp;
  while (start > 0 && isWord(text[start - 1])) start--;
  let end = clamp + 1;
  while (end < text.length && isWord(text[end])) end++;
  if (start >= end) return null;
  const query = text.slice(start, end).trim();
  return query ? { start, end, query } : null;
}

function hitFromSpan(
  block: Element,
  span: { start: number; end: number; query: string },
  doc: Document,
  fallbackX: number,
  fallbackY: number,
): WordLookupHit | null {
  const range = domRangeForSpan(block, span.start, span.end);
  const rect = range ? applyLookupHighlight(range, block, doc) : null;
  return {
    query: span.query.slice(0, 40),
    x: rect?.left ?? fallbackX,
    y: rect ? rect.bottom : fallbackY + 14,
    context: sentenceAround(block, span.query.slice(0, 8)),
  };
}

function lookupWkSpan(wk: HTMLElement): WordLookupHit | null {
  // Prefer surface form for popup title + annotation matching; lemma is resolved
  // separately by the dictionary UI for grading.
  const surface = wk.textContent?.trim() || '';
  const query = surface || wk.getAttribute('data-lemma') || '';
  if (!query) return null;
  const doc = wk.ownerDocument;
  clearLookupHighlight(doc);
  wk.classList.add(ACTIVE_CLASS);
  const rect = wk.getBoundingClientRect();
  const block = nearestBlock(wk);
  return {
    query: query.slice(0, 40),
    x: rect.left,
    y: rect.bottom,
    context: sentenceAround(block, surface || query),
  };
}

/** Resolve one word/expression at viewport coordinates and highlight it. */
export function lookupWordAtPoint(clientX: number, clientY: number, doc: Document = document): WordLookupHit | null {
  const el = doc.elementFromPoint(clientX, clientY);
  const wk = el?.closest?.('span.wk') as HTMLElement | null;
  if (wk) return lookupWkSpan(wk);

  const caret =
    doc.caretRangeFromPoint?.(clientX, clientY) ??
    (doc as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } })
      .caretPositionFromPoint?.(clientX, clientY);
  let node: Node | null = null;
  let offset = 0;
  if (caret && 'startContainer' in caret) {
    node = caret.startContainer;
    offset = caret.startOffset;
  } else if (caret && 'offsetNode' in caret) {
    node = caret.offsetNode;
    offset = caret.offset;
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;

  const textNode = node as Text;
  const block = nearestBlock(textNode);
  if (!block) return null;

  const globalOffset = charOffsetInBlock(block, textNode, offset);
  const span = tokenSpanAt(block, globalOffset);
  if (!span) return null;
  return hitFromSpan(block, span, doc, clientX, clientY);
}

function selectionHit(text: string, rect: DOMRect, block: Element | null): WordLookupHit {
  if (isLikelySentence(text)) {
    return { query: text.slice(0, 240), x: rect.left, y: rect.bottom, translate: true };
  }
  return {
    query: text.slice(0, 40),
    x: rect.left,
    y: rect.bottom,
    context: sentenceAround(block, text.slice(0, 8)),
  };
}

/** Use on mouseUp after noteLookupPointerDown on the same surface. */
export function lookupWordFromMouseUp(
  e: { clientX: number; clientY: number },
  doc: Document = document,
): WordLookupHit | null {
  const sel = doc.defaultView?.getSelection();
  const selected = sel?.toString().trim() ?? '';

  if (!isLookupClick(e) && selected && sel && sel.rangeCount > 0) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const block = nearestBlock(sel.anchorNode ?? doc.body);
    return selectionHit(selected, rect, block);
  }

  sel?.removeAllRanges();
  return lookupWordAtPoint(e.clientX, e.clientY, doc);
}

/** Epub / iframe: refine a browser selection down to one word when possible. */
export function lookupWordFromSelection(win: Window): WordLookupHit | null {
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const selected = sel.toString().trim();
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const doc = win.document;
  const block = nearestBlock(range.startContainer);

  if (selected && isLikelySentence(selected)) {
    return { query: selected.slice(0, 240), x: rect.left, y: rect.bottom, translate: true };
  }

  if (selected && selected.length <= 12 && !isLikelySentence(selected)) {
    if (block) applyLookupHighlight(range, block, doc);
    return {
      query: selected.slice(0, 40),
      x: rect.left,
      y: rect.bottom,
      context: sentenceAround(block, selected.slice(0, 8)),
    };
  }

  sel.removeAllRanges();
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !block) return null;
  const globalOffset = charOffsetInBlock(block, node as Text, range.startOffset);
  const span = tokenSpanAt(block, globalOffset);
  if (!span) return null;
  return hitFromSpan(block, span, doc, rect.left, rect.top);
}
