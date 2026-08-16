import { describe, expect, it } from 'vitest';
import type {
  AnkiDraft,
  AnkiDraftCard,
  AnkiDraftNote,
  AnkiDraftNoteType,
} from '../ankiDraft';
import {
  answerExtra,
  buildCardHealthContext,
  cardHealth,
  noteCardHealth,
  parseCardHealth,
  tallyCardHealth,
  worstCardHealth,
  type CardHealth,
} from '../ankiCardHealth';
import { renderAnkiCard, renderNoteCards } from '../ankiTemplateRender';

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

function noteType(over: Partial<AnkiDraftNoteType> & { id: string }): AnkiDraftNoteType {
  return {
    name: over.id,
    kind: 'standard',
    css: '',
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
    ...over,
  };
}

const basic = noteType({ id: 'basic' });

function draftOf(notes: AnkiDraftNote[], types: AnkiDraftNoteType[] = [basic]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Japanese', path: ['Japanese'], filtered: false }],
    noteTypes: types,
    notes,
    cards: notes.flatMap((n) =>
      (types.find((t) => t.id === n.noteTypeId)?.templates ?? [{ ord: 0 }]).map((tpl) =>
        card({ id: `c-${n.id}-${tpl.ord}`, noteId: n.id, ord: tpl.ord }),
      ),
    ),
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: notes.length,
      decks: 1,
      noteTypes: types.length,
      reviews: 0,
      mediaReferences: 0,
    },
  };
}

/** The verdict of a note's single card, rendered the way a surface would. */
function healthOf(draft: AnkiDraft, n: AnkiDraftNote, ord = 0): CardHealth {
  return cardHealth(renderAnkiCard(draft, n, ord));
}

describe('answerExtra', () => {
  it('returns what the answer adds once the embedded question is removed', () => {
    expect(answerExtra('ねこ', 'ねこ<hr id=answer>cat')).toBe('cat');
  });

  it('is empty when the answer strips to exactly the question', () => {
    expect(answerExtra('ねこ', 'ねこ<hr id=answer>')).toBe('');
    expect(answerExtra('ねこ', 'ねこ')).toBe('');
  });

  it('is empty when the remainder is the question over again', () => {
    // `{{FrontSide}}<hr id=answer>{{Front}}` — a mis-authored template.
    expect(answerExtra('ねこ', 'ねこ<hr id=answer>ねこ')).toBe('');
  });

  it('returns the whole answer when it does not embed the question', () => {
    expect(answerExtra('ねこ', 'cat')).toBe('cat');
  });

  it('counts a media file name as something the answer adds', () => {
    // Anki reviews an image-only back; calling it identical would put every
    // image card in a deck into the defect queue.
    expect(answerExtra('ねこ', 'ねこ<hr id=answer><img src="neko.jpg">')).toBe('neko.jpg');
  });

  it('does not confuse a shared prefix with an embedded question', () => {
    // The answer starts with the same three characters but is longer, so the
    // remainder is real content, not a substring accident.
    expect(answerExtra('ねこ', 'ねこがすき')).toBe('がすき');
  });
});

describe('cardHealth', () => {
  it('calls a normal front/back card ok', () => {
    const n = note({ id: 'n1' });
    expect(healthOf(draftOf([n]), n)).toBe('ok');
  });

  it('calls an answer that renders back to the question same, not ok', () => {
    // This is the whole point of the recipe: `empty-answer` does NOT fire here,
    // because {{FrontSide}} put the question into the answer.
    const n = note({ id: 'n1', fields: [field(0, 'Front', 'ねこ'), field(1, 'Back', '')] });
    const rendered = renderAnkiCard(draftOf([n]), n, 0);
    expect(rendered.answerHtml).toBe('ねこ<hr id=answer>');
    expect(rendered.problems.map((p) => p.code)).not.toContain('empty-answer');
    expect(cardHealth(rendered)).toBe('same');
  });

  it('calls a genuinely blank answer empty-back', () => {
    const bare = noteType({
      id: 'bare',
      templates: [
        { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{Back}}', bqfmt: '', bafmt: '' },
      ],
    });
    const n = note({
      id: 'n1',
      noteTypeId: 'bare',
      fields: [field(0, 'Front', 'ねこ'), field(1, 'Back', '')],
    });
    expect(healthOf(draftOf([n], [bare]), n)).toBe('empty-back');
  });

  it('calls a blank question empty-front', () => {
    const n = note({ id: 'n1', fields: [field(0, 'Front', ''), field(1, 'Back', 'cat')] });
    expect(healthOf(draftOf([n]), n)).toBe('empty-front');
  });

  it('calls an unresolved field broken, ahead of the blank it causes', () => {
    const typo = noteType({
      id: 'typo',
      templates: [
        {
          ord: 0,
          name: 'Card 1',
          qfmt: '{{Frnt}}',
          afmt: '{{FrontSide}}<hr id=answer>{{Back}}',
          bqfmt: '',
          bafmt: '',
        },
      ],
    });
    const n = note({ id: 'n1', noteTypeId: 'typo' });
    expect(healthOf(draftOf([n], [typo]), n)).toBe('broken');
  });

  it('calls a filter the renderer does not implement broken', () => {
    const tts = noteType({
      id: 'tts',
      templates: [
        {
          ord: 0,
          name: 'Card 1',
          qfmt: '{{tts ja_JP:Front}}',
          afmt: '{{FrontSide}}<hr id=answer>{{Back}}',
          bqfmt: '',
          bafmt: '',
        },
      ],
    });
    const n = note({ id: 'n1', noteTypeId: 'tts' });
    expect(healthOf(draftOf([n], [tts]), n)).toBe('broken');
  });

  it('calls an opted-out conditional card not-generated, never empty-front', () => {
    const optional = noteType({
      id: 'optional',
      fields: [
        { ord: 0, name: 'Front', sticky: false, rtl: false },
        { ord: 1, name: 'Back', sticky: false, rtl: false },
        { ord: 2, name: 'Add Reverse', sticky: false, rtl: false },
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
        {
          ord: 1,
          name: 'Card 2',
          qfmt: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}',
          afmt: '{{FrontSide}}<hr id=answer>{{Front}}',
          bqfmt: '',
          bafmt: '',
        },
      ],
    });
    const n = note({
      id: 'n1',
      noteTypeId: 'optional',
      fields: [field(0, 'Front', 'ねこ'), field(1, 'Back', 'cat'), field(2, 'Add Reverse', '')],
    });
    const draft = draftOf([n], [optional]);
    expect(healthOf(draft, n, 1)).toBe('not-generated');
    // And the note as a whole is healthy — the opted-out sibling is dropped.
    expect(noteCardHealth(draft, n)).toBe('ok');
  });

  it('judges an opted-in reverse card on its own render', () => {
    const optional = noteType({
      id: 'optional',
      fields: [
        { ord: 0, name: 'Front', sticky: false, rtl: false },
        { ord: 1, name: 'Back', sticky: false, rtl: false },
        { ord: 2, name: 'Add Reverse', sticky: false, rtl: false },
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
        {
          ord: 1,
          name: 'Card 2',
          qfmt: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}',
          afmt: '{{FrontSide}}<hr id=answer>{{Back}}',
          bqfmt: '',
          bafmt: '',
        },
      ],
    });
    // Opted in, but the reverse answer shows `{{Back}}` — the same text its own
    // question already showed. The note is `same`, not `ok`.
    const n = note({
      id: 'n1',
      noteTypeId: 'optional',
      fields: [field(0, 'Front', 'ねこ'), field(1, 'Back', 'cat'), field(2, 'Add Reverse', 'y')],
    });
    const draft = draftOf([n], [optional]);
    expect(healthOf(draft, n, 0)).toBe('ok');
    expect(healthOf(draft, n, 1)).toBe('same');
    expect(noteCardHealth(draft, n)).toBe('same');
  });
});

describe('worstCardHealth', () => {
  it('takes the worst verdict, in the documented order', () => {
    expect(worstCardHealth(['ok', 'same'])).toBe('same');
    expect(worstCardHealth(['same', 'empty-back'])).toBe('empty-back');
    expect(worstCardHealth(['empty-back', 'empty-front'])).toBe('empty-front');
    expect(worstCardHealth(['empty-front', 'broken'])).toBe('broken');
    expect(worstCardHealth(['ok', 'ok'])).toBe('ok');
  });

  it('drops ungenerated siblings rather than ranking them', () => {
    expect(worstCardHealth(['ok', 'not-generated'])).toBe('ok');
    expect(worstCardHealth(['same', 'not-generated'])).toBe('same');
  });

  it('says not-generated only when every card is', () => {
    expect(worstCardHealth(['not-generated', 'not-generated'])).toBe('not-generated');
  });

  it('calls a note type with no template at all broken', () => {
    const empty = noteType({ id: 'empty', templates: [] });
    const n = note({ id: 'n1', noteTypeId: 'empty' });
    const draft = draftOf([n], [empty]);
    expect(renderNoteCards(draft, n)).toHaveLength(0);
    expect(noteCardHealth(draft, n)).toBe('broken');
  });
});

describe('buildCardHealthContext', () => {
  it('keys every note in the draft, and the tally sums to the note count', () => {
    const notes = [
      note({ id: 'good' }),
      note({ id: 'blank-back', fields: [field(0, 'Front', 'いぬ'), field(1, 'Back', '')] }),
      note({ id: 'blank-front', fields: [field(0, 'Front', ''), field(1, 'Back', 'dog')] }),
    ];
    const context = buildCardHealthContext(draftOf(notes));
    expect(context.size).toBe(3);
    expect(context.get('good')).toBe('ok');
    expect(context.get('blank-back')).toBe('same');
    expect(context.get('blank-front')).toBe('empty-front');
    const tally = tallyCardHealth(context.values());
    expect(tally.ok + tally.same + tally['empty-front']).toBe(notes.length);
    expect(tally).toEqual({
      ok: 1,
      'not-generated': 0,
      same: 1,
      'empty-back': 0,
      'empty-front': 1,
      broken: 0,
    });
  });
});

describe('parseCardHealth', () => {
  it('accepts every verdict and refuses anything else', () => {
    expect(parseCardHealth('same')).toBe('same');
    expect(parseCardHealth(' Empty-Back ')).toBe('empty-back');
    expect(parseCardHealth('not-generated')).toBe('not-generated');
    expect(parseCardHealth('broken-ish')).toBeNull();
    expect(parseCardHealth('')).toBeNull();
  });
});
