/**
 * Allowlist sanitizer for dictionary glossary HTML.
 *
 * Dictionary HTML comes from files the user imported (Yomitan zips, StarDict,
 * migrated JSON stores) and is inserted with `innerHTML` by the reader pop-up,
 * the Dictionary view and the browser extension's hover pop-up. A dictionary
 * archive is untrusted input, so anything it says about markup has to pass
 * through here first.
 *
 * Pure on purpose: no DOM, no Node APIs. It runs in the main process (when a
 * lookup result is built) and may run again in a renderer (defence in depth).
 *
 * The design is "re-serialize, never pass through": a small tokenizer splits the
 * input into tags, attributes, text and comments, and the output is written
 * entirely by this module from the allowed pieces. Text is always re-escaped, so
 * however the tokenizer and a browser disagree about a malformed input, the
 * worst outcome is some escaped garbage text, never live markup.
 */

/** Hard cap on the sanitized output, in UTF-16 code units. */
export const DICT_HTML_MAX_OUTPUT = 64 * 1024;
/** Input beyond this is not even tokenized; dictionary glosses are far smaller. */
const MAX_INPUT = 512 * 1024;
/** Nesting deeper than this drops further tags (their text is kept). */
const MAX_DEPTH = 64;

const ALLOWED_TAGS = new Set([
  'b', 'i', 'em', 'strong', 'u', 's', 'sub', 'sup', 'small', 'span', 'div', 'p', 'br',
  'ul', 'ol', 'li', 'ruby', 'rt', 'rp', 'rb', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'details', 'summary', 'hr',
]);

const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'base', 'area', 'col', 'embed', 'param',
  'source', 'track', 'wbr', 'keygen',
]);

/**
 * Elements whose content is raw text to a browser: everything up to the
 * matching close tag is one text run, never markup. They are all dropped with
 * their content.
 */
const RAW_TEXT_TAGS = new Set([
  'script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext',
]);

/** Elements dropped together with everything inside them (markup content). */
const DROP_WITH_CONTENT = new Set(['svg', 'math', 'template', 'object', 'select', 'frameset', 'applet']);

// ----- Escaping and entities ----------------------------------------------------

/** Escape a string for use as HTML text or a double-quoted attribute value. */
export function escapeHtmlText(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validCodePoint(cp: number): boolean {
  return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
}

/**
 * Decode the five basic named entities and numeric character references.
 * Anything else (`&nbsp;`, a bare `&`) is left exactly as written.
 */
export function decodeBasicEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(?:(amp|lt|gt|quot|apos)|#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6}));/g, (whole, named, dec, hex) => {
    if (named) {
      switch (named as string) {
        case 'amp': return '&';
        case 'lt': return '<';
        case 'gt': return '>';
        case 'quot': return '"';
        default: return "'";
      }
    }
    const cp = dec ? parseInt(dec as string, 10) : parseInt(hex as string, 16);
    return validCodePoint(cp) ? String.fromCodePoint(cp) : whole;
  });
}

/**
 * Escape text for output while keeping well-formed entities the source already
 * wrote (`&amp;`, `&#12354;`, `&nbsp;`). An entity in text content can only ever
 * decode to text, so preserving one is safe; a stray `&` is escaped.
 */
function escapeTextKeepingEntities(s: string): string {
  return s.replace(/&(?:[A-Za-z][A-Za-z0-9]{1,31};|#\d{1,7};|#[xX][0-9a-fA-F]{1,6};)?|[<>"]/g, (m) => {
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    if (m === '&') return '&amp;';
    if (m.startsWith('&#')) {
      const cp = m[2] === 'x' || m[2] === 'X' ? parseInt(m.slice(3, -1), 16) : parseInt(m.slice(2, -1), 10);
      return validCodePoint(cp) ? m : `&amp;${m.slice(1)}`;
    }
    return m;
  });
}

// ----- Tokenizer ------------------------------------------------------------------

interface RawAttr {
  name: string;
  value: string;
}

type Token =
  | { type: 'text'; text: string }
  | { type: 'start'; name: string; attrs: RawAttr[] }
  | { type: 'end'; name: string };

const WS = /[\t\n\f\r ]/;

function isAsciiAlpha(c: string | undefined): boolean {
  return !!c && /[A-Za-z]/.test(c);
}

/**
 * Split HTML into tokens. Comments, doctypes and processing instructions are
 * consumed and never emitted. The content of raw-text elements (script, style,
 * ...) is consumed up to its close tag and never emitted either.
 */
function tokenize(input: string): Token[] {
  const s = input;
  const n = s.length;
  const out: Token[] = [];
  let i = 0;
  let textStart = 0;

  const flushText = (end: number) => {
    if (end > textStart) out.push({ type: 'text', text: s.slice(textStart, end) });
  };

  while (i < n) {
    if (s[i] !== '<') {
      i += 1;
      continue;
    }
    const next = s[i + 1];
    // Comment: <!-- ... --> (also the browser's --!> and the abrupt <!--> forms).
    if (s.startsWith('<!--', i)) {
      flushText(i);
      let j = i + 4;
      if (s[j] === '>') j += 1;
      else if (s.startsWith('->', j)) j += 2;
      else {
        const close = s.slice(j).search(/--!?>/);
        j = close < 0 ? n : j + close + (s[j + close + 2] === '!' ? 4 : 3);
      }
      i = j;
      textStart = i;
      continue;
    }
    // Doctype, CDATA, bogus comment, processing instruction: skip to '>'.
    if (next === '!' || next === '?') {
      flushText(i);
      const close = s.indexOf('>', i + 2);
      i = close < 0 ? n : close + 1;
      textStart = i;
      continue;
    }
    const isEnd = next === '/';
    const nameStart = isEnd ? i + 2 : i + 1;
    if (!isAsciiAlpha(s[nameStart])) {
      if (isEnd && s[nameStart] === '>') {
        // "</>" is ignored by browsers.
        flushText(i);
        i = nameStart + 1;
        textStart = i;
        continue;
      }
      // A literal '<' in text.
      i += 1;
      continue;
    }
    flushText(i);
    let j = nameStart;
    while (j < n && !WS.test(s[j]) && s[j] !== '/' && s[j] !== '>') j += 1;
    const name = s.slice(nameStart, j).toLowerCase();
    const attrs: RawAttr[] = [];
    let closed = false;
    while (j < n) {
      while (j < n && (WS.test(s[j]) || s[j] === '/')) j += 1;
      if (j >= n) break;
      if (s[j] === '>') {
        j += 1;
        closed = true;
        break;
      }
      const attrStart = j;
      // The first character may be '=' (HTML treats it as part of the name).
      j += 1;
      while (j < n && !WS.test(s[j]) && s[j] !== '/' && s[j] !== '>' && s[j] !== '=') j += 1;
      const attrName = s.slice(attrStart, j).toLowerCase();
      while (j < n && WS.test(s[j])) j += 1;
      let value = '';
      if (s[j] === '=') {
        j += 1;
        while (j < n && WS.test(s[j])) j += 1;
        const q = s[j];
        if (q === '"' || q === "'") {
          const close = s.indexOf(q, j + 1);
          if (close < 0) {
            j = n;
            break;
          }
          value = s.slice(j + 1, close);
          j = close + 1;
        } else {
          const vStart = j;
          while (j < n && !WS.test(s[j]) && s[j] !== '>') j += 1;
          value = s.slice(vStart, j);
        }
      }
      attrs.push({ name: attrName, value });
    }
    if (!closed) {
      // EOF inside a tag: a browser drops the whole tag, and so do we.
      i = n;
      textStart = n;
      break;
    }
    i = j;
    textStart = i;
    if (isEnd) {
      out.push({ type: 'end', name });
      continue;
    }
    out.push({ type: 'start', name, attrs });
    if (RAW_TEXT_TAGS.has(name)) {
      // Swallow everything up to the matching close tag (or the end).
      const closeRe = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, 'i');
      const rest = s.slice(i);
      const m = name === 'plaintext' ? null : closeRe.exec(rest);
      if (!m) {
        i = n;
        textStart = n;
        break;
      }
      const closeAt = i + m.index;
      const gt = s.indexOf('>', closeAt);
      i = gt < 0 ? n : gt + 1;
      textStart = i;
      out.push({ type: 'end', name });
    }
  }
  flushText(n);
  return out;
}

// ----- Attributes -----------------------------------------------------------------

const CLASS_TOKEN = /^[A-Za-z0-9_-]{1,40}$/;
const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;
const SPAN_RE = /^\d{1,3}$/;

const LENGTH_RE = /^(0|[+-]?(\d{1,4}(\.\d{1,4})?|\.\d{1,4})(px|em|rem|ex|ch|pt|pc|mm|cm|in|%))$/i;
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR_RE =
  /^rgba?\(\s*\d{1,3}(\.\d+)?%?\s*,\s*\d{1,3}(\.\d+)?%?\s*,\s*\d{1,3}(\.\d+)?%?\s*(,\s*(\d{1,3}%|[01]|[01]?\.\d{1,4})\s*)?\)$/i;
const NAMED_COLOR_RE = /^[a-z]{3,24}$/i;

function isColor(v: string): boolean {
  return HEX_COLOR_RE.test(v) || RGB_COLOR_RE.test(v) || NAMED_COLOR_RE.test(v);
}

function isLength(v: string): boolean {
  return LENGTH_RE.test(v);
}

const BORDER_STYLES = new Set([
  'none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset',
]);
const BORDER_WIDTHS = new Set(['thin', 'medium', 'thick']);
const DECORATION_KEYWORDS = new Set([
  'none', 'underline', 'overline', 'line-through', 'solid', 'double', 'dotted', 'dashed', 'wavy',
]);
const VERTICAL_ALIGN = new Set(['baseline', 'sub', 'super', 'top', 'middle', 'bottom', 'text-top', 'text-bottom']);
const FONT_SIZE_KEYWORDS = new Set([
  'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'smaller', 'larger',
]);

function tokens(value: string): string[] {
  return value.match(/rgba?\([^)]*\)|[^\s]+/gi) ?? [];
}

function boxValue(value: string, allowAuto: boolean): boolean {
  const t = tokens(value);
  return t.length >= 1 && t.length <= 4 && t.every((v) => isLength(v) || (allowAuto && v.toLowerCase() === 'auto'));
}

function borderValue(value: string): boolean {
  const t = tokens(value);
  return t.length >= 1 && t.length <= 3 && t.every((v) => {
    const lower = v.toLowerCase();
    return isLength(v) || BORDER_STYLES.has(lower) || BORDER_WIDTHS.has(lower) || isColor(v);
  });
}

type StyleCheck = (value: string) => boolean;

const STYLE_PROPS: Record<string, StyleCheck> = {
  'font-weight': (v) => /^(normal|bold|bolder|lighter|[1-9]00)$/i.test(v),
  'font-style': (v) => /^(normal|italic|oblique)$/i.test(v),
  'text-decoration': (v) => {
    const t = tokens(v);
    return t.length >= 1 && t.length <= 4 && t.every((x) => DECORATION_KEYWORDS.has(x.toLowerCase()) || isColor(x));
  },
  'text-decoration-line': (v) => {
    const t = tokens(v);
    return t.length >= 1 && t.length <= 3 && t.every((x) => DECORATION_KEYWORDS.has(x.toLowerCase()));
  },
  'vertical-align': (v) => VERTICAL_ALIGN.has(v.toLowerCase()) || isLength(v),
  display: (v) => /^(inline|inline-block|block|none)$/i.test(v),
  padding: (v) => boxValue(v, false),
  'padding-top': (v) => boxValue(v, false) && tokens(v).length === 1,
  'padding-bottom': (v) => boxValue(v, false) && tokens(v).length === 1,
  'padding-left': (v) => boxValue(v, false) && tokens(v).length === 1,
  'padding-right': (v) => boxValue(v, false) && tokens(v).length === 1,
  margin: (v) => boxValue(v, true),
  'margin-top': (v) => boxValue(v, true) && tokens(v).length === 1,
  'margin-bottom': (v) => boxValue(v, true) && tokens(v).length === 1,
  'margin-left': (v) => boxValue(v, true) && tokens(v).length === 1,
  'margin-right': (v) => boxValue(v, true) && tokens(v).length === 1,
  border: borderValue,
  'border-top': borderValue,
  'border-bottom': borderValue,
  'border-left': borderValue,
  'border-right': borderValue,
  'font-size': (v) => isLength(v) || FONT_SIZE_KEYWORDS.has(v.toLowerCase()),
  color: (v) => isColor(v),
};

/** Characters a whitelisted declaration value can ever need. */
const STYLE_VALUE_CHARS = /^[A-Za-z0-9#%.,()\s+-]*$/;

/**
 * Keep only whitelisted declarations with simple values. Returns '' when the
 * attribute should be dropped. Anything that smells of a resource load or a
 * parser trick rejects the whole attribute, not just one declaration.
 */
export function sanitizeDictStyle(raw: string): string {
  const value = decodeBasicEntities(raw);
  const squashed = value.toLowerCase().replace(/\s+/g, '');
  if (
    /url\(|expression|javascript:|vbscript:|@import|image-set|image\(|element\(|var\(|calc\(|attr\(|-moz-binding|behavior/.test(squashed) ||
    /[\\<>"'`{}]|\/\*|\*\/|&|!/.test(value)
  ) {
    return '';
  }
  const out: string[] = [];
  for (const decl of value.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const val = decl.slice(colon + 1).trim().replace(/\s+/g, ' ');
    if (!prop || !val || val.length > 100) continue;
    const check = Object.prototype.hasOwnProperty.call(STYLE_PROPS, prop) ? STYLE_PROPS[prop] : undefined;
    if (!check || !STYLE_VALUE_CHARS.test(val) || !check(val)) continue;
    out.push(`${prop}:${val}`);
    if (out.length >= 16) break;
  }
  return out.join(';');
}

function sanitizeAttrs(tag: string, attrs: RawAttr[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const { name, value } of attrs) {
    if (seen.has(name)) continue; // HTML keeps the first occurrence.
    seen.add(name);
    switch (name) {
      case 'class': {
        const kept = decodeBasicEntities(value).split(/\s+/).filter((t) => CLASS_TOKEN.test(t)).slice(0, 16);
        if (kept.length) parts.push(`class="${kept.join(' ')}"`);
        break;
      }
      case 'lang': {
        const v = decodeBasicEntities(value).trim();
        if (LANG_RE.test(v) && v.length <= 35) parts.push(`lang="${v}"`);
        break;
      }
      case 'title': {
        const v = decodeBasicEntities(value).slice(0, 512);
        if (v) parts.push(`title="${escapeHtmlText(v)}"`);
        break;
      }
      case 'colspan':
      case 'rowspan': {
        const v = value.trim();
        if ((tag === 'td' || tag === 'th') && SPAN_RE.test(v) && Number(v) >= 1) parts.push(`${name}="${Number(v)}"`);
        break;
      }
      case 'style': {
        const v = sanitizeDictStyle(value);
        if (v) parts.push(`style="${escapeHtmlText(v)}"`);
        break;
      }
      default:
        // Everything else — on*, href, src, srcset, xlink:*, formaction, data-*,
        // id, name — is dropped.
        break;
    }
  }
  return parts.length ? ` ${parts.join(' ')}` : '';
}

// ----- Sanitizer ------------------------------------------------------------------

/**
 * Sanitize dictionary HTML to an allowlisted subset. See the module comment.
 * Always returns well-formed markup: unclosed allowed tags are closed at the
 * end, stray close tags are ignored, and the output is capped at
 * `DICT_HTML_MAX_OUTPUT` (closing whatever was open when the cap was hit).
 */
export function sanitizeDictHtml(html: string): string {
  if (typeof html !== 'string' || !html) return '';
  const input = html.length > MAX_INPUT ? html.slice(0, MAX_INPUT) : html;
  const toks = tokenize(input);
  const stack: string[] = [];
  const dropStack: string[] = [];
  let out = '';
  /** Room reserved for the close tags of everything currently open. */
  const closeCost = () => stack.reduce((sum, tag) => sum + tag.length + 3, 0);
  const fits = (piece: string) => out.length + piece.length + closeCost() <= DICT_HTML_MAX_OUTPUT;

  for (const tok of toks) {
    if (dropStack.length) {
      // Inside a dropped element: only track its own nesting.
      const top = dropStack[dropStack.length - 1];
      if (tok.type === 'start' && tok.name === top && !VOID_TAGS.has(tok.name)) dropStack.push(tok.name);
      else if (tok.type === 'end' && tok.name === top) dropStack.pop();
      continue;
    }
    if (tok.type === 'text') {
      const piece = escapeTextKeepingEntities(tok.text);
      if (!fits(piece)) {
        // Fill what is left with whole characters of the escaped text, never
        // half an entity.
        const room = DICT_HTML_MAX_OUTPUT - out.length - closeCost();
        if (room > 0) {
          let cut = piece.slice(0, room);
          const amp = cut.lastIndexOf('&');
          if (amp >= 0 && !cut.slice(amp).includes(';')) cut = cut.slice(0, amp);
          out += cut;
        }
        break;
      }
      out += piece;
      continue;
    }
    if (tok.type === 'start') {
      const name = tok.name;
      if (RAW_TEXT_TAGS.has(name)) continue; // content already swallowed; the end token is ignored below.
      if (DROP_WITH_CONTENT.has(name)) {
        dropStack.push(name);
        continue;
      }
      if (!ALLOWED_TAGS.has(name)) continue; // drop the tag, keep its content
      const isVoid = name === 'br' || name === 'hr';
      if (!isVoid && stack.length >= MAX_DEPTH) continue;
      const piece = `<${name}${sanitizeAttrs(name, tok.attrs)}>`;
      if (!fits(piece + (isVoid ? '' : `</${name}>`))) break;
      out += piece;
      if (!isVoid) stack.push(name);
      continue;
    }
    // End tag.
    const name = tok.name;
    if (!ALLOWED_TAGS.has(name) || name === 'br' || name === 'hr') continue;
    const at = stack.lastIndexOf(name);
    if (at < 0) continue; // stray close tag
    while (stack.length > at) out += `</${stack.pop()}>`;
  }
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}

const BLOCK_BREAK_TAGS = new Set(['br', 'p', 'div', 'li', 'tr', 'hr', 'ul', 'ol', 'table', 'details', 'summary']);

/**
 * Plain text of dictionary HTML: tags removed (dropped elements with their
 * content), entities decoded, block boundaries turned into single spaces.
 * The result is text, not HTML — escape it before inserting it anywhere.
 */
export function stripDictHtml(html: string): string {
  if (typeof html !== 'string' || !html) return '';
  const toks = tokenize(html.length > MAX_INPUT ? html.slice(0, MAX_INPUT) : html);
  const dropStack: string[] = [];
  let out = '';
  for (const tok of toks) {
    if (dropStack.length) {
      const top = dropStack[dropStack.length - 1];
      if (tok.type === 'start' && tok.name === top && !VOID_TAGS.has(tok.name)) dropStack.push(tok.name);
      else if (tok.type === 'end' && tok.name === top) dropStack.pop();
      continue;
    }
    if (tok.type === 'text') out += tok.text;
    else if (tok.type === 'start' && DROP_WITH_CONTENT.has(tok.name)) dropStack.push(tok.name);
    else if (BLOCK_BREAK_TAGS.has(tok.name)) out += ' ';
  }
  return decodeBasicEntities(out).replace(/\s+/g, ' ').trim();
}
