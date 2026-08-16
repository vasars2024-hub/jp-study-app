import { describe, expect, it } from 'vitest';
import type { AnkiDraft, RawAnkiCollection, RawAnkiNoteTypeRow } from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import {
  SIBLING_SAMPLE_NOTES,
  SIBLING_VERDICTS,
  buildSiblingAuditContext,
  draftTemplateGroups,
  emptySiblingTally,
  noteSiblingAudit,
  noteTypeTemplateGroups,
  parseSiblingVerdict,
  sampleNoteIndices,
  tallySiblingVerdicts,
  type SiblingVerdict,
} from '../ankiSiblingAudit';

type Tpl = RawAnkiNoteTypeRow['templates'][number];

const FIELDS = ['Front', 'Back', 'Notes'];

function noteType(templates: Tpl[], over: Partial<RawAnkiNoteTypeRow> = {}): RawAnkiNoteTypeRow {
  return {
    id: '1',
    name: 'Basic',
    fields: FIELDS.map((name, ord) => ({ name, ord })),
    templates,
    ...over,
  };
}

/** `rows` is one array of field values per note; `ords` the card ords each holds. */
function draftOf(
  types: RawAnkiNoteTypeRow[],
  rows: Array<{ mid?: string; values: string[]; ords: number[] }>,
): AnkiDraft {
  let cardId = 500;
  const raw: RawAnkiCollection = {
    col: { ver: 11, crt: 0, mod: 0 },
    notes: rows.map((row, i) => ({
      id: String(100 + i),
      guid: `g${i}`,
      mid: row.mid ?? '1',
      flds: row.values.join(ANKI_FIELD_SEP),
    })),
    cards: rows.flatMap((row, i) =>
      row.ords.map((ord) => ({ id: String(cardId++), nid: String(100 + i), did: '1', ord })),
    ),
    decks: [{ id: '1', name: 'Deck' }],
    noteTypes: types,
    revlog: [],
  };
  return buildAnkiDraft(raw, {
    source: { kind: 'apkg', label: 'test.apkg' },
    normalize: (v) => v.replace(/<[^>]*>/g, '').trim(),
  });
}

const FORWARD: Tpl = { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}{{Back}}' };
const REVERSE: Tpl = { ord: 1, name: 'Card 2', qfmt: '{{Back}}', afmt: '{{FrontSide}}{{Front}}' };
/** Same render as FORWARD, written differently — the whole point of comparing renders. */
const FORWARD_TWIN: Tpl = {
  ord: 1,
  name: 'Card 1 copy',
  qfmt: '{{ Front }}',
  afmt: '{{FrontSide}}{{ Back }}',
};
/** Same question as FORWARD, a different answer. */
const FORWARD_OTHER_BACK: Tpl = {
  ord: 1,
  name: 'Card 3',
  qfmt: '{{Front}}',
  afmt: '{{FrontSide}}{{Notes}}',
};

const ROWS = [
  { values: ['ねこ', 'cat', 'a note'], ords: [0, 1] },
  { values: ['いぬ', 'dog', 'another'], ords: [0, 1] },
];

describe('parseSiblingVerdict', () => {
  it('accepts every verdict it publishes and refuses anything else', () => {
    for (const verdict of SIBLING_VERDICTS) expect(parseSiblingVerdict(verdict)).toBe(verdict);
    expect(parseSiblingVerdict(' ORPHAN ')).toBe('orphan');
    expect(parseSiblingVerdict('banana')).toBeNull();
    expect(parseSiblingVerdict('')).toBeNull();
  });
});

describe('sampleNoteIndices', () => {
  it('takes everything when the deck is smaller than the sample', () => {
    expect(sampleNoteIndices(3, 50)).toEqual([0, 1, 2]);
    expect(sampleNoteIndices(0, 50)).toEqual([]);
    expect(sampleNoteIndices(5, 0)).toEqual([]);
  });

  it('spreads across the whole deck rather than taking a prefix', () => {
    const picked = sampleNoteIndices(300, 3);
    expect(picked).toEqual([0, 100, 200]);
    // Every index is in range and strictly increasing, on a size that does not divide.
    const odd = sampleNoteIndices(7, 3);
    expect(odd).toEqual([0, 2, 4]);
    const big = sampleNoteIndices(100_000, SIBLING_SAMPLE_NOTES);
    expect(big).toHaveLength(SIBLING_SAMPLE_NOTES);
    expect(Math.max(...big)).toBeLessThan(100_000);
    expect([...big].sort((a, b) => a - b)).toEqual(big);
  });
});

describe('noteTypeTemplateGroups', () => {
  it('reports two templates that render alike as a duplicate, spelling aside', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const groups = noteTypeTemplateGroups(draft, draft.noteTypes[0]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      verdict: 'duplicate',
      ords: [0, 1],
      names: ['Card 1', 'Card 1 copy'],
      sampled: 2,
      redundantCards: 2,
    });
  });

  it('leaves a real forward/reverse pair alone', () => {
    const draft = draftOf([noteType([FORWARD, REVERSE])], ROWS);
    expect(noteTypeTemplateGroups(draft, draft.noteTypes[0])).toEqual([]);
  });

  it('separates one question with two answers as ambiguous, not duplicate', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_OTHER_BACK])], ROWS);
    const groups = noteTypeTemplateGroups(draft, draft.noteTypes[0]);
    expect(groups.map((g) => g.verdict)).toEqual(['ambiguous']);
    expect(groups[0].ords).toEqual([0, 1]);
  });

  it('reports both when three templates share a question and only two an answer', () => {
    const draft = draftOf(
      [noteType([FORWARD, FORWARD_TWIN, { ...FORWARD_OTHER_BACK, ord: 2 }])],
      [
        { values: ['ねこ', 'cat', 'a note'], ords: [0, 1, 2] },
        { values: ['いぬ', 'dog', 'another'], ords: [0, 1, 2] },
      ],
    );
    const groups = noteTypeTemplateGroups(draft, draft.noteTypes[0]);
    // Ambiguous first, and it names all three: the ambiguity is between the
    // answers, so pointing at only the duplicate pair would be the wrong pair.
    expect(groups.map((g) => [g.verdict, g.ords])).toEqual([
      ['ambiguous', [0, 1, 2]],
      ['duplicate', [0, 1]],
    ]);
  });

  it('does not group two templates that render nothing on every sampled note', () => {
    const blankA: Tpl = { ord: 0, name: 'A', qfmt: '{{Notes}}', afmt: '{{FrontSide}}' };
    const blankB: Tpl = { ord: 1, name: 'B', qfmt: '{{Notes}}', afmt: '{{FrontSide}}' };
    const draft = draftOf([noteType([blankA, blankB])], [
      { values: ['ねこ', 'cat', ''], ords: [0, 1] },
      { values: ['いぬ', 'dog', ''], ords: [0, 1] },
    ]);
    expect(noteTypeTemplateGroups(draft, draft.noteTypes[0])).toEqual([]);
    // Control: give the field content and the same two templates do collide.
    const filled = draftOf([noteType([blankA, blankB])], ROWS);
    expect(noteTypeTemplateGroups(filled, filled.noteTypes[0]).map((g) => g.verdict)).toEqual([
      'duplicate',
    ]);
  });

  it('skips a cloze note type, whose cards come from markers and not templates', () => {
    const cloze = noteType([FORWARD, FORWARD_TWIN], { id: '2', name: 'Cloze', type: 1 });
    const draft = draftOf([cloze], [{ mid: '2', values: ['{{c1::ねこ}} {{c2::が}}', '', ''], ords: [0, 1] }]);
    expect(noteTypeTemplateGroups(draft, draft.noteTypes[0])).toEqual([]);
  });

  it('skips a note type with a single template, and one with no notes', () => {
    const one = draftOf([noteType([FORWARD])], [{ values: ['ねこ', 'cat', ''], ords: [0] }]);
    expect(noteTypeTemplateGroups(one, one.noteTypes[0])).toEqual([]);
    const none = draftOf([noteType([FORWARD, FORWARD_TWIN])], []);
    expect(noteTypeTemplateGroups(none, none.noteTypes[0])).toEqual([]);
  });

  it('counts redundant cards over the whole draft while sampling only part of it', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      values: [`w${i}`, `m${i}`, ''],
      ords: [0, 1],
    }));
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], rows);
    const [group] = noteTypeTemplateGroups(draft, draft.noteTypes[0]);
    expect(group.sampled).toBe(SIBLING_SAMPLE_NOTES);
    // The sample decides the verdict; the whole draft decides what it costs.
    expect(group.redundantCards).toBe(120);
  });

  it('is decided by the sample, which is why the group states its size', () => {
    // A conditional that fires on exactly one note near the end of the deck.
    const guarded: Tpl = {
      ord: 1,
      name: 'Guarded',
      qfmt: '{{#Notes}}{{Front}}{{/Notes}}{{^Notes}}{{Front}}{{/Notes}}',
      afmt: '{{FrontSide}}{{#Notes}}{{Notes}}{{/Notes}}{{^Notes}}{{Back}}{{/Notes}}',
    };
    const rows = Array.from({ length: 60 }, (_, i) => ({
      values: [`w${i}`, `m${i}`, i === 58 ? 'differs here' : ''],
      ords: [0, 1],
    }));
    const draft = draftOf([noteType([FORWARD, guarded])], rows);
    // 60 notes, 50 sampled: the last index taken is `floor(49 * 60 / 50)` = 58,
    // so the deviating note is reached only because sampling spreads to the tail.
    expect(sampleNoteIndices(60, SIBLING_SAMPLE_NOTES)).toContain(58);
    expect(sampleNoteIndices(60, 2)).toEqual([0, 30]);
    // Spread: the one note that disagrees is seen, and the verdict is the
    // honest one — same question, two different answers.
    expect(noteTypeTemplateGroups(draft, draft.noteTypes[0]).map((g) => g.verdict)).toEqual([
      'ambiguous',
    ]);
    // A sample that never reaches it calls the pair a duplicate. Both readings
    // are of the same deck, which is exactly why `sampled` is reported.
    expect(noteTypeTemplateGroups(draft, draft.noteTypes[0], 2).map((g) => g.verdict)).toEqual([
      'duplicate',
    ]);
  });
});

describe('noteSiblingAudit', () => {
  it('drops a one-card note as single rather than counting it healthy', () => {
    const draft = draftOf([noteType([FORWARD])], [{ values: ['ねこ', 'cat', ''], ords: [0] }]);
    expect(noteSiblingAudit(draft, draft.notes[0], []).verdict).toBe('single');
  });

  it('passes a note whose siblings ask different things', () => {
    const draft = draftOf([noteType([FORWARD, REVERSE])], ROWS);
    const groups = draftTemplateGroups(draft);
    expect(noteSiblingAudit(draft, draft.notes[0], groups).verdict).toBe('ok');
  });

  it('reports a note holding both halves of a duplicate group', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const groups = draftTemplateGroups(draft);
    const audit = noteSiblingAudit(draft, draft.notes[0], groups);
    expect(audit.verdict).toBe('duplicate');
    expect(audit.groups.map((g) => g.ords)).toEqual([[0, 1]]);
  });

  it('does not report a note that only ever got one of the colliding templates', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], [
      ...ROWS,
      { values: ['とり', 'bird', ''], ords: [0] },
    ]);
    const groups = draftTemplateGroups(draft);
    // One card is one card, whatever its note type could have generated: this
    // note is `single` and not `ok`, because it has no sibling to compare.
    expect(noteSiblingAudit(draft, draft.notes[2], groups).verdict).toBe('single');
    expect(noteSiblingAudit(draft, draft.notes[0], groups).verdict).toBe('duplicate');
  });

  it('ranks a card with no template above every other verdict', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], [
      { values: ['ねこ', 'cat', ''], ords: [0, 1, 7] },
      ...ROWS.slice(1),
    ]);
    const groups = draftTemplateGroups(draft);
    const audit = noteSiblingAudit(draft, draft.notes[0], groups);
    // The note is also a duplicate; orphan outranks it, because a card whose ord
    // names no template cannot be rendered at all.
    expect(audit.verdict).toBe('orphan');
    expect(audit.orphanOrds).toEqual([7]);
  });

  it('prefers ambiguous over duplicate when a note is in both groups', () => {
    const draft = draftOf(
      [noteType([FORWARD, FORWARD_TWIN, { ...FORWARD_OTHER_BACK, ord: 2 }])],
      [
        { values: ['ねこ', 'cat', 'a note'], ords: [0, 1, 2] },
        { values: ['いぬ', 'dog', 'another'], ords: [0, 1, 2] },
      ],
    );
    const groups = draftTemplateGroups(draft);
    expect(noteSiblingAudit(draft, draft.notes[0], groups).verdict).toBe('ambiguous');
  });
});

describe('buildSiblingAuditContext', () => {
  it('partitions a mixed draft exactly, and the tally sums to the note count', () => {
    const draft = draftOf(
      [
        noteType([FORWARD, FORWARD_TWIN]),
        noteType([FORWARD, REVERSE], { id: '2', name: 'Reversible' }),
        noteType([FORWARD], { id: '3', name: 'One-sided' }),
      ],
      [
        { values: ['ねこ', 'cat', ''], ords: [0, 1] },
        { values: ['いぬ', 'dog', ''], ords: [0, 1] },
        { mid: '2', values: ['とり', 'bird', ''], ords: [0, 1] },
        { mid: '3', values: ['うま', 'horse', ''], ords: [0] },
        { mid: '3', values: ['さる', 'monkey', ''], ords: [0, 4] },
      ],
    );
    const context = buildSiblingAuditContext(draft);
    const tally = tallySiblingVerdicts(context.values());
    expect(tally).toEqual({
      ...emptySiblingTally(),
      duplicate: 2,
      ok: 1,
      single: 1,
      orphan: 1,
    });
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(draft.notes.length);
    // Negative control: the one-sided note is in no defect bucket at all.
    expect(context.get(draft.notes[3].id)).toBe('single');
  });

  it('tallies an empty run to zeros rather than to nothing', () => {
    const verdicts: SiblingVerdict[] = [];
    expect(tallySiblingVerdicts(verdicts)).toEqual(emptySiblingTally());
  });
});
