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
