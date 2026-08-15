import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import {
  clozeOrdinals,
  createEditJournal,
  editedNoteIds,
  noteIsEdited,
  normalizeTags,
  redoLastEdit,
  setNoteField,
  setNoteTags,
  undoLastEdit,
} from '../ankiDraftEdit';
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
    cardIds: ['c1'],
    media: [],
    ...over,
  };
}

function draftOf(notes: AnkiDraftNote[], clozeType = false): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      {
        id: 'nt1',
        name: clozeType ? 'Cloze' : 'Basic',
        kind: clozeType ? 'cloze' : 'standard',
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
      notes: notes.length, cards: 0, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0,
    },
  };
}

describe('normalizeTags', () => {
  it('splits on whitespace, drops empties and collapses duplicates in first-seen order', () => {
    // Anki tags are whitespace-separated, so "a b" is two tags however it arrived.
    expect(normalizeTags(['jlpt::n3', '  ', 'core  verbs', 'jlpt::n3'])).toEqual([
      'jlpt::n3', 'core', 'verbs',
    ]);
  });
});

describe('setNoteField', () => {
  it('rewrites raw and the normalized text the Browser and search read', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const r = setNoteField(d, createEditJournal(), 'n1', 0, '<b>いぬ</b>', normalize);
    expect(r.changed).toBe(true);
    const f = r.draft.notes[0]!.fields[0]!;
    expect(f.raw).toBe('<b>いぬ</b>');
    expect(f.normalized).toBe('いぬ');
    // The other field is untouched, and the original draft object is not mutated.
    expect(r.draft.notes[0]!.fields[1]!.raw).toBe('cat');
    expect(d.notes[0]!.fields[0]!.raw).toBe('ねこ');
  });

  it('refuses to journal a no-op, so undo never restores nothing', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const r = setNoteField(d, createEditJournal(), 'n1', 0, 'ねこ', normalize);
    expect(r.changed).toBe(false);
    expect(r.reason).toBe('unchanged');
    expect(r.journal.done).toHaveLength(0);
  });

  it('names a missing note and a missing field instead of silently doing nothing', () => {
    const d = draftOf([note({ id: 'n1' })]);
    expect(setNoteField(d, createEditJournal(), 'nope', 0, 'x', normalize).reason).toBe('no-such-note');
    expect(setNoteField(d, createEditJournal(), 'n1', 9, 'x', normalize).reason).toBe('no-such-field');
  });

  it('recomputes media and reports both an orphaned and an absent reference', () => {
    const withAudio = note({
      id: 'n1',
      fields: [
        { ord: 0, name: 'Front', raw: 'ねこ[sound:neko.mp3]', normalized: 'ねこ' },
        { ord: 1, name: 'Back', raw: 'cat', normalized: 'cat' },
      ],
      media: [
        { reference: 'neko.mp3', fileName: 'neko.mp3', kind: 'audio', fieldOrd: 0, present: true },
      ],
    });
    const d = draftOf([withAudio]);
    const r = setNoteField(d, createEditJournal(), 'n1', 0, 'ねこ[sound:inu.mp3]', normalize);
    expect(r.mediaDropped).toEqual(['neko.mp3']);
    // The source holds neko.mp3, not inu.mp3 — the new reference has nothing behind it.
    expect(r.mediaMissing).toEqual(['inu.mp3']);
    expect(r.draft.notes[0]!.media.map((m) => m.fileName)).toEqual(['inu.mp3']);
  });

  it('does not call a file dropped when another field still references it', () => {
    const both = note({
      id: 'n1',
      fields: [
        { ord: 0, name: 'Front', raw: '[sound:a.mp3]', normalized: '' },
        { ord: 1, name: 'Back', raw: '[sound:a.mp3]', normalized: '' },
      ],
      media: [
        { reference: 'a.mp3', fileName: 'a.mp3', kind: 'audio', fieldOrd: 0, present: true },
        { reference: 'a.mp3', fileName: 'a.mp3', kind: 'audio', fieldOrd: 1, present: true },
      ],
    });
    const r = setNoteField(draftOf([both]), createEditJournal(), 'n1', 0, 'plain', normalize);
    expect(r.mediaDropped).toEqual([]);
  });

  it('reports the cards a cloze edit would add and remove rather than pretending', () => {
    const cloze = note({
      id: 'n1',
      fields: [
        { ord: 0, name: 'Front', raw: '{{c1::ねこ}} は {{c2::猫}}', normalized: 'ねこ は 猫' },
        { ord: 1, name: 'Back', raw: '', normalized: '' },
      ],
    });
    const r = setNoteField(
      draftOf([cloze], true), createEditJournal(), 'n1', 0,
      '{{c1::ねこ}} は {{c3::猫}}', normalize,
    );
    expect(r.clozeOrdinalsAdded).toEqual([3]);
    expect(r.clozeOrdinalsRemoved).toEqual([2]);
  });

  it('says nothing about cloze numbers on a standard note type', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const r = setNoteField(d, createEditJournal(), 'n1', 0, '{{c1::ねこ}}', normalize);
    expect(r.clozeOrdinalsAdded).toEqual([]);
    expect(r.clozeOrdinalsRemoved).toEqual([]);
  });
});

describe('clozeOrdinals', () => {
  it('collects each distinct number once, in order', () => {
    expect(clozeOrdinals('{{c2::b}} {{c1::a}} {{c2::c}}')).toEqual([1, 2]);
    expect(clozeOrdinals('no cloze here')).toEqual([]);
  });
});

describe('setNoteTags', () => {
  it('keeps the marked flag and the marked tag from disagreeing', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const on = setNoteTags(d, createEditJournal(), 'n1', ['core', 'marked']);
    expect(on.draft.notes[0]!.marked).toBe(true);
    const off = setNoteTags(on.draft, on.journal, 'n1', ['core']);
    expect(off.draft.notes[0]!.marked).toBe(false);
    expect(off.draft.notes[0]!.tags).toEqual(['core']);
  });

  it('treats a re-ordered-into-the-same-list write as a no-op', () => {
    const d = draftOf([note({ id: 'n1', tags: ['a', 'b'] })]);
    expect(setNoteTags(d, createEditJournal(), 'n1', ['a', 'b', 'a']).changed).toBe(false);
  });
});

describe('undo and redo', () => {
  it('restores the previous bytes of a field, then puts them back', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const edit = setNoteField(d, createEditJournal(), 'n1', 0, '<i>いぬ</i>', normalize);
    const undone = undoLastEdit(edit.draft, edit.journal, normalize);
    expect(undone.draft.notes[0]!.fields[0]!.raw).toBe('ねこ');
    expect(undone.draft.notes[0]!.fields[0]!.normalized).toBe('ねこ');
    expect(undone.journal.done).toHaveLength(0);
    expect(undone.journal.undone).toHaveLength(1);

    const redone = redoLastEdit(undone.draft, undone.journal, normalize);
    expect(redone.draft.notes[0]!.fields[0]!.raw).toBe('<i>いぬ</i>');
    expect(redone.draft.notes[0]!.fields[0]!.normalized).toBe('いぬ');
    expect(redone.journal.undone).toHaveLength(0);
  });

  it('undoes a tag edit including the marked flag', () => {
    const d = draftOf([note({ id: 'n1', tags: ['core'] })]);
    const edit = setNoteTags(d, createEditJournal(), 'n1', ['marked']);
    expect(edit.draft.notes[0]!.marked).toBe(true);
    const undone = undoLastEdit(edit.draft, edit.journal, normalize);
    expect(undone.draft.notes[0]!.tags).toEqual(['core']);
    expect(undone.draft.notes[0]!.marked).toBe(false);
  });

  it('drops the redo branch as soon as a new edit forks the history', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const a = setNoteField(d, createEditJournal(), 'n1', 0, 'A', normalize);
    const undone = undoLastEdit(a.draft, a.journal, normalize);
    expect(undone.journal.undone).toHaveLength(1);
    const b = setNoteField(undone.draft, undone.journal, 'n1', 1, 'B', normalize);
    // Redoing "A" now would reapply an op computed against a draft that no
    // longer exists, so the branch is gone rather than dangerously available.
    expect(b.journal.undone).toEqual([]);
    expect(redoLastEdit(b.draft, b.journal, normalize).changed).toBe(false);
  });

  it('is a refusal, not a crash, with nothing to undo or redo', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const j = createEditJournal();
    expect(undoLastEdit(d, j, normalize).changed).toBe(false);
    expect(redoLastEdit(d, j, normalize).changed).toBe(false);
  });
});

describe('journal reporting', () => {
  it('counts each touched note once, in first-touch order', () => {
    const d = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    const a = setNoteField(d, createEditJournal(), 'n2', 0, 'x', normalize);
    const b = setNoteField(a.draft, a.journal, 'n1', 0, 'y', normalize);
    const c = setNoteTags(b.draft, b.journal, 'n2', ['t']);
    expect(editedNoteIds(c.journal)).toEqual(['n2', 'n1']);
    expect(noteIsEdited(c.journal, 'n1')).toBe(true);
    expect(noteIsEdited(c.journal, 'nope')).toBe(false);
  });
});
