// The dry run at deck scale — ANKI_DECK_WORKBENCH_PLAN.md gate 7's dry-run
// quarter, which CLOSED on the argument that there is nothing to interrupt.
//
// That closure is a claim about a number: step 6 recomputes the whole net of
// the session on every edit and undo, and it is worth interrupting only if it
// is slow enough for a user to reach a stop button. Measured over the largest
// fixture the plan declares (gate 9's 100,000 notes, here with three ops per
// note) it is well under a second — so the honest answer was a measurement, not
// a control with nothing to stop.
//
// Which is exactly why this test exists. Nothing else guards the number that
// closure rests on: `ankiChangeTrayScale.test.ts` covers the tray's plan, not
// the review, and a review that went quadratic would make gate 7's reasoning
// silently false while every behaviour test stayed green.
//
// The budget is deliberately loose — this asserts the SHAPE of the curve, not a
// machine's speed. Linear finishes in a small fraction of it; quadratic over
// 300,000 journal ops blows it by orders of magnitude.
import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import { planChangeTray } from '../ankiChangeTray';
import { createEditJournal } from '../ankiDraftEdit';
import { REVIEW_DIFF_LIMIT, buildWorkbenchReview } from '../ankiWorkbenchReview';

const SIZE = 100000;
const BUDGET_MS = 6000;

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

describe(`the dry run over ${SIZE} notes`, () => {
  it('folds a whole session into step 6 within a budget no stop button could beat', () => {
    const draft = bigDraft();
    const ids = draft.notes.map((n) => n.id);
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
      {
        id: 'a3',
        enabled: true,
        kind: 'find-replace',
        fieldName: 'Front',
        find: 'word',
        replace: '語',
        regex: false,
        matchCase: true,
      },
    ]);
    // Three ops per note, so the review folds 300,000 of them into one summary.
    expect(plan.journal.done).toHaveLength(SIZE * 3);

    const started = performance.now();
    const summary = buildWorkbenchReview(plan.draft, plan.journal);
    const elapsed = performance.now() - started;

    // Correctness at scale, not just speed: the net is every note, once, and
    // the diff list is capped rather than rendering 100,000 rows.
    expect(summary.changedNotes).toBe(SIZE);
    expect(summary.diffs).toHaveLength(REVIEW_DIFF_LIMIT);
    // The cap is on the rendered lines only — the count stays complete, which is
    // what lets step 6 say "showing 50 of N" instead of quietly losing the rest.
    // Three per note, not two: the tag change is a net value change of its own.
    expect(summary.totalDiffs).toBe(SIZE * 3);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  }, 120000);
});
