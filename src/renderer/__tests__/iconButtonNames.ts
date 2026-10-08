/**
 * Static scan for icon-only `<button>`s without an accessible name: a button
 * whose only children are `<Icon …/>` / `<…Icon …/>` components or an inline
 * `<svg>` and which carries no `aria-label`, `aria-labelledby` or `title`.
 * A screen reader announces such a button as just "button".
 *
 * Deliberately conservative: a button with a prop spread, any text, any `{…}`
 * child or any other element is not reported (it may be named some other way).
 */

export interface UnnamedIconButton {
  line: number;
  snippet: string;
}

function openingTagEnd(src: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return i;
  }
  return -1;
}

const ICON_ELEMENT = /<([A-Z][\w.]*Icon|Icon|Icons\.[\w]+)\b[^<>]*?\/>/g;
const SVG_ELEMENT = /<svg\b[\s\S]*?<\/svg>/g;
const JSX_COMMENT = /\{\s*\/\*[\s\S]*?\*\/\s*\}/g;
/** A lone symbol is not a name either: "×" is read out as "times". */
const GLYPH_ONLY = /^(?:[×✕✖‹›«»…⋯⋮+−←→↑↓▶◀▲▼☰⟳↻✓✔]|&times;|\{'[×✕✖‹›«»…⋯⋮+−←→↑↓▶◀▲▼☰⟳↻✓✔]'\})$/u;

export function findUnnamedIconButtons(src: string): UnnamedIconButton[] {
  const found: UnnamedIconButton[] = [];
  const open = /<button\b/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(src))) {
    const end = openingTagEnd(src, match.index + 7);
    if (end < 0) break;
    const attrs = src.slice(match.index, end + 1);
    if (/\{\s*\.\.\./.test(attrs)) continue;
    if (/\s(aria-label|aria-labelledby|title)\s*=/.test(attrs)) continue;
    if (attrs.endsWith('/>')) continue;
    const close = src.indexOf('</button>', end);
    if (close < 0) continue;
    const children = src.slice(end + 1, close);
    const icons = (children.match(ICON_ELEMENT)?.length ?? 0) + (children.match(SVG_ELEMENT)?.length ?? 0);
    const rest = children
      .replace(SVG_ELEMENT, '')
      .replace(ICON_ELEMENT, '')
      .replace(JSX_COMMENT, '')
      // A wrapper span adds no name of its own.
      .replace(/<\/?span\b[^<>{}]*>/g, '')
      .trim();
    // `{open ? <Icon a/> : <Icon b/>}` leaves only the condition behind.
    // A bare `{label}` is text, so only a condition (`?` / `&&`) counts.
    const iconOnly = icons > 0 && (!rest || /^(?:\{[\w.!\s()]*(?:\?[\w.!\s()]*:|&&)[\w.!\s?:&|()]*\}\s*)+$/.test(rest));
    if (!iconOnly && !GLYPH_ONLY.test(rest)) continue;
    const line = src.slice(0, match.index).split('\n').length;
    found.push({ line, snippet: attrs.replace(/\s+/g, ' ').slice(0, 120) });
  }
  return found;
}
