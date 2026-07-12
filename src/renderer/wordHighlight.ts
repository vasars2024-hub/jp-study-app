// Wrap Japanese content words in the reader DOM with knowledge-level spans, so
// new/learning words are tinted (LingQ style). Operates on the already-rendered
// chapter DOM; safe to call repeatedly (skips elements already processed).
import { getLevel } from './knownWords';
import { tokenizeSync, tokenizerReady } from './tokenizer';

const DONE = 'data-wk';
const SKIP_TAGS = new Set(['RT', 'RP', 'SCRIPT', 'STYLE', 'SVG', 'IMG', 'MARK']);

/** CSS injected into epub chapter documents — keep in sync with styles.css .wk-* */
export const WK_HIGHLIGHT_CSS = `
.wk {
  border-radius: 2px;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  cursor: pointer;
}
.wk-0 { background: rgba(96, 165, 250, 0.32); }
.wk-1 { background: rgba(255, 179, 0, 0.42); }
.wk-2 { background: rgba(255, 179, 0, 0.22); }
.wk-3 { background: transparent; }
mark.lookup-mark,
.wk.lookup-active {
  background: color-mix(in srgb, #ff2e4d 58%, transparent) !important;
  color: inherit;
  border-radius: 2px;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  outline: 1px solid color-mix(in srgb, #ff2e4d 70%, transparent);
}
.wk-on .wk-3 {
  background: rgba(120, 120, 130, 0.16);
}
::selection {
  background: color-mix(in srgb, #ff2e4d 55%, transparent);
  color: inherit;
}
`;

function collectTextNodes(root: Element): Text[] {
  const out: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      for (let el: Element | null = parent; el && el !== root; el = el.parentElement) {
        if (SKIP_TAGS.has(el.tagName) || el.classList.contains('wk')) {
          return NodeFilter.FILTER_REJECT;
        }
      }
      const t = node.nodeValue ?? '';
      if (!t.trim() || !/[぀-ヿ㐀-鿿々]/.test(t)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n = walker.nextNode();
  while (n) {
    out.push(n as Text);
    n = walker.nextNode();
  }
  return out;
}

/** Allow highlightEl to run again on this root (e.g. after toggling the setting). */
export function resetHighlightRoot(root: HTMLElement): void {
  root.removeAttribute(DONE);
}

/** Highlight content words inside `root`. Requires the tokenizer to be ready. */
export function highlightEl(root: HTMLElement, force = false): void {
  if (!tokenizerReady()) return;
  if (!force && root.getAttribute(DONE) === '1') return;
  root.setAttribute(DONE, '1');
  for (const textNode of collectTextNodes(root)) {
    const text = textNode.nodeValue ?? '';
    const tokens = tokenizeSync(text);
    if (!tokens.length) continue;
    const frag = root.ownerDocument.createDocumentFragment();
    let any = false;
    for (const tk of tokens) {
      if (tk.content && tk.lemma) {
        const span = root.ownerDocument.createElement('span');
        span.className = `wk wk-${getLevel(tk.lemma)}`;
        span.setAttribute('data-lemma', tk.lemma);
        span.textContent = tk.surface;
        frag.appendChild(span);
        any = true;
      } else {
        frag.appendChild(root.ownerDocument.createTextNode(tk.surface));
      }
    }
    if (any) textNode.replaceWith(frag);
  }
}

/** Highlight every block inside a document (e.g. an epub.js chapter iframe). */
export function highlightDocument(doc: Document, force = false): void {
  const body = doc.body;
  if (!body) return;
  highlightEl(body, force);
  doc.querySelectorAll<HTMLElement>('p, li, blockquote, h1, h2, h3, h4, section, div').forEach((el) => {
    if (el === body) return;
    if (el.querySelector('p, li')) return;
    if (/[぀-ヿ㐀-鿿々]/.test(el.textContent ?? '')) highlightEl(el, force);
  });
}

/** Recolour existing .wk spans after knowledge changed (no re-tokenizing). */
export function recolorEl(root: HTMLElement | Document, lemmas?: Set<string>): void {
  const scope = root instanceof Document ? root : root.ownerDocument;
  const host = root instanceof Document ? root : root;
  host.querySelectorAll<HTMLElement>('span.wk[data-lemma]').forEach((s) => {
    const lemma = s.getAttribute('data-lemma') ?? '';
    if (lemmas && !lemmas.has(lemma)) return;
    const active = s.classList.contains('lookup-active');
    s.className = `wk wk-${getLevel(lemma)}`;
    if (active) s.classList.add('lookup-active');
  });
  // Also recolour inside nested iframes (epub.js).
  scope.querySelectorAll('iframe').forEach((frame) => {
    try {
      const idoc = frame.contentDocument;
      if (idoc) recolorEl(idoc, lemmas);
    } catch {
      /* cross-origin */
    }
  });
}
