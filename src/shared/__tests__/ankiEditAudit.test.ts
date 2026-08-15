import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import {
  createEditJournal,
  countJournalSteps,
  setNoteField,
  setNoteTags,
  undoLastEdit,
  type AnkiDraftEditJournal,
} from '../ankiDraftEdit';
import { planChangeTray } from '../ankiChangeTray';
import { appliedStepCount, auditedNoteCount, summarizeJournal } from '../ankiEditAudit';

function note(id: string): AnkiDraftNote {
  return {
    id, guid: `g-${id}`, noteTypeId: 'nt1', tags: [], marked: false,
    fields: [
      { ord: 0, name: 'Expression', raw: `${id}-e`, normalized: `${id}-e` },
      { ord: 1, name: 'Meaning', raw: `${id}-m`, normalized: `${id}-m` },
    ],
    modifiedAtSec: 0, flags: 0, data: '', cardIds: [], media: [],
  };
}

const draft: AnkiDraft = {
  version: 1,
  source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp', plainText: true },
  decks: [],
  noteTypes: [
    {
      id: 'nt1', name: 'Basic', kind: 'standard', css: '',
      fields: [
        { ord: 0, name: 'Expression', sticky: false, rtl: false },
        { ord: 1, name: 'Meaning', sticky: false, rtl: false },
      ],
      templates: [], sortFieldOrd: 0, latexPre: '', latexPost: '',
    },
  ] as AnkiDraft['noteTypes'],
  notes: [note('n1'), note('n2'), note('n3')],
  cards: [],
  diagnostics: [],
  counts: { notes: 3, cards: 0, decks: 0, noteTypes: 1, reviews: 0, mediaReferences: 0 },
};

const normalize = (raw: string) => raw.trim();

/** A real change-tray run over three notes, which is what a batch actually is. */
function batch(journal: AnkiDraftEditJournal, d: AnkiDraft, group: string) {
  const plan = planChangeTray(
    d,
    journal,
    ['n1', 'n2', 'n3'],
    [{ id: 'a1', enabled: true, kind: 'find-replace', fieldName: 'Meaning', find: '-m', replace: '-batched', regex: false, matchCase: true }],
    { groupId: group },
  );
  if (plan.blocked) throw new Error(`tray blocked: ${JSON.stringify(plan.problems)}`);
  return { draft: plan.draft, journal: plan.journal };
}

describe('an entry is exactly what one Undo takes back', () => {
  it('collapses a batch into one entry, not one per note', () => {
    const run = batch(createEditJournal(), draft, 'tray-1');
    const entries = summarizeJournal(run.journal, run.draft);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      index: 1, batch: true, noteCount: 3, opCount: 3, fieldNames: ['Meaning'], tagsChanged: false, undone: false,
    });
    // The list and the Undo button agree about what a step is.
    expect(entries.length).toBe(countJournalSteps(run.journal.done));
  });

  it('keeps a single hand edit as its own entry', () => {
    const first = setNoteField(draft, createEditJournal(), 'n1', 0, 'edited', normalize);
    const second = setNoteTags(first.draft, first.journal, 'n2', ['jlpt']);
    const entries = summarizeJournal(second.journal, second.draft);
    expect(entries.map((e) => [e.index, e.batch, e.noteCount, e.fieldNames.join(), e.tagsChanged])).toEqual([
      [1, false, 1, 'Expression', false],
      [2, false, 1, '', true],
    ]);
  });

  it('names fields, never ords', () => {
    const out = setNoteField(draft, createEditJournal(), 'n1', 1, 'x', normalize);
    expect(summarizeJournal(out.journal, out.draft)[0]?.fieldNames).toEqual(['Meaning']);
  });
});

describe('an undone step is recorded, not erased', () => {
  it('stays listed after the batch is taken back', () => {
    const run = batch(createEditJournal(), draft, 'tray-1');
    const single = setNoteField(run.draft, run.journal, 'n1', 0, 'later', normalize);
    const back = undoLastEdit(single.draft, single.journal, normalize);

    const entries = summarizeJournal(back.journal, back.draft);
    expect(entries.map((e) => [e.index, e.batch, e.undone])).toEqual([
      [1, true, false],
      [2, false, true],
    ]);
    expect(appliedStepCount(entries)).toBe(1);
  });

  it('reports undone steps oldest-first, the same order they happened', () => {
    const current = batch(createEditJournal(), draft, 'tray-1');
    const b = setNoteField(current.draft, current.journal, 'n2', 0, 'second', normalize);
    const c = setNoteTags(b.draft, b.journal, 'n3', ['third']);
    let back = undoLastEdit(c.draft, c.journal, normalize);
    back = undoLastEdit(back.draft, back.journal, normalize);

    const entries = summarizeJournal(back.journal, back.draft);
    // tray-1 applied; then the field edit, then the tag edit, both taken back —
    // and the tag edit is still the newer of the two even though it was undone
    // first.
    expect(entries.map((e) => [e.index, e.undone, e.tagsChanged])).toEqual([
      [1, false, false],
      [2, true, false],
      [3, true, true],
    ]);
  });

  it('a batch survives the round trip as one entry, ops intact', () => {
    const run = batch(createEditJournal(), draft, 'tray-1');
    const back = undoLastEdit(run.draft, run.journal, normalize);
    const entries = summarizeJournal(back.journal, back.draft);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ batch: true, opCount: 3, noteCount: 3, undone: true });
    expect(entries[0]?.fieldNames).toEqual(['Meaning']);
  });
});

describe('counts', () => {
  it('counts a twice-edited note once', () => {
    const a = setNoteField(draft, createEditJournal(), 'n1', 0, 'one', normalize);
    const b = setNoteField(a.draft, a.journal, 'n1', 1, 'two', normalize);
    expect(auditedNoteCount(b.journal)).toBe(1);
    expect(summarizeJournal(b.journal, b.draft)).toHaveLength(2);
  });

  it('an empty journal has nothing to show', () => {
    expect(summarizeJournal(createEditJournal(), draft)).toEqual([]);
    expect(auditedNoteCount(createEditJournal())).toBe(0);
  });
});
