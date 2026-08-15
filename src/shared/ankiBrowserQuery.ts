// The Deck Workbench Browser's nested filters — ANKI_DECK_WORKBENCH_PLAN.md
// Phase 3 ("nested filters, saved views …") and the plan's "Advanced rules …
// expose nested `AND`/`OR`, field and scheduler predicates, regex".
//
// Phase 2's search was one flat string of required substrings, and its own
// comment named this slice as the thing that would replace it: "a filter that
// silently ignores `deck:x` and returns everything is worse than no filter".
// So the rule this module is built around is that **an unrecognized key is a
// parse error, not a no-op** — the same refusal the change tray makes for a bad
// regex. A query either means something exact or it is rejected with the token
// that broke it, and the Browser shows nothing until the user fixes it.
//
// A second rule: a predicate reads a row's own data, never its *columns*.
// Hiding a column must not change what a filter matches.
//
// Nothing here is user-visible English. A parse failure carries a code the
// surface resolves to an i18n string plus the offending token, which is the
// user's own typing and is never translated.

import type { BrowserRow } from './ankiWorkbenchBrowser';

// ----- the tree ----------------------------------------------------------------

/** Substring over the whole row haystack — the Phase 2 meaning of a bare word. */
export interface AnyTextPredicate {
  kind: 'text';
  /** Already lower-cased. */
  needle: string;
}

/** Regex over the whole row haystack (`re:pat`) or over one field. */
export interface RegexPredicate {
  kind: 'regex';
  source: string;
  /** Absent = the whole haystack. */
  fieldName?: string;
}

export interface FieldPredicate {
  kind: 'field';
  fieldName: string;
  /** Lower-cased. Empty means "this field is empty", which is Anki's `Front:`. */
  needle: string;
  /** The needle carried a `*`, so it is anchored and matched as a pattern. */
  wildcard: boolean;
}

export interface TagPredicate {
  kind: 'tag';
  /** Lower-cased; `*` allowed. `none` is handled by `absent`. */
  needle: string;
  wildcard: boolean;
  /** `tag:none` — the note carries no tags at all. */
  absent: boolean;
}

export interface DeckPredicate {
  kind: 'deck';
  needle: string;
  wildcard: boolean;
}

export interface NoteTypePredicate {
  kind: 'noteType';
  needle: string;
  wildcard: boolean;
}

export interface FlagPredicate {
  kind: 'flag';
  /** `is:marked` / `is:unmarked`. */
  marked: boolean;
}

export type NumericOp = '=' | '>' | '<' | '>=' | '<=';

/** `cards:>1` — how many cards the note generates. The only count a row holds. */
export interface CardCountPredicate {
  kind: 'cards';
  op: NumericOp;
  value: number;
}

export type BrowserPredicate =
  | AnyTextPredicate
  | RegexPredicate
  | FieldPredicate
  | TagPredicate
  | DeckPredicate
  | NoteTypePredicate
  | FlagPredicate
  | CardCountPredicate;

export interface BrowserFilterGroup {
  kind: 'group';
  op: 'and' | 'or';
  children: BrowserFilterNode[];
}

export interface BrowserFilterNot {
  kind: 'not';
  child: BrowserFilterNode;
}

export type BrowserFilterNode = BrowserFilterGroup | BrowserFilterNot | BrowserPredicate;

// ----- parse results -----------------------------------------------------------

export type BrowserQueryErrorCode =
  | 'unknown-key'
  | 'bad-regex'
  | 'unbalanced-paren'
  | 'empty-group'
  | 'dangling-operator';

export interface BrowserQueryError {
  code: BrowserQueryErrorCode;
  /** The exact text that broke, shown verbatim — it is the user's own typing. */
  token: string;
}

export type BrowserQueryResult =
  | { ok: true; filter: BrowserFilterNode | null }
  | { ok: false; error: BrowserQueryError };

/** What the parser needs to tell a field name from a typo. */
export interface BrowserQuerySchema {
  /** Every field name in the draft, as `browserFieldNames` returns them. */
  fieldNames: string[];
}

/** Keys that are not field names. `re` is handled where it appears. */
const RESERVED_KEYS = new Set(['deck', 'tag', 'note', 'is', 'cards', 're']);

// ----- tokenizer ---------------------------------------------------------------

interface Token {
  /** The token text, with the quotes themselves removed. */
  text: string;
  /**
   * The token is *entirely* one quoted run, so it is literal text: neither an
   * operator word nor a `key:value`. `deck:"my deck"` is deliberately NOT this
   * — quoting a value must not stop it being a deck search — while `"or"` and
   * `"c1::cloze"` are, which is the only way to search for either verbatim.
   */
  quoted: boolean;
}

/** Characters the tokenizer itself consumes; a `\` before anything else survives. */
const TOKENIZER_ESCAPABLE = new Set(['"', '(', ')', '\\', ' ', '\t', '\n']);

/**
 * Splits on whitespace, honours `"…"` (including around a value, `deck:"a b"`),
 * `\` escapes, and makes `(` and `)` their own tokens when they are unquoted —
 * so a regex containing a paren or a space has to be quoted (`re:"^a (b|c)$"`),
 * exactly as Anki's own browser requires.
 */
export function tokenizeBrowserQuery(query: string): Token[] {
  const out: Token[] = [];
  let buf = '';
  let inQuote = false;
  let sawQuote = false;
  /** Still true while every character of this token came from inside quotes. */
  let onlyQuoted = true;
  const flush = (): void => {
    if (buf !== '' || sawQuote) out.push({ text: buf, quoted: sawQuote && onlyQuoted });
    buf = '';
    sawQuote = false;
    onlyQuoted = true;
  };
  for (let i = 0; i < query.length; i += 1) {
    const ch = query[i] ?? '';
    if (ch === '\\' && i + 1 < query.length) {
      const next = query[i + 1] ?? '';
      // A `\` that shields a tokenizer character is consumed here. Any other
      // `\` is passed through intact, because the layers below still need it —
      // `\*` means a literal star to the wildcard matcher, and a regex is full
      // of backslashes that are none of this function's business.
      buf += TOKENIZER_ESCAPABLE.has(next) ? next : ch + next;
      if (!inQuote) onlyQuoted = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuote = !inQuote;
      sawQuote = true;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      flush();
      continue;
    }
    if (!inQuote && (ch === '(' || ch === ')')) {
      flush();
      out.push({ text: ch, quoted: false });
      continue;
    }
    buf += ch;
    if (!inQuote) onlyQuoted = false;
  }
  flush();
  return out;
}

// ----- parser ------------------------------------------------------------------

function compileWildcard(needle: string): boolean {
  // Only `*` is a wildcard. Anki also treats `_` as one, but `_` is ordinary
  // text in deck names, tags and media-derived fields, and a filter that
  // quietly widens on a literal underscore is the same failure this module
  // exists to avoid. `\*` is a literal star.
  return /(^|[^\\])\*/.test(needle);
}

function unescapeStar(needle: string): string {
  return needle.replace(/\\\*/g, '*');
}

function wildcardToRegex(needle: string): RegExp {
  const escaped = needle
    .split(/(?<!\\)\*/)
    .map((part) => unescapeStar(part).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'iu');
}

function parseNumeric(raw: string): { op: NumericOp; value: number } | null {
  const m = /^(>=|<=|>|<|=)?\s*(\d+)$/.exec(raw);
  if (!m) return null;
  return { op: (m[1] as NumericOp | undefined) ?? '=', value: Number(m[2]) };
}

function predicateFromTerm(token: Token, schema: BrowserQuerySchema): BrowserPredicate | BrowserQueryError {
  const { text, quoted } = token;
  const colon = quoted ? -1 : text.indexOf(':');
  if (colon <= 0) {
    return { kind: 'text', needle: text.toLowerCase() };
  }
  const key = text.slice(0, colon);
  const value = text.slice(colon + 1);
  const lowerKey = key.toLowerCase();

  if (lowerKey === 're') {
    try {
      new RegExp(value, 'iu');
    } catch {
      return { code: 'bad-regex', token: value };
    }
    return { kind: 'regex', source: value };
  }
  if (lowerKey === 'tag') {
    if (value.toLowerCase() === 'none') {
      return { kind: 'tag', needle: '', wildcard: false, absent: true };
    }
    return {
      kind: 'tag',
      needle: unescapeStar(value).toLowerCase(),
      wildcard: compileWildcard(value),
      absent: false,
    };
  }
  if (lowerKey === 'deck') {
    return { kind: 'deck', needle: unescapeStar(value).toLowerCase(), wildcard: compileWildcard(value) };
  }
  if (lowerKey === 'note') {
    return {
      kind: 'noteType',
      needle: unescapeStar(value).toLowerCase(),
      wildcard: compileWildcard(value),
    };
  }
  if (lowerKey === 'is') {
    const v = value.toLowerCase();
    if (v === 'marked') return { kind: 'flag', marked: true };
    if (v === 'unmarked') return { kind: 'flag', marked: false };
    return { code: 'unknown-key', token: text };
  }
  if (lowerKey === 'cards') {
    const num = parseNumeric(value);
    if (!num) return { code: 'unknown-key', token: text };
    return { kind: 'cards', op: num.op, value: num.value };
  }

  // A field name, matched case-insensitively against the draft's own fields so
  // `expression:食べる` works without the user reproducing the exact casing.
  const field = schema.fieldNames.find((name) => name.toLowerCase() === lowerKey);
  if (!field) return { code: 'unknown-key', token: text };
  if (value.toLowerCase().startsWith('re:')) {
    const source = value.slice(3);
    try {
      new RegExp(source, 'iu');
    } catch {
      return { code: 'bad-regex', token: source };
    }
    return { kind: 'regex', source, fieldName: field };
  }
  return {
    kind: 'field',
    fieldName: field,
    needle: unescapeStar(value).toLowerCase(),
    wildcard: compileWildcard(value),
  };
}

function isError(x: unknown): x is BrowserQueryError {
  return typeof x === 'object' && x !== null && 'code' in x;
}

/**
 * Recursive descent over `or` ( `and`? unary )*, where `and` is implicit — the
 * shape Anki's own browser uses, so a query a user already knows keeps working.
 * Every bare word still means "this substring appears somewhere in the row",
 * which makes Phase 2's flat search an exact subset of this grammar.
 */
export function parseBrowserQuery(query: string, schema: BrowserQuerySchema): BrowserQueryResult {
  const tokens = tokenizeBrowserQuery(query);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const isWord = (tok: Token | undefined, word: string): boolean =>
    !!tok && !tok.quoted && tok.text.toLowerCase() === word;

  function parseOr(): BrowserFilterNode | BrowserQueryError {
    const first = parseAnd();
    if (isError(first)) return first;
    const children = [first];
    while (isWord(peek(), 'or')) {
      pos += 1;
      const next = parseAnd();
      if (isError(next)) return next;
      children.push(next);
    }
    return children.length === 1 ? (children[0] as BrowserFilterNode) : { kind: 'group', op: 'or', children };
  }

  function parseAnd(): BrowserFilterNode | BrowserQueryError {
    const children: BrowserFilterNode[] = [];
    for (;;) {
      const tok = peek();
      if (!tok) break;
      if (tok.text === ')' && !tok.quoted) break;
      if (isWord(tok, 'or')) break;
      if (isWord(tok, 'and')) {
        // An explicit `and` between two operands is the same as juxtaposition;
        // one with nothing on its left is a typo, not an empty conjunction.
        if (children.length === 0) return { code: 'dangling-operator', token: tok.text };
        pos += 1;
        const tail = peek();
        if (!tail || (tail.text === ')' && !tail.quoted) || isWord(tail, 'or')) {
          return { code: 'dangling-operator', token: tok.text };
        }
        continue;
      }
      const unary = parseUnary();
      if (isError(unary)) return unary;
      children.push(unary);
    }
    if (children.length === 0) return { code: 'empty-group', token: '' };
    return children.length === 1 ? (children[0] as BrowserFilterNode) : { kind: 'group', op: 'and', children };
  }

  function parseUnary(): BrowserFilterNode | BrowserQueryError {
    const tok = peek();
    if (!tok) return { code: 'dangling-operator', token: '' };
    if (!tok.quoted && (tok.text === '-' || tok.text.toLowerCase() === 'not')) {
      pos += 1;
      const child = parseUnary();
      return isError(child) ? child : { kind: 'not', child };
    }
    if (!tok.quoted && tok.text.startsWith('-') && tok.text.length > 1) {
      pos += 1;
      const inner = predicateFromTerm({ text: tok.text.slice(1), quoted: false }, schema);
      return isError(inner) ? inner : { kind: 'not', child: inner };
    }
    if (!tok.quoted && tok.text === '(') {
      pos += 1;
      const inner = parseOr();
      if (isError(inner)) return inner;
      const close = peek();
      if (!close || close.text !== ')' || close.quoted) return { code: 'unbalanced-paren', token: '(' };
      pos += 1;
      return inner;
    }
    if (!tok.quoted && tok.text === ')') return { code: 'unbalanced-paren', token: ')' };
    pos += 1;
    const pred = predicateFromTerm(tok, schema);
    return isError(pred) ? pred : pred;
  }

  if (tokens.length === 0) return { ok: true, filter: null };
  const root = parseOr();
  if (isError(root)) return { ok: false, error: root };
  const rest = peek();
  if (rest) return { ok: false, error: { code: 'unbalanced-paren', token: rest.text } };
  return { ok: true, filter: root };
}

// ----- evaluation --------------------------------------------------------------

type RowTest = (row: BrowserRow) => boolean;

function compareNumeric(op: NumericOp, left: number, right: number): boolean {
  switch (op) {
    case '=':
      return left === right;
    case '>':
      return left > right;
    case '<':
      return left < right;
    case '>=':
      return left >= right;
    default:
      return left <= right;
  }
}

function matchesNeedle(haystack: string, needle: string, wildcard: boolean, re: RegExp | null): boolean {
  return wildcard && re ? re.test(haystack) : haystack.toLowerCase().includes(needle);
}

/**
 * Compiled once per query, not once per row: a 100k-note draft would otherwise
 * build the same RegExp a hundred thousand times, which is the shape of defect
 * the change-tray preview shipped and then had to fix.
 */
export function compileBrowserFilter(node: BrowserFilterNode): RowTest {
  switch (node.kind) {
    case 'group': {
      const tests = node.children.map(compileBrowserFilter);
      return node.op === 'and'
        ? (row) => tests.every((test) => test(row))
        : (row) => tests.some((test) => test(row));
    }
    case 'not': {
      const test = compileBrowserFilter(node.child);
      return (row) => !test(row);
    }
    case 'text': {
      const needle = node.needle;
      return (row) => row.search.includes(needle);
    }
    case 'regex': {
      let re: RegExp;
      try {
        re = new RegExp(node.source, 'iu');
      } catch {
        // Unreachable through `parseBrowserQuery`, which rejects a bad pattern.
        // A hand-built tree still must not throw during a render.
        return () => false;
      }
      const fieldName = node.fieldName;
      return fieldName === undefined
        ? (row) => re.test(row.search)
        : (row) => re.test(row.fields[fieldName] ?? '');
    }
    case 'field': {
      const re = node.wildcard ? wildcardToRegex(node.needle) : null;
      const { fieldName, needle, wildcard } = node;
      return (row) => {
        const value = row.fields[fieldName];
        // Absent and empty are the same answer to "is this field empty" only
        // when the note type has the field at all; a note of another type
        // genuinely has no such field and must not match `Field:`.
        if (value === undefined) return false;
        if (needle === '' && !wildcard) return value.trim() === '';
        return matchesNeedle(value, needle, wildcard, re);
      };
    }
    case 'tag': {
      if (node.absent) return (row) => row.tags.length === 0;
      const re = node.wildcard ? wildcardToRegex(node.needle) : null;
      const { needle, wildcard } = node;
      return (row) => row.tags.some((tag) => matchesNeedle(tag, needle, wildcard, re));
    }
    case 'deck': {
      const re = node.wildcard ? wildcardToRegex(node.needle) : null;
      const { needle, wildcard } = node;
      return (row) => row.deckNames.some((name) => matchesNeedle(name, needle, wildcard, re));
    }
    case 'noteType': {
      const re = node.wildcard ? wildcardToRegex(node.needle) : null;
      const { needle, wildcard } = node;
      return (row) => matchesNeedle(row.noteTypeName, needle, wildcard, re);
    }
    case 'flag': {
      const want = node.marked;
      return (row) => row.marked === want;
    }
    default: {
      const { op, value } = node;
      return (row) => compareNumeric(op, row.cardCount, value);
    }
  }
}

export function matchBrowserRows(rows: BrowserRow[], filter: BrowserFilterNode | null): BrowserRow[] {
  if (!filter) return rows;
  const test = compileBrowserFilter(filter);
  return rows.filter(test);
}

/**
 * The one call the surface makes. A parse failure returns no rows *and* the
 * error, so the Browser can say which token broke instead of showing an empty
 * grid that looks like "nothing matched".
 */
export function filterBrowserRows(
  rows: BrowserRow[],
  query: string,
  schema: BrowserQuerySchema,
): { rows: BrowserRow[]; error: BrowserQueryError | null } {
  const parsed = parseBrowserQuery(query, schema);
  if (!parsed.ok) return { rows: [], error: parsed.error };
  return { rows: matchBrowserRows(rows, parsed.filter), error: null };
}
