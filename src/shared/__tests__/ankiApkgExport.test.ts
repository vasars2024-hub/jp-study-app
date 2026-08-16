// The export change set must be the review's numbers made into writes: the net
// against the journal's first before-images, never the sum of the steps.

import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote } from '../ankiDraft';
import { createEditJournal, setNoteField, setNoteTags } from '../ankiDraftEdit';
import type { AnkiDraftEditJournal } from '../ankiDraftEdit';
import { buildApkgExportChanges, exportChangesEmpty } from '../ankiApkgExport';
import { stripFieldHtml } from '../apkgParse';

const normalize = stripFieldHtml;

function note(over: Partial<AnkiDraftNote> & { id: string }): AnkiDraftNote {
  return {
    guid: `g-${over.id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Front', raw: 'ねこ', normalized: 'ねこ' },
      { ord: 1, name: 'Back', raw: 'cat', normalized: 'cat' },
    ],
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
    due: 10,
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

function draftOf(notes: AnkiDraftNote[], cards: AnkiDraftCard[] = []): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'sha1:fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      {
        id: 'nt1',
        name: 'Basic',
        kind: 'standard',
        css: '',
        fields: [
          { ord: 0, name: 'Front', sticky: false, rtl: false },
          { ord: 1, name: 'Back', sticky: false, rtl: false },
        ],
        templates: [],
        sortFieldOrd: 0,
      },
    ],
    notes,
    cards,
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: cards.length,
      decks: 1,
      noteTypes: 1,
      reviews: 0,
      mediaReferences: 0,
    },
  };
}

describe('buildApkgExportChanges', () => {
  it('exports the net, so a field taken A → B → A ships nothing', () => {
    let d = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    let r = setNoteField(d, j, 'n1', 0, 'いぬ', normalize);
    ({ draft: d, journal: j } = r);
    r = setNoteField(d, j, 'n2', 0, 'とり', normalize);
    ({ draft: d, journal: j } = r);
    r = setNoteField(d, j, 'n1', 0, 'ねこ', normalize);
    ({ draft: d, journal: j } = r);

    const changes = buildApkgExportChanges(d, j);
    expect(changes.notes).toHaveLength(1);
    expect(changes.notes[0]).toMatchObject({ noteId: 'n2' });
    expect(changes.cardMoves).toHaveLength(0);
  });

  it('ships the complete field row in ord order, not a patch', () => {
    let d = draftOf([note({ id: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 1, 'dog', normalize));

    const changes = buildApkgExportChanges(d, j);
    expect(changes.notes[0]?.fields).toEqual(['ねこ', 'dog']);
    expect(changes.notes[0]?.tags).toBeUndefined();
  });

  it('exports a net tag change without fields, in draft space', () => {
    let d = draftOf([note({ id: 'n1', tags: ['core'], marked: true })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteTags(d, j, 'n1', ['core', 'verbs']));

    const changes = buildApkgExportChanges(d, j);
    expect(changes.notes).toHaveLength(1);
    expect(changes.notes[0]?.fields).toBeUndefined();
    // `marked` travels as the note flag, never inside the tag list.
    expect(changes.notes[0]?.tags).toEqual(['core', 'verbs']);
  });

  it('exports a net card move and drops one that returned to its origin', () => {
    const d0 = draftOf(
      [note({ id: 'n1', cardIds: ['c1', 'c2'] })],
      [card({ id: 'c1', noteId: 'n1', due: 99 }), card({ id: 'c2', noteId: 'n1', due: 10 })],
    );
    const j: AnkiDraftEditJournal = {
      done: [
        { kind: 'card-due', noteId: 'n1', cardId: 'c1', before: 10, after: 99, group: 'g1' },
        { kind: 'card-due', noteId: 'n1', cardId: 'c2', before: 10, after: 40, group: 'g1' },
        { kind: 'card-due', noteId: 'n1', cardId: 'c2', before: 40, after: 10, group: 'g2' },
      ],
      undone: [],
    };

    const changes = buildApkgExportChanges(d0, j);
    expect(changes.cardMoves).toEqual([{ cardId: 'c1', noteId: 'n1', due: 99 }]);
    expect(changes.notes).toHaveLength(0);
  });

  it('an empty journal exports nothing', () => {
    const changes = buildApkgExportChanges(draftOf([note({ id: 'n1' })]), createEditJournal());
    expect(exportChangesEmpty(changes)).toBe(true);
  });

  it('skips a note the draft no longer holds, as the review does', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const j: AnkiDraftEditJournal = {
      done: [{ kind: 'field', noteId: 'ghost', fieldOrd: 0, before: 'a', after: 'b' }],
      undone: [],
    };
    expect(exportChangesEmpty(buildApkgExportChanges(d, j))).toBe(true);
  });
});
