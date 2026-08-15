// The tray at deck scale — ANKI_DECK_WORKBENCH_PLAN.md gate 9, "filter and
// preview the fixture without freezing".
//
// The tray's preview is recomputed on every render, so its cost is not a
// background job the user can wait out: it is frame time. The first
// implementation was quadratic in two independent places (a linear scan per
// note to find it, and a whole-array rebuild per edit), which is invisible on
// the 3-note fixtures the behaviour tests use and a freeze on a real deck.
//
// The budget below is deliberately loose — this asserts the *shape* of the
// curve, not a machine's speed. A quadratic implementation blows it by more
// than an order of magnitude even on a fast machine; a linear one finishes in
// well under a tenth of it.
import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import { planChangeTray } from '../ankiChangeTray';
import { createEditJournal, undoLastEdit } from '../ankiDraftEdit';
import { stripFieldHtml } from '../apkgParse';

const SIZE = 8000;
const BUDGET_MS = 4000;

function bigDraft(): AnkiDraft {
  const notes: AnkiDraftNote[] = [];
  for (let i = 0; i < SIZE; i += 1) {
    notes.push({
      id: `n${i}`,
      guid: `g${i}`,
      noteTypeId: 'basic',
      tags: ['core'],
      marked: false,
      fields: [
        { ord: 0, name: 'Front', raw: `word ${i}`, normalized: `word ${i}` },
        { ord: 1, name: 'Back', raw: `cat ${i}`, normalized: `cat ${i}` },
      ],
      modifiedAtSec: 0,
      flags: 0,
      data: '',
      cardIds: [],
      media: [],
    });
  }
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      {
        id: 'basic',
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
    counts: { notes: SIZE, cards: 0, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
  };
}

describe(`the tray over ${SIZE} notes`, () => {
  it('plans two actions over the whole deck within a frame budget a user survives', () => {
    const draft = bigDraft();
    const ids = draft.notes.map((n) => n.id);
    const started = performance.now();
    const plan = planChangeTray(draft, createEditJournal(), ids, [
      {
        id: 'a1',
        enabled: true,
        kind: 'find-replace',
        fieldName: 'Back',
        find: 'cat',
        replace: 'ねこ',
        regex: false,
        matchCase: true,
      },
      { id: 'a2', enabled: true, kind: 'add-tags', tags: ['batch'] },
    ]);
    const elapsed = performance.now() - started;

    // Correctness at scale, not just speed: every note changed, once each.
    expect(plan.changedNotes).toBe(SIZE);
    expect(plan.journal.done).toHaveLength(SIZE * 2);
    expect(plan.draft.notes[0]!.fields[1]!.raw).toBe('ねこ 0');
    expect(plan.draft.notes[SIZE - 1]!.tags).toEqual(['core', 'batch']);
    // The input is still untouched — a mutable fast path that leaked would show
    // up here rather than as a mystery later.
    expect(draft.notes[0]!.fields[1]!.raw).toBe('cat 0');
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('takes the whole batch back in one step, within the same budget', () => {
    const draft = bigDraft();
    const plan = planChangeTray(draft, createEditJournal(), draft.notes.map((n) => n.id), [
      { id: 'a', enabled: true, kind: 'add-tags', tags: ['batch'] },
    ]);
    // Undo walks the group op by op, so it is the second place the quadratic
    // rebuild used to hide.
    const started = performance.now();
    const undone = undoLastEdit(plan.draft, plan.journal, stripFieldHtml);
    const elapsed = performance.now() - started;

    expect(undone.journal.done).toHaveLength(0);
    expect(undone.draft.notes.every((n) => n.tags.length === 1)).toBe(true);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
