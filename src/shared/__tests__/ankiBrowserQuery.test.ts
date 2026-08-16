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
import { buildVocabContext } from '../ankiVocabContext';
import { buildCardHealthContext } from '../ankiCardHealth';
import { buildMediaHealthContext } from '../ankiMediaHealth';
import { buildSiblingAuditContext } from '../ankiSiblingAudit';
import { explainBrowserQuery } from '../ankiQueryExplain';

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

// ----- Phase 4: frequency and known-word predicates ------------------------------

describe('freq: and known: refuse rather than match-all without a context', () => {
  it('names the offending token, exactly like an unknown key', () => {
    expect(ids('freq:<=5000')).toBe('no-vocab-context');
    expect(ids('known:no')).toBe('no-vocab-context');
    // The refusal is the whole query's, so nothing leaks through the AND.
    expect(ids('core freq:none')).toBe('no-vocab-context');
  });

  it('refuses before judging the value, so a right query is not reported as wrong', () => {
    expect(ids('freq:banana')).toBe('no-vocab-context');
  });

  it('a hand-built freq/known node with no context matches nothing, and does not throw', () => {
    const freq = compileBrowserFilter({ kind: 'freq', op: '<=', value: 5000 });
    const known = compileBrowserFilter({ kind: 'known', mode: 'yes' });
    expect(rows.filter(freq)).toEqual([]);
    expect(rows.filter(known)).toEqual([]);
  });
});

describe('freq: and known: with a context', () => {
  const vocabCards = [
    // n1's two cards are both mature, so Anki calls it known.
    { ...card('c1', 'n1', 'd1'), type: 'review' as const, interval: 60 },
    { ...card('c2', 'n1', 'd2'), type: 'review' as const, interval: 40 },
    card('c3', 'n2', 'd1'),
    card('c4', 'n3', 'd1'),
  ];
  const vocab = buildVocabContext({
    notes: draft.notes,
    noteTypes: draft.noteTypes,
    cards: vocabCards,
    // 飲む is in no installed corpus; the cloze note has no word field at all.
    ranks: new Map([['食べる', 812], ['飲む', null]]),
    localLevels: new Map([['食べる', 1], ['飲む', 3]]),
  });
  const vocabSchema = { fieldNames: browserFieldNames(draft), vocab };
  const vids = (query: string): string[] | string => {
    const out = filterBrowserRows(rows, query, vocabSchema);
    return out.error ? out.error.code : out.rows.map((r) => r.noteId);
  };

  it('compares ranks and never counts an unranked word as rare', () => {
    expect(vids('freq:<=5000')).toEqual(['n1']);
    expect(vids('freq:>100000')).toEqual([]);
    expect(vids('freq:=812')).toEqual(['n1']);
  });

  it('separates "nothing ranks it" from "there is no word to rank"', () => {
    expect(vids('freq:none')).toEqual(['n3']);
    expect(vids('freq:noword')).toEqual(['n2']);
  });

  it('reads a band as a closed range, so the bands partition instead of nesting', () => {
    expect(vids('freq:veryCommon')).toEqual(['n1']);
    expect(vids('freq:common')).toEqual([]);
    expect(vids('freq:rare')).toEqual([]);
  });

  it('still refuses a value it cannot read', () => {
    expect(vids('freq:banana')).toBe('unknown-key');
    expect(vids('known:maybe')).toBe('unknown-key');
  });

  it('answers each known source on its own', () => {
    // 食べる is Learning locally (level 1 < 3) but mature in Anki; 飲む is the
    // reverse; the cloze note has no word and therefore no local opinion.
    expect(vids('known:anki')).toEqual(['n1']);
    expect(vids('known:local')).toEqual(['n3']);
    expect(vids('known:both')).toEqual([]);
    expect(vids('known:conflict')).toEqual(['n1', 'n3']);
  });

  it('resolves the verdict by the context precedence', () => {
    expect(vids('known:yes')).toEqual(['n3']); // the default precedence is local
    const ankiFirst = {
      fieldNames: browserFieldNames(draft),
      vocab: { ...vocab, precedence: 'anki' as const },
    };
    const out = filterBrowserRows(rows, 'known:yes', ankiFirst);
    expect(out.rows.map((r) => r.noteId)).toEqual(['n1']);
  });

  it('lets an unscheduled card still be an Anki answer, but never a local one', () => {
    // n2's only card is new: Anki has genuinely measured it as not mature, so
    // it answers `known:no`. Its *local* side stays null — the note carries no
    // word, so no one was ever asked. Every note here has a card, so nothing is
    // `known:none`.
    expect(vids('known:none')).toEqual([]);
    expect(vids('known:no')).toEqual(['n1', 'n2']); // local wins n1; Anki alone answers n2
  });

  it('is no-data, not "not known", when neither source has anything to say', () => {
    // The same n2 with nothing scheduled: a CSV import nobody has studied.
    const unscheduled = buildVocabContext({
      notes: draft.notes,
      noteTypes: draft.noteTypes,
      cards: vocabCards.filter((c) => c.noteId !== 'n2'),
      ranks: new Map([['食べる', 812], ['飲む', null]]),
      localLevels: new Map([['食べる', 1], ['飲む', 3]]),
    });
    const schemaNow = { fieldNames: browserFieldNames(draft), vocab: unscheduled };
    expect(filterBrowserRows(rows, 'known:none', schemaNow).rows.map((r) => r.noteId)).toEqual(['n2']);
    expect(filterBrowserRows(rows, 'known:no', schemaNow).rows.map((r) => r.noteId)).toEqual(['n1']);
  });

  it('composes with the rest of the grammar, including negation', () => {
    expect(vids('-known:local')).toEqual(['n1', 'n2']);
    expect(vids('(freq:<=5000 or freq:none) -known:local')).toEqual(['n1']);
  });

  it('treats a row the context never saw as all-absent rather than a match', () => {
    const stranger = { ...(rows[0] as (typeof rows)[number]), noteId: 'paged-in-later' };
    const parsed = parseBrowserQuery('freq:<=5000', vocabSchema);
    if (!parsed.ok) throw new Error(parsed.error.code);
    expect(matchBrowserRows([stranger], parsed.filter, vocab)).toEqual([]);
    const none = parseBrowserQuery('freq:noword', vocabSchema);
    if (!none.ok) throw new Error(none.error.code);
    expect(matchBrowserRows([stranger], none.filter, vocab)).toEqual([stranger]);
  });
});

// ----- Phase 4: smart recipe 8, wrong-language / wrong-script content -------------

describe('script: finds content in the wrong writing system', () => {
  it('needs no vocabulary context, unlike freq: and known:', () => {
    // The same bare `schema` every test above uses — there is no `vocab` on it.
    expect(ids('script:latin')).toEqual(['n1', 'n2']);
    expect(ids('script:han')).toEqual(['n1', 'n3']);
    expect(ids('script:cyrillic')).toEqual([]);
  });

  it('reads the note’s fields and not the haystack, so deck names cannot match it', () => {
    // Every row’s `search` carries `japanese::core` and the note type name, so a
    // `script:latin` over the haystack would return all three rows.
    expect(rows.every((r) => /japanese/.test(r.search))).toBe(true);
    expect(ids('script:latin')).not.toContain('n3');
  });

  it('scopes to one field with the same `Field:` spelling `re:` uses', () => {
    expect(ids('Meaning:script:latin')).toEqual(['n1']);
    expect(ids('Expression:script:latin')).toEqual([]);
    expect(ids('Expression:script:kana')).toEqual(['n1', 'n3']);
    // Case-insensitive on the field name, like every other field predicate.
    expect(ids('expression:script:han')).toEqual(['n1', 'n3']);
  });

  it('a note type without the field never matches, and so is kept by the negation', () => {
    // n2 is a Cloze note: it has no Expression field at all. Reporting it as
    // "this Expression holds no Japanese" would drag every other note type into
    // one note type’s wrong-script audit.
    expect(ids('Expression:script:none')).toEqual([]);
    expect(ids('-Expression:script:kana')).toEqual(['n2']);
  });

  it('distinguishes an empty field from an absent one', () => {
    // n3’s Meaning is present and empty; n2 has no Meaning field at all.
    expect(ids('Meaning:script:none')).toEqual(['n3']);
  });

  it('unscoped `script:none` means every field is letter-free, not some field', () => {
    // n3 has an empty Meaning but a kanji Expression, so it is not letter-free.
    expect(ids('script:none')).toEqual([]);
  });

  it('composes with groups and negation', () => {
    expect(ids('script:han -script:latin')).toEqual(['n3']);
    expect(ids('(script:latin or script:han) core')).toEqual(['n1', 'n2', 'n3']);
  });

  it('refuses an unknown script by naming the whole token, never matching all', () => {
    expect(ids('script:klingon')).toBe('unknown-key');
    expect(ids('Expression:script:klingon')).toBe('unknown-key');
    expect(ids('script:')).toBe('unknown-key');
    const refused = filterBrowserRows(rows, 'Expression:script:klingon', schema);
    expect(refused.error).toEqual({ code: 'unknown-key', token: 'Expression:script:klingon' });
    expect(refused.rows).toEqual([]);
  });

  it('a hand-built node with neither script nor absence matches nothing, and does not throw', () => {
    expect(rows.filter(compileBrowserFilter({ kind: 'script' }))).toEqual([]);
    expect(rows.filter(compileBrowserFilter({ kind: 'script', fieldName: 'Meaning' }))).toEqual([]);
  });
});

describe('render: (smart recipe 15)', () => {
  // Its own draft, because the fixture above declares `templates: []` on every
  // note type — which renders no card at all and is `broken` for every note.
  const basic: AnkiDraft['noteTypes'][number] = {
    id: 'basic', name: 'Basic', kind: 'standard', css: '',
    fields: [
      { ord: 0, name: 'Front', sticky: false, rtl: false },
      { ord: 1, name: 'Back', sticky: false, rtl: false },
    ],
    templates: [
      {
        ord: 0, name: 'Card 1',
        qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}',
        bqfmt: '', bafmt: '',
      },
    ],
    sortFieldOrd: 0, latexPre: '', latexPost: '',
  };
  const typo: AnkiDraft['noteTypes'][number] = {
    ...basic,
    id: 'typo', name: 'Typo',
    templates: [{ ...basic.templates[0], qfmt: '{{Frnt}}' }],
  };
  const notes = [
    note({ id: 'good', noteTypeId: 'basic', cardIds: ['g1'],
      fields: [f(0, 'Front', 'ねこ'), f(1, 'Back', 'cat')] }),
    note({ id: 'blank-back', noteTypeId: 'basic', cardIds: ['b1'],
      fields: [f(0, 'Front', 'いぬ'), f(1, 'Back', '')] }),
    note({ id: 'blank-front', noteTypeId: 'basic', cardIds: ['f1'],
      fields: [f(0, 'Front', ''), f(1, 'Back', 'dog')] }),
    note({ id: 'bad-template', noteTypeId: 'typo', cardIds: ['t1'],
      fields: [f(0, 'Front', 'とり'), f(1, 'Back', 'bird')] }),
  ];
  const rDraft: AnkiDraft = {
    ...draft,
    noteTypes: [basic, typo],
    notes,
    cards: notes.map((n) => card(n.cardIds[0], n.id, 'd1')),
    counts: { ...draft.counts, notes: notes.length, cards: notes.length, noteTypes: 2 },
  };
  const rRows = buildBrowserRows(rDraft, defaultBrowserColumns(rDraft));
  const rSchema = {
    fieldNames: browserFieldNames(rDraft),
    render: buildCardHealthContext(rDraft),
  };
  const rIds = (query: string): string[] | string => {
    const out = filterBrowserRows(rRows, query, rSchema);
    return out.error ? out.error.code : out.rows.map((r) => r.noteId);
  };

  it('finds the card whose answer shows the front again', () => {
    expect(rIds('render:same')).toEqual(['blank-back']);
  });

  it('finds a blank question and a template that cannot render', () => {
    expect(rIds('render:empty-front')).toEqual(['blank-front']);
    expect(rIds('render:broken')).toEqual(['bad-template']);
  });

  it('reports only the healthy note as ok, and the verdicts partition the deck', () => {
    expect(rIds('render:ok')).toEqual(['good']);
    const partition = ['ok', 'same', 'empty-back', 'empty-front', 'broken', 'not-generated']
      .flatMap((h) => rIds(`render:${h}`) as string[]);
    expect(partition.sort()).toEqual(['bad-template', 'blank-back', 'blank-front', 'good']);
  });

  it('composes with negation and groups like any other predicate', () => {
    expect((rIds('-render:ok') as string[]).sort())
      .toEqual(['bad-template', 'blank-back', 'blank-front']);
    expect((rIds('(render:same or render:broken)') as string[]).sort())
      .toEqual(['bad-template', 'blank-back']);
  });

  it('refuses the key outright when the surface resolved no render context', () => {
    // Not "unknown value" and not an empty grid: with no context every spelling
    // is equally unanswerable, and `no-vocab-context` would send the user off
    // loading a frequency dictionary that has nothing to do with it.
    const bare = { fieldNames: browserFieldNames(rDraft) };
    const refused = filterBrowserRows(rRows, 'render:same', bare);
    expect(refused.error).toEqual({ code: 'no-render-context', token: 'render:same' });
    expect(refused.rows).toEqual([]);
    expect(filterBrowserRows(rRows, 'render:banana', bare).error?.code).toBe('no-render-context');
  });

  it('refuses an unknown verdict by naming the token, never matching all', () => {
    expect(rIds('render:banana')).toBe('unknown-key');
    expect(rIds('render:')).toBe('unknown-key');
  });

  it('a compiled node with no context matches nothing rather than everything', () => {
    expect(rRows.filter(compileBrowserFilter({ kind: 'render', health: 'ok' }))).toEqual([]);
  });
});

describe('media: (smart recipe 11)', () => {
  const mRef = (over: Partial<AnkiDraftNote['media'][number]> = {}) => ({
    reference: 'a.mp3',
    fileName: 'a.mp3',
    kind: 'audio' as const,
    fieldOrd: 0,
    present: true,
    bytes: 4096,
    ...over,
  });
  const notes = [
    note({ id: 'fine', cardIds: ['c1'], fields: [f(0, 'Front', 'ねこ')], media: [mRef()] }),
    note({
      id: 'gone', cardIds: ['c2'], fields: [f(0, 'Front', 'いぬ')],
      media: [mRef({ fileName: 'gone.mp3', present: false })],
    }),
    note({
      id: 'copy', cardIds: ['c3'], fields: [f(0, 'Front', 'とり')],
      media: [mRef({ fileName: 'copy.mp3', duplicateOf: 'a.mp3' })],
    }),
    note({ id: 'silent', cardIds: ['c4'], fields: [f(0, 'Front', 'うま')] }),
  ];
  const mDraft: AnkiDraft = {
    ...draft,
    notes,
    cards: notes.map((n) => card(n.cardIds[0]!, n.id, 'd1')),
    media: { files: 2, bytes: 8192, unreferenced: 0, sized: true },
    counts: { ...draft.counts, notes: notes.length, cards: notes.length },
  };
  const mRows = buildBrowserRows(mDraft, defaultBrowserColumns(mDraft));
  const mSchema = {
    fieldNames: browserFieldNames(mDraft),
    media: buildMediaHealthContext(mDraft),
  };
  const mIds = (query: string): string[] | string => {
    const out = filterBrowserRows(mRows, query, mSchema);
    return out.error ? out.error.code : out.rows.map((r) => r.noteId);
  };

  it('finds the note citing a file the package does not carry', () => {
    expect(mIds('media:missing')).toEqual(['gone']);
  });

  it('finds the second copy and not the file it copies', () => {
    expect(mIds('media:duplicate')).toEqual(['copy']);
  });

  it('separates "no media" from "media is fine", and the verdicts partition the deck', () => {
    expect(mIds('media:none')).toEqual(['silent']);
    expect(mIds('media:ok')).toEqual(['fine']);
    const partition = ['none', 'ok', 'unverified', 'duplicate', 'oversized', 'broken', 'missing']
      .flatMap((h) => mIds(`media:${h}`) as string[]);
    expect(partition.sort()).toEqual(['copy', 'fine', 'gone', 'silent']);
  });

  it('composes with negation and groups like any other predicate', () => {
    expect((mIds('-media:none') as string[]).sort()).toEqual(['copy', 'fine', 'gone']);
    expect((mIds('(media:missing or media:duplicate)') as string[]).sort())
      .toEqual(['copy', 'gone']);
  });

  it('refuses the key outright on a source that carries no media at all', () => {
    // Its own code: unlike `no-render-context` there is nothing to wait for —
    // a CSV or a live AnkiConnect deck will never have a package to inspect.
    const bare = { fieldNames: browserFieldNames(mDraft) };
    const refused = filterBrowserRows(mRows, 'media:missing', bare);
    expect(refused.error).toEqual({ code: 'no-media-context', token: 'media:missing' });
    expect(refused.rows).toEqual([]);
    expect(filterBrowserRows(mRows, 'media:banana', bare).error?.code).toBe('no-media-context');
  });

  it('refuses an unknown verdict by naming the token, never matching all', () => {
    expect(mIds('media:banana')).toBe('unknown-key');
    expect(mIds('media:')).toBe('unknown-key');
  });

  it('a compiled node with no context matches nothing rather than everything', () => {
    expect(mRows.filter(compileBrowserFilter({ kind: 'media', health: 'ok' }))).toEqual([]);
  });

  it('explains itself in words, one sentence per verdict', () => {
    const parsed = parseBrowserQuery('media:missing', mSchema);
    expect(parsed.ok && parsed.filter).toEqual({ kind: 'media', health: 'missing' });
    expect(explainBrowserQuery('media:missing', mSchema)).toEqual({
      kind: 'clause',
      key: 'ankiWorkbench.browser.explain.media.missing',
    });
  });
});

describe('sibling: (smart recipe 17)', () => {
  // Its own draft again, and a card at a chosen ord: this predicate's verdict is
  // about which templates gave a note a card, so `card()`'s fixed `ord: 0`
  // cannot express any of it.
  const at = (id: string, noteId: string, ord: number): AnkiDraftCard => ({
    ...card(id, noteId, 'd1'),
    ord,
  });
  const tpl = (ord: number, name: string, qfmt: string, afmt: string) => ({
    ord, name, qfmt, afmt, bqfmt: '', bafmt: '',
  });
  const fields = [
    { ord: 0, name: 'Front', sticky: false, rtl: false },
    { ord: 1, name: 'Back', sticky: false, rtl: false },
  ];
  const twinned: AnkiDraft['noteTypes'][number] = {
    id: 'twinned', name: 'Twinned', kind: 'standard', css: '', fields,
    templates: [
      tpl(0, 'Card 1', '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}'),
      // Same render, different spelling — compared as text, not as source.
      tpl(1, 'Card 1 copy', '{{ Front }}', '{{FrontSide}}<hr id=answer>{{ Back }}'),
    ],
    sortFieldOrd: 0, latexPre: '', latexPost: '',
  };
  const reversible: AnkiDraft['noteTypes'][number] = {
    ...twinned,
    id: 'reversible', name: 'Reversible',
    templates: [
      tpl(0, 'Card 1', '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}'),
      tpl(1, 'Card 2', '{{Back}}', '{{FrontSide}}<hr id=answer>{{Front}}'),
    ],
  };
  const disagreeing: AnkiDraft['noteTypes'][number] = {
    ...twinned,
    id: 'disagreeing', name: 'Disagreeing',
    templates: [
      tpl(0, 'Card 1', '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}'),
      tpl(1, 'Card 2', '{{Front}}', '{{FrontSide}}<hr id=answer>{{Front}}'),
    ],
  };
  const notes = [
    note({ id: 'twin', noteTypeId: 'twinned', cardIds: ['t1', 't2'],
      fields: [f(0, 'Front', 'ねこ'), f(1, 'Back', 'cat')] }),
    note({ id: 'fine', noteTypeId: 'reversible', cardIds: ['r1', 'r2'],
      fields: [f(0, 'Front', 'いぬ'), f(1, 'Back', 'dog')] }),
    note({ id: 'alone', noteTypeId: 'reversible', cardIds: ['s1'],
      fields: [f(0, 'Front', 'とり'), f(1, 'Back', 'bird')] }),
    note({ id: 'unclear', noteTypeId: 'disagreeing', cardIds: ['a1', 'a2'],
      fields: [f(0, 'Front', 'うま'), f(1, 'Back', 'horse')] }),
    note({ id: 'stray', noteTypeId: 'reversible', cardIds: ['o1', 'o2', 'o3'],
      fields: [f(0, 'Front', 'さる'), f(1, 'Back', 'monkey')] }),
  ];
  const sDraft: AnkiDraft = {
    ...draft,
    noteTypes: [twinned, reversible, disagreeing],
    notes,
    cards: [
      at('t1', 'twin', 0), at('t2', 'twin', 1),
      at('r1', 'fine', 0), at('r2', 'fine', 1),
      at('s1', 'alone', 0),
      at('a1', 'unclear', 0), at('a2', 'unclear', 1),
      at('o1', 'stray', 0), at('o2', 'stray', 1), at('o3', 'stray', 9),
    ],
    counts: { ...draft.counts, notes: notes.length, cards: 10, noteTypes: 3 },
  };
  const sRows = buildBrowserRows(sDraft, defaultBrowserColumns(sDraft));
  const sSchema = {
    fieldNames: browserFieldNames(sDraft),
    sibling: buildSiblingAuditContext(sDraft),
  };
  const sIds = (query: string): string[] | string => {
    const out = filterBrowserRows(sRows, query, sSchema);
    return out.error ? out.error.code : out.rows.map((r) => r.noteId);
  };

  it('finds the note reviewing the same prompt twice', () => {
    expect(sIds('sibling:duplicate')).toEqual(['twin']);
  });

  it('keeps "same prompt, two answers" separate from a plain duplicate', () => {
    expect(sIds('sibling:ambiguous')).toEqual(['unclear']);
  });

  it('finds a card whose ord names no template', () => {
    expect(sIds('sibling:orphan')).toEqual(['stray']);
  });

  it('drops a one-card note as single, and the verdicts partition the deck', () => {
    expect(sIds('sibling:single')).toEqual(['alone']);
    expect(sIds('sibling:ok')).toEqual(['fine']);
    const partition = ['single', 'ok', 'duplicate', 'ambiguous', 'orphan']
      .flatMap((v) => sIds(`sibling:${v}`) as string[]);
    expect(partition.sort()).toEqual(['alone', 'fine', 'stray', 'twin', 'unclear']);
  });

  it('composes with negation and groups like any other predicate', () => {
    expect((sIds('-sibling:single') as string[]).sort())
      .toEqual(['fine', 'stray', 'twin', 'unclear']);
    expect((sIds('(sibling:duplicate or sibling:ambiguous)') as string[]).sort())
      .toEqual(['twin', 'unclear']);
  });

  it('refuses the key outright when no template comparison has run', () => {
    const bare = { fieldNames: browserFieldNames(sDraft) };
    const refused = filterBrowserRows(sRows, 'sibling:duplicate', bare);
    expect(refused.error).toEqual({ code: 'no-sibling-context', token: 'sibling:duplicate' });
    expect(refused.rows).toEqual([]);
    expect(filterBrowserRows(sRows, 'sibling:banana', bare).error?.code).toBe('no-sibling-context');
  });

  it('refuses an unknown verdict by naming the token, never matching all', () => {
    expect(sIds('sibling:banana')).toBe('unknown-key');
    expect(sIds('sibling:')).toBe('unknown-key');
  });

  it('a compiled node with no context matches nothing rather than everything', () => {
    expect(sRows.filter(compileBrowserFilter({ kind: 'sibling', verdict: 'ok' }))).toEqual([]);
  });

  it('explains itself in words, one sentence per verdict', () => {
    const parsed = parseBrowserQuery('sibling:ambiguous', sSchema);
    expect(parsed.ok && parsed.filter).toEqual({ kind: 'sibling', verdict: 'ambiguous' });
    expect(explainBrowserQuery('sibling:ambiguous', sSchema)).toEqual({
      kind: 'clause',
      key: 'ankiWorkbench.browser.explain.sibling.ambiguous',
    });
  });
});
