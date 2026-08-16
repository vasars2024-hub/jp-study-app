// Rescuing leeches — ANKI_DECK_WORKBENCH_PLAN.md Phase 4, recipe 10.
//
// Two negative controls carry this file, and both are the recipe's promises
// rather than edge cases:
//
//  1. **A hand-written hint survives.** A leech is exactly the note a user has
//     already annotated. An occupied hint field must come out byte-identical
//     and be reported, never overwritten by a machine prefix.
//  2. **A reschedule-only run blocks.** The workbench cannot write a scheduling
//     preset, so a run that asked for nothing else must disable Apply rather
//     than succeed having changed nothing — which would read as it having
//     worked.
import { describe, expect, it } from 'vitest';
import {
  ANKI_LEECH_TAG,
  DEFAULT_LEECH_HINT_REVEAL,
  DEFAULT_LEECH_THRESHOLD,
  leechHintText,
  planLeechRescue,
  type LeechRescueMeasure,
  type LeechRescueRefusal,
} from '../ankiLeechRescue';
import {
  LEECH_RESCUE_PROBLEM_CODES,
  planChangeTray,
  type TrayAction,
} from '../ankiChangeTray';
import { collapsePlainText, createEditJournal, undoLastEdit } from '../ankiDraftEdit';
import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote } from '../ankiDraft';

function noteOf(
  id: string,
  expression: string,
  over: Partial<AnkiDraftNote> = {},
  hint = '',
): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Expression', raw: expression, normalized: expression },
      { ord: 1, name: 'Meaning', raw: 'to eat', normalized: 'to eat' },
      { ord: 2, name: 'Hint', raw: hint, normalized: hint },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
    ...over,
  };
}

function cardOf(id: string, noteId: string, lapses: number, suspended = false): AnkiDraftCard {
  return {
    id,
    noteId,
    deckId: 'd1',
    ord: 0,
    type: 'review',
    queue: suspended ? 'suspended' : 'review',
    due: 40,
    interval: 21,
    easeFactor: 1_800,
    reps: 30,
    lapses,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
  };
}

const noteTypes: AnkiDraft['noteTypes'] = [
  {
    id: 'nt1',
    name: 'Vocab',
    kind: 'standard',
    css: '',
    fields: [
      { ord: 0, name: 'Expression', sticky: false, rtl: false },
      { ord: 1, name: 'Meaning', sticky: false, rtl: false },
      { ord: 2, name: 'Hint', sticky: false, rtl: false },
    ],
    templates: [],
    sortFieldOrd: 0,
  },
];

function draftOf(notes: AnkiDraftNote[], cards: AnkiDraftCard[]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp', plainText: true },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes,
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

// 躊躇う 11 lapses and suspended — a leech by every measure. 憂鬱 3 lapses but
// Anki already tagged it, so only `includeTagged` reaches it. 猫 1 lapse: not a
// leech and must be left alone. 蟠り 9 lapses with a hand-written hint that must
// survive. 戸 9 lapses whose Meaning is one character, so a 1-character reveal
// would be the whole answer.
const notes = [
  noteOf('n-tame', '躊躇う'),
  noteOf('n-yuu', '憂鬱', { tags: [ANKI_LEECH_TAG] }),
  noteOf('n-neko', '猫'),
  noteOf('n-wada', '蟠り', {}, 'mine, do not touch'),
  noteOf('n-to', '戸', {
    fields: [
      { ord: 0, name: 'Expression', raw: '戸', normalized: '戸' },
      { ord: 1, name: 'Meaning', raw: 'd', normalized: 'd' },
      { ord: 2, name: 'Hint', raw: '', normalized: '' },
    ],
  }),
];
const cards = [
  cardOf('c-tame', 'n-tame', 11, true),
  cardOf('c-yuu', 'n-yuu', 3),
  cardOf('c-neko', 'n-neko', 1),
  cardOf('c-wada', 'n-wada', 9),
  cardOf('c-to', 'n-to', 9),
];
const draft = draftOf(notes, cards);
const allIds = notes.map((n) => n.id);

const baseInput = {
  notes,
  cards,
  noteTypes,
  includeTagged: true,
  rescueTag: 'rescue::pending',
  hintFromField: 'Meaning',
  hintToField: 'Hint',
};

const rescueAction = (
  over: Partial<Extract<TrayAction, { kind: 'rescue-leeches' }>> = {},
): TrayAction => ({
  id: 'a1',
  enabled: true,
  kind: 'rescue-leeches',
  threshold: DEFAULT_LEECH_THRESHOLD,
  includeTagged: true,
  measures: ['tag', 'hint'],
  rescueTag: 'rescue::pending',
  hintFromField: 'Meaning',
  hintToField: 'Hint',
  ...over,
});

const refusalsFor = (skips: ReadonlyArray<{ noteId: string; refusal: LeechRescueRefusal }>) =>
  new Map(skips.map((s) => [`${s.noteId}:${s.refusal}`, true]));

const labelOf = (
  skips: ReadonlyArray<{ noteId: string; label: string }>,
  noteId: string,
): string | undefined => skips.find((s) => s.noteId === noteId)?.label;

describe('leechHintText', () => {
  it('reveals the leading characters and withholds the rest', () => {
    expect(leechHintText('to eat', 1)).toBe('t…');
    expect(leechHintText('to eat', 3)).toBe('to …');
  });

  it('refuses when the source is no longer than the reveal', () => {
    expect(leechHintText('to', 2)).toBeNull();
    expect(leechHintText('t', 1)).toBeNull();
    expect(leechHintText('', 1)).toBeNull();
  });

  it('counts by code point, so a surrogate pair is never split', () => {
    // 𠮟 (U+20B9F) is a pair; slicing by UTF-16 unit would write a lone half.
    expect(leechHintText('𠮟る', 1)).toBe('𠮟…');
  });
});

describe('planLeechRescue', () => {
  it('finds leeches by lapse count and by Anki’s own tag', () => {
    const plan = planLeechRescue({ ...baseInput, measures: ['tag'], threshold: 8 });
    expect(plan.leechNotes).toBe(4);
    expect(plan.taggedOnlyNotes).toBe(1);
    expect(plan.targets.map((t) => t.noteId).sort())
      .toEqual(['n-tame', 'n-to', 'n-wada', 'n-yuu']);
    expect(plan.targets.find((t) => t.noteId === 'n-tame')).toMatchObject({
      lapses: 11,
      tagged: false,
      suspendedCards: 1,
      tag: 'rescue::pending',
    });
  });

  it('leaves a non-leech out and says so by name — the filter’s control', () => {
    const plan = planLeechRescue({ ...baseInput, measures: ['tag'], threshold: 8 });
    expect(plan.targets.some((t) => t.noteId === 'n-neko')).toBe(false);
    expect(refusalsFor(plan.skips).has('n-neko:not-leech')).toBe(true);
    // Named by its own text, not its id: a refusal list of ids is unactionable.
    expect(labelOf(plan.skips, 'n-neko')).toBe('猫');
  });

  it('drops the tag-only note when includeTagged is off', () => {
    const plan = planLeechRescue({
      ...baseInput,
      measures: ['tag'],
      threshold: 8,
      includeTagged: false,
    });
    expect(plan.leechNotes).toBe(3);
    expect(plan.taggedOnlyNotes).toBe(0);
    expect(refusalsFor(plan.skips).has('n-yuu:not-leech')).toBe(true);
  });

  it('derives the hint from the source field and never invents text', () => {
    const plan = planLeechRescue({ ...baseInput, measures: ['hint'], threshold: 8 });
    expect(plan.targets.find((t) => t.noteId === 'n-tame')?.hint).toMatchObject({
      fromField: 'Meaning',
      toField: 'Hint',
      toOrd: 2,
      before: '',
      after: 't…',
    });
  });

  it('refuses an occupied hint field — the hand-written hint control', () => {
    const plan = planLeechRescue({ ...baseInput, measures: ['hint'], threshold: 8 });
    expect(plan.targets.some((t) => t.noteId === 'n-wada')).toBe(false);
    expect(refusalsFor(plan.skips).has('n-wada:hint-occupied')).toBe(true);
  });

  it('refuses a source that the reveal would show whole', () => {
    const plan = planLeechRescue({ ...baseInput, measures: ['hint'], threshold: 8 });
    expect(refusalsFor(plan.skips).has('n-to:hint-source-too-short')).toBe(true);
  });

  it('refuses a field name the note type does not carry', () => {
    const plan = planLeechRescue({
      ...baseInput,
      measures: ['hint'],
      threshold: 8,
      hintToField: 'Nope',
    });
    expect(plan.targets).toHaveLength(0);
    expect(plan.skips.filter((s) => s.refusal === 'hint-field-absent')).toHaveLength(4);
  });

  it('reports a note whose rescue tag is already present rather than re-writing it', () => {
    const tagged = notes.map((n) =>
      n.id === 'n-tame' ? { ...n, tags: ['rescue::pending'] } : n);
    const plan = planLeechRescue({
      ...baseInput,
      notes: tagged,
      measures: ['tag'],
      threshold: 8,
    });
    expect(refusalsFor(plan.skips).has('n-tame:already-tagged')).toBe(true);
    expect(plan.targets.some((t) => t.noteId === 'n-tame')).toBe(false);
  });

  it('refuses a note with no cards, because it has no lapse count', () => {
    const plan = planLeechRescue({ ...baseInput, cards: [], measures: ['tag'], threshold: 8 });
    expect(plan.leechNotes).toBe(0);
    expect(plan.skips.filter((s) => s.refusal === 'no-cards')).toHaveLength(5);
  });

  it('flags a reschedule as refused, never as applied', () => {
    const plan = planLeechRescue({ ...baseInput, measures: ['reschedule'], threshold: 8 });
    expect(plan.rescheduleRefused).toBe(true);
    expect(plan.targets).toHaveLength(0);
  });

  it('uses Anki’s own default threshold when none is given', () => {
    expect(DEFAULT_LEECH_THRESHOLD).toBe(8);
    expect(DEFAULT_LEECH_HINT_REVEAL).toBe(1);
    const plan = planLeechRescue({ ...baseInput, measures: ['tag'] });
    expect(plan.leechNotes).toBe(4);
  });

  it('a lower threshold reaches further down the deck', () => {
    const plan = planLeechRescue({ ...baseInput, measures: ['tag'], threshold: 3 });
    expect(plan.leechNotes).toBe(4);
    expect(plan.taggedOnlyNotes).toBe(0);
  });
});

describe('rescue-leeches through the change tray', () => {
  it('writes the tag and the hint as one undoable group', () => {
    const plan = planChangeTray(draft, createEditJournal(), allIds, [rescueAction()]);
    expect(plan.blocked).toBe(false);
    expect(plan.leechRescue?.leechNotes).toBe(4);
    // 躊躇う and 憂鬱 get both measures; 蟠り and 戸 get only the tag.
    expect(plan.changedNotes).toBe(4);
    const wada = plan.draft.notes.find((n) => n.id === 'n-wada');
    expect(wada?.fields.find((f) => f.ord === 2)?.raw).toBe('mine, do not touch');
    expect(wada?.tags).toEqual(['rescue::pending']);
    const tame = plan.draft.notes.find((n) => n.id === 'n-tame');
    expect(tame?.fields.find((f) => f.ord === 2)?.raw).toBe('t…');
    expect(tame?.tags).toEqual(['rescue::pending']);

    // The non-leech comes out byte-identical, object and all.
    expect(plan.draft.notes.find((n) => n.id === 'n-neko'))
      .toBe(notes.find((n) => n.id === 'n-neko'));

    const groups = new Set(plan.journal.done.map((op) => op.group));
    expect(groups).toEqual(new Set([plan.groupId]));
    let undone = { draft: plan.draft, journal: plan.journal };
    const step = undoLastEdit(undone.draft, undone.journal, collapsePlainText);
    expect(step.changed).toBe(true);
    undone = { draft: step.draft, journal: step.journal };
    // One group, so a single undo takes the whole run back.
    expect(undone.journal.done).toHaveLength(0);
    expect(undone.draft.notes.find((n) => n.id === 'n-tame')?.tags).toEqual([]);
    expect(undone.draft.notes.find((n) => n.id === 'n-tame')?.fields
      .find((f) => f.ord === 2)?.raw).toBe('');
  });

  it('blocks a reschedule-only run instead of applying nothing', () => {
    const plan = planChangeTray(draft, createEditJournal(), allIds, [
      rescueAction({ measures: ['reschedule'] }),
    ]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.some((p) =>
      p.code === 'leech-reschedule-unsupported' && p.severity === 'blocking')).toBe(true);
    expect(plan.draft).toBe(draft);
  });

  it('warns, but runs, when a reschedule rides alongside a measure that works', () => {
    const plan = planChangeTray(draft, createEditJournal(), allIds, [
      rescueAction({ measures: ['tag', 'reschedule'] }),
    ]);
    expect(plan.blocked).toBe(false);
    expect(plan.problems.some((p) =>
      p.code === 'leech-reschedule-unsupported' && p.severity === 'warning')).toBe(true);
    expect(plan.changedNotes).toBe(4);
  });

  it('blocks an empty measure list and a hint that reads its own destination', () => {
    const empty = planChangeTray(draft, createEditJournal(), allIds, [
      rescueAction({ measures: [] as LeechRescueMeasure[] }),
    ]);
    expect(empty.blocked).toBe(true);
    expect(empty.problems.some((p) => p.code === 'empty-parameter')).toBe(true);

    const selfHint = planChangeTray(draft, createEditJournal(), allIds, [
      rescueAction({ measures: ['hint'], hintFromField: 'Hint', hintToField: 'Hint' }),
    ]);
    expect(selfHint.blocked).toBe(true);
    expect(selfHint.problems.some((p) => p.code === 'same-field')).toBe(true);
  });

  it('blocks a threshold below one, which would make every card a leech', () => {
    const plan = planChangeTray(draft, createEditJournal(), allIds, [
      rescueAction({ threshold: 0 }),
    ]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.some((p) => p.code === 'empty-parameter')).toBe(true);
  });

  it('maps every refusal to its own problem code', () => {
    const codes = new Set(LEECH_RESCUE_PROBLEM_CODES.map(([, code]) => code));
    expect(codes.size).toBe(LEECH_RESCUE_PROBLEM_CODES.length);
    const plan = planChangeTray(draft, createEditJournal(), allIds, [rescueAction()]);
    const seen = new Set(plan.problems.map((p) => p.code));
    expect(seen.has('leech-not-leech')).toBe(true);
    expect(seen.has('leech-hint-occupied')).toBe(true);
    expect(seen.has('leech-hint-source-too-short')).toBe(true);
    // "Not a leech" is the filter working, so it is informational.
    expect(plan.problems.find((p) => p.code === 'leech-not-leech')?.severity).toBe('info');
    expect(plan.problems.find((p) => p.code === 'leech-hint-occupied')?.severity)
      .toBe('warning');
  });

  it('counts the run honestly in its outcome row', () => {
    const plan = planChangeTray(draft, createEditJournal(), allIds, [rescueAction()]);
    const outcome = plan.outcomes.find((o) => o.kind === 'rescue-leeches');
    expect(outcome).toMatchObject({ matched: 5, changed: 4, skipped: 1 });
  });
});
