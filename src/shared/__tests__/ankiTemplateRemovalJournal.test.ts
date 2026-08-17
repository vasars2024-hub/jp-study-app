// Recipe 17's remove half, made reversible: the `template-remove` journal op.
//
// The journal's rule is that every op is a complete inverse — `card-due` is
// deliberately the narrowest card op because a queue change would have to
// reconstruct state the draft never held. A template removal is the opposite
// case: it is the most destructive thing the workbench does, but the draft *does*
// hold everything it destroys at the moment it runs, so the op can carry it.
//
// These tests exist to prove that carrying it is enough. The load-bearing ones
// are the round trip (undo restores rows, ords AND positions) and the two-step
// fold, where the second removal names an ord the first one renumbered.

import { describe, expect, it } from 'vitest';
import type { AnkiDraft, RawAnkiCollection, RawAnkiNoteTypeRow } from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import { draftTemplateGroups } from '../ankiSiblingAudit';
import {
  applyTemplateRemoval,
  templateRemovalOps,
  templateRemovalOrphans,
} from '../ankiTemplateRemoval';
import {
  createEditJournal,
  editedNoteIds,
  noteIsEdited,
  redoLastEdit,
  undoLastEdit,
  type AnkiDraftEditJournal,
  type AnkiDraftEditOp,
} from '../ankiDraftEdit';
import { buildApkgExportChanges, exportChangesEmpty } from '../ankiApkgExport';
import { buildWorkbenchReview } from '../ankiWorkbenchReview';
import { summarizeJournal, auditedNoteCount } from '../ankiEditAudit';

type Tpl = RawAnkiNoteTypeRow['templates'][number];

const FIELDS = ['Front', 'Back', 'Notes'];

function noteType(templates: Tpl[], over: Partial<RawAnkiNoteTypeRow> = {}): RawAnkiNoteTypeRow {
  return { id: '1', name: 'Basic', fields: FIELDS.map((name, ord) => ({ name, ord })), templates, ...over };
}

function draftOf(
  types: RawAnkiNoteTypeRow[],
  rows: Array<{ mid?: string; values: string[]; ords: number[] }>,
): AnkiDraft {
  let cardId = 500;
  const raw: RawAnkiCollection = {
    col: { ver: 11, crt: 0, mod: 0 },
    notes: rows.map((row, i) => ({
      id: String(100 + i),
      guid: `g${i}`,
      mid: row.mid ?? '1',
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
    normalize: (v) => v.replace(/<[^>]*>/g, '').trim(),
  });
}

const FORWARD: Tpl = { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}{{Back}}' };
/** Same render as FORWARD, spelled differently — a `duplicate` group. */
const FORWARD_TWIN: Tpl = { ord: 1, name: 'Card 1 copy', qfmt: '{{ Front }}', afmt: '{{FrontSide}}{{ Back }}' };
/** A third template rendering FORWARD again, so one group can hold three ords. */
const FORWARD_TWIN_2: Tpl = { ord: 2, name: 'Card 1 copy 2', qfmt: '{{Front}}', afmt: '{{FrontSide}}{{Back}}' };

const ROWS = [
  { values: ['ねこ', 'cat', 'a note'], ords: [0, 1] },
  { values: ['いぬ', 'dog', 'another'], ords: [0, 1] },
];
const ROWS_3 = [
  { values: ['ねこ', 'cat', 'a note'], ords: [0, 1, 2] },
  { values: ['いぬ', 'dog', 'another'], ords: [0, 1, 2] },
];

const NORMALIZE = (v: string) => v.replace(/<[^>]*>/g, '').trim();

/** Run a removal and return the after-draft plus the ops that reverse it. */
function remove(draft: AnkiDraft, removeOrds: number[], group?: string) {
  const plan = applyTemplateRemoval(draft, draftTemplateGroups(draft), [
    { noteTypeId: '1', removeOrds },
  ]);
  return { plan, ops: templateRemovalOps(draft, plan, group) };
}

function journalOf(ops: AnkiDraftEditOp[]): AnkiDraftEditJournal {
  return { ...createEditJournal(), done: ops };
}

/** A card as the round trip must restore it: identity, binding and scheduling. */
function cardShape(draft: AnkiDraft) {
  return draft.cards.map((c) => ({
    id: c.id,
    noteId: c.noteId,
    ord: c.ord,
    due: c.due,
    interval: c.interval,
    reps: c.reps,
    lapses: c.lapses,
  }));
}

describe('templateRemovalOps', () => {
  it('carries the template, every deleted card row and its source position', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const { plan, ops } = remove(draft, [1]);

    expect(plan.removals).toHaveLength(1);
    expect(ops).toHaveLength(1);
    const op = ops[0];
    if (op.kind !== 'template-remove') throw new Error('expected a template-remove op');

    expect(op.noteTypeId).toBe('1');
    expect(op.template.ord).toBe(1);
    expect(op.template.name).toBe('Card 1 copy');
    // Two notes × the one removed template.
    expect(op.cards).toHaveLength(2);
    expect(op.cardIndexes).toHaveLength(2);
    // The rows really came out of the SOURCE draft, at the positions it held them.
    for (const [i, index] of op.cardIndexes.entries()) {
      expect(draft.cards[index].id).toBe(op.cards[i].id);
      expect(draft.cards[index].ord).toBe(1);
    }
    // Removing the last ord moves nobody.
    expect(op.renumbered).toEqual([]);
  });

  it('records the survivor moves a mid-list removal causes', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN, FORWARD_TWIN_2])], ROWS_3);
    const { ops } = remove(draft, [1]);
    const op = ops[0];
    if (op.kind !== 'template-remove') throw new Error('expected a template-remove op');
    // [0,1,2] minus 1 → survivor 2 becomes 1; survivor 0 does not move.
    expect(op.renumbered).toEqual([{ from: 2, to: 1 }]);
  });
});

describe('undo/redo of a template removal', () => {
  it('restores the templates, the card rows, their ords and their positions', () => {
    const before = draftOf([noteType([FORWARD, FORWARD_TWIN, FORWARD_TWIN_2])], ROWS_3);
    const { plan, ops } = remove(before, [1]);
    const after = plan.draft;

    // The removal did what it says, and left no orphan behind.
    expect(after.noteTypes[0].templates.map((t) => t.ord)).toEqual([0, 1]);
    expect(after.cards).toHaveLength(4);
    expect(templateRemovalOrphans(after)).toBe(0);

    const undone = undoLastEdit(after, journalOf(ops), NORMALIZE);
    expect(undone.changed).toBe(true);
    // Byte-for-byte on every field an undo has to bring back, INCLUDING the
    // array order: a set-equal restore would still have shuffled the Browser.
    expect(cardShape(undone.draft)).toEqual(cardShape(before));
    expect(undone.draft.noteTypes[0].templates).toEqual(before.noteTypes[0].templates);
    expect(templateRemovalOrphans(undone.draft)).toBe(0);

    // And redo lands exactly back on the removal's own after-draft.
    const redone = redoLastEdit(undone.draft, undone.journal, NORMALIZE);
    expect(cardShape(redone.draft)).toEqual(cardShape(after));
    expect(redone.draft.noteTypes[0].templates).toEqual(after.noteTypes[0].templates);
    expect(templateRemovalOrphans(redone.draft)).toBe(0);
  });

  it('NEGATIVE CONTROL: dropping cardIndexes from the op breaks position, not membership', () => {
    const before = draftOf([noteType([FORWARD, FORWARD_TWIN, FORWARD_TWIN_2])], ROWS_3);
    const { plan, ops } = remove(before, [1]);
    const op = ops[0];
    if (op.kind !== 'template-remove') throw new Error('expected a template-remove op');

    // Exactly the shortcut this op's `cardIndexes` field exists to refuse:
    // put the rows back at the end instead of where they came from.
    const appending: AnkiDraftEditOp = { ...op, cardIndexes: op.cards.map(() => 999) };
    const undone = undoLastEdit(plan.draft, journalOf([appending]), NORMALIZE);

    // The rows all come back — which is why a membership assertion passes
    // against the broken version and proves nothing.
    expect(new Set(undone.draft.cards.map((c) => c.id))).toEqual(
      new Set(before.cards.map((c) => c.id)),
    );
    // The order does not, and that is what the real test asserts.
    expect(undone.draft.cards.map((c) => c.id)).not.toEqual(before.cards.map((c) => c.id));
  });

  it('NEGATIVE CONTROL: an op with no renumbering collides two templates on one ord', () => {
    const before = draftOf([noteType([FORWARD, FORWARD_TWIN, FORWARD_TWIN_2])], ROWS_3);
    const { plan, ops } = remove(before, [1]);
    const op = ops[0];
    if (op.kind !== 'template-remove') throw new Error('expected a template-remove op');

    const unrenumbered: AnkiDraftEditOp = { ...op, renumbered: [] };
    const undone = undoLastEdit(plan.draft, journalOf([unrenumbered]), NORMALIZE);

    // Survivor ord 2 was moved to 1 by the removal and never moved back, so the
    // restored template lands on top of it: ords [0,1,1] instead of [0,1,2].
    const ords = undone.draft.noteTypes[0].templates.map((t) => t.ord);
    expect(ords).toEqual([0, 1, 1]);
    expect(ords).not.toEqual(before.noteTypes[0].templates.map((t) => t.ord));

    // Worth stating because it is the trap: `templateRemovalOrphans` — the
    // control the removal itself uses — reads **0** here. Every card's ord still
    // names *a* template, just the wrong one. A collision is not an orphan, so
    // the round-trip test asserts the template list itself, not this number.
    expect(templateRemovalOrphans(undone.draft)).toBe(0);
  });

  it('is undone as one step together with the field edits sharing its group', () => {
    const before = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const { plan, ops } = remove(before, [1], 'tray-1');
    const step: AnkiDraftEditOp[] = [
      { kind: 'tags', noteId: '100', before: [], after: ['seen'], group: 'tray-1' },
      ...ops,
    ];
    const after = { ...plan.draft, notes: plan.draft.notes.map((n) => (n.id === '100' ? { ...n, tags: ['seen'] } : n)) };

    const undone = undoLastEdit(after, journalOf(step), NORMALIZE);
    expect(undone.journal.done).toEqual([]);
    expect(undone.draft.notes.find((n) => n.id === '100')?.tags).toEqual([]);
    expect(cardShape(undone.draft)).toEqual(cardShape(before));
  });
});

describe('note attribution', () => {
  it('belongs to no note, so it badges none of them as edited', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const { ops } = remove(draft, [1]);
    const journal = journalOf(ops);

    // A removal spans every note of the note type; attributing it to one would
    // be false about the rest, and badging all of them would be worse.
    expect(editedNoteIds(journal)).toEqual([]);
    expect(noteIsEdited(journal, '100')).toBe(false);
    expect(auditedNoteCount(journal)).toBe(0);

    // But the journal list still shows it, rather than an empty row.
    const entries = summarizeJournal(journal, draft);
    expect(entries).toHaveLength(1);
    expect(entries[0].templatesRemoved).toBe(1);
    expect(entries[0].noteCount).toBe(0);
  });
});

describe('the export change set', () => {
  it('exports the removal, and reports the set as non-empty', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const { plan, ops } = remove(draft, [1]);
    const changes = buildApkgExportChanges(plan.draft, journalOf(ops));

    expect(changes.templateRemovals).toEqual([{ noteTypeId: '1', removedOrds: [1] }]);
    expect(exportChangesEmpty(changes)).toBe(false);
    // A removal touches no note's bytes and moves no card between decks.
    expect(changes.notes).toEqual([]);
    expect(changes.cardMoves).toEqual([]);
  });

  it('maps a SECOND removal back to the ord the first one renumbered', () => {
    const first = draftOf([noteType([FORWARD, FORWARD_TWIN, FORWARD_TWIN_2])], ROWS_3);
    const step1 = remove(first, [1]);
    // Survivors are now [0,1] where 1 IS source ord 2. Removing "ord 1" again
    // must export source ord 2 — exporting 1 would delete the template the user
    // deliberately kept.
    const step2 = remove(step1.plan.draft, [1]);
    expect(step2.plan.removals).toHaveLength(1);

    const changes = buildApkgExportChanges(step2.plan.draft, journalOf([...step1.ops, ...step2.ops]));
    expect(changes.templateRemovals).toEqual([{ noteTypeId: '1', removedOrds: [1, 2] }]);
  });

  it('exports nothing once the removal is undone', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const { plan, ops } = remove(draft, [1]);
    const undone = undoLastEdit(plan.draft, journalOf(ops), NORMALIZE);

    const changes = buildApkgExportChanges(undone.draft, undone.journal);
    expect(changes.templateRemovals).toEqual([]);
    expect(exportChangesEmpty(changes)).toBe(true);
  });
});

describe('the workbench review', () => {
  it('names the removal and the cards it destroys, as its own counts', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const { plan, ops } = remove(draft, [1]);
    const review = buildWorkbenchReview(plan.draft, journalOf(ops));

    expect(review.templatesRemoved).toBe(1);
    expect(review.cardsDeleted).toBe(2);
    // Not folded into any note-shaped count: step 6 would otherwise show the
    // workbench's one destructive change as an empty review.
    expect(review.changedNotes).toBe(0);
    expect(review.deckRenames).toBe(0);
    expect(review.appliedSteps).toBe(1);
  });
});
