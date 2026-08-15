import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote, AnkiDraftNoteType } from '../ankiDraft';
import {
  applyCardDesign,
  cardDesignFormats,
  DEFAULT_REVERSE_FLAG_FIELD,
  planCardDesign,
  removeCardDesign,
  type CardDesignRequest,
} from '../ankiCardDesign';
import { renderAnkiCard } from '../ankiTemplateRender';

function field(ord: number, name: string, raw: string) {
  return { ord, name, raw, normalized: raw.replace(/<[^>]*>/g, '').trim() };
}

function note(over: Partial<AnkiDraftNote> & { id: string }): AnkiDraftNote {
  return {
    guid: `g-${over.id}`,
    noteTypeId: 'basic',
    tags: [],
    marked: false,
    fields: [field(0, 'Front', 'ねこ'), field(1, 'Back', 'cat')],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`c-${over.id}`],
    media: [],
    ...over,
  };
}

function card(over: Partial<AnkiDraftCard> & { id: string; noteId: string }): AnkiDraftCard {
  return {
    deckId: 'd1',
    ord: 0,
    type: 'new',
    queue: 'new',
    due: 0,
    interval: 0,
    easeFactor: 0,
    reps: 0,
    lapses: 0,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
    ...over,
  };
}

const basic: AnkiDraftNoteType = {
  id: 'basic',
  name: 'Basic',
  kind: 'standard',
  css: '.card { color: black; }',
  fields: [
    { ord: 0, name: 'Front', sticky: false, rtl: false },
    { ord: 1, name: 'Back', sticky: false, rtl: false },
  ],
  templates: [
    {
      ord: 0,
      name: 'Card 1',
      qfmt: '{{Front}}',
      afmt: '{{FrontSide}}<hr id=answer>{{Back}}',
      bqfmt: '',
      bafmt: '',
    },
  ],
  sortFieldOrd: 0,
};

const clozeType: AnkiDraftNoteType = {
  id: 'cloze',
  name: 'Cloze',
  kind: 'cloze',
  css: '',
  fields: [{ ord: 0, name: 'Text', sticky: false, rtl: false }],
  templates: [
    { ord: 0, name: 'Cloze', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}', bqfmt: '', bafmt: '' },
  ],
  sortFieldOrd: 0,
};

function draftOf(notes: AnkiDraftNote[], noteTypes: AnkiDraftNoteType[] = [basic, clozeType]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Japanese::Core', path: ['Japanese', 'Core'], filtered: false }],
    noteTypes,
    notes,
    cards: notes.map((n) => card({ id: `c-${n.id}`, noteId: n.id })),
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: notes.length,
      decks: 1,
      noteTypes: noteTypes.length,
      reviews: 0,
      mediaReferences: 0,
    },
  };
}

const reverse: CardDesignRequest = {
  noteTypeId: 'basic',
  kind: 'reverse',
  questionFieldOrd: 1,
  answerFieldOrd: 0,
};

const optional: CardDesignRequest = { ...reverse, kind: 'optional-reverse' };

describe('cardDesignFormats', () => {
  it('writes the plain reverse the way Anki does', () => {
    expect(cardDesignFormats('reverse', 'Back', 'Front', '')).toEqual({
      qfmt: '{{Back}}',
      afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
    });
  });

  it('gates only the question on the flag field, never the answer', () => {
    const { qfmt, afmt } = cardDesignFormats('optional-reverse', 'Back', 'Front', 'Add Reverse');
    expect(qfmt).toBe('{{#Add Reverse}}{{Back}}{{/Add Reverse}}');
    expect(afmt).not.toContain('Add Reverse');
  });
});

describe('planCardDesign', () => {
  it('counts one new card per note for a plain reverse', () => {
    const plan = planCardDesign(draftOf([note({ id: 'n1' }), note({ id: 'n2' })]), reverse);
    expect(plan.status).toBe('ok');
    expect(plan.cardsAdded).toBe(2);
    expect(plan.notesOfType).toBe(2);
    expect(plan.template?.ord).toBe(1);
    expect(plan.template?.name).toBe('Card 2');
    expect(plan.addedField).toBeNull();
  });

  it('refuses a cloze note type instead of adding a template it would ignore', () => {
    const plan = planCardDesign(draftOf([note({ id: 'n1' })]), {
      ...reverse,
      noteTypeId: 'cloze',
      questionFieldOrd: 0,
      answerFieldOrd: 0,
    });
    expect(plan.status).toBe('blocked');
    expect(plan.problems.map((p) => p.code)).toEqual(['cloze-note-type']);
    expect(plan.template).toBeNull();
  });

  it('refuses a card that asks with the field it answers with', () => {
    const plan = planCardDesign(draftOf([note({ id: 'n1' })]), { ...reverse, answerFieldOrd: 1 });
    expect(plan.status).toBe('blocked');
    expect(plan.problems[0]).toMatchObject({ code: 'same-field-both-sides', detail: 'Back' });
  });

  it('refuses a design an existing template already asks, rather than doubling every card', () => {
    const withReverse: AnkiDraftNoteType = {
      ...basic,
      templates: [...basic.templates, { ord: 1, name: 'Card 2', qfmt: '{{Back}}', afmt: '{{Front}}', bqfmt: '', bafmt: '' }],
    };
    const plan = planCardDesign(draftOf([note({ id: 'n1' })], [withReverse]), reverse);
    expect(plan.status).toBe('blocked');
    expect(plan.problems[0].code).toBe('design-already-present');
  });

  it('does not count a note whose question field is empty, and says how many', () => {
    const plan = planCardDesign(
      draftOf([
        note({ id: 'n1' }),
        note({ id: 'n2', fields: [field(0, 'Front', 'いぬ'), field(1, 'Back', '')] }),
      ]),
      reverse,
    );
    expect(plan.cardsAdded).toBe(1);
    expect(plan.notesWithEmptyQuestion).toBe(1);
    expect(plan.problems).toContainEqual({ code: 'empty-question-field', detail: 'Back', count: 1 });
    expect(plan.status).toBe('ok');
  });

  it('adds the flag field when the note type lacks it, and reports zero cards without blocking', () => {
    const plan = planCardDesign(draftOf([note({ id: 'n1' })]), optional);
    expect(plan.status).toBe('ok');
    expect(plan.addedField).toMatchObject({ ord: 2, name: DEFAULT_REVERSE_FLAG_FIELD });
    expect(plan.cardsAdded).toBe(0);
    expect(plan.problems.map((p) => p.code)).toContain('flag-field-added');
    expect(plan.problems.map((p) => p.code)).not.toContain('no-notes-flagged');
  });

  it('blocks an optional design on an existing flag field that no note carries', () => {
    const flagged: AnkiDraftNoteType = {
      ...basic,
      fields: [...basic.fields, { ord: 2, name: DEFAULT_REVERSE_FLAG_FIELD, sticky: false, rtl: false }],
    };
    const notes = [
      note({ id: 'n1', fields: [field(0, 'Front', 'ねこ'), field(1, 'Back', 'cat'), field(2, DEFAULT_REVERSE_FLAG_FIELD, '')] }),
    ];
    const plan = planCardDesign(draftOf(notes, [flagged]), optional);
    expect(plan.status).toBe('blocked');
    expect(plan.problems).toContainEqual({
      code: 'no-notes-flagged',
      detail: DEFAULT_REVERSE_FLAG_FIELD,
      count: 1,
    });
  });

  it('counts only the flagged notes when the flag field is already populated', () => {
    const flagged: AnkiDraftNoteType = {
      ...basic,
      fields: [...basic.fields, { ord: 2, name: DEFAULT_REVERSE_FLAG_FIELD, sticky: false, rtl: false }],
    };
    const notes = [
      note({ id: 'n1', fields: [field(0, 'Front', 'ねこ'), field(1, 'Back', 'cat'), field(2, DEFAULT_REVERSE_FLAG_FIELD, 'y')] }),
      note({ id: 'n2', fields: [field(0, 'Front', 'いぬ'), field(1, 'Back', 'dog'), field(2, DEFAULT_REVERSE_FLAG_FIELD, '')] }),
      note({ id: 'n3', fields: [field(0, 'Front', 'とり'), field(1, 'Back', 'bird'), field(2, DEFAULT_REVERSE_FLAG_FIELD, '1')] }),
    ];
    const plan = planCardDesign(draftOf(notes, [flagged]), optional);
    expect(plan.status).toBe('ok');
    expect(plan.cardsAdded).toBe(2);
    expect(plan.notesWithoutFlag).toBe(1);
    expect(plan.sampleNoteIds).toEqual(['n1', 'n3']);
  });
});

describe('applyCardDesign', () => {
  it('creates one card per generating note, in the deck its siblings already live in', () => {
    const draft = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    const plan = planCardDesign(draft, reverse);
    const { draft: next, applied } = applyCardDesign(draft, plan);

    expect(next.cards).toHaveLength(4);
    expect(applied.cardIds).toEqual(['n1-design1', 'n2-design1']);
    const added = next.cards.filter((c) => applied.cardIds.includes(c.id));
    expect(added.map((c) => c.ord)).toEqual([1, 1]);
    expect(added.map((c) => c.deckId)).toEqual(['d1', 'd1']);
    expect(added.every((c) => c.type === 'new' && c.reps === 0)).toBe(true);
    expect(next.counts.cards).toBe(4);
    expect(next.notes[0].cardIds).toEqual(['c-n1', 'n1-design1']);
  });

  it('renders the new sibling as a real card the preview can show', () => {
    const draft = draftOf([note({ id: 'n1' })]);
    const { draft: next } = applyCardDesign(draft, planCardDesign(draft, reverse));
    const rendered = renderAnkiCard(next, next.notes[0], 1);
    expect(rendered.questionHtml).toBe('cat');
    expect(rendered.answerHtml).toContain('ねこ');
    expect(rendered.problems).toEqual([]);
  });

  it('gives every note of the type the added flag field, empty', () => {
    const draft = draftOf([note({ id: 'n1' })]);
    const { draft: next } = applyCardDesign(draft, planCardDesign(draft, optional));
    const nt = next.noteTypes.find((t) => t.id === 'basic');
    expect(nt?.fields.map((f) => f.name)).toEqual(['Front', 'Back', DEFAULT_REVERSE_FLAG_FIELD]);
    expect(next.notes[0].fields[2]).toMatchObject({ ord: 2, name: DEFAULT_REVERSE_FLAG_FIELD, raw: '' });
    expect(next.cards).toHaveLength(1);
  });

  it('refuses to apply a blocked plan rather than half-adding a template', () => {
    const draft = draftOf([note({ id: 'n1' })]);
    const plan = planCardDesign(draft, { ...reverse, answerFieldOrd: 1 });
    expect(() => applyCardDesign(draft, plan)).toThrow(/blocked/);
  });
});

describe('removeCardDesign', () => {
  it('restores the draft to what it was, cards, template and field alike', () => {
    const draft = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    const { draft: next, applied } = applyCardDesign(draft, planCardDesign(draft, optional));
    const back = removeCardDesign(next, applied);

    expect(back.noteTypes.find((t) => t.id === 'basic')?.templates).toHaveLength(1);
    expect(back.noteTypes.find((t) => t.id === 'basic')?.fields.map((f) => f.name)).toEqual([
      'Front',
      'Back',
    ]);
    expect(back.notes.map((n) => n.fields.map((f) => f.name))).toEqual([
      ['Front', 'Back'],
      ['Front', 'Back'],
    ]);
    expect(back.cards.map((c) => c.id)).toEqual(['c-n1', 'c-n2']);
    expect(back.counts.cards).toBe(draft.counts.cards);
  });

  it('leaves a card the design did not create alone', () => {
    const draft = draftOf([note({ id: 'n1' })]);
    const { draft: next, applied } = applyCardDesign(draft, planCardDesign(draft, reverse));
    const withForeign: AnkiDraft = {
      ...next,
      cards: [...next.cards, card({ id: 'foreign', noteId: 'n1', ord: 7 })],
    };
    const back = removeCardDesign(withForeign, applied);
    expect(back.cards.map((c) => c.id)).toEqual(['c-n1', 'foreign']);
  });
});

describe('the conditional card that Anki never generates', () => {
  it('says no card exists rather than calling the question blank', () => {
    const flagged: AnkiDraftNoteType = {
      ...basic,
      fields: [...basic.fields, { ord: 2, name: DEFAULT_REVERSE_FLAG_FIELD, sticky: false, rtl: false }],
      templates: [
        ...basic.templates,
        {
          ord: 1,
          name: 'Card 2',
          qfmt: `{{#${DEFAULT_REVERSE_FLAG_FIELD}}}{{Back}}{{/${DEFAULT_REVERSE_FLAG_FIELD}}}`,
          afmt: '{{FrontSide}}<hr id=answer>{{Front}}',
          bqfmt: '',
          bafmt: '',
        },
      ],
    };
    const unflagged = note({
      id: 'n1',
      fields: [field(0, 'Front', 'ねこ'), field(1, 'Back', 'cat'), field(2, DEFAULT_REVERSE_FLAG_FIELD, '')],
    });
    const rendered = renderAnkiCard(draftOf([unflagged], [flagged]), unflagged, 1);
    expect(rendered.questionHtml).toBe('');
    const codes = rendered.problems.map((p) => p.code);
    expect(codes).toContain('conditional-card-not-generated');
    expect(codes).not.toContain('empty-question');
    expect(codes).not.toContain('empty-answer');
  });

  it('still calls an unconditional blank question a blank question', () => {
    const blank = note({ id: 'n1', fields: [field(0, 'Front', ''), field(1, 'Back', 'cat')] });
    const rendered = renderAnkiCard(draftOf([blank]), blank, 0);
    expect(rendered.problems.map((p) => p.code)).toContain('empty-question');
    expect(rendered.problems.map((p) => p.code)).not.toContain('conditional-card-not-generated');
  });
});
