import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote } from '../ankiDraft';
import { browserFieldNames, buildBrowserRows, defaultBrowserColumns } from '../ankiWorkbenchBrowser';
import {
  compileBrowserFilter,
  filterBrowserRows,
  matchBrowserRows,
  parseBrowserQuery,
  tokenizeBrowserQuery,
} from '../ankiBrowserQuery';

function note(over: Partial<AnkiDraftNote> & { id: string }): AnkiDraftNote {
  return {
    guid: `g-${over.id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
    ...over,
  };
}

function card(id: string, noteId: string, deckId: string): AnkiDraftCard {
  return {
    id, noteId, deckId, ord: 0, type: 'new', queue: 'new', due: 0, interval: 0,
    easeFactor: 0, reps: 0, lapses: 0, left: 0, flag: 'none', modifiedAtSec: 0,
  };
}

const f = (ord: number, name: string, text: string) => ({ ord, name, raw: text, normalized: text });

const draft: AnkiDraft = {
  version: 1,
  source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
  decks: [
    { id: 'd1', name: 'Japanese::Core', path: ['Japanese', 'Core'], filtered: false },
    { id: 'd2', name: 'Japanese::Verbs', path: ['Japanese', 'Verbs'], filtered: false },
  ],
  noteTypes: [
    {
      id: 'nt1', name: 'Basic', kind: 'standard', css: '',
      fields: [
        { ord: 0, name: 'Meaning', sticky: false, rtl: false },
        { ord: 1, name: 'Expression', sticky: false, rtl: false },
      ],
      templates: [], sortFieldOrd: 1, latexPre: '', latexPost: '',
    },
    {
      id: 'nt2', name: 'Cloze', kind: 'cloze', css: '',
      fields: [{ ord: 0, name: 'Text', sticky: false, rtl: false }],
      templates: [], sortFieldOrd: 0, latexPre: '', latexPost: '',
    },
  ] as AnkiDraft['noteTypes'],
  notes: [
    note({
      id: 'n1', tags: ['core', 'verb'], cardIds: ['c1', 'c2'], marked: true,
      fields: [f(0, 'Meaning', 'to eat'), f(1, 'Expression', '食べる')],
    }),
    note({
      id: 'n2', noteTypeId: 'nt2', tags: [], cardIds: ['c3'],
      fields: [f(0, 'Text', 'a {{c1::cloze}} note')],
    }),
    note({
      id: 'n3', tags: ['core', 'jlpt::n5'], cardIds: ['c4'],
      fields: [f(0, 'Meaning', ''), f(1, 'Expression', '飲む')],
    }),
  ],
  cards: [card('c1', 'n1', 'd1'), card('c2', 'n1', 'd2'), card('c3', 'n2', 'd1'), card('c4', 'n3', 'd1')],
  diagnostics: [],
  counts: { notes: 3, cards: 4, decks: 2, noteTypes: 2, reviews: 0, mediaReferences: 0 },
};

const rows = buildBrowserRows(draft, defaultBrowserColumns(draft));
const schema = { fieldNames: browserFieldNames(draft) };

/** Ids the query keeps, or the error code it refused with. */
function ids(query: string): string[] | string {
  const out = filterBrowserRows(rows, query, schema);
  return out.error ? out.error.code : out.rows.map((r) => r.noteId);
}

describe('tokenizer', () => {
  it('keeps a quoted run whole and makes parens their own tokens', () => {
    expect(tokenizeBrowserQuery('a "b c" (d)').map((t) => t.text)).toEqual(['a', 'b c', '(', 'd', ')']);
  });

  it('a wholly quoted token is literal text even when it reads like an operator', () => {
    expect(tokenizeBrowserQuery('"or"')).toEqual([{ text: 'or', quoted: true }]);
    // …so it filters instead of joining: three ANDed substrings, not an OR.
    expect(parseBrowserQuery('a "or" b', schema)).toEqual({
      ok: true,
      filter: {
        kind: 'group',
        op: 'and',
        children: [
          { kind: 'text', needle: 'a' },
          { kind: 'text', needle: 'or' },
          { kind: 'text', needle: 'b' },
        ],
      },
    });
  });

  it('a quoted *value* is still a key:value, but a quoted whole token is not', () => {
    expect(tokenizeBrowserQuery('deck:"my deck"')).toEqual([
      { text: 'deck:my deck', quoted: false },
    ]);
    expect(tokenizeBrowserQuery('"c1::cloze"')).toEqual([{ text: 'c1::cloze', quoted: true }]);
    // The wholly quoted one must not be parsed as an unknown key `c1`.
    expect(ids('"c1::cloze"')).toEqual(['n2']);
  });

  it('a backslash escapes the next character', () => {
    expect(tokenizeBrowserQuery('a\\ b').map((t) => t.text)).toEqual(['a b']);
  });
});

describe('bare words stay Phase 2', () => {
  it('are substrings over fields, tags, decks and note type, all required', () => {
    expect(ids('')).toEqual(['n1', 'n2', 'n3']);
    expect(ids('core')).toEqual(['n1', 'n2', 'n3']); // every note has a card in Japanese::Core
    expect(ids('core verb')).toEqual(['n1']);
    expect(ids('飲む')).toEqual(['n3']);
  });
});

describe('an unrecognized key is a refusal, not a no-op', () => {
  it('rejects an unknown key rather than returning everything', () => {
    expect(ids('colour:red')).toBe('unknown-key');
    expect(ids('is:due')).toBe('unknown-key');
    expect(ids('cards:many')).toBe('unknown-key');
  });

  it('rejects a bad regex with the pattern that broke', () => {
    const out = filterBrowserRows(rows, 're:"(["', schema);
    expect(out.error).toEqual({ code: 'bad-regex', token: '([' });
    expect(out.rows).toEqual([]);
  });

  it('rejects unbalanced parens and a dangling operator', () => {
    expect(ids('(core')).toBe('unbalanced-paren');
    expect(ids('core)')).toBe('unbalanced-paren');
    expect(ids('and core')).toBe('dangling-operator');
    expect(ids('core and')).toBe('dangling-operator');
  });

  it('a refusal shows no rows — an empty grid must not read as "nothing matched"', () => {
    const out = filterBrowserRows(rows, 'colour:red', schema);
    expect(out.rows).toEqual([]);
    expect(out.error?.token).toBe('colour:red');
  });
});

describe('predicates', () => {
  it('deck:, note:, tag: and is:marked read the row, not its columns', () => {
    expect(ids('deck:Japanese::Verbs')).toEqual(['n1']);
    expect(ids('note:Cloze')).toEqual(['n2']);
    expect(ids('tag:core')).toEqual(['n1', 'n3']);
    expect(ids('tag:none')).toEqual(['n2']);
    expect(ids('is:marked')).toEqual(['n1']);
    expect(ids('is:unmarked')).toEqual(['n2', 'n3']);
  });

  it('a field predicate is case-insensitive in the key and matches only that field', () => {
    expect(ids('expression:飲む')).toEqual(['n3']);
    // "eat" is in Meaning, so an Expression-scoped query must not find it even
    // though the bare word does.
    expect(ids('eat')).toEqual(['n1']);
    expect(ids('Expression:eat')).toEqual([]);
  });

  it('an empty value means the field is empty, and a note without the field never matches', () => {
    // n3's Meaning is ''. n2 has no Meaning field at all.
    expect(ids('Meaning:')).toEqual(['n3']);
  });

  it('* is a wildcard and \\* is a literal star', () => {
    expect(ids('tag:jlpt::*')).toEqual(['n3']);
    expect(ids('deck:*Verbs')).toEqual(['n1']);
    expect(ids('tag:\\*')).toEqual([]);
  });

  it('_ is literal, not a single-character wildcard', () => {
    // Anki would treat `c_re` as matching `core`; a deck or tag with a real
    // underscore is far more common here than the wildcard is useful.
    expect(ids('tag:c_re')).toEqual([]);
  });

  it('cards: compares the generated card count', () => {
    expect(ids('cards:2')).toEqual(['n1']);
    expect(ids('cards:>1')).toEqual(['n1']);
    expect(ids('cards:<=1')).toEqual(['n2', 'n3']);
  });

  it('re: is a regex over the row, and Field:re: over one field', () => {
    // A paren is grammar, so a regex carrying one is quoted — as in Anki.
    expect(ids('re:"^to (eat|drink)$"')).toEqual([]); // the haystack is the whole row
    expect(ids('Meaning:re:"^to (eat|drink)$"')).toEqual(['n1']);
    expect(ids('re:c1::')).toEqual(['n2']);
  });
});

describe('nesting', () => {
  it('juxtaposition is AND, "or" is OR, and "-" negates one term', () => {
    expect(ids('tag:core is:marked')).toEqual(['n1']);
    expect(ids('note:Cloze or is:marked')).toEqual(['n1', 'n2']);
    expect(ids('-tag:core')).toEqual(['n2']);
    expect(ids('not tag:core')).toEqual(['n2']);
  });

  it('AND binds tighter than OR, and parens override it', () => {
    // Without parens: (Cloze AND marked) OR core → n1, n3.
    expect(ids('note:Cloze is:marked or tag:core')).toEqual(['n1', 'n3']);
    // With: Cloze AND (marked OR core) → nothing, since n2 has no tags.
    expect(ids('note:Cloze (is:marked or tag:core)')).toEqual([]);
  });

  it('negation applies to a whole group', () => {
    expect(ids('-(tag:core or note:Cloze)')).toEqual([]);
    expect(ids('-(is:marked or note:Cloze)')).toEqual(['n3']);
  });

  it('an explicit "and" between operands means the same as juxtaposition', () => {
    expect(parseBrowserQuery('tag:core and is:marked', schema)).toEqual(
      parseBrowserQuery('tag:core is:marked', schema),
    );
  });

  it('parses to a real tree, not a flat term list', () => {
    const parsed = parseBrowserQuery('a or (b c)', schema);
    expect(parsed).toEqual({
      ok: true,
      filter: {
        kind: 'group',
        op: 'or',
        children: [
          { kind: 'text', needle: 'a' },
          {
            kind: 'group',
            op: 'and',
            children: [
              { kind: 'text', needle: 'b' },
              { kind: 'text', needle: 'c' },
            ],
          },
        ],
      },
    });
  });

  it('an empty query is the null filter, which keeps every row', () => {
    expect(parseBrowserQuery('   ', schema)).toEqual({ ok: true, filter: null });
    expect(matchBrowserRows(rows, null)).toBe(rows);
  });
});

describe('compilation happens once, not per row', () => {
  it('a hand-built tree with an impossible regex fails closed instead of throwing', () => {
    const test = compileBrowserFilter({ kind: 'regex', source: '([' });
    expect(() => rows.map(test)).not.toThrow();
    expect(rows.filter(test)).toEqual([]);
  });

  it('filters 30,000 rows well inside a frame', () => {
    const many = Array.from({ length: 30000 }, (_, i) => ({
      ...(rows[i % rows.length] as (typeof rows)[number]),
      noteId: `x${i}`,
    }));
    const parsed = parseBrowserQuery('tag:jlpt::* or deck:*Verbs', schema);
    if (!parsed.ok) throw new Error(parsed.error.code);
    const started = Date.now();
    const out = matchBrowserRows(many, parsed.filter);
    const elapsed = Date.now() - started;
    // n1 (deck Verbs) and n3 (tag jlpt::n5) match, n2 does not: two rows in
    // every three. Recompiling the two wildcards per row is what this catches.
    expect(out).toHaveLength(20000);
    expect(elapsed).toBeLessThan(300);
  });
});
