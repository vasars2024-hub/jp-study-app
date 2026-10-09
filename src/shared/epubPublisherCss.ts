/**
 * The book's own CSS, made safe to apply inside the app's DOM.
 *
 * The novel reader renders chapters straight into the app (no iframe), so it
 * used to drop every `<style>` and `<link>` — which also dropped what Japanese
 * typesetting depends on: 縦中横 (`-epub-text-combine: horizontal`, i.e.
 * `text-combine-upright`), upright Latin (`text-orientation: upright`), 傍点
 * (`text-emphasis`), ruby placement, gothic emphasis spans, centred and
 * right-aligned lines, image floats and widths.
 *
 * This keeps that and nothing else:
 *
 *   - **Parsed here, not by the browser.** Chromium's parser discards the
 *     `-epub-*` properties the EPUB 3 spec uses before any code could map them,
 *     so the stylesheet is tokenised by hand: comments and strings respected,
 *     blocks brace-matched.
 *   - **An allow-list of properties**, each mapped to the standard name
 *     (`-epub-writing-mode` -> `writing-mode`, `-webkit-text-combine:
 *     horizontal` -> `text-combine-upright: all`) and each value checked
 *     against what that property may hold. Colours, backgrounds, fonts other
 *     than the generic families, positioning, `content`, `!important`,
 *     line-height and page breaks are the reader's, so they are dropped.
 *   - **No external anything.** Any value with `url(`, `expression`, an escape,
 *     `@`, `<` or `javascript` is dropped; `@import`, `@font-face`,
 *     `@namespace`, `@page`, `@keyframes` are dropped whole.
 *   - **Scoped.** Every selector is prefixed with the reader's scope class, and
 *     the book's `html` / `body` / `:root` (and classes it puts on them, such as
 *     Denden Amigo's `.vrtl`) are taken off the front: the reader owns the page
 *     box, writing mode and margins, so a rule that targets the book's root is
 *     dropped rather than applied to the app.
 *
 * Pure string code — no DOM — so main, the renderer and tests share it.
 */

export const PUBLISHER_CSS_SCOPE = '.epub-pub';

/** A book's merged stylesheet larger than this is truncated before parsing. */
export const PUBLISHER_CSS_MAX_INPUT = 512 * 1024;
const MAX_VALUE_LENGTH = 200;
const MAX_SELECTOR_LENGTH = 300;
const MAX_RULES = 4000;

export interface PublisherCssOptions {
  scope?: string;
  /** Classes the book puts on `<html>` / `<body>`; a leading compound made of them is the root. */
  rootClasses?: Iterable<string>;
}

/* ------------------------------------------------------------------ *
 * Tokenising
 * ------------------------------------------------------------------ */

function stripComments(css: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < css.length) {
    const ch = css[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < css.length) {
        out += css[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      out += ' ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Index of the `}` matching the `{` at `open`, honouring strings; -1 when unbalanced. */
function matchBrace(css: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split on `sep` at nesting depth 0 (parens, brackets) and outside strings. */
function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

interface RawRule {
  prelude: string;
  body: string;
}

/** Top-level rules: `prelude { body }`. A statement at-rule (`@import ...;`) has an empty body. */
function topLevelRules(css: string): RawRule[] {
  const rules: RawRule[] = [];
  let i = 0;
  while (i < css.length && rules.length < MAX_RULES) {
    const brace = css.indexOf('{', i);
    const semi = css.indexOf(';', i);
    // A statement at-rule ends at `;` before any block opens.
    if (semi !== -1 && (brace === -1 || semi < brace) && css.slice(i, semi).trim().startsWith('@')) {
      rules.push({ prelude: css.slice(i, semi).trim(), body: '' });
      i = semi + 1;
      continue;
    }
    if (brace === -1) break;
    const close = matchBrace(css, brace);
    if (close === -1) break;
    // A stray `;` between rules (common in hand-edited book CSS) is not part of the selector.
    rules.push({ prelude: css.slice(i, brace).replace(/^[\s;]+/, '').trim(), body: css.slice(brace + 1, close) });
    i = close + 1;
  }
  return rules;
}

/* ------------------------------------------------------------------ *
 * Declarations
 * ------------------------------------------------------------------ */

const UNSAFE_VALUE = /url\s*\(|expression|javascript|vbscript|behavior|binding|\\|@|<|>|\{|\}|\/\*|image-set|element\s*\(|attr\s*\(|var\s*\(|env\s*\(/i;

const LENGTH = String.raw`-?(?:\d+|\d*\.\d+)(?:px|em|rem|%|ex|ch|ic|vw|vh|vmin|vmax|pt|pc|mm|cm|in|q)?`;
const LENGTHS = new RegExp(String.raw`^(?:(?:${LENGTH}|auto|0)\s*){1,4}$`, 'i');
const ONE_LENGTH = new RegExp(String.raw`^(?:${LENGTH}|auto|none|0)$`, 'i');
const RELATIVE_SIZE = /^(?:-?(?:\d+|\d*\.\d+)(?:em|rem|%)|smaller|larger|xx-small|x-small|small|medium|large|x-large|xx-large)$/i;
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);

type ValueCheck = (value: string) => string | null;

const keywords = (...allowed: string[]): ValueCheck => {
  const set = new Set(allowed);
  return (value) => (set.has(value.toLowerCase()) ? value.toLowerCase() : null);
};
const lengths: ValueCheck = (value) => (LENGTHS.test(value) ? value : null);
const oneLength: ValueCheck = (value) => (ONE_LENGTH.test(value) ? value : null);

const writingMode: ValueCheck = (value) => {
  const v = value.toLowerCase();
  if (v === 'vertical-rl' || v === 'tb-rl' || v === 'tb') return 'vertical-rl';
  if (v === 'vertical-lr') return 'vertical-lr';
  if (v === 'horizontal-tb' || v === 'lr-tb' || v === 'lr' || v === 'rl-tb') return 'horizontal-tb';
  return null;
};

/** `-epub-text-combine: horizontal`, `digits 2`, `all` -> `all` (Chromium supports `all` only). */
const textCombine: ValueCheck = (value) => {
  const v = value.toLowerCase().trim();
  if (v === 'none') return 'none';
  if (v === 'all' || v === 'horizontal' || /^digits(?:\s+[1-4])?$/.test(v)) return 'all';
  return null;
};

const textOrientation: ValueCheck = (value) => {
  const v = value.toLowerCase();
  if (v === 'upright' || v === 'mixed' || v === 'sideways') return v;
  if (v === 'sideways-right' || v === 'vertical-right') return v === 'vertical-right' ? 'mixed' : 'sideways';
  if (v === 'use-glyph-orientation') return 'mixed';
  return null;
};

const emphasisStyle: ValueCheck = (value) => {
  const v = value.toLowerCase().trim();
  if (/^(?:none|(?:(?:filled|open)\s*)?(?:dot|circle|double-circle|triangle|sesame)?(?:\s*(?:filled|open))?)$/.test(v) && v) {
    return v;
  }
  // A single quoted character: "﹅".
  if (/^(["'])[^"'\\]{1,2}\1$/.test(value.trim())) return value.trim();
  return null;
};

const emphasisPosition: ValueCheck = (value) =>
  /^(?:over|under)(?:\s+(?:left|right))?$|^(?:left|right)(?:\s+(?:over|under))?$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;

const rubyPosition: ValueCheck = (value) => {
  const v = value.toLowerCase();
  if (v === 'over' || v === 'before') return 'over';
  if (v === 'under' || v === 'after') return 'under';
  if (v === 'alternate' || v === 'inter-character') return v;
  return null;
};

const fontFamily: ValueCheck = (value) => {
  const families = value.split(',').map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase());
  const generic = families.filter((f) => GENERIC_FAMILIES.has(f));
  return generic.length ? generic[generic.length - 1] : null;
};

const fontWeight: ValueCheck = (value) =>
  /^(?:normal|bold|bolder|lighter|[1-9]00)$/i.test(value) ? value.toLowerCase() : null;

const fontSize: ValueCheck = (value) => (RELATIVE_SIZE.test(value) ? value : null);

const verticalAlign: ValueCheck = (value) =>
  /^(?:baseline|sub|super|text-top|text-bottom|middle|top|bottom)$/i.test(value) || ONE_LENGTH.test(value)
    ? value.toLowerCase()
    : null;

const borderShorthand: ValueCheck = (value) =>
  /^(?:(?:-?(?:\d+|\d*\.\d+)(?:px|em)?|thin|medium|thick|none|hidden|solid|dotted|dashed|double|groove|ridge|inset|outset|currentcolor)\s*){1,3}$/i.test(value)
    ? value
    : null;

const borderStyle: ValueCheck = (value) =>
  /^(?:(?:none|hidden|solid|dotted|dashed|double|groove|ridge|inset|outset)\s*){1,4}$/i.test(value) ? value.toLowerCase() : null;

const textDecoration: ValueCheck = (value) =>
  /^(?:(?:none|underline|overline|line-through|solid|double|dotted|dashed|wavy)\s*){1,4}$/i.test(value)
    ? value.toLowerCase()
    : null;

const featureSettings: ValueCheck = (value) =>
  /^(?:normal|(?:\s*["'][a-z0-9]{4}["'](?:\s+(?:on|off|\d))?\s*,?)+)$/i.test(value.trim()) ? value.trim() : null;

/** Property name (lower-case, as the book wrote it) -> [standard name, value check]. */
const PROPERTIES: Record<string, [string, ValueCheck]> = {
  'writing-mode': ['writing-mode', writingMode],
  '-webkit-writing-mode': ['writing-mode', writingMode],
  '-epub-writing-mode': ['writing-mode', writingMode],
  '-ms-writing-mode': ['writing-mode', writingMode],
  'text-combine-upright': ['text-combine-upright', textCombine],
  '-webkit-text-combine': ['text-combine-upright', textCombine],
  '-epub-text-combine': ['text-combine-upright', textCombine],
  '-epub-text-combine-horizontal': ['text-combine-upright', textCombine],
  '-ms-text-combine-horizontal': ['text-combine-upright', textCombine],
  'text-orientation': ['text-orientation', textOrientation],
  '-webkit-text-orientation': ['text-orientation', textOrientation],
  '-epub-text-orientation': ['text-orientation', textOrientation],
  'text-emphasis-style': ['text-emphasis-style', emphasisStyle],
  '-webkit-text-emphasis-style': ['text-emphasis-style', emphasisStyle],
  '-epub-text-emphasis-style': ['text-emphasis-style', emphasisStyle],
  'text-emphasis-position': ['text-emphasis-position', emphasisPosition],
  '-webkit-text-emphasis-position': ['text-emphasis-position', emphasisPosition],
  '-epub-text-emphasis-position': ['text-emphasis-position', emphasisPosition],
  'ruby-position': ['ruby-position', rubyPosition],
  '-webkit-ruby-position': ['ruby-position', rubyPosition],
  '-epub-ruby-position': ['ruby-position', rubyPosition],
  'ruby-align': ['ruby-align', keywords('start', 'center', 'space-between', 'space-around')],
  'text-align': ['text-align', keywords('left', 'right', 'center', 'justify', 'start', 'end')],
  'text-align-last': ['text-align-last', keywords('auto', 'left', 'right', 'center', 'justify', 'start', 'end')],
  'text-indent': ['text-indent', oneLength],
  'font-weight': ['font-weight', fontWeight],
  'font-style': ['font-style', keywords('normal', 'italic', 'oblique')],
  'font-size': ['font-size', fontSize],
  'font-family': ['font-family', fontFamily],
  'font-feature-settings': ['font-feature-settings', featureSettings],
  'font-variant-east-asian': ['font-variant-east-asian', keywords('normal', 'full-width', 'proportional-width', 'ruby', 'jis78', 'jis83', 'jis90', 'jis04', 'simplified', 'traditional')],
  'vertical-align': ['vertical-align', verticalAlign],
  'letter-spacing': ['letter-spacing', (v) => (/^normal$/i.test(v) || ONE_LENGTH.test(v) ? v : null)],
  'text-decoration': ['text-decoration', textDecoration],
  'text-decoration-line': ['text-decoration-line', textDecoration],
  'text-decoration-style': ['text-decoration-style', keywords('solid', 'double', 'dotted', 'dashed', 'wavy')],
  'text-underline-position': ['text-underline-position', keywords('auto', 'under', 'left', 'right')],
  'margin': ['margin', lengths],
  'margin-top': ['margin-top', oneLength],
  'margin-right': ['margin-right', oneLength],
  'margin-bottom': ['margin-bottom', oneLength],
  'margin-left': ['margin-left', oneLength],
  'margin-block-start': ['margin-block-start', oneLength],
  'margin-block-end': ['margin-block-end', oneLength],
  'margin-inline-start': ['margin-inline-start', oneLength],
  'margin-inline-end': ['margin-inline-end', oneLength],
  'padding': ['padding', lengths],
  'padding-top': ['padding-top', oneLength],
  'padding-right': ['padding-right', oneLength],
  'padding-bottom': ['padding-bottom', oneLength],
  'padding-left': ['padding-left', oneLength],
  'padding-block-start': ['padding-block-start', oneLength],
  'padding-block-end': ['padding-block-end', oneLength],
  'padding-inline-start': ['padding-inline-start', oneLength],
  'padding-inline-end': ['padding-inline-end', oneLength],
  'display': ['display', keywords('block', 'inline', 'inline-block', 'none', 'flow-root')],
  'float': ['float', keywords('left', 'right', 'none', 'inline-start', 'inline-end')],
  'clear': ['clear', keywords('left', 'right', 'both', 'none')],
  'width': ['width', oneLength],
  'height': ['height', oneLength],
  'max-width': ['max-width', oneLength],
  'max-height': ['max-height', oneLength],
  'min-width': ['min-width', oneLength],
  'min-height': ['min-height', oneLength],
  'inline-size': ['inline-size', oneLength],
  'block-size': ['block-size', oneLength],
  'border': ['border', borderShorthand],
  'border-top': ['border-top', borderShorthand],
  'border-right': ['border-right', borderShorthand],
  'border-bottom': ['border-bottom', borderShorthand],
  'border-left': ['border-left', borderShorthand],
  'border-style': ['border-style', borderStyle],
  'border-width': ['border-width', lengths],
  'white-space': ['white-space', keywords('normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces')],
  'word-break': ['word-break', keywords('normal', 'break-all', 'keep-all', 'break-word')],
  'line-break': ['line-break', keywords('auto', 'loose', 'normal', 'strict', 'anywhere')],
  '-webkit-line-break': ['line-break', keywords('auto', 'loose', 'normal', 'strict', 'anywhere')],
  '-epub-line-break': ['line-break', keywords('auto', 'loose', 'normal', 'strict', 'anywhere')],
  'overflow-wrap': ['overflow-wrap', keywords('normal', 'break-word', 'anywhere')],
  'word-wrap': ['overflow-wrap', keywords('normal', 'break-word', 'anywhere')],
  'hyphens': ['hyphens', keywords('none', 'manual', 'auto')],
  '-epub-hyphens': ['hyphens', keywords('none', 'manual', 'auto')],
  'text-transform': ['text-transform', keywords('none', 'uppercase', 'lowercase', 'capitalize', 'full-width')],
  'unicode-bidi': ['unicode-bidi', keywords('normal', 'embed', 'isolate', 'bidi-override', 'isolate-override', 'plaintext')],
};

/**
 * One block's declarations, filtered and mapped. Later declarations of the
 * same property win, as in CSS. Returns `prop: value` strings.
 */
export function sanitizeDeclarations(body: string): string[] {
  const out = new Map<string, string>();
  for (const raw of splitTopLevel(body, ';')) {
    const colon = raw.indexOf(':');
    if (colon <= 0) continue;
    const name = raw.slice(0, colon).trim().toLowerCase();
    let value = raw.slice(colon + 1).trim().replace(/\s*!\s*important\s*$/i, '').trim();
    if (!value || value.length > MAX_VALUE_LENGTH || UNSAFE_VALUE.test(value)) continue;
    value = value.replace(/\s+/g, ' ');
    const spec = PROPERTIES[name];
    if (!spec) continue;
    const checked = spec[1](value);
    if (checked === null) continue;
    out.delete(spec[0]);
    out.set(spec[0], checked);
  }
  return [...out.entries()].map(([prop, value]) => `${prop}: ${value}`);
}

/** An inline `style=""` attribute, filtered the same way; '' when nothing survives. */
export function sanitizeInlineStyle(style: string): string {
  if (!style || style.length > 4096) return '';
  return sanitizeDeclarations(stripComments(style)).join('; ');
}

/* ------------------------------------------------------------------ *
 * Selectors
 * ------------------------------------------------------------------ */

const SAFE_SELECTOR = /^[\w\s.#:>+~*()[\]="'|^$,\-\u0080-\uffff]+$/u;
const ROOT_TYPE = /^(?:html|body|:root)(?=$|[.#:[])/i;

/** Split a selector into compounds and the combinators between them. */
function compounds(selector: string): { parts: string[]; combinators: string[] } {
  const parts: string[] = [];
  const combinators: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;
  let pendingCombinator: string | null = null;
  const flush = () => {
    if (!current) return;
    if (parts.length) combinators.push(pendingCombinator ?? ' ');
    parts.push(current);
    current = '';
    pendingCombinator = null;
  };
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === '>' || ch === '+' || ch === '~')) {
      flush();
      pendingCombinator = ch;
      continue;
    }
    if (depth === 0 && /\s/.test(ch)) {
      flush();
      continue;
    }
    current += ch;
  }
  flush();
  return { parts, combinators };
}

function isRootCompound(compound: string, rootClasses: ReadonlySet<string>): boolean {
  if (ROOT_TYPE.test(compound)) return true;
  // A compound made only of classes the book puts on <html>/<body>: `.vrtl`, `.hltr.main`.
  const classes = compound.match(/^(?:\.[\w\-\u0080-\uffff]+)+$/u);
  if (!classes || !rootClasses.size) return false;
  return compound
    .split('.')
    .filter(Boolean)
    .every((name) => rootClasses.has(name));
}

/**
 * One selector, scoped: null when it is unsafe, or when it targets the book's
 * root itself (`html`, `body.p-text`, `.vrtl`) — the caller then drops the rule.
 */
export function scopeSelector(selector: string, scope = PUBLISHER_CSS_SCOPE, rootClasses: ReadonlySet<string> = new Set()): string | null {
  const trimmed = selector.trim();
  if (!trimmed || trimmed.length > MAX_SELECTOR_LENGTH || !SAFE_SELECTOR.test(trimmed)) return null;
  if (/::?(?:before|after|marker|placeholder|selection|backdrop|first-letter|first-line)\b/i.test(trimmed)) {
    // Generated content and selection colours belong to the reader; the
    // properties they would need are not on the list anyway.
    return null;
  }
  const { parts, combinators } = compounds(trimmed);
  let start = 0;
  while (start < parts.length && isRootCompound(parts[start], rootClasses)) start += 1;
  if (start >= parts.length) return null;
  let out = parts[start];
  for (let i = start + 1; i < parts.length; i += 1) {
    const combinator = combinators[i - 1];
    out += combinator === ' ' ? ` ${parts[i]}` : ` ${combinator} ${parts[i]}`;
  }
  // A selector that starts with a child/sibling combinator after the root
  // (`body > p`) is scoped as a descendant — the book's body is not ours.
  return `${scope} ${out}`;
}

/* ------------------------------------------------------------------ *
 * Whole sheets
 * ------------------------------------------------------------------ */

const SAFE_MEDIA_PRELUDE = /^@media\s+[\w\s(),:.-]+$/i;

function sanitizeRules(css: string, scope: string, rootClasses: ReadonlySet<string>, depth: number): string[] {
  const out: string[] = [];
  for (const rule of topLevelRules(css)) {
    if (rule.prelude.startsWith('@')) {
      // Media queries read the WINDOW, not the reading column, but a book that
      // only styles for `screen`/`(min-width)` should not lose its rules: kept,
      // with the prelude checked and the inner rules sanitised the same way.
      if (depth === 0 && SAFE_MEDIA_PRELUDE.test(rule.prelude) && !/amzn-|kf8|mobi/i.test(rule.prelude)) {
        const inner = sanitizeRules(rule.body, scope, rootClasses, depth + 1);
        if (inner.length) out.push(`${rule.prelude.replace(/\s+/g, ' ')} {\n${inner.join('\n')}\n}`);
      }
      continue;
    }
    const declarations = sanitizeDeclarations(rule.body);
    if (!declarations.length) continue;
    const selectors = splitTopLevel(rule.prelude, ',')
      .map((selector) => scopeSelector(selector, scope, rootClasses))
      .filter((selector): selector is string => selector !== null);
    if (!selectors.length) continue;
    out.push(`${selectors.join(', ')} { ${declarations.join('; ')}; }`);
  }
  return out;
}

/**
 * The book's stylesheets (concatenated in document order), sanitised and
 * scoped. '' when nothing survives.
 */
export function sanitizePublisherCss(css: string, options: PublisherCssOptions = {}): string {
  if (!css) return '';
  const scope = options.scope ?? PUBLISHER_CSS_SCOPE;
  const rootClasses = new Set([...(options.rootClasses ?? [])].map((name) => name.trim()).filter(Boolean));
  const source = stripComments(css.slice(0, PUBLISHER_CSS_MAX_INPUT)).replace(/<!--|-->/g, ' ');
  return sanitizeRules(source, scope, rootClasses, 0).join('\n');
}
