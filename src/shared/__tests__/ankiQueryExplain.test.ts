import { describe, expect, it } from 'vitest';
import { en } from '../i18n/catalogs/en';
import {
  QUERY_EXPLAIN_KEY_PREFIX,
  explainBrowserQuery,
  inclusiveBound,
  queryExplainClauses,
  type QueryExplainNode,
} from '../ankiQueryExplain';
import type { BrowserQuerySchema } from '../ankiBrowserQuery';
import { emptyVocabContext } from '../ankiVocabContext';

/**
 * A schema with vocabulary resolved, so `freq:`/`known:` parse instead of
 * refusing. The context may be empty — this module explains the query and never
 * touches a row, which is exactly why it can be tested without a draft.
 */
const schema: BrowserQuerySchema = {
  fieldNames: ['Expression', 'Meaning'],
  vocab: emptyVocabContext(),
};

/** Field names only — `freq:`/`known:` are a refusal here, and explain nothing. */
const bare: BrowserQuerySchema = { fieldNames: ['Expression', 'Meaning'] };

function keys(node: QueryExplainNode | null): string[] {
  return node ? queryExplainClauses(node).map((c) => c.key.slice(QUERY_EXPLAIN_KEY_PREFIX.length)) : [];
}

function only(query: string, s: BrowserQuerySchema = schema): { key: string; vars?: Record<string, string | number> } {
  const node = explainBrowserQuery(query, s);
  const clauses = node ? queryExplainClauses(node) : [];
  expect(clauses).toHaveLength(1);
  const c = clauses[0]!;
  return { key: c.key.slice(QUERY_EXPLAIN_KEY_PREFIX.length), ...(c.vars ? { vars: c.vars } : {}) };
}

describe('inclusiveBound', () => {
  it('turns a strict comparison into the inclusive rank it really means', () => {
    expect(inclusiveBound('<', 5000)).toEqual({ side: 'atMost', bound: 4999 });
    expect(inclusiveBound('<=', 5000)).toEqual({ side: 'atMost', bound: 5000 });
    expect(inclusiveBound('>', 5000)).toEqual({ side: 'atLeast', bound: 5001 });
    expect(inclusiveBound('>=', 5000)).toEqual({ side: 'atLeast', bound: 5000 });
    expect(inclusiveBound('=', 5000)).toEqual({ side: 'exactly', bound: 5000 });
  });
});

describe('explainBrowserQuery — gate 3', () => {
  it('reads freq:<=5000 as the most frequent 5,000 words', () => {
    expect(only('freq:<=5000')).toEqual({ key: 'freqTop', vars: { rank: 5000 } });
    // The gate's sentence, assembled the way the UI assembles it.
    expect(en[`${QUERY_EXPLAIN_KEY_PREFIX}freqTop`]).toContain('{rank} most frequent words');
  });

  it('explains the whole gate-3 query, structure included', () => {
    const node = explainBrowserQuery('freq:<=5000 known:no', schema);
    expect(node?.kind).toBe('group');
    expect(node && node.kind === 'group' ? node.op : null).toBe('and');
    expect(keys(node)).toEqual(['freqTop', 'known.no']);
  });

  it('states the inclusive rank a strict comparison stands for, not the operator', () => {
    expect(only('freq:<5000')).toEqual({ key: 'freqTop', vars: { rank: 4999 } });
    expect(only('freq:>15000')).toEqual({ key: 'freqRarer', vars: { rank: 15001 } });
    expect(only('freq:=1')).toEqual({ key: 'freqExactly', vars: { rank: 1 } });
  });

  it('does not claim "the most frequent 0 words" for a rank nothing can hold', () => {
    expect(only('freq:<1')).toEqual({ key: 'freqNothing' });
  });

  it('keeps a band a closed range and the three absences distinct', () => {
    expect(only('freq:common')).toEqual({ key: 'freqBand', vars: { from: 1501, to: 5000 } });
    expect(only('freq:none')).toEqual({ key: 'freqUnranked' });
    expect(only('freq:noword')).toEqual({ key: 'freqNoWord' });
  });
});

describe('explainBrowserQuery — the rest of the grammar', () => {
  it('explains nothing for an empty query or a refused one', () => {
    expect(explainBrowserQuery('', schema)).toBeNull();
    expect(explainBrowserQuery('   ', schema)).toBeNull();
    // Unknown key, unbalanced bracket, and a `freq:` with no vocabulary context:
    // all three are refusals whose intent is unknown, so none of them explains.
    expect(explainBrowserQuery('nope:1', schema)).toBeNull();
    expect(explainBrowserQuery('(freq:<=5000', schema)).toBeNull();
    expect(explainBrowserQuery('freq:<=5000', bare)).toBeNull();
  });

  it('mirrors negation and nesting rather than flattening them', () => {
    const node = explainBrowserQuery('-tag:none (is:marked or cards:>1)', schema);
    expect(node?.kind).toBe('group');
    const children = node && node.kind === 'group' ? node.children : [];
    expect(children[0]?.kind).toBe('not');
    expect(children[1]?.kind).toBe('group');
    expect(children[1] && children[1].kind === 'group' ? children[1].op : null).toBe('or');
    expect(keys(node)).toEqual(['tagNone', 'marked', 'cardsAtLeast']);
  });

  it('normalizes a card-count comparison the same way a rank is normalized', () => {
    expect(only('cards:>1')).toEqual({ key: 'cardsAtLeast', vars: { cards: 2 } });
    expect(only('cards:<=1')).toEqual({ key: 'cardsAtMost', vars: { cards: 1 } });
    expect(only('cards:1')).toEqual({ key: 'cardsExactly', vars: { cards: 1 } });
  });

  it('tells a field search from a pattern and from an emptiness test', () => {
    expect(only('Expression:猫')).toEqual({ key: 'field', vars: { field: 'Expression', needle: '猫' } });
    expect(only('Expression:猫*')).toEqual({ key: 'fieldPattern', vars: { field: 'Expression', pattern: '猫*' } });
    expect(only('Expression:')).toEqual({ key: 'fieldEmpty', vars: { field: 'Expression' } });
  });

  it('passes a script name as a key, never as English text', () => {
    const latin = only('Expression:script:latin');
    expect(latin.key).toBe('scriptField');
    expect(latin.vars?.script).toBe(`${QUERY_EXPLAIN_KEY_PREFIX}script.latin`);
    expect(only('script:none')).toEqual({ key: 'scriptNone' });
  });

  it('has an English string for every key it can emit', () => {
    const queries = [
      'hello', 're:^a', 'Expression:re:^a', 'Expression:猫', 'Expression:猫*', 'Expression:',
      'tag:core', 'tag:none', 'tag:core*', 'deck:jp', 'deck:jp*', 'note:Basic', 'note:Bas*',
      'is:marked', 'is:unmarked', 'cards:1', 'cards:<1', 'cards:>1',
      'freq:<=5000', 'freq:<1', 'freq:>1', 'freq:=1', 'freq:common', 'freq:none', 'freq:noword',
      'known:yes', 'known:no', 'known:local', 'known:anki', 'known:both', 'known:conflict', 'known:none',
      'script:latin', 'Expression:script:kana', 'script:none', 'Expression:script:none',
    ];
    const emitted = new Set<string>();
    for (const q of queries) {
      const node = explainBrowserQuery(q, schema);
      expect(node, q).not.toBeNull();
      for (const c of queryExplainClauses(node!)) {
        emitted.add(c.key);
        const script = c.vars?.script;
        if (typeof script === 'string') emitted.add(script);
      }
    }
    // Every emitted key resolves, plus the four structural ones the UI renders.
    for (const key of [
      ...emitted,
      `${QUERY_EXPLAIN_KEY_PREFIX}title`,
      `${QUERY_EXPLAIN_KEY_PREFIX}not`,
      `${QUERY_EXPLAIN_KEY_PREFIX}group.and`,
      `${QUERY_EXPLAIN_KEY_PREFIX}group.or`,
    ]) {
      expect(en[key], key).toBeTypeOf('string');
    }
    // 36 queries reach every clause branch this module has; a new predicate kind
    // that forgets its string fails above rather than rendering a dotted key.
    expect(emitted.size).toBeGreaterThanOrEqual(36);
  });
});
