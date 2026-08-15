import { describe, expect, it } from 'vitest';
import {
  buildAnkiConnectCollection,
  joinConnectFields,
  type AnkiConnectCardInfo,
  type AnkiConnectDraftInput,
  type AnkiConnectModel,
  type AnkiConnectNoteInfo,
} from '../ankiConnectDraft';
import { buildAnkiDraft, splitNoteFields } from '../ankiDraft';

// Every literal below was captured from a live AnkiConnect 6 (`findModelsByName`,
// `notesInfo`, `cardsInfo`, `deckNamesAndIds`) rather than written from memory.
const BASIC: AnkiConnectModel = {
  id: 1767397623232,
  name: 'Basic',
  type: 0,
  css: '.card {\n    font-family: arial;\n}\n',
  sortf: 0,
  latexPre: '\\documentclass[12pt]{article}',
  latexPost: '\\end{document}',
  flds: [
    { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20 },
    { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20 },
  ],
  tmpls: [
    {
      name: 'Card 1',
      ord: 0,
      qfmt: '{{Front}}',
      afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
      bqfmt: '',
      bafmt: '',
      did: null,
    },
  ],
};

const CLOZE: AnkiConnectModel = {
  id: 1767397623236,
  name: 'Cloze',
  type: 1,
  sortf: 0,
  flds: [{ name: 'Text', ord: 0 }, { name: 'Back Extra', ord: 1 }],
  tmpls: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' }],
};

const NOTE: AnkiConnectNoteInfo = {
  noteId: 1782214626188,
  profile: 'User 1',
  modelName: 'Basic',
  tags: ['yomitan'],
  mod: 1782214626,
  cards: [1782214626188],
  fields: {
    Front: { value: '烧烤', order: 0 },
    Back: { value: '<b>Reading:</b> shāokǎo', order: 1 },
  },
};

const CARD: AnkiConnectCardInfo = {
  cardId: 1782214626188,
  note: 1782214626188,
  deckName: 'Chinese',
  modelName: 'Basic',
  ord: 0,
  type: 0,
  queue: 0,
  due: 314455,
  interval: 0,
  factor: 0,
  reps: 0,
  lapses: 0,
  left: 0,
  mod: 1782214626,
  flags: 0,
};

function input(overrides: Partial<AnkiConnectDraftInput> = {}): AnkiConnectDraftInput {
  return {
    deckNamesAndIds: { Default: 1, Chinese: 1782214589474, 'Custom Study Session': 1768532311921 },
    models: [BASIC, CLOZE],
    notes: [NOTE],
    cards: [CARD],
    ...overrides,
  };
}

const plain = (raw: string): string => String(raw ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('joinConnectFields', () => {
  it('orders on the reported ordinal, not on object key order', () => {
    // The live response really does hand back an object; a note whose keys were
    // inserted back-to-front must still join front-to-back.
    const scrambled = { Back: { value: 'B', order: 1 }, Front: { value: 'F', order: 0 } };
    expect(splitNoteFields(joinConnectFields(scrambled))).toEqual(['F', 'B']);
  });

  it('keeps an empty field rather than dropping it', () => {
    const withGap = { A: { value: 'a', order: 0 }, B: { value: '', order: 1 }, C: { value: 'c', order: 2 } };
    expect(splitNoteFields(joinConnectFields(withGap))).toEqual(['a', '', 'c']);
  });

  it('answers a single empty field for a note with none', () => {
    expect(joinConnectFields(undefined)).toBe('');
  });
});

describe('buildAnkiConnectCollection', () => {
  it('carries the whole model row through, including cloze kind and latex', () => {
    const { raw } = buildAnkiConnectCollection(input());
    const basic = raw.noteTypes.find((n) => n.name === 'Basic')!;
    expect(basic.id).toBe('1767397623232');
    expect(basic.type).toBe(0);
    expect(basic.latexPre).toContain('documentclass');
    expect(basic.fields.map((f) => f.name)).toEqual(['Front', 'Back']);
    expect(basic.templates[0]).toMatchObject({ ord: 0, name: 'Card 1', qfmt: '{{Front}}' });
    // `did: null` is Anki's "no deck override"; it must not become the deck 0.
    expect(basic.templates[0]!.did).toBeUndefined();
    expect(raw.noteTypes.find((n) => n.name === 'Cloze')!.type).toBe(1);
  });

  it('resolves the note to its model id and the card to its deck id', () => {
    const { raw, unknownModelNames, unknownDeckNames } = buildAnkiConnectCollection(input());
    expect(raw.notes[0]!.mid).toBe('1767397623232');
    expect(raw.cards[0]!.did).toBe('1782214589474');
    expect(raw.cards[0]!.nid).toBe('1782214626188');
    expect(unknownModelNames).toEqual([]);
    expect(unknownDeckNames).toEqual([]);
  });

  it('leaves the guid empty rather than reusing the note id', () => {
    const { raw } = buildAnkiConnectCollection(input());
    // A note id is collection-local; a guid is what survives a reimport. Filling
    // one with the other would make an export collide on a foreign collection.
    expect(raw.notes[0]!.guid).toBe('');
  });

  it('carries an unresolvable model and deck through by name, and names them', () => {
    const orphanNote: AnkiConnectNoteInfo = { ...NOTE, noteId: 999, modelName: 'Retired Model' };
    const orphanCard: AnkiConnectCardInfo = { ...CARD, cardId: 999, note: 999, deckName: 'Gone::Deck' };
    const shape = buildAnkiConnectCollection(input({ notes: [orphanNote], cards: [orphanCard] }));
    expect(shape.raw.notes[0]!.mid).toBe('Retired Model');
    expect(shape.raw.cards[0]!.did).toBe('Gone::Deck');
    expect(shape.unknownModelNames).toEqual(['Retired Model']);
    expect(shape.unknownDeckNames).toEqual(['Gone::Deck']);
  });

  it('marks only the decks the reader confirmed filtered', () => {
    const { raw } = buildAnkiConnectCollection(
      input({ filteredDeckNames: ['Custom Study Session'] }),
    );
    const byName = new Map(raw.decks.map((d) => [d.name, d.dyn]));
    expect(byName.get('Custom Study Session')).toBe(1);
    expect(byName.get('Chinese')).toBe(0);
  });

  it('reports neither an empty revlog nor an empty media manifest', () => {
    const { raw } = buildAnkiConnectCollection(input());
    expect(raw.revlog).toBeUndefined();
    expect(raw.mediaFiles).toBeUndefined();
  });
});

describe('buildAnkiConnectCollection through buildAnkiDraft', () => {
  it('produces a clean draft from a healthy live read', () => {
    const { raw } = buildAnkiConnectCollection(input({ filteredDeckNames: ['Custom Study Session'] }));
    const draft = buildAnkiDraft(raw, {
      source: { kind: 'ankiconnect', label: 'User 1', fingerprint: 'test' },
      normalize: plain,
    });
    expect(draft.counts).toMatchObject({ notes: 1, cards: 1, decks: 3, noteTypes: 2 });
    expect(draft.notes[0]!.fields.map((f) => `${f.name}=${f.normalized}`)).toEqual([
      'Front=烧烤',
      'Back=Reading: shāokǎo',
    ]);
    expect(draft.cards[0]).toMatchObject({ type: 'new', queue: 'new', flag: 'none' });
    expect(draft.decks.find((d) => d.name === 'Custom Study Session')!.filtered).toBe(true);
    expect(draft.diagnostics.filter((d) => d.severity === 'blocking')).toEqual([]);
    expect(draft.diagnostics.map((d) => d.code)).toContain('filtered-deck');
  });

  it('turns an unresolvable model into a blocking diagnostic, not a lost note', () => {
    const { raw } = buildAnkiConnectCollection(
      input({ notes: [{ ...NOTE, modelName: 'Retired Model' }] }),
    );
    const draft = buildAnkiDraft(raw, {
      source: { kind: 'ankiconnect', label: 'User 1', fingerprint: 'test' },
      normalize: plain,
    });
    expect(draft.notes).toHaveLength(1);
    expect(draft.diagnostics.find((d) => d.code === 'unknown-note-type')).toMatchObject({
      severity: 'blocking',
      count: 1,
    });
  });

  it('reports a field count that disagrees with the model as corruption', () => {
    const short: AnkiConnectNoteInfo = { ...NOTE, fields: { Front: { value: 'only one', order: 0 } } };
    const { raw } = buildAnkiConnectCollection(input({ notes: [short] }));
    const draft = buildAnkiDraft(raw, {
      source: { kind: 'ankiconnect', label: 'User 1', fingerprint: 'test' },
      normalize: plain,
    });
    expect(draft.diagnostics.find((d) => d.code === 'field-count-mismatch')).toMatchObject({
      severity: 'blocking',
      samples: ['1782214626188'],
    });
  });
});
