// Recipe 1's rendered-template variant: the front/back swap, as a journal op.
//
// The load-bearing tests here are NOT the happy path. They are the ones that
// prove the op reaches a destination, because the defect this slice was written
// to fix is that it did not: `buildApkgExportChanges` folds `journal.done` and
// nothing else, so an op with no branch there is a preview no package can ship.
// Gate 13 shipped exactly that defect once already — 3,180 cards added to a real
// deck, not one of them exportable — and a swap that renders in the panel and
// vanishes on export is the same failure wearing different clothes.
//
// The second cluster is the ord mapping. The ops are written in the DRAFT's ord
// numbering and the change set is in the SOURCE's, and a removal earlier in the
// same session makes those two disagree. A swap exported against the op's own
// number would reformat the template the user KEPT.

import { describe, expect, it } from 'vitest';
import type { AnkiDraft, RawAnkiCollection, RawAnkiNoteTypeRow } from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import { draftTemplateGroups } from '../ankiSiblingAudit';
import { applyTemplateRemoval, templateRemovalOps } from '../ankiTemplateRemoval';
import {
  createEditJournal,
  editedNoteIds,
  noteIsEdited,
  redoLastEdit,
  setNoteField,
  setTemplateFormats,
  undoLastEdit,
  type AnkiDraftEditJournal,
} from '../ankiDraftEdit';
import { buildApkgExportChanges, exportChangesEmpty } from '../ankiApkgExport';
import { auditedNoteCount, summarizeJournal } from '../ankiEditAudit';

type Tpl = RawAnkiNoteTypeRow['templates'][number];

const FIELDS = ['Front', 'Back'];
const NORMALIZE = (v: string) => v.replace(/<[^>]*>/g, '').trim();

const FORWARD: Tpl = { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}{{Back}}' };
const SECOND: Tpl = { ord: 1, name: 'Card 2', qfmt: '{{Back}}', afmt: '{{FrontSide}}{{Front}}' };
const THIRD: Tpl = { ord: 2, name: 'Card 3', qfmt: '{{Front}}{{Back}}', afmt: '{{FrontSide}}' };
/**
 * Same render as FORWARD, spelled differently — a `duplicate` group, and the
 * only kind of template `applyTemplateRemoval` will drop. A unique template is
 * skipped `not-duplicate`, so a removal fixture built from distinct renders
 * silently removes nothing and every assertion after it tests the empty case.
 */
const FORWARD_TWIN: Tpl = {
  ord: 1,
  name: 'Card 1 copy',
  qfmt: '{{ Front }}',
  afmt: '{{FrontSide}}{{ Back }}',
};

/** The swap recipe 1 performs: the two formats exchanged. */
const SWAPPED = { qfmt: '{{Back}}', afmt: '{{FrontSide}}{{Front}}' };

function noteType(templates: Tpl[], over: Partial<RawAnkiNoteTypeRow> = {}): RawAnkiNoteTypeRow {
  return {
    id: '1',
    name: 'Basic',
    fields: FIELDS.map((name, ord) => ({ name, ord })),
    templates,
    ...over,
  };
}

function draftOf(
  types: RawAnkiNoteTypeRow[],
  rows: Array<{ values: string[]; ords: number[] }>,
): AnkiDraft {
  let cardId = 500;
  const raw: RawAnkiCollection = {
    col: { ver: 11, crt: 0, mod: 0 },
    notes: rows.map((row, i) => ({
      id: String(100 + i),
      guid: `g${i}`,
      mid: '1',
      flds: row.values.join(ANKI_FIELD_SEP),
    })),
    cards: rows.flatMap((row, i) =>
      row.ords.map((ord) => ({ id: String(cardId++), nid: String(100 + i), did: '1', ord })),
    ),
    decks: [{ id: '1', name: 'Deck' }],
    noteTypes: types,
    revlog: [],
  };
  return buildAnkiDraft(raw, {
    source: { kind: 'apkg', label: 'test.apkg' },
    normalize: NORMALIZE,
  });
}

const ROWS = [
  { values: ['ねこ', 'cat'], ords: [0, 1] },
  { values: ['いぬ', 'dog'], ords: [0, 1] },
];

function templateAt(draft: AnkiDraft, ord: number): Tpl {
  const found = draft.noteTypes[0].templates.find((t) => t.ord === ord);
  if (!found) throw new Error(`no template at ord ${ord}`);
  return found as Tpl;
}

/** Swap ord 0's two formats, from a clean journal. */
function swapFirst(draft: AnkiDraft, journal: AnkiDraftEditJournal = createEditJournal()) {
  return setTemplateFormats(draft, journal, '1', 0, SWAPPED);
}

describe('setTemplateFormats', () => {
  it('rewrites both formats and leaves every card row and ord alone', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    const result = swapFirst(draft);

    expect(result.changed).toBe(true);
    expect(templateAt(result.draft, 0).qfmt).toBe('{{Back}}');
    expect(templateAt(result.draft, 0).afmt).toBe('{{FrontSide}}{{Front}}');
    // The whole point of not modelling this as a remove-plus-add: nothing is
    // destroyed and nothing is minted, so the schedule survives untouched.
    expect(result.draft.cards).toHaveLength(draft.cards.length);
    expect(result.draft.cards.map((c) => [c.id, c.ord])).toEqual(
      draft.cards.map((c) => [c.id, c.ord]),
    );
    // The template's NAME is not part of this op.
    expect(templateAt(result.draft, 0).name).toBe('Card 1');
    // And the other template is not touched at all.
    expect(templateAt(result.draft, 1)).toEqual(templateAt(draft, 1));
  });

  it('carries the before-image verbatim so the undo restores bytes', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    const { journal } = swapFirst(draft);
    const op = journal.done[0];
    if (op.kind !== 'template-format') throw new Error('expected a template-format op');

    expect(op.before).toEqual({ qfmt: '{{Front}}', afmt: '{{FrontSide}}{{Back}}' });
    expect(op.after).toEqual(SWAPPED);
    expect(op.ord).toBe(0);
    expect(op.noteTypeId).toBe('1');
  });

  it('refuses a question format that references no field', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    // The negative control for the reader's own bar: `decodeTemplateConfig`
    // returns null for a qfmt with no `{{`, so writing one would read back as a
    // template the workbench cannot see — a silent loss, not an edit.
    const result = setTemplateFormats(draft, createEditJournal(), '1', 0, {
      qfmt: 'no field here',
      afmt: '{{Back}}',
    });

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('empty-question-format');
    expect(result.draft).toBe(draft);
    expect(result.journal.done).toHaveLength(0);
  });

  it('refuses a cloze note type, whose front must keep its cloze replacement', () => {
    // `type: 1` is what makes it cloze — the draft reads Anki's own column, not
    // the shape of the qfmt.
    const cloze = noteType([{ ord: 0, name: 'Cloze', qfmt: '{{cloze:Front}}', afmt: '{{cloze:Front}}' }], {
      name: 'Cloze',
      type: 1,
    });
    const draft = draftOf([cloze], [{ values: ['{{c1::ねこ}}', ''], ords: [0] }]);
    const result = setTemplateFormats(draft, createEditJournal(), '1', 0, {
      qfmt: '{{Front}}',
      afmt: '{{cloze:Front}}',
    });

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('cloze-note-type');
  });

  it('refuses an unknown note type and an unknown ord by distinct names', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    expect(setTemplateFormats(draft, createEditJournal(), 'nope', 0, SWAPPED).reason).toBe(
      'no-such-note-type',
    );
    expect(setTemplateFormats(draft, createEditJournal(), '1', 9, SWAPPED).reason).toBe(
      'no-such-template',
    );
  });

  it('records nothing when both formats already hold the new text', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    const once = swapFirst(draft);
    const twice = setTemplateFormats(once.draft, once.journal, '1', 0, SWAPPED);

    expect(twice.changed).toBe(false);
    expect(twice.reason).toBe('unchanged');
    expect(twice.journal.done).toHaveLength(1);
  });
});

describe('undo and redo of a swap', () => {
  it('round-trips both formats and drops nothing else', () => {
    const draft = draftOf([noteType([FORWARD, SECOND, THIRD])], [
      { values: ['ねこ', 'cat'], ords: [0, 1, 2] },
    ]);
    const swapped = swapFirst(draft);

    const undone = undoLastEdit(swapped.draft, swapped.journal, NORMALIZE);
    expect(undone.changed).toBe(true);
    expect(templateAt(undone.draft, 0)).toEqual(templateAt(draft, 0));
    // Every other template is byte-identical too — the control that the undo
    // restored one template rather than re-sorting the set.
    expect(undone.draft.noteTypes[0].templates).toEqual(draft.noteTypes[0].templates);
    expect(undone.draft.cards).toEqual(draft.cards);

    const redone = redoLastEdit(undone.draft, undone.journal, NORMALIZE);
    expect(templateAt(redone.draft, 0).qfmt).toBe('{{Back}}');
    expect(templateAt(redone.draft, 0).afmt).toBe('{{FrontSide}}{{Front}}');
  });

  it('undoes a swap that shares a step with a note edit, without touching the note twice', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    const withNote = setNoteField(draft, createEditJournal(), '100', 0, 'ネコ', NORMALIZE);
    const withSwap = setTemplateFormats(withNote.draft, withNote.journal, '1', 0, SWAPPED);
    expect(withSwap.journal.done).toHaveLength(2);
    // One step, as a batch writes it. Grouping is stamped on the ops rather than
    // taken by the setters, so the journal is rebuilt here the way the batch
    // helpers do it.
    const grouped: AnkiDraftEditJournal = {
      ...withSwap.journal,
      done: withSwap.journal.done.map((op) => ({ ...op, group: 'batch-1' })),
    };

    const undone = undoLastEdit(withSwap.draft, grouped, NORMALIZE);
    // Both halves of the one step come back: the structural pass must not
    // consume the note op, and the positional pass must not read `noteId` off
    // the format op.
    expect(templateAt(undone.draft, 0)).toEqual(templateAt(draft, 0));
    expect(undone.draft.notes[0].fields[0].raw).toBe('ねこ');
    expect(undone.journal.done).toHaveLength(0);
  });
});

describe('the swap reaches a destination', () => {
  it('exports as a templateFormats row — the defect this slice fixes', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    const swapped = swapFirst(draft);
    const changes = buildApkgExportChanges(swapped.draft, swapped.journal);

    expect(changes.templateFormats).toEqual([
      {
        noteTypeId: '1',
        ord: 0,
        qfmt: '{{Back}}',
        afmt: '{{FrontSide}}{{Front}}',
        beforeQfmt: '{{Front}}',
        beforeAfmt: '{{FrontSide}}{{Back}}',
      },
    ]);
    // It creates and destroys nothing, so it must not leak into any other list.
    expect(changes.notes).toHaveLength(0);
    expect(changes.cardMoves).toHaveLength(0);
    expect(changes.templateAdds).toHaveLength(0);
    expect(changes.templateRemovals).toHaveLength(0);
  });

  it('is not "nothing to export" when it is the only edit', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    const swapped = swapFirst(draft);
    const changes = buildApkgExportChanges(swapped.draft, swapped.journal);

    expect(exportChangesEmpty(changes)).toBe(false);
    // The control: the same change set with the row taken out IS empty, so the
    // assertion above is about this field and not about some other one.
    expect(exportChangesEmpty({ ...changes, templateFormats: [] })).toBe(true);
  });

  it('folds two swaps of one template into one row, keeping the SOURCE before-image', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    const first = swapFirst(draft);
    const second = setTemplateFormats(first.draft, first.journal, '1', 0, {
      qfmt: '{{Front}}{{Back}}',
      afmt: '{{FrontSide}}',
    });
    const changes = buildApkgExportChanges(second.draft, second.journal);

    expect(changes.templateFormats).toHaveLength(1);
    const row = changes.templateFormats![0];
    // Last write wins for the text...
    expect(row.qfmt).toBe('{{Front}}{{Back}}');
    // ...and the FIRST before-image survives: the intermediate value was never in
    // the package, so reverting to it would be a write with no cause.
    expect(row.beforeQfmt).toBe('{{Front}}');
    expect(row.beforeAfmt).toBe('{{FrontSide}}{{Back}}');
  });

  it('exports nothing when a swap is swapped back', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    const there = swapFirst(draft);
    const back = setTemplateFormats(there.draft, there.journal, '1', 0, {
      qfmt: '{{Front}}',
      afmt: '{{FrontSide}}{{Back}}',
    });
    const changes = buildApkgExportChanges(back.draft, back.journal);

    expect(changes.templateFormats).toEqual([]);
    expect(exportChangesEmpty(changes)).toBe(true);
  });

  it('maps the ord through an earlier removal, so it reformats the template kept', () => {
    // Source ords [0,1,2]. Removing ord 1 renumbers the survivors to [0,1], so
    // the draft's "ord 1" is the source's ord 2. Exporting the op's own number
    // would reformat source ord 1 — which no longer exists — or worse, the wrong
    // survivor. This is the removal test's mirror and the reason the mapping is
    // shared rather than reimplemented.
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN, THIRD])], [
      { values: ['ねこ', 'cat'], ords: [0, 1, 2] },
    ]);
    const plan = applyTemplateRemoval(draft, draftTemplateGroups(draft), [
      { noteTypeId: '1', removeOrds: [1] },
    ]);
    expect(plan.removals, 'the fixture really removed a template').toHaveLength(1);
    const removalOps = templateRemovalOps(draft, plan, undefined);
    const afterRemoval = plan.draft;
    const journal: AnkiDraftEditJournal = { ...createEditJournal(), done: removalOps };

    // Draft ord 1 is now what the source called ord 2 (THIRD).
    const swapped = setTemplateFormats(afterRemoval, journal, '1', 1, SWAPPED);
    expect(swapped.changed).toBe(true);

    const changes = buildApkgExportChanges(swapped.draft, swapped.journal);
    expect(changes.templateFormats).toHaveLength(1);
    // The SOURCE ord, not the draft's.
    expect(changes.templateFormats![0].ord).toBe(2);
    expect(changes.templateRemovals).toEqual([{ noteTypeId: '1', removedOrds: [1] }]);
  });

  it('drops a swap on a template the same session then removed', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const swapped = setTemplateFormats(draft, createEditJournal(), '1', 1, {
      qfmt: '{{Front}}{{Back}}',
      afmt: '{{FrontSide}}',
    });
    expect(swapped.changed).toBe(true);
    // The removal is planned against the ORIGINAL draft on purpose: the swap it
    // follows is exactly what stops ord 1 rendering like ord 0, so re-grouping
    // the edited draft would skip it `not-duplicate` and the fixture would test
    // nothing. The journal is the real sequence — format, then remove.
    const plan = applyTemplateRemoval(draft, draftTemplateGroups(draft), [
      { noteTypeId: '1', removeOrds: [1] },
    ]);
    expect(plan.removals, 'the fixture really removed a template').toHaveLength(1);
    const journal: AnkiDraftEditJournal = {
      ...swapped.journal,
      done: [...swapped.journal.done, ...templateRemovalOps(draft, plan, undefined)],
    };
    const changes = buildApkgExportChanges(plan.draft, journal);

    // The ord is gone from the destination, so a rewrite would refuse
    // `template-missing` against a template this very export deleted.
    expect(changes.templateFormats).toEqual([]);
    expect(changes.templateRemovals).toEqual([{ noteTypeId: '1', removedOrds: [1] }]);
  });
});

describe('a swap is not a note edit', () => {
  it('counts no note in any of the three counters', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    const swapped = swapFirst(draft);

    // The op has no `noteId`. Before the shared predicate, `undefined` entered
    // these sets and the panel badged a note nothing had written to.
    expect(editedNoteIds(swapped.journal)).toEqual([]);
    expect(auditedNoteCount(swapped.journal)).toBe(0);
    expect(noteIsEdited(swapped.journal, '100')).toBe(false);
  });

  it('still shows up as its own step in the audit, named by note type and ord', () => {
    const draft = draftOf([noteType([FORWARD, SECOND])], ROWS);
    const swapped = swapFirst(draft);
    const entries = summarizeJournal(swapped.journal, swapped.draft);

    expect(entries).toHaveLength(1);
    expect(entries[0].noteCount).toBe(0);
    expect(entries[0].templatesRemoved).toBe(0);
    // Named rather than blank: the id falls back to the note type and its ord.
    expect(entries[0].id).toContain('template-format:1:0');
  });
});
