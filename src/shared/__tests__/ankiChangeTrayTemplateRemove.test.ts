// Recipe 17's remove half as a tray action — the control the destinations have
// been waiting for since 2ea9e8f6.
//
// The action is deliberately selection-independent: a template belongs to a note
// type, not to the notes a user happened to filter to. And the audit that
// justifies it arrives through `opts.templateGroups` rather than on the action,
// because `draftTemplateGroups` renders templates over a sample and this planner
// re-runs on every render.

import { describe, expect, it } from 'vitest';
import type { AnkiDraft, RawAnkiCollection, RawAnkiNoteTypeRow } from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import { draftTemplateGroups } from '../ankiSiblingAudit';
import { templateRemovalOrphans } from '../ankiTemplateRemoval';
import { planChangeTray, type TrayAction, type TrayProblemCode } from '../ankiChangeTray';
import { createEditJournal, undoLastEdit } from '../ankiDraftEdit';
import { buildApkgExportChanges } from '../ankiApkgExport';

type Tpl = RawAnkiNoteTypeRow['templates'][number];

const FIELDS = ['Front', 'Back', 'Notes'];
const NORMALIZE = (v: string) => v.replace(/<[^>]*>/g, '').trim();

function noteType(templates: Tpl[], over: Partial<RawAnkiNoteTypeRow> = {}): RawAnkiNoteTypeRow {
  return { id: '1', name: 'Basic', fields: FIELDS.map((name, ord) => ({ name, ord })), templates, ...over };
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

const FORWARD: Tpl = { ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}{{Back}}' };
const FORWARD_TWIN: Tpl = { ord: 1, name: 'Card 1 copy', qfmt: '{{ Front }}', afmt: '{{FrontSide}}{{ Back }}' };
const FORWARD_TWIN_2: Tpl = { ord: 2, name: 'Card 1 copy 2', qfmt: '{{Front}}', afmt: '{{FrontSide}}{{Back}}' };
/** Same question as FORWARD, a DIFFERENT answer — an `ambiguous` group. */
const FORWARD_OTHER_BACK: Tpl = { ord: 1, name: 'Card 3', qfmt: '{{Front}}', afmt: '{{FrontSide}}{{Notes}}' };

const ROWS = [
  { values: ['ねこ', 'cat', 'a note'], ords: [0, 1] },
  { values: ['いぬ', 'dog', 'another'], ords: [0, 1] },
];
const ROWS_3 = [
  { values: ['ねこ', 'cat', 'a note'], ords: [0, 1, 2] },
  { values: ['いぬ', 'dog', 'another'], ords: [0, 1, 2] },
];

function removeAction(ords: number[], over: Partial<TrayAction> = {}): TrayAction {
  return { id: 'a1', enabled: true, kind: 'remove-template', noteTypeId: '1', ords, ...over } as TrayAction;
}

function codes(problems: readonly { code: TrayProblemCode }[]): TrayProblemCode[] {
  return problems.map((p) => p.code);
}

describe('the remove-template tray action', () => {
  it('drops the template and its cards, and folds BOTH into the returned draft', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const plan = planChangeTray(draft, createEditJournal(), [], [removeAction([1])], {
      templateGroups: draftTemplateGroups(draft),
    });

    expect(plan.blocked).toBe(false);
    // The note types must reach the returned draft: folding only the cards would
    // leave every survivor pointing at a template list that never changed.
    expect(plan.draft.noteTypes[0].templates.map((t) => t.ord)).toEqual([0]);
    expect(plan.draft.cards).toHaveLength(2);
    expect(templateRemovalOrphans(plan.draft)).toBe(0);

    expect(plan.templateRemoval?.removals).toHaveLength(1);
    expect(plan.templateRemoval?.removedCards).toBe(2);
    // The destructive count is a WARNING, not an info row.
    const removed = plan.problems.find((p) => p.code === 'template-removed');
    expect(removed?.severity).toBe('warning');
    expect(removed?.count).toBe(2);
    expect(removed?.detail).toBe('Card 1 copy');

    expect(plan.outcomes[0]).toMatchObject({ kind: 'remove-template', matched: 1, changed: 1, skipped: 0 });
  });

  it('is selection-independent: an empty noteIds list still removes', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    // `noteIds: []` — a template belongs to a note type, not to a filtered page.
    const plan = planChangeTray(draft, createEditJournal(), [], [removeAction([1])], {
      templateGroups: draftTemplateGroups(draft),
    });
    expect(plan.blocked).toBe(false);
    expect(plan.templateRemoval?.removals).toHaveLength(1);
  });

  it('journals the removal, and undo puts the whole thing back', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN, FORWARD_TWIN_2])], ROWS_3);
    const plan = planChangeTray(draft, createEditJournal(), [], [removeAction([1])], {
      templateGroups: draftTemplateGroups(draft),
    });

    expect(plan.journal.done.filter((op) => op.kind === 'template-remove')).toHaveLength(1);
    // The export set the tray's own journal produces.
    expect(buildApkgExportChanges(plan.draft, plan.journal).templateRemovals).toEqual([
      { noteTypeId: '1', removedOrds: [1] },
    ]);

    const undone = undoLastEdit(plan.draft, plan.journal, NORMALIZE);
    expect(undone.draft.noteTypes[0].templates).toEqual(draft.noteTypes[0].templates);
    expect(undone.draft.cards.map((c) => c.id)).toEqual(draft.cards.map((c) => c.id));
    expect(undone.draft.cards.map((c) => c.ord)).toEqual(draft.cards.map((c) => c.ord));
  });

  it('BLOCKS with no audit rather than refusing every ord as not-duplicate', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    // No `templateGroups`. Without the block this would come back
    // `not-duplicate`, which reads as "this deck has no duplicates" — the exact
    // opposite of what an audit that has not run means.
    const plan = planChangeTray(draft, createEditJournal(), [], [removeAction([1])]);

    expect(plan.blocked).toBe(true);
    expect(codes(plan.problems)).toEqual(['template-no-audit']);
    // A blocked plan returns the INPUT draft, untouched.
    expect(plan.draft).toBe(draft);
    expect(plan.draft.noteTypes[0].templates).toHaveLength(2);
  });

  it('BLOCKS an action with no ord chosen', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const plan = planChangeTray(draft, createEditJournal(), [], [removeAction([])], {
      templateGroups: draftTemplateGroups(draft),
    });
    expect(plan.blocked).toBe(true);
    expect(codes(plan.problems)).toEqual(['empty-parameter']);
  });

  it('refuses an ambiguous group BY NAME, and changes nothing', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_OTHER_BACK])], ROWS);
    const groups = draftTemplateGroups(draft);
    expect(groups.map((g) => g.verdict)).toEqual(['ambiguous']);

    const plan = planChangeTray(draft, createEditJournal(), [], [removeAction([1])], {
      templateGroups: groups,
    });
    expect(plan.blocked).toBe(false);
    expect(codes(plan.problems)).toEqual(['template-not-duplicate']);
    expect(plan.templateRemoval?.removals).toEqual([]);
    // NEGATIVE CONTROL for the whole action: a refused removal must leave the
    // draft object identical, not merely equal.
    expect(plan.draft).toBe(draft);
    expect(plan.journal.done).toEqual([]);
  });

  it('tells the keeper apart from a template no group covers', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const groups = draftTemplateGroups(draft);
    // Ord 0 is the keeper of the duplicate group — a different fix than
    // "no group covers this", so a different code.
    const keeper = planChangeTray(draft, createEditJournal(), [], [removeAction([0])], {
      templateGroups: groups,
    });
    expect(codes(keeper.problems)).toEqual(['template-is-keeper']);

    // An ord that exists in no group at all.
    const missing = planChangeTray(draft, createEditJournal(), [], [removeAction([7])], {
      templateGroups: groups,
    });
    expect(codes(missing.problems)).toEqual(['template-missing']);
  });

  it('refuses a cloze note type by name', () => {
    // `type: 1` is what makes a note type cloze, not its name.
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN], { name: 'Cloze', type: 1 })], ROWS);
    const plan = planChangeTray(draft, createEditJournal(), [], [removeAction([1])], {
      templateGroups: draftTemplateGroups(draft),
    });
    expect(codes(plan.problems)).toEqual(['template-cloze']);
    expect(plan.templateRemoval?.removals).toEqual([]);
  });

  it('reports a partial answer as both a removal and a refusal', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN, FORWARD_TWIN_2])], ROWS_3);
    // Ords 1 and 2 are removable; ord 7 does not exist. A partial answer, not a
    // mis-set form, so nothing blocks.
    const plan = planChangeTray(draft, createEditJournal(), [], [removeAction([1, 2, 7])], {
      templateGroups: draftTemplateGroups(draft),
    });

    expect(plan.blocked).toBe(false);
    expect(plan.templateRemoval?.removals).toHaveLength(2);
    expect(codes(plan.problems).sort()).toEqual(['template-missing', 'template-removed']);
    expect(plan.outcomes[0]).toMatchObject({ matched: 3, changed: 2, skipped: 1 });
    // Both removals renumbered TOGETHER — survivor 0 stays 0 and nothing orphans.
    expect(plan.draft.noteTypes[0].templates.map((t) => t.ord)).toEqual([0]);
    expect(templateRemovalOrphans(plan.draft)).toBe(0);
    // 4 of the 6 cards are gone: two templates × two notes.
    expect(plan.draft.cards).toHaveLength(2);
  });

  it('refuses to empty a note type: asking for EVERY template removes none', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN, FORWARD_TWIN_2])], ROWS_3);
    // The `last-template` refusal is counted per note type, not per request, so
    // three ords that between them leave nothing standing are all refused —
    // including the two that would each be removable on their own.
    const plan = planChangeTray(draft, createEditJournal(), [], [removeAction([0, 1, 2])], {
      templateGroups: draftTemplateGroups(draft),
    });

    expect(plan.blocked).toBe(false);
    expect(plan.templateRemoval?.removals).toEqual([]);
    expect(codes(plan.problems)).toEqual([
      'template-last',
      'template-last',
      'template-last',
    ]);
    expect(plan.draft).toBe(draft);
  });

  it('rewrites the card array in place, so a later action addresses the right rows', () => {
    const draft = draftOf([noteType([FORWARD, FORWARD_TWIN, FORWARD_TWIN_2])], ROWS_3);
    // Two removals as two SEPARATE actions in one tray. The second reads the
    // card table the first rewrote; if the working array had been replaced
    // rather than rewritten, or the plan re-read `draft`, this would remove
    // against stale rows.
    const plan = planChangeTray(
      draft,
      createEditJournal(),
      [],
      [removeAction([1]), removeAction([1], { id: 'a2' })],
      { templateGroups: draftTemplateGroups(draft) },
    );

    // 6 cards → 4 after the first removal → 2 after the second.
    expect(plan.draft.cards).toHaveLength(2);
    expect(plan.draft.noteTypes[0].templates.map((t) => t.ord)).toEqual([0]);
    expect(templateRemovalOrphans(plan.draft)).toBe(0);
    // And the export maps the second one back to SOURCE ord 2, not ord 1.
    expect(buildApkgExportChanges(plan.draft, plan.journal).templateRemovals).toEqual([
      { noteTypeId: '1', removedOrds: [1, 2] },
    ]);
  });
});
