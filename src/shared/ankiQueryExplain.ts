/**
 * Plain-language reading of a parsed Browser query — Phase 4 gate 3's
 * "explain that this means the most frequent 5,000 words".
 *
 * `freq:<=5000` is the query the gate asks for and it is unreadable: the number
 * is a corpus rank, not a count of cards, not a score, and not a threshold the
 * user set anywhere. A filter whose meaning the user has to guess is the same
 * failure `no-vocab-context` exists to prevent, one step later — an empty grid
 * and no way to tell a wrong query from an empty result.
 *
 * Two rules this module keeps:
 *
 * 1. **It returns i18n keys and variables, never prose.** Building the sentence
 *    here would hardcode English word order into shared logic, and the four
 *    catalogs are the only place that can get JA/ZH/RU right.
 * 2. **It explains the parsed tree, never the typed text.** The AST is what
 *    actually filtered, so an explanation cannot drift from the result — and a
 *    query that failed to parse produces no explanation at all rather than a
 *    guess at what the user meant.
 *
 * Comparison bounds are normalized to the inclusive rank they really mean:
 * `freq:<5000` explains as "the most frequent 4,999 words", because that is the
 * set it returns. Rewriting the operator instead ("ranked below 5000") would be
 * literally true and still leave the user counting off-by-ones.
 */
import {
  parseBrowserQuery,
  type BrowserFilterNode,
  type BrowserQuerySchema,
  type NumericOp,
} from './ankiBrowserQuery';

/** Every key this module emits starts here; `i18n-check` sees them as literals. */
export const QUERY_EXPLAIN_KEY_PREFIX = 'ankiWorkbench.browser.explain.';

export interface QueryExplainClause {
  kind: 'clause';
  /** A full i18n key, prefix included. */
  key: string;
  vars?: Record<string, string | number>;
}

export interface QueryExplainGroup {
  kind: 'group';
  op: 'and' | 'or';
  children: QueryExplainNode[];
}

export interface QueryExplainNot {
  kind: 'not';
  child: QueryExplainNode;
}

export type QueryExplainNode = QueryExplainClause | QueryExplainGroup | QueryExplainNot;

function clause(suffix: string, vars?: Record<string, string | number>): QueryExplainClause {
  return vars ? { kind: 'clause', key: QUERY_EXPLAIN_KEY_PREFIX + suffix, vars } : { kind: 'clause', key: QUERY_EXPLAIN_KEY_PREFIX + suffix };
}

/**
 * A comparison as the inclusive bound it stands for.
 *
 * `'atMost'` with bound 4999 for `<5000`, `'atLeast'` with 5001 for `>5000`.
 * Ranks are whole numbers, so this is exact rather than an approximation.
 */
export function inclusiveBound(op: NumericOp, value: number): { side: 'exactly' | 'atMost' | 'atLeast'; bound: number } {
  switch (op) {
    case '=':
      return { side: 'exactly', bound: value };
    case '<=':
      return { side: 'atMost', bound: value };
    case '<':
      return { side: 'atMost', bound: value - 1 };
    case '>=':
      return { side: 'atLeast', bound: value };
    case '>':
      return { side: 'atLeast', bound: value + 1 };
  }
}

function explainFrequency(node: Extract<BrowserFilterNode, { kind: 'freq' }>): QueryExplainNode {
  if (node.absence === 'none') return clause('freqUnranked');
  if (node.absence === 'noword') return clause('freqNoWord');
  if (node.range) return clause('freqBand', { from: node.range.from, to: node.range.to });
  if (node.op && node.value !== undefined) {
    const { side, bound } = inclusiveBound(node.op, node.value);
    if (side === 'exactly') return clause('freqExactly', { rank: bound });
    // "The most frequent N words" is only meaningful for N >= 1; `freq:<1`
    // matches nothing and must say so rather than claim the most frequent 0.
    if (side === 'atMost') return bound >= 1 ? clause('freqTop', { rank: bound }) : clause('freqNothing');
    return clause('freqRarer', { rank: bound });
  }
  return clause('freqUnranked');
}

function explainCards(node: Extract<BrowserFilterNode, { kind: 'cards' }>): QueryExplainNode {
  // `cards` and not `count`: `translate()` reads a `count` var for plural
  // selection, and these entries must never start behaving as plural forms.
  const { side, bound } = inclusiveBound(node.op, node.value);
  if (side === 'exactly') return clause('cardsExactly', { cards: bound });
  if (side === 'atMost') return clause('cardsAtMost', { cards: bound });
  return clause('cardsAtLeast', { cards: bound });
}

function explainPredicate(node: Exclude<BrowserFilterNode, { kind: 'group' } | { kind: 'not' }>): QueryExplainNode {
  switch (node.kind) {
    case 'text':
      return clause('text', { needle: node.needle });
    case 'regex':
      return node.fieldName
        ? clause('regexField', { field: node.fieldName, pattern: node.source })
        : clause('regex', { pattern: node.source });
    case 'field':
      if (node.needle === '') return clause('fieldEmpty', { field: node.fieldName });
      return node.wildcard
        ? clause('fieldPattern', { field: node.fieldName, pattern: node.needle })
        : clause('field', { field: node.fieldName, needle: node.needle });
    case 'tag':
      if (node.absent) return clause('tagNone');
      return node.wildcard ? clause('tagPattern', { pattern: node.needle }) : clause('tag', { tag: node.needle });
    case 'deck':
      return node.wildcard ? clause('deckPattern', { pattern: node.needle }) : clause('deck', { deck: node.needle });
    case 'noteType':
      return node.wildcard
        ? clause('noteTypePattern', { pattern: node.needle })
        : clause('noteType', { noteType: node.needle });
    case 'flag':
      return clause(node.marked ? 'marked' : 'unmarked');
    case 'cards':
      return explainCards(node);
    case 'freq':
      return explainFrequency(node);
    case 'known':
      return clause(`known.${node.mode}`);
    case 'script':
      if (node.absence === 'none') {
        return node.fieldName ? clause('scriptFieldNone', { field: node.fieldName }) : clause('scriptNone');
      }
      // The script name is its own key: "Latin" is a proper noun in English and
      // not one in Japanese, so it cannot be interpolated raw.
      return node.fieldName
        ? clause('scriptField', { field: node.fieldName, script: `${QUERY_EXPLAIN_KEY_PREFIX}script.${node.script}` })
        : clause('script', { script: `${QUERY_EXPLAIN_KEY_PREFIX}script.${node.script}` });
  }
}

/**
 * The parsed tree as an explanation tree of the same shape.
 *
 * A `vars` value that is itself a key (only `script`) is resolved by the caller;
 * see `renderQueryExplain` in the Browser, which translates it before
 * interpolating.
 */
export function explainBrowserFilter(node: BrowserFilterNode): QueryExplainNode {
  if (node.kind === 'group') {
    return { kind: 'group', op: node.op, children: node.children.map(explainBrowserFilter) };
  }
  if (node.kind === 'not') return { kind: 'not', child: explainBrowserFilter(node.child) };
  return explainPredicate(node);
}

/**
 * Explain a typed query, or `null` when there is nothing honest to say: an
 * empty query (which filters nothing) and a query that failed to parse (whose
 * error is already shown, and whose intent is unknown) both produce `null`.
 */
export function explainBrowserQuery(query: string, schema: BrowserQuerySchema): QueryExplainNode | null {
  const parsed = parseBrowserQuery(query, schema);
  if (!parsed.ok || !parsed.filter) return null;
  return explainBrowserFilter(parsed.filter);
}

/** Every clause in the tree, depth first — the flat form tests and probes read. */
export function queryExplainClauses(node: QueryExplainNode): QueryExplainClause[] {
  if (node.kind === 'clause') return [node];
  if (node.kind === 'not') return queryExplainClauses(node.child);
  return node.children.flatMap(queryExplainClauses);
}
