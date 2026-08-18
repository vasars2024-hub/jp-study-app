// Gate 8 clause 2 — reversing a commit.
//
// The property under test is a round trip: commit a change set, reverse it, and
// the reversal must write back exactly the values the source held, as complete
// rows. The two traps this file pins are the ones the design exists for — the
// record is a SNAPSHOT (a later draft edit must not leak into the reversal of an
// earlier commit) and a reversal that would be a lie is REFUSED by name rather
// than half-written.

import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote } from '../ankiDraft';
import {
  createEditJournal,
  renameDraftDeck,
  setCardFlag,
  setCardScheduling,
  setCardSuspended,
  setNoteField,
  setNoteTags,
} from '../ankiDraftEdit';
import type { AnkiDraftEditJournal } from '../ankiDraftEdit';
import { buildApkgExportChanges } from '../ankiApkgExport';
import type { ApkgExportChangeSet } from '../ankiApkgExport';
import { buildCommitRecord, buildCommitReversal } from '../ankiCommitReversal';
import type { AnkiCommitDestination } from '../ankiCommitReversal';
import { ConnectCommitRefusal, planConnectCommit } from '../ankiConnectCommit';
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
    type: 'review',
    queue: 'review',
    due: 10,
    interval: 3,
    easeFactor: 2500,
    reps: 4,
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

/** What step 7 does on a successful export, in one call. */
function commit(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  destination: AnkiCommitDestination = 'package',
  committed?: ApkgExportChangeSet,
) {
  const changes = committed ?? buildApkgExportChanges(draft, journal);
  return buildCommitRecord({
    id: 'commit-1',
    at: '2026-08-18T00:00:00.000Z',
    destination,
    label: 'out.apkg',
    fingerprint: 'sha1:after',
    draft,
    journal,
    committed: changes,
  });
}

describe('buildCommitReversal', () => {
  it('writes the source value back as a complete row, not a patch', () => {
    let d = draftOf([note({ id: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 1, 'dog', normalize));

    const record = commit(d, j);
    expect(record.committed.notes[0]?.fields).toEqual(['ねこ', 'dog']);

    const reversal = buildCommitReversal(record);
    expect(reversal.changes.notes).toHaveLength(1);
    // Ord 1 goes back; ord 0, which this commit never touched, keeps its value.
    expect(reversal.changes.notes[0]?.fields).toEqual(['ねこ', 'cat']);
    expect(reversal.counts).toEqual({ notes: 1, cards: 0, decks: 0, templates: 0 });
    expect(reversal.refusals).toHaveLength(0);
    expect(reversal.empty).toBe(false);
  });

  it('reverses to the FIRST before-image, so two edits to one field go back once', () => {
    let d = draftOf([note({ id: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 0, 'いぬ', normalize));
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 0, 'とり', normalize));

    const reversal = buildCommitReversal(commit(d, j));
    expect(reversal.changes.notes[0]?.fields).toEqual(['ねこ', 'cat']);
  });

  it('reverses nothing when the commit shipped nothing — A → B → A', () => {
    let d = draftOf([note({ id: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 0, 'いぬ', normalize));
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 0, 'ねこ', normalize));

    const reversal = buildCommitReversal(commit(d, j));
    expect(reversal.changes.notes).toHaveLength(0);
    expect(reversal.empty).toBe(true);
    expect(reversal.counts.notes).toBe(0);
  });

  it('is a snapshot: an edit made AFTER the commit does not leak into the reversal', () => {
    let d = draftOf([note({ id: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 1, 'dog', normalize));
    const record = commit(d, j);

    // The user keeps working after committing.
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 1, 'wolf', normalize));
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 0, 'とり', normalize));

    const reversal = buildCommitReversal(record);
    // The row that landed was ['ねこ','dog']; reversing it restores 'cat' and
    // must not mention 'wolf' or 'とり', which are not in the destination.
    expect(reversal.changes.notes[0]?.fields).toEqual(['ねこ', 'cat']);
    expect(reversal.counts.notes).toBe(1);
  });

  it('reverts tags to the source list, in draft space', () => {
    let d = draftOf([note({ id: 'n1', tags: ['n5', 'core'] })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteTags(d, j, 'n1', ['n5', 'core', 'leech']));

    const reversal = buildCommitReversal(commit(d, j));
    expect(reversal.changes.notes[0]?.tags).toEqual(['n5', 'core']);
    expect(reversal.changes.notes[0]?.fields).toBeUndefined();
  });

  it("inverts a deck rename, with `from` set to the destination's CURRENT name", () => {
    let d = draftOf([note({ id: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = renameDraftDeck(d, j, 'd1', 'Core::JLPT'));
    ({ draft: d, journal: j } = renameDraftDeck(d, j, 'd1', 'Core::JLPT N5'));

    const reversal = buildCommitReversal(commit(d, j));
    // `from` is the committed name, or the writer's "the deck moved underneath
    // us" guard would refuse a perfectly valid reversal.
    expect(reversal.changes.deckRenames).toEqual([
      { deckId: 'd1', from: 'Core::JLPT N5', to: 'Core' },
    ]);
    expect(reversal.counts.decks).toBe(1);
  });

  it('reverts all three gate-5 card-state kinds to their before-images', () => {
    let d = draftOf([note({ id: 'n1' })], [card({ id: 'c1', noteId: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setCardFlag(d, j, 'c1', 'orange'));
    ({ draft: d, journal: j } = setCardSuspended(d, j, 'c1', true));
    ({ draft: d, journal: j } = setCardScheduling(d, j, 'c1', { interval: 42, easeFactor: 1900 }));

    const reversal = buildCommitReversal(commit(d, j));
    expect(reversal.changes.cardFlags).toEqual([{ cardId: 'c1', noteId: 'n1', flag: 'none' }]);
    expect(reversal.changes.cardQueues).toEqual([{ cardId: 'c1', noteId: 'n1', queue: 'review' }]);
    expect(reversal.changes.cardScheduling).toEqual([
      { cardId: 'c1', noteId: 'n1', interval: 3, easeFactor: 2500 },
    ]);
    expect(reversal.counts.cards).toBe(3);
  });

  it('does not revert a card-state value the commit folded away', () => {
    let d = draftOf([note({ id: 'n1' })], [card({ id: 'c1', noteId: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setCardFlag(d, j, 'c1', 'orange'));
    ({ draft: d, journal: j } = setCardFlag(d, j, 'c1', 'none'));

    const reversal = buildCommitReversal(commit(d, j));
    expect(reversal.changes.cardFlags).toEqual([]);
    expect(reversal.empty).toBe(true);
  });

  it('refuses to reverse a committed template removal, and names what it costs', () => {
    const record = commit(draftOf([note({ id: 'n1' })]), {
      done: [
        {
          kind: 'template-remove',
          noteTypeId: 'nt1',
          template: { ord: 1, name: 'Recognition', qfmt: '', afmt: '', bqfmt: '', bafmt: '' },
          cards: [
            card({ id: 'c9', noteId: 'n1', ord: 1 }),
            card({ id: 'c10', noteId: 'n1', ord: 1 }),
          ],
          cardIndexes: [3, 4],
          renumbered: [],
        },
      ],
      undone: [],
    });

    const reversal = buildCommitReversal(record);
    expect(reversal.refusals).toEqual([
      { code: 'template-restore-loses-scheduling', subject: 'Recognition', count: 2 },
    ]);
    // Refused whole: nothing about the removal is half-written into the inverse.
    expect(reversal.changes.templateAdds).toEqual([]);
    expect(reversal.empty).toBe(true);
  });

  it('reverses a committed design by removing the ord it added', () => {
    const committed: ApkgExportChangeSet = {
      notes: [],
      cardMoves: [],
      deckRenames: [],
      templateAdds: [
        {
          noteTypeId: 'nt1',
          ord: 2,
          name: 'Reverse',
          qfmt: '{{Back}}',
          afmt: '{{Front}}',
          bqfmt: '',
          bafmt: '',
          cards: [{ noteId: 'n1', deckId: 'd1', due: 1 }],
        },
      ],
    };
    const record = commit(draftOf([note({ id: 'n1' })]), createEditJournal(), 'package', committed);

    const reversal = buildCommitReversal(record);
    expect(reversal.changes.templateRemovals).toEqual([{ noteTypeId: 'nt1', removedOrds: [2] }]);
    expect(reversal.refusals).toHaveLength(0);
    expect(reversal.counts.templates).toBe(1);
  });

  it('refuses to un-add a design that also added a field to the note type', () => {
    const committed: ApkgExportChangeSet = {
      notes: [],
      cardMoves: [],
      deckRenames: [],
      templateAdds: [
        {
          noteTypeId: 'nt1',
          ord: 2,
          name: 'Reverse',
          qfmt: '{{Back}}',
          afmt: '{{Front}}',
          bqfmt: '',
          bafmt: '',
          addedFieldName: 'AddReverse',
          cards: [{ noteId: 'n1', deckId: 'd1', due: 1 }],
        },
      ],
    };
    const record = commit(draftOf([note({ id: 'n1' })]), createEditJournal(), 'package', committed);

    const reversal = buildCommitReversal(record);
    expect(reversal.refusals).toEqual([
      { code: 'template-unadd-field-unsupported', subject: 'AddReverse', count: 1 },
    ]);
    expect(reversal.changes.templateRemovals).toEqual([]);
  });

  it('refuses a text export whole — it overwrote nothing, so there is nothing to put back', () => {
    let d = draftOf([note({ id: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 1, 'dog', normalize));

    const reversal = buildCommitReversal(commit(d, j, 'text'));
    expect(reversal.refusals.map((r) => r.code)).toEqual(['text-export-not-reversible']);
    expect(reversal.changes.notes).toEqual([]);
    expect(reversal.empty).toBe(true);
  });

  it('refuses a field revert whose note is not in the committed change set', () => {
    let d = draftOf([note({ id: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 1, 'dog', normalize));

    const record = commit(d, j);
    const orphaned = { ...record, committed: { ...record.committed, notes: [] }, fieldOrds: {} };
    const reversal = buildCommitReversal(orphaned);
    expect(reversal.refusals).toEqual([{ code: 'note-not-in-commit', subject: 'n1', count: 1 }]);
    expect(reversal.changes.notes).toEqual([]);
  });

  it('maps a revert by ORD, not by position, when the ords are not 0..n-1', () => {
    const sparse = note({
      id: 'n1',
      fields: [
        { ord: 3, name: 'Front', raw: 'ねこ', normalized: 'ねこ' },
        { ord: 7, name: 'Back', raw: 'cat', normalized: 'cat' },
      ],
    });
    let d = draftOf([sparse]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteField(d, j, 'n1', 7, 'dog', normalize));

    const record = commit(d, j);
    expect(record.fieldOrds.n1).toEqual([3, 7]);
    expect(buildCommitReversal(record).changes.notes[0]?.fields).toEqual(['ねこ', 'cat']);
  });

  // The scope-honesty half of the gate: whatever the live destination refuses on
  // the way out has to stay refused on the way back. It does, because a reversal
  // is an ordinary change set on the same transport — nothing had to be taught
  // about reversals for this to hold, which is the point of the design.
  it('stays refused on the way back: a deck rename reversal is refused by the live commit', () => {
    let d = draftOf([note({ id: 'n1' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = renameDraftDeck(d, j, 'd1', 'Core::JLPT'));

    const reversal = buildCommitReversal(commit(d, j));
    expect(reversal.changes.deckRenames).toHaveLength(1);
    try {
      planConnectCommit(reversal.changes, d);
      expect.unreachable('the live destination must refuse a deck rename in either direction');
    } catch (err) {
      expect(err).toBeInstanceOf(ConnectCommitRefusal);
      expect((err as ConnectCommitRefusal).code).toBe('deck-rename-unsupported');
    }
  });

  it('a supported reversal plans real live writes, so the refusal above is not blanket', () => {
    // AnkiConnect keys on integer ids, so the live plan needs real-looking ones.
    let d = draftOf([note({ id: '1700000000001' })]);
    let j: AnkiDraftEditJournal = createEditJournal();
    ({ draft: d, journal: j } = setNoteField(d, j, '1700000000001', 1, 'dog', normalize));

    const reversal = buildCommitReversal(commit(d, j));
    const plan = planConnectCommit(reversal.changes, d);
    expect(plan.noteWrites).toHaveLength(1);
    expect(plan.noteWrites[0]?.fields).toEqual({ Front: 'ねこ', Back: 'cat' });
  });
});
