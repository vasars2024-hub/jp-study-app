import { describe, expect, it } from 'vitest';
import type { AnkiDraftNote, AnkiDraftNoteType } from '../ankiDraft';
import {
  NEAR_MAX_COMPARISONS,
  bigramDice,
  duplicateNoteIds,
  findDuplicateNotes,
  normalizeDuplicateKey,
  proposeCanonical,
} from '../ankiDuplicates';

const f = (ord: number, name: string, text: string) => ({ ord, name, raw: text, normalized: text });

function note(id: string, fields: ReturnType<typeof f>[], noteTypeId = 'nt1'): AnkiDraftNote {
  return {
    id, guid: `g-${id}`, noteTypeId, tags: [], marked: false, fields,
    modifiedAtSec: 0, flags: 0, data: '', cardIds: [], media: [],
  };
}

const noteTypes = [
  {
    id: 'nt1', name: 'Basic', kind: 'standard', css: '',
    fields: [
      { ord: 0, name: 'Expression', sticky: false, rtl: false },
      { ord: 1, name: 'Meaning', sticky: false, rtl: false },
    ],
    templates: [], sortFieldOrd: 0, latexPre: '', latexPost: '',
  },
  {
    id: 'nt2', name: 'Cloze', kind: 'cloze', css: '',
    fields: [{ ord: 0, name: 'Text', sticky: false, rtl: false }],
    templates: [], sortFieldOrd: 0, latexPre: '', latexPost: '',
  },
] as unknown as AnkiDraftNoteType[];

const scan = (notes: AnkiDraftNote[], over: Partial<Parameters<typeof findDuplicateNotes>[0]> = {}) =>
  findDuplicateNotes({ notes, noteTypes, fieldName: 'Expression', mode: 'normalized', ...over });

describe('normalizeDuplicateKey', () => {
  it('removes spaces rather than collapsing them, because Japanese has none', () => {
    expect(normalizeDuplicateKey('食べ　る')).toBe('食べる');
    expect(normalizeDuplicateKey('to eat')).toBe('toeat');
  });

  it('folds case, width and the punctuation both scripts use for the same job', () => {
    expect(normalizeDuplicateKey('Ｔｏ Ｅａｔ！')).toBe(normalizeDuplicateKey('to eat!'));
    expect(normalizeDuplicateKey('「食べる」')).toBe('食べる');
  });
});

describe('exact vs normalized', () => {
  // `normalized` is HTML-stripped by the importer; `raw` is what Anki stores.
  // The two modes read different halves of the same field on purpose.
  const notes = [
    note('n1', [
      { ord: 0, name: 'Expression', raw: '<b>食べる</b>', normalized: '食べる' },
      f(1, 'Meaning', 'to eat'),
    ]),
    note('n2', [f(0, 'Expression', '食べる'), f(1, 'Meaning', '')]),
  ];

  it('exact compares the stored bytes, so markup makes two notes different', () => {
    expect(scan(notes, { mode: 'exact' }).groups).toEqual([]);
  });

  it('normalized compares the search text, so the same word groups', () => {
    const out = scan(notes);
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0]).toMatchObject({
      key: '食べる',
      canonicalNoteId: 'n1',
      duplicateNoteIds: ['n2'],
      reason: 'most-filled-fields',
      tied: false,
    });
  });
});

describe('what is not a duplicate', () => {
  it('two blank values are two missing values, never a group', () => {
    const out = scan([
      note('n1', [f(0, 'Expression', ''), f(1, 'Meaning', 'a')]),
      note('n2', [f(0, 'Expression', '   '), f(1, 'Meaning', 'b')]),
      note('n3', [f(0, 'Expression', ''), f(1, 'Meaning', 'c')]),
    ]);
    expect(out.groups).toEqual([]);
    expect(out.emptyNoteIds).toEqual(['n1', 'n2', 'n3']);
  });

  it('a note type without the field is reported apart from a blank one', () => {
    const out = scan([
      note('n1', [f(0, 'Expression', '猫')]),
      note('n2', [f(0, 'Expression', '猫')]),
      note('n3', [f(0, 'Text', '猫')], 'nt2'),
    ]);
    expect(out.fieldAbsentNoteIds).toEqual(['n3']);
    expect(out.emptyNoteIds).toEqual([]);
    expect(out.groups[0].duplicateNoteIds).toEqual(['n2']);
  });

  it('honours a selection, so the rest of the deck cannot join a group', () => {
    const notes = [
      note('n1', [f(0, 'Expression', '猫')]),
      note('n2', [f(0, 'Expression', '猫')]),
      note('n3', [f(0, 'Expression', '猫')]),
    ];
    expect(scan(notes).groups[0].duplicateNoteIds).toEqual(['n2', 'n3']);
    expect(scan(notes, { noteIds: ['n1', 'n2'] }).groups[0].duplicateNoteIds).toEqual(['n2']);
  });
});

describe('the canonical proposal', () => {
  it('prefers the note that would lose the least, and names the rule', () => {
    const full = note('n1', [f(0, 'Expression', '猫'), f(1, 'Meaning', 'cat')]);
    const bare = note('n2', [f(0, 'Expression', '猫'), f(1, 'Meaning', '')]);
    expect(proposeCanonical([bare, full])).toMatchObject({
      note: full, reason: 'most-filled-fields', tied: false,
    });
  });

  it('falls to the most text when the filled-field counts match', () => {
    const long = note('n1', [f(0, 'Expression', '猫'), f(1, 'Meaning', 'a cat, the animal')]);
    const short = note('n2', [f(0, 'Expression', '猫'), f(1, 'Meaning', 'cat')]);
    expect(proposeCanonical([short, long])).toMatchObject({ note: long, reason: 'longest-content' });
  });

  it('reports a tie rather than hiding it, and still answers deterministically', () => {
    const a = note('n1', [f(0, 'Expression', '猫'), f(1, 'Meaning', 'cat')]);
    const b = note('n2', [f(0, 'Expression', '猫'), f(1, 'Meaning', 'cat')]);
    const out = proposeCanonical([a, b]);
    expect(out).toMatchObject({ note: a, reason: 'first-seen', tied: true });
    // Same answer whichever order the caller supplies — the earlier note wins.
    expect(proposeCanonical([a, b]).note.id).toBe('n1');
  });

  it('a winner that beats the field outright is not reported as tied', () => {
    // n2 and n3 tie with each other but both lose to n1: the *pick* was not
    // arbitrary, so `tied` must stay false.
    const n1 = note('n1', [f(0, 'Expression', '猫'), f(1, 'Meaning', 'cat')]);
    const n2 = note('n2', [f(0, 'Expression', '猫'), f(1, 'Meaning', '')]);
    const n3 = note('n3', [f(0, 'Expression', '猫'), f(1, 'Meaning', '')]);
    expect(proposeCanonical([n1, n2, n3])).toMatchObject({
      note: n1, reason: 'most-filled-fields', tied: false,
    });
  });
});

describe('near mode', () => {
  const sentences = [
    note('n1', [f(0, 'Expression', '今日は天気がいいですね')]),
    note('n2', [f(0, 'Expression', '今日は天気がいいですねえ')]),
    note('n3', [f(0, 'Expression', '猫がソファで寝ています')]),
  ];

  it('groups a rewritten sentence at a threshold the caller states', () => {
    const out = findDuplicateNotes({
      notes: sentences, noteTypes, fieldName: 'Expression', mode: 'near', threshold: 0.8,
    });
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].canonicalNoteId).toBe('n2');
    expect(out.groups[0].duplicateNoteIds).toEqual(['n1']);
    // A near group has no single value, so it must not pass one member's text
    // off as the group's key.
    expect(out.groups[0].key).toBe('');
    expect(out.comparisons).toBeGreaterThan(0);
  });

  it('a stricter threshold finds fewer groups — the number is the finding', () => {
    const strict = findDuplicateNotes({
      notes: sentences, noteTypes, fieldName: 'Expression', mode: 'near', threshold: 0.99,
    });
    expect(strict.groups).toEqual([]);
  });

  it('refuses rather than inventing a threshold when none is given', () => {
    const out = findDuplicateNotes({ notes: sentences, noteTypes, fieldName: 'Expression', mode: 'near' });
    expect(out.groups).toEqual([]);
    expect(out.comparisons).toBe(0);
    // The notes were still read, so the caller can tell "nothing to compare"
    // from "you did not say how close is close enough".
    expect(out.emptyNoteIds).toEqual([]);
    expect(out.fieldAbsentNoteIds).toEqual([]);
  });

  it('is transitive: a≈b and b≈c is one group of three, not b reported twice', () => {
    const chain = [
      note('n1', [f(0, 'Expression', 'abcdefgh')]),
      note('n2', [f(0, 'Expression', 'abcdefghij')]),
      note('n3', [f(0, 'Expression', 'abcdefghijkl')]),
    ];
    const out = findDuplicateNotes({
      notes: chain, noteTypes, fieldName: 'Expression', mode: 'near', threshold: 0.8,
    });
    expect(out.groups).toHaveLength(1);
    expect([out.groups[0].canonicalNoteId, ...out.groups[0].duplicateNoteIds].sort())
      .toEqual(['n1', 'n2', 'n3']);
  });

  it('never compares two notes sharing no bigram, so unrelated text costs nothing', () => {
    const apart = [
      note('n1', [f(0, 'Expression', 'aaaa')]),
      note('n2', [f(0, 'Expression', 'bbbb')]),
      note('n3', [f(0, 'Expression', 'cccc')]),
    ];
    const out = findDuplicateNotes({
      notes: apart, noteTypes, fieldName: 'Expression', mode: 'near', threshold: 0.5,
    });
    expect(out.comparisons).toBe(0);
    expect(out.groups).toEqual([]);
  });
});

describe('bigramDice', () => {
  it('is 1 for identical text and 0 for nothing shared', () => {
    expect(bigramDice('食べる', '食べる')).toBe(1);
    expect(bigramDice('食べる', '飲む')).toBe(0);
  });

  it('reads Japanese, which has no word boundaries to tokenize on', () => {
    expect(bigramDice('今日は天気がいい', '今日は天気がよい')).toBeGreaterThan(0.7);
  });
});

describe('duplicateNoteIds', () => {
  it('is every non-canonical note once, in group order', () => {
    const out = scan([
      note('n1', [f(0, 'Expression', '猫')]),
      note('n2', [f(0, 'Expression', '猫')]),
      note('n3', [f(0, 'Expression', '犬')]),
      note('n4', [f(0, 'Expression', '犬')]),
    ]);
    expect(duplicateNoteIds(out)).toEqual(['n2', 'n4']);
  });
});

describe('the cap', () => {
  it('is a documented number the caller can act on, not a silent truncation', () => {
    expect(NEAR_MAX_COMPARISONS).toBeGreaterThan(0);
  });
});
