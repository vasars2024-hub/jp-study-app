import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import { createEditJournal, setNoteField, setNoteTags, undoLastEdit } from '../ankiDraftEdit';
import type { AnkiDraftEditJournal } from '../ankiDraftEdit';
import { buildWorkbenchReview } from '../ankiWorkbenchReview';
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

function draftOf(notes: AnkiDraftNote[]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
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
    cards: [],
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: 0,
      decks: 1,
      noteTypes: 1,
      reviews: 0,
      mediaReferences: 0,
    },
  };
}

/** Apply a batch the way a tray does: every op carrying one shared group id. */
function grouped(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
  group: string,
  writes: { noteId: string; fieldOrd: number; raw: string }[],
): { draft: AnkiDraft; journal: AnkiDraftEditJournal } {
  let d = draft;
  let j = journal;
  for (const w of writes) {
    const r = setNoteField(d, j, w.noteId, w.fieldOrd, w.raw, normalize);
    if (!r.changed) continue;
    d = r.draft;
    const last = r.journal.done[r.journal.done.length - 1]!;
    j = { done: [...r.journal.done.slice(0, -1), { ...last, group }], undone: [] };
  }
  return { draft: d, journal: j };
}

describe('buildWorkbenchReview', () => {
  it('counts the net against the source, not the sum of the steps', () => {
    // A → B → A is not a change. The step outcomes said "2 notes changed"
    // twice; review must still report zero for this note.
    let d = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    let j = createEditJournal();
    ({ draft: d, journal: j } = grouped(d, j, 'g1', [
      { noteId: 'n1', fieldOrd: 0, raw: 'いぬ' },
      { noteId: 'n2', fieldOrd: 0, raw: 'とり' },
    ]));
    ({ draft: d, journal: j } = grouped(d, j, 'g2', [{ noteId: 'n1', fieldOrd: 0, raw: 'ねこ' }]));

    const r = buildWorkbenchReview(d, j);
    expect(r.changedNotes).toBe(1);
    expect(r.revertedNotes).toBe(1);
    expect(r.totalDiffs).toBe(1);
    expect(r.diffs[0]).toMatchObject({ noteId: 'n2', fieldName: 'Front', before: 'ねこ', after: 'とり' });
    // Two trays plus nothing else: the Undo button's own units.
    expect(r.appliedSteps).toBe(2);
  });

  it('flags a value two steps wrote and reports the later value as what lands', () => {
    let d = draftOf([note({ id: 'n1' })]);
    let j = createEditJournal();
    ({ draft: d, journal: j } = grouped(d, j, 'g1', [{ noteId: 'n1', fieldOrd: 1, raw: 'dog' }]));
    ({ draft: d, journal: j } = grouped(d, j, 'g2', [{ noteId: 'n1', fieldOrd: 1, raw: 'bird' }]));

    const r = buildWorkbenchReview(d, j);
    expect(r.overwrites).toBe(1);
    expect(r.totalDiffs).toBe(1);
    // The before-image is the source's, not step 1's output.
    expect(r.diffs[0]).toMatchObject({ before: 'cat', after: 'bird', overwritten: true });
  });

  it('follows an undo down: the taken-back change stops being reported', () => {
    let d = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    let j = createEditJournal();
    ({ draft: d, journal: j } = grouped(d, j, 'g1', [
      { noteId: 'n1', fieldOrd: 0, raw: 'いぬ' },
      { noteId: 'n2', fieldOrd: 0, raw: 'とり' },
    ]));
    expect(buildWorkbenchReview(d, j).changedNotes).toBe(2);

    const undone = undoLastEdit(d, j, normalize);
    const r = buildWorkbenchReview(undone.draft, undone.journal);
    expect(r.changedNotes).toBe(0);
    expect(r.totalDiffs).toBe(0);
    expect(r.appliedSteps).toBe(0);
  });

  it('groups net field changes by field name and counts tags separately', () => {
    let d = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    let j = createEditJournal();
    ({ draft: d, journal: j } = grouped(d, j, 'g1', [
      { noteId: 'n1', fieldOrd: 0, raw: 'いぬ' },
      { noteId: 'n2', fieldOrd: 0, raw: 'とり' },
      { noteId: 'n1', fieldOrd: 1, raw: 'dog' },
    ]));
    const tagged = setNoteTags(d, j, 'n2', ['jlpt::n3']);
    const r = buildWorkbenchReview(tagged.draft, tagged.journal);

    expect(r.fieldCounts).toEqual([
      { name: 'Front', notes: 2 },
      { name: 'Back', notes: 1 },
    ]);
    expect(r.tagNotes).toBe(1);
    expect(r.changedNotes).toBe(2);
    expect(r.totalDiffs).toBe(4);
  });

  it('caps the rendered lines without capping the count', () => {
    const notes = Array.from({ length: 8 }, (_, i) => note({ id: `n${i}` }));
    let d = draftOf(notes);
    let j = createEditJournal();
    ({ draft: d, journal: j } = grouped(
      d,
      j,
      'g1',
      notes.map((n, i) => ({ noteId: n.id, fieldOrd: 0, raw: `ねこ${i}` })),
    ));

    const r = buildWorkbenchReview(d, j, { diffLimit: 3 });
    expect(r.totalDiffs).toBe(8);
    expect(r.diffs).toHaveLength(3);
    expect(r.changedNotes).toBe(8);
  });

  it('is empty for an untouched draft', () => {
    const r = buildWorkbenchReview(draftOf([note({ id: 'n1' })]), createEditJournal());
    expect(r).toMatchObject({
      appliedSteps: 0,
      changedNotes: 0,
      revertedNotes: 0,
      totalDiffs: 0,
      overwrites: 0,
      fieldCounts: [],
    });
  });
});
