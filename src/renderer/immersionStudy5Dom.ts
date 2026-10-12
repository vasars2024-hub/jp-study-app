/**
 * The immersion reader's DOM side of the 7.5 study layer: i+1 sentence
 * highlighting over the known-word spans `wordHighlight.highlightEl` already
 * wrote, and the page's words for "new words met".
 *
 * Highlighting never rewrites the article: sentences are painted with the CSS
 * Custom Highlight API (Ranges, no new elements), so lookups, selection and the
 * known-word recolouring keep working on the same nodes. Where the API is
 * missing (jsdom) only the unknown word's span gets a class.
 */
import { imm5IPlusOneSentences, imm5PageCoverage, type Imm5PageCoverage, type Imm5Word } from '../shared/immersionStudy5';

export const IMM5_IPLUS1_HIGHLIGHT = 'imm5-iplus1';
export const IMM5_IPLUS1_WORD_CLASS = 'imm5-iplus1-word';

/**
 * Elements that start their own run of text. `div` is in the list because
 * Aozora Bunko's `main_text` (and many blogs) are one div of `<br>`-separated
 * lines with no `<p>` at all — those pages used to get no i+1 highlighting.
 */
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, td, th, figcaption, div, section, article';
const SKIP = new Set(['RT', 'RP', 'SCRIPT', 'STYLE']);

interface TextPiece {
  node: Text;
  start: number;
}

interface BlockText {
  text: string;
  pieces: TextPiece[];
  words: (Imm5Word & { span: HTMLElement })[];
}

function levelOfSpan(span: Element): number {
  const m = /\bwk-(\d)\b/.exec(span.className);
  return m ? Number(m[1]) : 3;
}

/**
 * A block's OWN text (furigana excluded, nested blocks left to themselves),
 * with every known-word span at its offsets. A `<br>` reads as a newline, so
 * a line break ends a sentence the way it does on the page.
 */
export function imm5BlockText(block: Element): BlockText {
  const doc = block.ownerDocument;
  const pieces: TextPiece[] = [];
  const words: BlockText['words'] = [];
  let text = '';
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (SKIP.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el !== block && el.matches(BLOCK_SELECTOR)) return NodeFilter.FILTER_REJECT;
        return el.tagName === 'BR' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      text += '\n';
      continue;
    }
    const textNode = node as Text;
    const value = textNode.nodeValue ?? '';
    if (!value) continue;
    pieces.push({ node: textNode, start: text.length });
    const span = textNode.parentElement;
    if (span && span.classList.contains('wk') && span.hasAttribute('data-lemma')) {
      words.push({
        start: text.length,
        end: text.length + value.length,
        level: levelOfSpan(span),
        ...(span.hasAttribute('data-proper') ? { proper: true } : {}),
        span,
      });
    }
    text += value;
  }
  return { text, pieces, words };
}

/** Known-word coverage of the page under `root`, from the spans `highlightEl` wrote. */
export function imm5ReaderCoverage(root: Element): Imm5PageCoverage {
  const words: { lemma: string; level: number; proper?: boolean }[] = [];
  root.querySelectorAll('span.wk[data-lemma]').forEach((span) => {
    if (span.closest('rt, rp')) return;
    words.push({
      lemma: span.getAttribute('data-lemma') ?? '',
      level: levelOfSpan(span),
      proper: span.hasAttribute('data-proper'),
    });
  });
  return imm5PageCoverage(words);
}

function pointAt(pieces: readonly TextPiece[], offset: number, preferEnd: boolean): { node: Text; offset: number } | null {
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const len = piece.node.nodeValue?.length ?? 0;
    const end = piece.start + len;
    if (offset < end || (preferEnd && offset === end)) {
      return { node: piece.node, offset: Math.max(0, offset - piece.start) };
    }
  }
  const last = pieces[pieces.length - 1];
  return last ? { node: last.node, offset: last.node.nodeValue?.length ?? 0 } : null;
}

interface HighlightRegistry {
  set(name: string, value: unknown): void;
  delete(name: string): void;
}

function highlightApi(): { registry: HighlightRegistry; Highlight: new (...ranges: Range[]) => unknown } | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Ctor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  return css?.highlights && Ctor ? { registry: css.highlights, Highlight: Ctor } : null;
}

export function imm5ClearIPlusOne(root: Element): void {
  root.querySelectorAll(`.${IMM5_IPLUS1_WORD_CLASS}`).forEach((el) => el.classList.remove(IMM5_IPLUS1_WORD_CLASS));
  highlightApi()?.registry.delete(IMM5_IPLUS1_HIGHLIGHT);
}

/**
 * Paint every i+1 sentence under `root`; returns how many there are. Run after
 * `highlightEl` (it reads the `.wk` spans) and again after knowledge changes.
 */
export function imm5ApplyIPlusOne(root: Element): number {
  imm5ClearIPlusOne(root);
  const api = highlightApi();
  const ranges: Range[] = [];
  let count = 0;
  // Every block measures only its own text (nested blocks are measured on their
  // own), so a <div> of <br> lines and the <p>s beside it are both covered.
  const blocks = [root, ...Array.from(root.querySelectorAll(BLOCK_SELECTOR))];
  for (const block of blocks) {
    const { text, pieces, words } = imm5BlockText(block);
    if (!words.length) continue;
    for (const sentence of imm5IPlusOneSentences(text, words)) {
      count += 1;
      const word = words.find((w) => w.start === sentence.word.start);
      word?.span.classList.add(IMM5_IPLUS1_WORD_CLASS);
      if (!api) continue;
      const from = pointAt(pieces, sentence.start, false);
      const to = pointAt(pieces, sentence.end, true);
      if (!from || !to) continue;
      const range = block.ownerDocument.createRange();
      try {
        range.setStart(from.node, from.offset);
        range.setEnd(to.node, to.offset);
        ranges.push(range);
      } catch {
        /* a node moved under us; skip this sentence */
      }
    }
  }
  if (api && ranges.length) api.registry.set(IMM5_IPLUS1_HIGHLIGHT, new api.Highlight(...ranges));
  return count;
}

/** Distinct lemmas of the known-word spans under `root`. */
export function imm5PageLemmas(root: Element): string[] {
  const out = new Set<string>();
  root.querySelectorAll('span.wk[data-lemma]').forEach((span) => {
    const lemma = span.getAttribute('data-lemma');
    if (lemma) out.add(lemma);
  });
  return [...out];
}
