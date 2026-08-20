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

  it('exports a deck rename as the net of the draft, not the ops', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const renamed: AnkiDraft = {
      ...d,
      decks: [{ id: 'd1', name: 'Japanese::Core', path: ['Japanese', 'Core'], filtered: false }],
    };
    const j: AnkiDraftEditJournal = {
      done: [
        { kind: 'deck-name', deckId: 'd1', before: 'Core', after: 'core', group: 'g1' },
        { kind: 'deck-name', deckId: 'd1', before: 'core', after: 'Japanese::Core', group: 'g2' },
      ],
      undone: [],
    };
    const changes = buildApkgExportChanges(renamed, j);
    expect(changes.deckRenames).toEqual([
      { deckId: 'd1', from: 'Core', to: 'Japanese::Core' },
    ]);
    expect(exportChangesEmpty(changes)).toBe(false);
    // A rename alone is not a note change: nothing else may ride along.
    expect(changes.notes).toHaveLength(0);
    expect(changes.cardMoves).toHaveLength(0);
  });

  it('exports nothing for a deck renamed back to the name the source holds', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const j: AnkiDraftEditJournal = {
      done: [
        { kind: 'deck-name', deckId: 'd1', before: 'Core', after: 'core' },
        { kind: 'deck-name', deckId: 'd1', before: 'core', after: 'Core' },
      ],
      undone: [],
    };
    expect(exportChangesEmpty(buildApkgExportChanges(d, j))).toBe(true);
  });

  // ----- recipe 13's split ------------------------------------------------------

  /** A draft after a split filed `c-n1` and `c-n2` into two decks it invented. */
  function splitDraft(): AnkiDraft {
    const d = draftOf(
      [note({ id: 'n1' }), note({ id: 'n2' })],
      [card({ id: 'c-n1', noteId: 'n1', deckId: 'split:d1:N5' }), card({ id: 'c-n2', noteId: 'n2', deckId: 'split:d1:N4' })],
    );
    return {
      ...d,
      decks: [
        ...d.decks,
        { id: 'split:d1:N5', name: 'Core::N5', path: ['Core', 'N5'], parentId: 'd1', filtered: false, configId: '7' },
        { id: 'split:d1:N4', name: 'Core::N4', path: ['Core', 'N4'], parentId: 'd1', filtered: false, configId: '7' },
      ],
    };
  }

  it('describes each invented deck once, with the name and preset the split chose', () => {
    const j: AnkiDraftEditJournal = {
      done: [
        { kind: 'card-deck', noteId: 'n1', cardId: 'c-n1', before: 'd1', after: 'split:d1:N5', group: 'g1' },
        { kind: 'card-deck', noteId: 'n2', cardId: 'c-n2', before: 'd1', after: 'split:d1:N4', group: 'g1' },
      ],
      undone: [],
    };
    const changes = buildApkgExportChanges(splitDraft(), j);
    expect(changes.cardDeckMoves).toEqual([
      { cardId: 'c-n1', noteId: 'n1', deckId: 'split:d1:N5' },
      { cardId: 'c-n2', noteId: 'n2', deckId: 'split:d1:N4' },
    ]);
    expect(changes.deckCreates).toEqual([
      { deckId: 'split:d1:N5', name: 'Core::N5', configId: '7' },
      { deckId: 'split:d1:N4', name: 'Core::N4', configId: '7' },
    ]);
    // A refile is not a note change and not a reposition.
    expect(changes.notes).toHaveLength(0);
    expect(changes.cardMoves).toHaveLength(0);
  });

  it('describes a deck once when two cards land in it, not once per card', () => {
    const base = splitDraft();
    const d: AnkiDraft = {
      ...base,
      cards: base.cards.map((c) => ({ ...c, deckId: 'split:d1:N5' })),
    };
    const j: AnkiDraftEditJournal = {
      done: [
        { kind: 'card-deck', noteId: 'n1', cardId: 'c-n1', before: 'd1', after: 'split:d1:N5', group: 'g1' },
        { kind: 'card-deck', noteId: 'n2', cardId: 'c-n2', before: 'd1', after: 'split:d1:N5', group: 'g1' },
      ],
      undone: [],
    };
    const changes = buildApkgExportChanges(d, j);
    expect(changes.cardDeckMoves).toHaveLength(2);
    expect(changes.deckCreates).toEqual([
      { deckId: 'split:d1:N5', name: 'Core::N5', configId: '7' },
    ]);
  });

  it('names no invented deck when the split was refiled into an existing one', () => {
    const d = draftOf(
      [note({ id: 'n1' })],
      [card({ id: 'c-n1', noteId: 'n1', deckId: 'd2' })],
    );
    const withTarget: AnkiDraft = {
      ...d,
      decks: [...d.decks, { id: 'd2', name: 'Core::N5', path: ['Core', 'N5'], filtered: false }],
    };
    const j: AnkiDraftEditJournal = {
      done: [{ kind: 'card-deck', noteId: 'n1', cardId: 'c-n1', before: 'd1', after: 'd2' }],
      undone: [],
    };
    const changes = buildApkgExportChanges(withTarget, j);
    expect(changes.cardDeckMoves).toHaveLength(1);
    expect(changes.deckCreates).toEqual([]);
  });

  it('describes no deck for a split whose moves were all undone', () => {
    // The card is back in `d1`, so the move folds to nothing — and the deck the
    // split invented must not be written into the package either.
    const base = splitDraft();
    const d: AnkiDraft = { ...base, cards: base.cards.map((c) => ({ ...c, deckId: 'd1' })) };
    const j: AnkiDraftEditJournal = {
      done: [
        { kind: 'card-deck', noteId: 'n1', cardId: 'c-n1', before: 'd1', after: 'split:d1:N5', group: 'g1' },
        { kind: 'card-deck', noteId: 'n2', cardId: 'c-n2', before: 'd1', after: 'split:d1:N4', group: 'g1' },
      ],
      undone: [],
    };
    const changes = buildApkgExportChanges(d, j);
    expect(changes.cardDeckMoves).toEqual([]);
    expect(changes.deckCreates).toEqual([]);
    expect(exportChangesEmpty(changes)).toBe(true);
  });

  it('keeps a reposition and a refile of the SAME card apart', () => {
    const base = splitDraft();
    const d: AnkiDraft = {
      ...base,
      cards: base.cards.map((c) => (c.id === 'c-n1' ? { ...c, due: 99 } : c)),
    };
    const j: AnkiDraftEditJournal = {
      done: [
        { kind: 'card-deck', noteId: 'n1', cardId: 'c-n1', before: 'd1', after: 'split:d1:N5' },
        { kind: 'card-due', noteId: 'n1', cardId: 'c-n1', before: 10, after: 99 },
      ],
      undone: [],
    };
    const changes = buildApkgExportChanges(d, j);
    expect(changes.cardMoves).toEqual([{ cardId: 'c-n1', noteId: 'n1', due: 99 }]);
    expect(changes.cardDeckMoves).toEqual([
      { cardId: 'c-n1', noteId: 'n1', deckId: 'split:d1:N5' },
    ]);
  });

  describe('a card the same journal DESIGNED', () => {
    // Gate 14's live walk refused the whole export with `card-missing` naming
    // `1768607213795-design2`: a split moved a card `template-add` was still
    // creating, and the writer validates every move against the SOURCE
    // package's `cards` table. Nine other rows' edits went down with it,
    // because the writer is all-or-nothing.
    function designed(deckId: string, due: number) {
      const base = splitDraft();
      const tpl = {
        ord: 1,
        name: 'Card 2',
        qfmt: '{{Back}}',
        afmt: '{{FrontSide}}{{Front}}',
        bqfmt: '',
        bafmt: '',
      };
      const made = card({ id: 'n1-design1', noteId: 'n1', ord: 1, deckId, due });
      const d: AnkiDraft = {
        ...base,
        cards: [...base.cards, made],
        noteTypes: base.noteTypes.map((nt) => ({ ...nt, templates: [tpl] })),
      };
      const j: AnkiDraftEditJournal = {
        done: [
          {
            kind: 'template-add',
            noteTypeId: 'nt1',
            template: tpl,
            addedField: null,
            cards: [{ ...made, deckId: 'd1', due: 10 }],
          },
        ],
        undone: [],
      };
      return { d, j };
    }

    it('folds its refile into the design instead of a move no source card can take', () => {
      const { d, j } = designed('split:d1:N5', 10);
      j.done.push({
        kind: 'card-deck', noteId: 'n1', cardId: 'n1-design1',
        before: 'd1', after: 'split:d1:N5',
      });
      const changes = buildApkgExportChanges(d, j);
      expect(changes.cardDeckMoves).toEqual([]);
      expect(changes.templateAdds?.[0].cards).toEqual([
        { noteId: 'n1', deckId: 'split:d1:N5', due: 10 },
      ]);
    });

    it('still creates the invented deck the design is now the only card in', () => {
      const { d, j } = designed('split:d1:N5', 10);
      j.done.push({
        kind: 'card-deck', noteId: 'n1', cardId: 'n1-design1',
        before: 'd1', after: 'split:d1:N5',
      });
      const changes = buildApkgExportChanges(d, j);
      expect(changes.deckCreates).toEqual([
        { deckId: 'split:d1:N5', name: 'Core::N5', configId: '7' },
      ]);
    });

    it('folds its reposition into the design too, for the same reason', () => {
      const { d, j } = designed('d1', 42);
      j.done.push({ kind: 'card-due', noteId: 'n1', cardId: 'n1-design1', before: 10, after: 42 });
      const changes = buildApkgExportChanges(d, j);
      expect(changes.cardMoves).toEqual([]);
      expect(changes.templateAdds?.[0].cards).toEqual([
        { noteId: 'n1', deckId: 'd1', due: 42 },
      ]);
    });

    it('leaves a SOURCE card alone — the fold is only for cards being created', () => {
      const { d, j } = designed('d1', 10);
      j.done.push({
        kind: 'card-deck', noteId: 'n2', cardId: 'c-n2',
        before: 'd1', after: 'split:d1:N4',
      });
      const changes = buildApkgExportChanges(d, j);
      expect(changes.cardDeckMoves).toEqual([
        { cardId: 'c-n2', noteId: 'n2', deckId: 'split:d1:N4' },
      ]);
      expect(changes.templateAdds?.[0].cards).toEqual([
        { noteId: 'n1', deckId: 'd1', due: 10 },
      ]);
    });
  });
});
