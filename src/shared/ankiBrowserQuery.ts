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
import { parseCardHealth, type CardHealth, type CardHealthContext } from './ankiCardHealth';
import { FREQUENCY_BAND_LIMITS, type LexiconFrequencyBand } from './lexiconFrequency';
import { containsScript, hasNoScript, parseTextScript, type TextScript } from './textScripts';
import {
  extractVocabTerm,
  isVocabKnownConflict,
  resolveVocabField,
  resolveVocabKnown,
  type VocabContext,
  type VocabNoteFacts,
} from './ankiVocabContext';
import {
  parseSentenceCover,
  resolveReadingField,
  resolveSentenceField,
  sentenceCover,
  type SentenceCover,
} from './ankiSentenceCover';

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

/**
 * `freq:<=5000`, `freq:common`, `freq:none`, `freq:noword` — Phase 4 gate 3.
 *
 * Three separate absences, because collapsing them would let a filter claim
 * something nobody measured. A numeric or band comparison matches only a note
 * whose word an installed corpus actually ranked; `none` is a word no corpus
 * knows; `noword` is a note no word could be read from at all (its note type
 * declares no word field, or the field holds prose). "Unranked" is therefore
 * never silently sorted in with "rare", which is the whole reason
 * `lexiconFrequency.ts` keeps the rank nullable.
 */
export interface FrequencyPredicate {
  kind: 'freq';
  /** A rank comparison. Absent for a band range and for the two absence modes. */
  op?: NumericOp;
  value?: number;
  /**
   * A closed inclusive rank range, from a band name (`freq:common`). A band is
   * a range rather than a `<=` so the four bands partition the ranks instead of
   * nesting — otherwise `freq:common` would also return every very-common word
   * and "how many are merely common" could not be asked.
   */
  range?: { from: number; to: number };
  /** `none` = ranked by nothing; `noword` = no headword to rank. */
  absence?: 'none' | 'noword';
}

/**
 * `known:yes|no|local|anki|both|conflict|none` — Phase 4 gate 4.
 *
 * `yes`/`no` are the verdict after the context's precedence has resolved any
 * disagreement; `local`/`anki`/`both` name a source directly; `conflict` finds
 * the items gate 4 asks the user to resolve; `none` is the notes neither source
 * has an opinion about. A note with no data at all matches **only** `none` —
 * not `no`, which would report a word the user was never asked about as one
 * they do not know.
 *
 * A scheduled card is always an Anki answer, including a new one: Anki measured
 * it and it is not mature. Silence is a note with no card at all, or a word
 * this install's knowledge store has never held an entry for.
 */
export interface KnownPredicate {
  kind: 'known';
  mode: 'yes' | 'no' | 'local' | 'anki' | 'both' | 'conflict' | 'none';
}

/**
 * `script:latin`, `Expression:script:kana`, `script:none` — smart recipe 8,
 * "detect wrong-language or wrong-script content in a chosen field".
 *
 * Containment, never a language verdict: `textScripts.ts` explains why. The
 * useful audit query is a composition — `Expression:script:latin` finds English
 * where Japanese belongs, and `-Expression:script:han -Expression:script:kana`
 * finds an expression field with no Japanese at all, using the negation the
 * grammar already has rather than a `not-` spelling of every mode.
 *
 * **Unscoped, this reads the note's fields and not `row.search`.** The haystack
 * also carries tags and deck names, which are Latin in nearly every real deck,
 * so `script:latin` over it would match everything and read as a broken filter.
 */
export interface ScriptPredicate {
  kind: 'script';
  /** Absent = any field of the note. */
  fieldName?: string;
  /** Absent when `absence` is set. */
  script?: TextScript;
  /** `script:none` — no letter of any known script. */
  absence?: 'none';
}

/**
 * `cover:none`, `Example:cover:stem` — smart recipe 16, "find sentence cards
 * missing the target expression or reading".
 *
 * Unscoped it reads the note's *sentence* field, resolved by
 * `resolveSentenceField` the same way `freq:` resolves the word field — a user
 * filtering a mined deck should not have to know it calls the field `Example`.
 * Field-scoped it reads exactly the field named, spelled like `Field:script:`.
 *
 * The four modes are spelled out rather than offered as `cover:broken` because
 * `none` is a candidate to review and not a verdict: the stem rule is a prefix
 * rule and misses 来る → きた. `ankiSentenceCover.ts` lists what it misses.
 */
export interface SentenceCoverPredicate {
  kind: 'cover';
  /** Absent = the note's own sentence field. */
  fieldName?: string;
  cover: SentenceCover;
}

/**
 * `render:same`, `render:broken` — smart recipe 15, "identify empty backs,
 * identical front/back renders, and broken templates".
 *
 * Unlike every other predicate this one cannot be answered from the row: the
 * verdict is about the note type's *templates*, and a row carries only field
 * values. So it reads `schema.render`, precomputed once per draft by
 * `buildCardHealthContext`, exactly the way `freq:`/`known:` read
 * `schema.vocab` — and refuses the same way when that context is absent.
 */
export interface CardHealthPredicate {
  kind: 'render';
  health: CardHealth;
}

export type BrowserPredicate =
  | AnyTextPredicate
  | RegexPredicate
  | FieldPredicate
  | TagPredicate
  | DeckPredicate
  | NoteTypePredicate
  | FlagPredicate
  | CardCountPredicate
  | FrequencyPredicate
  | KnownPredicate
  | ScriptPredicate
  | SentenceCoverPredicate
  | CardHealthPredicate;

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
  | 'dangling-operator'
  /**
   * `freq:` or `known:` was used while the surface had no vocabulary context to
   * read. The refusal names the token, exactly like an unknown key: a
   * frequency filter that quietly matches every note — or none — is worse than
   * no filter, and the user cannot tell the two apart from an empty grid.
   */
  | 'no-vocab-context'
  /**
   * `render:` was used while the surface had no rendered-card verdicts to read.
   * Its own code and not `no-vocab-context`, because the two are cleared by
   * different things: vocabulary context waits on a frequency dictionary, and
   * render context waits only on the draft itself. Telling a user to load a
   * dictionary would send them after the wrong thing entirely.
   */
  | 'no-render-context';

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
  /**
   * Per-note ranks and known state, from `buildVocabContext`. Absent means the
   * surface has not resolved any vocabulary facts, and `freq:`/`known:` are a
   * refusal rather than a filter — see `no-vocab-context`.
   */
  vocab?: VocabContext;
  /**
   * Per-note rendered-card verdicts, from `buildCardHealthContext`. Absent
   * means nothing has rendered this draft's cards, and `render:` is a refusal
   * rather than a filter — see `no-render-context`.
   */
  render?: CardHealthContext;
}

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

/** Band name → the rank it ends at, so `freq:common` reads the shared limits. */
const FREQUENCY_BAND_BY_NAME = new Map<string, LexiconFrequencyBand>(
  [...FREQUENCY_BAND_LIMITS.map(([band]) => band), 'rare' as const].map((band) => [
    band.toLowerCase(),
    band,
  ]),
);

function bandRange(band: LexiconFrequencyBand): { from: number; to: number } {
  let from = 1;
  for (const [name, limit] of FREQUENCY_BAND_LIMITS) {
    if (name === band) return { from, to: limit };
    from = limit + 1;
  }
  return { from, to: Number.MAX_SAFE_INTEGER };
}

function parseFrequencyValue(value: string): BrowserPredicate | null {
  const v = value.toLowerCase();
  if (v === 'none' || v === 'noword') return { kind: 'freq', absence: v };
  const band = FREQUENCY_BAND_BY_NAME.get(v);
  if (band) return { kind: 'freq', range: bandRange(band) };
  const num = parseNumeric(value);
  return num ? { kind: 'freq', op: num.op, value: num.value } : null;
}

const KNOWN_MODES: ReadonlySet<KnownPredicate['mode']> = new Set([
  'yes',
  'no',
  'local',
  'anki',
  'both',
  'conflict',
  'none',
]);

function parseKnownValue(value: string): BrowserPredicate | null {
  const v = value.toLowerCase() as KnownPredicate['mode'];
  return KNOWN_MODES.has(v) ? { kind: 'known', mode: v } : null;
}

/** `none` or one `TextScript`. Unlike `freq:`, this needs no context to answer. */
function parseScriptValue(value: string): ScriptPredicate | null {
  if (value.toLowerCase() === 'none') return { kind: 'script', absence: 'none' };
  const script = parseTextScript(value);
  return script ? { kind: 'script', script } : null;
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
  if (lowerKey === 'script') {
    return parseScriptValue(value) ?? { code: 'unknown-key', token: text };
  }
  if (lowerKey === 'cover') {
    const cover = parseSentenceCover(value);
    return cover ? { kind: 'cover', cover } : { code: 'unknown-key', token: text };
  }
  if (lowerKey === 'render') {
    // Refused before the value is read, for the reason `freq:`/`known:` give.
    if (!schema.render) return { code: 'no-render-context', token: text };
    const health = parseCardHealth(value);
    return health ? { kind: 'render', health } : { code: 'unknown-key', token: text };
  }
  if (lowerKey === 'freq' || lowerKey === 'known') {
    // The refusal comes before the value is even read: with no context, every
    // spelling of the key is equally unanswerable, and reporting "unknown
    // value" would send the user off correcting a query that is already right.
    if (!schema.vocab) return { code: 'no-vocab-context', token: text };
    const parsed = lowerKey === 'freq' ? parseFrequencyValue(value) : parseKnownValue(value);
    return parsed ?? { code: 'unknown-key', token: text };
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
  // `Expression:script:kana`, the field-scoped form, spelled exactly like
  // `Field:re:` above so a user who knows one already knows the other.
  if (value.toLowerCase().startsWith('script:')) {
    const scoped = parseScriptValue(value.slice(7));
    return scoped ? { ...scoped, fieldName: field } : { code: 'unknown-key', token: text };
  }
  // `Example:cover:none`, the field-scoped form, spelled like the two above.
  if (value.toLowerCase().startsWith('cover:')) {
    const cover = parseSentenceCover(value.slice(6));
    return cover ? { kind: 'cover', cover, fieldName: field } : { code: 'unknown-key', token: text };
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
export function compileBrowserFilter(
  node: BrowserFilterNode,
  vocab?: VocabContext,
  render?: CardHealthContext,
): RowTest {
  switch (node.kind) {
    case 'group': {
      const tests = node.children.map((child) => compileBrowserFilter(child, vocab, render));
      return node.op === 'and'
        ? (row) => tests.every((test) => test(row))
        : (row) => tests.some((test) => test(row));
    }
    case 'not': {
      const test = compileBrowserFilter(node.child, vocab, render);
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
    case 'cards': {
      const { op, value } = node;
      return (row) => compareNumeric(op, row.cardCount, value);
    }
    case 'freq': {
      // Unreachable through `parseBrowserQuery`, which refuses the token when
      // there is no context. A hand-built tree still must not match everything.
      if (!vocab) return () => false;
      const facts = vocab.byNote;
      if (node.absence === 'noword') return (row) => factsFor(facts, row).term === null;
      if (node.absence === 'none') {
        // A note with no word is not a word nothing ranks. It is excluded here
        // and found by `freq:noword` instead.
        return (row) => {
          const f = factsFor(facts, row);
          return f.term !== null && f.rank === null;
        };
      }
      const { range, op, value } = node;
      if (range) {
        return (row) => {
          const rank = factsFor(facts, row).rank;
          return rank !== null && rank >= range.from && rank <= range.to;
        };
      }
      if (op === undefined || value === undefined) return () => false;
      return (row) => {
        const rank = factsFor(facts, row).rank;
        return rank !== null && compareNumeric(op, rank, value);
      };
    }
    case 'script': {
      const { fieldName, script, absence } = node;
      if (fieldName !== undefined) {
        // Absent is not empty, exactly as `field` decides it: a note of another
        // note type genuinely has no such field, and reporting it as "holds no
        // Japanese" would put every other note type into a wrong-script audit.
        return (row) => {
          const value = row.fields[fieldName];
          if (value === undefined) return false;
          return absence === 'none' ? hasNoScript(value) : !!script && containsScript(value, script);
        };
      }
      // Unscoped reads the fields, never `row.search` — see `ScriptPredicate`.
      // `script:none` is "every field is letter-free", not "some field is":
      // otherwise a normal note with one empty field would answer yes.
      return (row) => {
        const values = Object.values(row.fields);
        return absence === 'none'
          ? values.every(hasNoScript)
          : !!script && values.some((value) => containsScript(value, script));
      };
    }
    case 'cover': {
      const { fieldName, cover } = node;
      return (row) => {
        // Every field name is read off the *row*, not off a draft-wide schema:
        // a mixed deck holds several note types and each declares its own
        // sentence, word and reading fields. Resolving once for the draft would
        // score one note type's notes against another's field names.
        const names = Object.keys(row.fields);
        const sentenceField = fieldName ?? resolveSentenceField(names);
        if (sentenceField === null) return false;
        const sentence = row.fields[sentenceField];
        // Absent is not empty, the same rule `field` and `script` both apply: a
        // note type with no such field has no coverage verdict, and calling that
        // `none` would report every vocabulary note as a broken sentence card.
        if (sentence === undefined) return false;
        const wordField = resolveVocabField(names);
        if (wordField === null) return false;
        const term = extractVocabTerm(row.fields[wordField] ?? '');
        if (term === null) return false;
        const readingField = resolveReadingField(names);
        return (
          sentenceCover({
            sentence,
            term,
            reading: readingField === null ? null : (row.fields[readingField] ?? null),
          }) === cover
        );
      };
    }
    case 'render': {
      // No context is a filter that matches nothing, which is why the parser
      // refuses `render:` outright before ever reaching here. This guard is for
      // a caller that compiled a tree it did not parse against the same schema.
      if (!render) return () => false;
      const { health } = node;
      // A row whose note the context never saw is not a match: absent is not
      // `ok`, the same rule `cover:` applies to a missing sentence field.
      return (row) => render.get(row.noteId) === health;
    }
    default: {
      if (!vocab) return () => false;
      const facts = vocab.byNote;
      const precedence = vocab.precedence;
      const { mode } = node;
      return (row) => {
        const known = factsFor(facts, row).known;
        switch (mode) {
          case 'local':
            return known.local === true;
          case 'anki':
            return known.anki === true;
          case 'both':
            return known.local === true && known.anki === true;
          case 'conflict':
            return isVocabKnownConflict(known);
          case 'none':
            return known.local === null && known.anki === null;
          case 'no':
            // Only a source that spoke can say "no"; a word nobody has an
            // opinion about is `known:none`, never `known:no`.
            return resolveVocabKnown(known, precedence) === 'unknown';
          default:
            return resolveVocabKnown(known, precedence) === 'known';
        }
      };
    }
  }
}

/**
 * A row whose note the context never saw. `buildVocabContext` gives every note
 * an entry, so this is the paged-source case: rows loaded after the context was
 * built are all-absent rather than throwing or matching.
 */
const NO_VOCAB_FACTS: VocabNoteFacts = {
  noteId: '',
  field: null,
  term: null,
  rank: null,
  known: { local: null, anki: null },
};

function factsFor(byNote: ReadonlyMap<string, VocabNoteFacts>, row: BrowserRow): VocabNoteFacts {
  return byNote.get(row.noteId) ?? NO_VOCAB_FACTS;
}

export function matchBrowserRows(
  rows: BrowserRow[],
  filter: BrowserFilterNode | null,
  vocab?: VocabContext,
  render?: CardHealthContext,
): BrowserRow[] {
  if (!filter) return rows;
  const test = compileBrowserFilter(filter, vocab, render);
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
  return {
    rows: matchBrowserRows(rows, parsed.filter, schema.vocab, schema.render),
    error: null,
  };
}
