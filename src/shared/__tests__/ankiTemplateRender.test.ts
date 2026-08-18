import { describe, expect, it } from 'vitest';
import type {
  AnkiDraft,
  AnkiDraftCard,
  AnkiDraftNote,
  AnkiDraftNoteType,
} from '../ankiDraft';
import {
  buildRepresentativeSample,
  cardOrdsOfNote,
  clozeOrdinalsOfNote,
  fieldIsEmpty,
  noteCardCensus,
  noteLevelProblems,
  parseClozeChunks,
  renderAnkiCard,
  renderClozeField,
  renderNoteCards,
} from '../ankiTemplateRender';

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
    cardIds: [],
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
  fields: [
    { ord: 0, name: 'Text', sticky: false, rtl: false },
    { ord: 1, name: 'Extra', sticky: false, rtl: false },
  ],
  templates: [
    {
      ord: 0,
      name: 'Cloze',
      qfmt: '{{cloze:Text}}',
      afmt: '{{cloze:Text}}<br>{{Extra}}',
      bqfmt: '',
      bafmt: '',
    },
  ],
  sortFieldOrd: 0,
};

function draftOf(
  notes: AnkiDraftNote[],
  over: Partial<AnkiDraft> = {},
): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Japanese::Core', path: ['Japanese', 'Core'], filtered: false }],
    noteTypes: [basic, clozeType],
    notes,
    cards: notes.map((n) => card({ id: `c-${n.id}`, noteId: n.id })),
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: notes.length,
      decks: 1,
      noteTypes: 2,
      reviews: 0,
      mediaReferences: 0,
    },
    ...over,
  };
}

describe('fieldIsEmpty', () => {
  it('treats markup, entities and whitespace as empty the way Anki does', () => {
    expect(fieldIsEmpty('<br>')).toBe(true);
    expect(fieldIsEmpty('&nbsp; ')).toBe(true);
    expect(fieldIsEmpty('<div>x</div>')).toBe(false);
  });
});

describe('renderAnkiCard', () => {
  it('renders a standard card and substitutes FrontSide into the answer', () => {
    const n = note({ id: 'n1' });
    const rendered = renderAnkiCard(draftOf([n]), n, 0);
    expect(rendered.questionHtml).toBe('ねこ');
    expect(rendered.answerHtml).toBe('ねこ<hr id=answer>cat');
    expect(rendered.label).toBe('Card 1');
    expect(rendered.css).toBe('.card { color: black; }');
    expect(rendered.problems).toEqual([]);
  });

  it('inserts the question into the answer literally, `$` sequences and all', () => {
    // A real deck's front side can carry inline script, and `$&`/`` $` ``/`$'`/
    // `$1` are replacement patterns to `String.replace`. Measured on the
    // eggrolls JLPT deck: its `$'` spliced the whole remainder of the answer
    // format in again, duplicating the body and leaving a `{{/Alt1}}` with no
    // opener, so all 10,147 of its notes reported `unbalanced-conditional`.
    const type = {
      ...basic,
      templates: [
        {
          ...basic.templates[0],
          afmt: '{{FrontSide}}<hr id=answer>{{#Back}}{{Back}}{{/Back}}',
        },
      ],
    };
    const n = note({
      id: 'n1',
      fields: [field(0, 'Front', `x.replace(/(a)(b)/g, '$1<b>$2</b>') $& $\` $' $$`), field(1, 'Back', 'cat')],
    });
    const rendered = renderAnkiCard(draftOf([n], { noteTypes: [type, clozeType] }), n, 0);
    expect(rendered.answerHtml).toBe(`${rendered.questionHtml}<hr id=answer>cat`);
    // The tell of the old behaviour: the answer body appearing twice, and a
    // close marker whose opener the splice left behind.
    expect(rendered.answerHtml).not.toContain('{{/Back}}');
    expect(rendered.problems).toEqual([]);
  });

  it('reports a field the note type does not have instead of printing the marker', () => {
    const type = {
      ...basic,
      templates: [{ ...basic.templates[0], qfmt: '{{Front}} {{Reading}}' }],
    };
    const n = note({ id: 'n1' });
    const rendered = renderAnkiCard(draftOf([n], { noteTypes: [type, clozeType] }), n, 0);
    expect(rendered.questionHtml).toBe('ねこ ');
    expect(rendered.problems).toContainEqual({
      code: 'unresolved-field',
      side: 'question',
      detail: 'Reading',
    });
  });

  it('flags an empty question — the card Anki would refuse to generate', () => {
    const n = note({ id: 'n1', fields: [field(0, 'Front', ''), field(1, 'Back', 'cat')] });
    const rendered = renderAnkiCard(draftOf([n]), n, 0);
    expect(rendered.problems.map((p) => p.code)).toContain('empty-question');
    // The answer still renders, so the report is side-specific rather than "broken".
    expect(rendered.problems.map((p) => p.code)).not.toContain('empty-answer');
  });

  it('resolves {{#Field}} and {{^Field}} against the emptiness of the field', () => {
    const type = {
      ...basic,
      templates: [
        {
          ...basic.templates[0],
          qfmt: '{{#Back}}has:{{Back}}{{/Back}}{{^Back}}none{{/Back}}',
        },
      ],
    };
    const filled = note({ id: 'n1' });
    const bare = note({ id: 'n2', fields: [field(0, 'Front', 'a'), field(1, 'Back', '<br>')] });
    const draft = draftOf([filled, bare], { noteTypes: [type, clozeType] });
    expect(renderAnkiCard(draft, filled, 0).questionHtml).toBe('has:cat');
    expect(renderAnkiCard(draft, bare, 0).questionHtml).toBe('none');
  });

  it('reports an unclosed conditional and still renders the rest of the card', () => {
    const type = {
      ...basic,
      templates: [{ ...basic.templates[0], qfmt: '{{#Back}}{{Front}}' }],
    };
    const n = note({ id: 'n1' });
    const rendered = renderAnkiCard(draftOf([n], { noteTypes: [type, clozeType] }), n, 0);
    expect(rendered.questionHtml).toBe('ねこ');
    expect(rendered.problems).toContainEqual({
      code: 'unbalanced-conditional',
      side: 'question',
      detail: 'Back',
    });
  });

  it('applies the text and furigana filters, and reports one it cannot run', () => {
    const type = {
      ...basic,
      templates: [
        {
          ...basic.templates[0],
          qfmt: '{{text:Back}}|{{furigana:Front}}|{{tts en_US:Back}}',
        },
      ],
    };
    const n = note({
      id: 'n1',
      fields: [field(0, 'Front', '猫[ねこ]'), field(1, 'Back', '<b>cat</b>')],
    });
    const rendered = renderAnkiCard(draftOf([n], { noteTypes: [type, clozeType] }), n, 0);
    expect(rendered.questionHtml).toBe('cat|<ruby>猫<rt>ねこ</rt></ruby>|<b>cat</b>');
    expect(rendered.problems).toContainEqual({
      code: 'unknown-filter',
      side: 'question',
      detail: 'tts',
    });
  });

  it('resolves the special fields from the card, not the note fields', () => {
    const type = {
      ...basic,
      templates: [{ ...basic.templates[0], qfmt: '{{Deck}}/{{Subdeck}}/{{Type}}/{{Tags}}' }],
    };
    const n = note({ id: 'n1', tags: ['jlpt::n5', 'core'] });
    const rendered = renderAnkiCard(draftOf([n], { noteTypes: [type, clozeType] }), n, 0);
    expect(rendered.questionHtml).toBe('Japanese::Core/Core/Basic/jlpt::n5 core');
  });

  it('reports a media file the source does not contain', () => {
    const n = note({
      id: 'n1',
      fields: [field(0, 'Front', '<img src="gone.png">'), field(1, 'Back', 'cat')],
      media: [
        { reference: 'gone.png', fileName: 'gone.png', kind: 'image', fieldOrd: 0, present: false },
      ],
    });
    const rendered = renderAnkiCard(draftOf([n]), n, 0);
    expect(rendered.problems).toContainEqual({
      code: 'missing-media',
      side: 'question',
      detail: 'gone.png',
    });
    // Absent media is already blank-and-explained; it must not also be reported
    // as merely unrenderable, which would read as "fine in Anki".
    expect(rendered.problems.map((p) => p.code)).not.toContain('media-not-rendered');
  });

  it('says so when media the source does hold cannot be shown in the preview', () => {
    // The frame's CSP allows `data:` images only and Anki references media by
    // bare file name, so a present image is still a blank box. Silence there is
    // a false clean on every image card.
    const n = note({
      id: 'n1',
      fields: [
        field(0, 'Front', '<img src="cat.png"><img src="cat.png">'),
        field(1, 'Back', '<img src="dog.png">'),
      ],
      media: [
        { reference: 'cat.png', fileName: 'cat.png', kind: 'image', fieldOrd: 0, present: true },
        { reference: 'dog.png', fileName: 'dog.png', kind: 'image', fieldOrd: 1, present: true },
      ],
    });
    const type = {
      ...basic,
      templates: [{ ...basic.templates[0], qfmt: '{{Front}}', afmt: '{{Back}}' }],
    };
    const rendered = renderAnkiCard(draftOf([n], { noteTypes: [type, clozeType] }), n, 0);
    // One line per side, and the repeated reference is named once.
    expect(rendered.problems).toContainEqual({
      code: 'media-not-rendered',
      side: 'question',
      detail: 'cat.png',
    });
    expect(rendered.problems).toContainEqual({
      code: 'media-not-rendered',
      side: 'answer',
      detail: 'dog.png',
    });
    expect(rendered.problems.filter((p) => p.code === 'media-not-rendered')).toHaveLength(2);
  });

  it('does not call an image-only side empty', () => {
    // Anki's own emptiness test preserves media file names, so a front that is
    // nothing but an `<img>` generates a card. Reporting `empty-question` there
    // claims Anki would refuse it — a false failure on every image-only note.
    const n = note({
      id: 'n1',
      fields: [field(0, 'Front', '<img src="cat.png">'), field(1, 'Back', '<img src="dog.png">')],
      media: [
        { reference: 'cat.png', fileName: 'cat.png', kind: 'image', fieldOrd: 0, present: true },
        { reference: 'dog.png', fileName: 'dog.png', kind: 'image', fieldOrd: 1, present: true },
      ],
    });
    const codes = renderAnkiCard(draftOf([n]), n, 0).problems.map((p) => p.code);
    expect(codes).not.toContain('empty-question');
    expect(codes).not.toContain('empty-answer');
    // A tag with no `src` really is nothing, and still reads as empty.
    expect(fieldIsEmpty('<br><div></div>')).toBe(true);
    expect(fieldIsEmpty('<img src="cat.png">')).toBe(false);
  });

  it('leaves a card with no media references clean', () => {
    const n = note({ id: 'n1' });
    expect(renderAnkiCard(draftOf([n]), n, 0).problems).toEqual([]);
  });

  it('does not let the advisory claim the sample set’s failing slot', () => {
    // An image card is not a failing card. Before the advisory was classed as
    // advisory, the first image note in any media deck took the one slot the
    // gallery reserves for a card that genuinely fails to render.
    const imaged = note({
      id: 'n1',
      fields: [field(0, 'Front', '<img src="cat.png">'), field(1, 'Back', 'cat')],
      media: [
        { reference: 'cat.png', fileName: 'cat.png', kind: 'image', fieldOrd: 0, present: true },
      ],
    });
    const broken = note({
      id: 'n2',
      fields: [field(0, 'Front', '{{Nope}}'), field(1, 'Back', 'dog')],
    });
    const type = {
      ...basic,
      templates: [{ ...basic.templates[0], qfmt: '{{Front}}{{Nope}}', afmt: '{{Back}}' }],
    };
    const draft = draftOf([imaged, broken], { noteTypes: [type, clozeType] });
    const sample = buildRepresentativeSample(draft);
    const failing = sample.cases.filter((c) => c.reasons.includes('validation-failing'));
    expect(failing).toHaveLength(1);
    // Both notes render `{{Nope}}`, so the tie is broken by order — what matters
    // is that the slot went to an unresolved field, not to an image.
    expect(failing[0].render.problems.map((p) => p.code)).toContain('unresolved-field');
  });
});

describe('cloze', () => {
  it('parses a nested deletion without truncating the outer one', () => {
    const { chunks, malformed } = parseClozeChunks('{{c1::a {{c2::b}} c}}');
    expect(malformed).toBe(false);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].ord).toBe(1);
    expect(chunks[0].answer).toBe('a {{c2::b}} c');
  });

  it('hides the target deletion on the question and reveals it on the answer', () => {
    const raw = '{{c1::猫}} は {{c2::犬}} ではない';
    expect(renderClozeField(raw, 0, 'question').html).toBe(
      '<span class="cloze">[...]</span> は 犬 ではない',
    );
    expect(renderClozeField(raw, 0, 'answer').html).toBe(
      '<span class="cloze">猫</span> は 犬 ではない',
    );
    // The sibling card hides the other one, which is what makes it a sibling.
    expect(renderClozeField(raw, 1, 'question').html).toBe(
      '猫 は <span class="cloze">[...]</span> ではない',
    );
  });

  it('shows the hint in place of the ellipsis', () => {
    expect(renderClozeField('{{c1::猫::animal}}', 0, 'question').html).toBe(
      '<span class="cloze">[animal]</span>',
    );
  });

  it('reports an unclosed marker and a c0 rather than rendering them as text', () => {
    expect(parseClozeChunks('{{c1::猫').malformed).toBe(true);
    expect(parseClozeChunks('{{c0::猫}}').malformed).toBe(true);
    expect(parseClozeChunks('{{c0::猫}}').chunks).toEqual([]);
  });

  it('generates one card per cloze number, not one per template', () => {
    const n = note({
      id: 'n1',
      noteTypeId: 'cloze',
      fields: [field(0, 'Text', '{{c1::a}} {{c3::b}}'), field(1, 'Extra', '')],
    });
    const draft = draftOf([n]);
    expect(clozeOrdinalsOfNote(n)).toEqual([1, 3]);
    expect(cardOrdsOfNote(draft, n)).toEqual([0, 2]);
    const cards = renderNoteCards(draft, n);
    expect(cards.map((c) => c.label)).toEqual(['Cloze 1', 'Cloze 3']);
    expect(cards[1].questionHtml).toBe('a <span class="cloze">[...]</span>');
  });

  it('reports a cloze note type whose fields carry no marker at all', () => {
    const n = note({
      id: 'n1',
      noteTypeId: 'cloze',
      fields: [field(0, 'Text', 'no markers here'), field(1, 'Extra', '')],
    });
    const rendered = renderAnkiCard(draftOf([n]), n, 0);
    expect(rendered.problems.map((p) => p.code)).toContain('cloze-without-markers');
  });

  it('reports {{cloze:…}} on a standard note type instead of rendering nothing', () => {
    const type = {
      ...basic,
      templates: [{ ...basic.templates[0], qfmt: '{{cloze:Front}}' }],
    };
    const n = note({ id: 'n1' });
    const rendered = renderAnkiCard(draftOf([n], { noteTypes: [type, clozeType] }), n, 0);
    expect(rendered.problems).toContainEqual({
      code: 'cloze-filter-outside-cloze-note',
      side: 'question',
      detail: 'Front',
    });
  });
});

describe('noteLevelProblems', () => {
  it('finds a duplicate first field and an empty one', () => {
    const a = note({ id: 'n1' });
    const b = note({ id: 'n2' });
    const blank = note({ id: 'n3', fields: [field(0, 'Front', ''), field(1, 'Back', 'x')] });
    const draft = draftOf([a, b, blank]);
    expect(noteLevelProblems(draft, a).map((p) => p.code)).toEqual(['duplicate-first-field']);
    expect(noteLevelProblems(draft, blank).map((p) => p.code)).toEqual(['empty-first-field']);
  });
});

describe('buildRepresentativeSample', () => {
  const deck = () => {
    const notes = [
      note({ id: 'n1' }),
      note({ id: 'n2', fields: [field(0, 'Front', ''), field(1, 'Back', 'blank front')] }),
      note({
        id: 'n3',
        fields: [field(0, 'Front', 'x'.repeat(200)), field(1, 'Back', 'long')],
      }),
      note({
        id: 'n4',
        fields: [field(0, 'Front', '<img src="gone.png">a'), field(1, 'Back', 'media')],
        media: [
          {
            reference: 'gone.png',
            fileName: 'gone.png',
            kind: 'image',
            fieldOrd: 0,
            present: false,
          },
        ],
      }),
      note({
        id: 'n5',
        noteTypeId: 'cloze',
        fields: [field(0, 'Text', '{{c1::a}} {{c2::b}}'), field(1, 'Extra', '')],
      }),
    ];
    return draftOf(notes);
  };

  it('covers the cases the plan names, and says which it could not find', () => {
    const sample = buildRepresentativeSample(deck());
    const covered = new Set(sample.cases.flatMap((c) => c.reasons));
    for (const reason of ['first', 'empty-render', 'longest', 'media-heavy', 'cloze'] as const) {
      expect(covered.has(reason)).toBe(true);
    }
    expect(sample.absentReasons).not.toContain('cloze');
    expect(sample.scannedNotes).toBe(5);
  });

  it('shows every sibling of a multi-card note, not just the first', () => {
    const sample = buildRepresentativeSample(deck());
    const siblings = sample.cases.filter((c) => c.reasons.includes('sibling'));
    expect(siblings.map((c) => c.cardOrd).sort()).toEqual([0, 1]);
    expect(siblings.every((c) => c.noteId === 'n5')).toBe(true);
  });

  it('is deterministic — the same deck samples the same cards twice', () => {
    const a = buildRepresentativeSample(deck()).cases.map((c) => `${c.noteId}:${c.cardOrd}`);
    const b = buildRepresentativeSample(deck()).cases.map((c) => `${c.noteId}:${c.cardOrd}`);
    expect(a).toEqual(b);
  });

  it('reports how far it scanned rather than calling a truncated scan representative', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      note({ id: `n${i}`, fields: [field(0, 'Front', `f${i}`), field(1, 'Back', `b${i}`)] }),
    );
    const sample = buildRepresentativeSample(draftOf(many), { scanLimit: 10 });
    expect(sample.scannedNotes).toBe(10);
  });

  it('keeps the failing cards when the set is truncated to the limit', () => {
    const sample = buildRepresentativeSample(deck(), { limit: 2 });
    expect(sample.cases).toHaveLength(2);
    const kept = new Set(sample.cases.flatMap((c) => c.reasons));
    expect(kept.has('empty-render') || kept.has('validation-failing')).toBe(true);
    // And it says so, rather than implying the deck had no ordinary card.
    expect(sample.absentReasons).toContain('first');
  });
});

describe('noteCardCensus', () => {
  // Optional reverse, in Anki's own shape: Card 2 is gated on a separate flag
  // field, not on the content field. Gating it on `Back` would make an empty
  // `Back` read as `empty-question`, because forcing the section open still
  // renders nothing — which is the renderer telling the truth, and the reason
  // this fixture needs the third field.
  const reverseType: AnkiDraftNoteType = {
    ...basic,
    id: 'reverse',
    name: 'Basic (optional reversed)',
    fields: [...basic.fields, { ord: 2, name: 'Add Reverse', sticky: false, rtl: false }],
    templates: [
      ...basic.templates,
      {
        ord: 1,
        name: 'Card 2',
        qfmt: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}',
        afmt: '{{FrontSide}}<hr id=answer>{{Front}}',
        bqfmt: '',
        bafmt: '',
      },
    ],
  };

  function censusDraft(n: AnkiDraftNote, cards: AnkiDraftCard[]): AnkiDraft {
    return draftOf([n], { noteTypes: [basic, clozeType, reverseType], cards });
  }

  it('says nothing when the cards a note holds are the cards it generates', () => {
    const n = note({ id: 'n1', cardIds: ['c1'] });
    const census = noteCardCensus(censusDraft(n, [card({ id: 'c1', noteId: 'n1' })]), n);
    expect(census).toEqual({ existing: 1, generated: 1, differs: false });
  });

  it('counts the card a new cloze deletion would create, which the note does not hold yet', () => {
    const n = note({
      id: 'n1',
      noteTypeId: 'cloze',
      // Two deletions, one card: `setNoteField` never touches `cardIds`.
      fields: [field(0, 'Text', '{{c1::ねこ}}が{{c2::すき}}'), field(1, 'Extra', '')],
      cardIds: ['c1'],
    });
    const census = noteCardCensus(censusDraft(n, [card({ id: 'c1', noteId: 'n1' })]), n);
    expect(census).toEqual({ existing: 1, generated: 2, differs: true });
  });

  it('counts the card a removed cloze deletion would orphan', () => {
    const n = note({
      id: 'n1',
      noteTypeId: 'cloze',
      fields: [field(0, 'Text', '{{c1::ねこ}}がすき'), field(1, 'Extra', '')],
      cardIds: ['c1', 'c2'],
    });
    const cards = [
      card({ id: 'c1', noteId: 'n1', ord: 0 }),
      card({ id: 'c2', noteId: 'n1', ord: 1 }),
    ];
    const census = noteCardCensus(censusDraft(n, cards), n);
    expect(census).toEqual({ existing: 2, generated: 1, differs: true });
  });

  it('does not count a card a conditional suppresses — an optional reverse is not a missing card', () => {
    const n = note({
      id: 'n1',
      noteTypeId: 'reverse',
      fields: [field(0, 'Front', 'ねこ'), field(1, 'Back', 'cat'), field(2, 'Add Reverse', '')],
      cardIds: ['c1'],
    });
    const draft = censusDraft(n, [card({ id: 'c1', noteId: 'n1' })]);
    expect(renderNoteCards(draft, n).map((c) => c.problems.map((p) => p.code))).toEqual([
      [],
      ['conditional-card-not-generated'],
    ]);
    expect(noteCardCensus(draft, n)).toEqual({ existing: 1, generated: 1, differs: false });
  });

  it('reports the sibling an edit turned on, so filling a field is not a silent card', () => {
    const n = note({
      id: 'n1',
      noteTypeId: 'reverse',
      fields: [field(0, 'Front', 'ねこ'), field(1, 'Back', 'cat'), field(2, 'Add Reverse', 'y')],
      cardIds: ['c1'],
    });
    const census = noteCardCensus(censusDraft(n, [card({ id: 'c1', noteId: 'n1' })]), n);
    expect(census).toEqual({ existing: 1, generated: 2, differs: true });
  });

  it('keeps a card that renders badly in the count — broken is not absent', () => {
    // NEGATIVE CONTROL for the `conditional-card-not-generated` rule: an empty
    // question with no conditional behind it must NOT lower `generated`, or a
    // broken card would quietly read as one the note was never going to make.
    const n = note({
      id: 'n1',
      fields: [field(0, 'Front', ''), field(1, 'Back', 'cat')],
      cardIds: ['c1'],
    });
    const draft = censusDraft(n, [card({ id: 'c1', noteId: 'n1' })]);
    expect(renderNoteCards(draft, n).flatMap((c) => c.problems.map((p) => p.code))).toContain(
      'empty-question',
    );
    expect(noteCardCensus(draft, n)).toEqual({ existing: 1, generated: 1, differs: false });
  });
});
