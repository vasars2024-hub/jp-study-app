// Click-to-lookup: resolve a single word/expression under the pointer (using
// kuromoji when available), highlight it in the text, and return popup coords.

import { tokenizeSync, tokenizerReady, type JpToken } from './tokenizer';
import { detectSentenceBounds, isSentencePunct, sentenceAt } from '../shared/sentenceBounds';
import { segmentStudyText, studyWords } from '../shared/studySegmentation';
import { getChineseScript, getStudyLang } from './studyEnvironment';

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
/** Reject caretRangeFromPoint hits that snap to text far from the pointer (common in EPUB margins). */
const LOOKUP_PROXIMITY_PX = 24;
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

function distanceToRect(x: number, y: number, r: DOMRectReadOnly): number {
  const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
  const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
  return Math.hypot(dx, dy);
}

function pointNearRange(x: number, y: number, range: Range, maxPx = LOOKUP_PROXIMITY_PX): boolean {
  const rects = range.getClientRects();
  if (rects.length > 0) {
    for (let i = 0; i < rects.length; i++) {
      if (distanceToRect(x, y, rects[i]!) <= maxPx) return true;
    }
    return false;
  }
  const box = range.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return false;
  return distanceToRect(x, y, box) <= maxPx;
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

/**
 * A block's words as written. A subtitle line that draws pinyin ruby or Russian
 * stress accents says what it actually reads in `data-lookup-text`; its
 * `textContent` would carry the readings too.
 */
function blockText(block: Element | null): string {
  return block?.closest('[data-lookup-text]')?.getAttribute('data-lookup-text') ?? block?.textContent ?? '';
}

function sentenceAround(block: Element | null, needle: string): string {
  return sentenceAroundText(blockText(block), needle);
}

/** `sentenceAround` for callers that have the block text but not the block. */
function sentenceAroundText(raw: string, needle: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
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
  const lang = lookupLangForText(t);
  if (lang === 'ja' && tokenizerReady()) {
    const toks = tokenizeSync(t).filter((tk) => tk.content || tk.surface.length > 1);
    if (toks.length > 2) return true;
  } else if (lang !== 'ja' && studyWords(t, lang).length > 2) {
    return true;
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

// Re-tokenizing the whole block synchronously on every click is the main cost
// of click-to-lookup; cache per block so repeat clicks (and clicks racing the
// async word-highlight pass) don't redo it while the text hasn't changed.
const tokenCache = new WeakMap<Element, { text: string; tokens: JpToken[] }>();

// Common particles/auxiliaries/copulas — excluded from the kana-fragment glue
// below even though they're pure hiragana, so gluing a fragmented unknown
// word never eats into a real grammatical particle beside it.
const PARTICLE_LIKE = new Set([
  'を', 'が', 'は', 'に', 'で', 'と', 'も', 'の', 'へ', 'や', 'から', 'まで', 'より', 'ながら',
  'たり', 'し', 'て', 'で', 'た', 'ます', 'です', 'ない', 'ん', 'ね', 'よ', 'か', 'わ', 'ぞ', 'ぜ',
  'な', 'ば', 'けど', 'けれど', 'ので', 'のに', 'こそ', 'さえ', 'すら', 'でも', 'しか', 'だけ', 'ほど',
  'くらい', 'ぐらい', 'など', 'よう', 'まし', 'たら', 'たい', 'せ', 'させ', 'られ', 'れ', 'ろ',
]);

/**
 * An auxiliary (ござい, まし, られ…) is grammar attached to a word, never a
 * fragment of one: gluing it turned a click on おはよう in おはようございます
 * into the lookup "おはようござい", a span no dictionary has.
 */
function isGluableKanaFragment(t: JpToken): boolean {
  return t.surface.length > 0 && t.pos !== '助動詞' && /^[ぁ-ゖー]+$/.test(t.surface) && !PARTICLE_LIKE.has(t.surface);
}

function tokenSpanAt(block: Element, globalOffset: number): { start: number; end: number; query: string } | null {
  const text = (block.textContent ?? '').replace(/\r/g, '');
  if (!text) return null;

  let tokens: JpToken[] | undefined;
  if (tokenizerReady() && lookupLangForText(text) === 'ja') {
    const cached = tokenCache.get(block);
    tokens = cached && cached.text === text ? cached.tokens : tokenizeSync(text);
    if (!cached || cached.text !== text) tokenCache.set(block, { text, tokens });
  }
  return resolveWordSpanInText(text, globalOffset, tokens);
}

/**
 * Which language's word rules a clicked text follows. Kana is Japanese and
 * Cyrillic Russian by the script alone; Han with no kana is Chinese when
 * Chinese is studied (kuromoji would split 公园 as Japanese), Japanese
 * otherwise. Latin and the rest use the study language's segmenter.
 */
export function lookupLangForText(text: string): string {
  const study = getStudyLang();
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja';
  if (/\p{Script=Cyrillic}/u.test(text)) return 'ru';
  if (/\p{Script=Han}/u.test(text)) {
    if (study !== 'zh') return 'ja';
    return getChineseScript() === 'traditional' ? 'zh-Hant' : 'zh-Hans';
  }
  return study === 'zh' ? 'zh-Hans' : study;
}

/** The word segment (ICU) at `offset`, for Chinese, Russian and other non-Japanese text. */
function segmentSpanAt(text: string, offset: number, lang: string): { start: number; end: number; query: string } | null {
  const parts = segmentStudyText(text, lang);
  const at = parts.find((part) => offset >= part.start && offset < part.end);
  if (!at) return null;
  let hit = at;
  if (!at.wordLike) {
    // A click on the space or the punctuation beside a word means that word.
    const index = parts.indexOf(at);
    hit = parts[index - 1]?.wordLike ? parts[index - 1] : parts[index + 1]?.wordLike ? parts[index + 1] : at;
  }
  if (!hit.wordLike) return null;
  const query = hit.text.trim();
  return query ? { start: hit.start, end: hit.end, query } : null;
}

/**
 * The word/expression span at `globalOffset` in a plain string.
 *
 * Extracted from `tokenSpanAt` unchanged so that surfaces with no DOM of their
 * own — the Immersion Browser's `<webview>` guest, which can only hand the host
 * text across the process boundary — resolve a word with *this* logic rather
 * than a second copy of it. `tokenSpanAt` is now a thin caching wrapper; the
 * token walk, the particle-neighbor rule and the kana-fragment glue below are
 * the originals and are the only implementation.
 *
 * `tokens` is the caller's cache, when it has one. Omit it and the tokenizer
 * runs here.
 */
export function resolveWordSpanInText(
  text: string,
  globalOffset: number,
  cachedTokens?: JpToken[],
  lang: string = lookupLangForText(text),
): { start: number; end: number; query: string } | null {
  if (!text) return null;

  // Chinese, Russian and everything else: ICU word boundaries. The Cyrillic
  // `кошку` in a Russian line used to resolve to nothing — the fallback below
  // only knew kana, kanji and ASCII.
  if (lang !== 'ja') {
    return segmentSpanAt(text, globalOffset, lang) ?? cjkSpanAt(text, globalOffset);
  }

  const tokens =
    cachedTokens ??
    (tokenizerReady() && /[぀-ヿ㐀-鿿]/.test(text) ? tokenizeSync(text) : undefined);

  if (tokens) {
    let pos = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      const tkEnd = pos + tk.surface.length;
      if (globalOffset >= pos && globalOffset < tkEnd) {
        let idx = i;
        // An interjection (おはよう, ありがとう, はい) is the word the user
        // clicked, not a particle hanging off its neighbour.
        if (!tk.content && tk.pos !== '感動詞') {
          // Clicked a particle/auxiliary (を、が、した…) rather than the word
          // itself. Attach to whichever neighbor is the actual content word —
          // almost always the one right before it (particles trail their
          // word) — but only the immediate neighbor: scanning further out
          // used to walk clean past several non-content tokens and land on
          // an unrelated word later in the sentence.
          if (i > 0 && tokens[i - 1]!.content) idx = i - 1;
          else if (i + 1 < tokens.length && tokens[i + 1]!.content) idx = i + 1;
        }
        let [s, e] = [idx, idx + 1];
        // Words not in the dictionary (e.g. うがい written in plain kana) can
        // come back from kuromoji split into several adjacent kana "unknown
        // word" tokens instead of one — a click then only grabs one piece
        // (う, then separately がい), and kuromoji's classification of those
        // fragments as content/non-content is unreliable (it may tag "う" as
        // a non-content interjection). Ignore the content flag here and glue
        // by script + a particle/auxiliary blocklist instead: real words are
        // almost never placed directly next to each other with no particle
        // between them, so a contiguous run of non-particle hiragana tokens
        // is almost always one fragmented word.
        if (isGluableKanaFragment(tokens[idx]!)) {
          while (s > 0 && isGluableKanaFragment(tokens[s - 1]!)) s--;
          while (e < tokens.length && isGluableKanaFragment(tokens[e]!)) e++;
        }
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
  // Any letter, mark or digit of any script — Cyrillic and accented Latin included.
  const isWord = (c: string) => /[\p{L}\p{M}\p{N}々]/u.test(c);
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
  // separately by the dictionary UI for grading. `data-surface` is the word as
  // written when the element also draws pinyin ruby or stress accents.
  const surface = wk.getAttribute('data-surface')?.trim() || wk.textContent?.trim() || '';
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

/**
 * Select the full sentence under a click (ends at 。！？ etc., not commas).
 * Returns the selected text, or null if nothing resolvable. Does not open dict.
 */
export function selectSentenceAtPoint(
  clientX: number,
  clientY: number,
  doc: Document = document,
): string | null {
  const caret =
    doc.caretRangeFromPoint?.(clientX, clientY) ??
    (() => {
      const pos = (
        doc as Document & {
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        }
      ).caretPositionFromPoint?.(clientX, clientY);
      if (!pos) return null;
      const r = doc.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    })();

  let node: Node | null = null;
  let offset = 0;
  if (caret && 'startContainer' in caret) {
    node = caret.startContainer;
    offset = caret.startOffset;
  }
  // Fallback: token / text under element
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    const el = doc.elementFromPoint(clientX, clientY);
    const wk = el?.closest?.('span.wk') as HTMLElement | null;
    if (wk?.firstChild && wk.firstChild.nodeType === Node.TEXT_NODE) {
      node = wk.firstChild;
      offset = 0;
    } else {
      return null;
    }
  }

  const textNode = node as Text;
  // Prefer novel-part / novel-content so multi-paragraph blocks still work.
  const block =
    (textNode.parentElement?.closest('.novel-part, .novel-content, [data-lookup-block]') as Element | null) ??
    nearestBlock(textNode);
  if (!block) return null;

  const globalOffset = charOffsetInBlock(block, textNode, offset);
  const range = detectSentenceRange(block, globalOffset);
  if (!range) return null;

  const win = doc.defaultView ?? window;
  const sel = win.getSelection();
  if (!sel) return null;
  sel.removeAllRanges();
  sel.addRange(range);
  const text = range.toString().trim();
  return text || null;
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
  // caretRangeFromPoint can miss (return null, or snap to unrelated text) when
  // the pointer lands right on a glyph edge / span boundary. Fall back to the
  // first text node under the element the pointer is actually over, rather
  // than silently doing nothing and forcing the user to click repeatedly.
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    const fallback = firstTextNodeIn(el);
    if (!fallback) return null;
    node = fallback;
    offset = 0;
  }

  let textNode = node as Text;
  let block = nearestBlock(textNode);
  if (!block) return null;

  const caretRange = doc.createRange();
  caretRange.setStart(textNode, offset);
  caretRange.collapse(true);
  if (!pointNearRange(clientX, clientY, caretRange)) {
    const fallback = firstTextNodeIn(el);
    if (!fallback || fallback === textNode) return null;
    textNode = fallback;
    offset = 0;
    block = nearestBlock(textNode);
    if (!block) return null;
  }

  const globalOffset = charOffsetInBlock(block, textNode, offset);

  // Punctuation isn't a word to look up — a closing ender/quote/bracket (。」』)
  // belongs to the sentence that ends there, an opening one (「『（() opens
  // the sentence that follows it. Select that sentence instead of failing or
  // (worse) treating the punctuation glyph itself as the dictionary query.
  const punct = punctuationSentenceHit(block, globalOffset, doc, clientX, clientY);
  if (punct) return punct;

  const span = tokenSpanAt(block, globalOffset);
  if (!span) return null;
  return hitFromSpan(block, span, doc, clientX, clientY);
}

function punctuationSentenceHit(
  block: Element,
  globalOffset: number,
  doc: Document,
  fallbackX: number,
  fallbackY: number,
): WordLookupHit | null {
  const text = block.textContent ?? '';
  const ch = text[globalOffset];
  if (!ch || !isSentencePunct(ch)) return null;

  const range = detectSentenceRange(block, globalOffset);
  if (!range) return null;
  const query = range.toString().trim();
  if (!query) return null;

  const rect = applyLookupHighlight(range, block, doc);
  return {
    query: query.slice(0, 240),
    x: rect?.left ?? fallbackX,
    y: rect ? rect.bottom : fallbackY + 14,
    translate: true,
  };
}

/** First text node inside `el` with non-whitespace content, if any. */
function firstTextNodeIn(el: Element | null): Text | null {
  if (!el) return null;
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode() as Text | null;
  while (n) {
    if ((n.textContent ?? '').trim()) return n;
    n = walker.nextNode() as Text | null;
  }
  return null;
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

/**
 * Off-DOM lookup: resolve a hit from text the host does not own.
 *
 * The Immersion Browser's `<webview>` guest is a separate, untrusted process.
 * The host cannot reach into its DOM to run `lookupWordFromMouseUp`, and the
 * guest cannot be given the tokenizer or the dictionary. So the guest sends
 * *text plus an offset* and this resolves it here, on the host, through the
 * same three branches `lookupWordFromMouseUp` uses:
 *
 *   selection → `selectionHit`'s sentence-vs-word split
 *   punctuation → `punctuationSentenceHit`'s whole-sentence translate
 *   otherwise → `resolveWordSpanInText`, i.e. `tokenSpanAt`'s own token walk
 *
 * The one thing it cannot do is highlight, because the text is not in this
 * document. `x`/`y` are supplied by the caller (already translated into host
 * coordinates) instead of being read off a client rect.
 */
export function lookupHitFromText(input: {
  text: string;
  offset?: number;
  selection?: string;
  x: number;
  y: number;
}): WordLookupHit | null {
  const { text, x, y } = input;
  if (!text) return null;

  const selection = (input.selection ?? '').trim();
  if (selection) {
    if (isLikelySentence(selection)) {
      return { query: selection.slice(0, 240), x, y, translate: true };
    }
    return {
      query: selection.slice(0, 40),
      x,
      y,
      context: sentenceAroundText(text, selection.slice(0, 8)),
    };
  }

  const offset = Math.min(Math.max(input.offset ?? 0, 0), text.length - 1);

  const ch = text[offset];
  if (ch && isSentencePunct(ch)) {
    const { start, end } = detectSentenceBounds(text, offset);
    const sentence = text.slice(start, end).trim();
    if (sentence) return { query: sentence.slice(0, 240), x, y, translate: true };
  }

  const span = resolveWordSpanInText(text, offset);
  if (!span) return null;
  return {
    query: span.query.slice(0, 40),
    x,
    y,
    context: sentenceAroundText(text, span.query.slice(0, 8)),
  };
}

/** Epub / iframe: refine a browser selection down to one word when possible. */
export function lookupWordFromSelection(win: Window): WordLookupHit | null {
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const selected = sel.toString().trim();
  if (!selected) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const doc = win.document;
  const block = nearestBlock(range.startContainer);

  // Ignore stale selections when the user clicked/dragged away from the highlighted text.
  if (!pointNearRange(downX, downY, range)) return null;

  if (selected && isLikelySentence(selected)) {
    return { query: selected.slice(0, 240), x: rect.left, y: rect.bottom, translate: true };
  }

  if (selected.length === 1 && isSentencePunct(selected) && block) {
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const globalOffset = charOffsetInBlock(block, node as Text, range.startOffset);
      const punct = punctuationSentenceHit(block, globalOffset, doc, rect.left, rect.bottom);
      if (punct) return punct;
    }
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
