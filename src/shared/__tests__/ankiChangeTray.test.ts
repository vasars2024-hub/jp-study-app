import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import {
  MAX_PROBLEM_DETAILS,
  addTrayAction,
  moveTrayAction,
  planChangeTray,
  removeTrayAction,
  summarizeTrayProblems,
  toggleTrayAction,
  type TrayAction,
  type TrayProblem,
  type TrayProblemCode,
} from '../ankiChangeTray';
import {
  countJournalSteps,
  createEditJournal,
  redoLastEdit,
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

/** A second note type whose `Back` sits at a different ord — the mixed-selection trap. */
function draftOf(notes: AnkiDraftNote[], opts?: { cloze?: boolean }): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      {
        id: 'nt1',
        name: opts?.cloze ? 'Cloze' : 'Basic',
        kind: opts?.cloze ? 'cloze' : 'standard',
        css: '',
        fields: [
          { ord: 0, name: 'Front', sticky: false, rtl: false },
          { ord: 1, name: 'Back', sticky: false, rtl: false },
        ],
        templates: [],
        sortFieldOrd: 0,
      },
      {
        id: 'nt2',
        name: 'Reversed',
        kind: 'standard',
        css: '',
        fields: [
          { ord: 0, name: 'Reading', sticky: false, rtl: false },
          { ord: 1, name: 'Meaning', sticky: false, rtl: false },
          { ord: 2, name: 'Back', sticky: false, rtl: false },
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
      noteTypes: 2,
      reviews: 0,
      mediaReferences: 0,
    },
  };
}

function replace(over: Partial<Extract<TrayAction, { kind: 'find-replace' }>> = {}): TrayAction {
  return {
    id: 'a1',
    enabled: true,
    kind: 'find-replace',
    fieldName: 'Back',
    find: 'cat',
    replace: 'ねこ',
    regex: false,
    matchCase: true,
    ...over,
  };
}

describe('the ordered list', () => {
  const base: TrayAction[] = [
    { id: 'a', enabled: true, kind: 'add-tags', tags: ['x'] },
    { id: 'b', enabled: true, kind: 'remove-tags', tags: ['y'] },
  ];

  it('adds, removes, toggles and reorders without mutating the input', () => {
    const added = addTrayAction(base, { id: 'c', enabled: true, kind: 'add-tags', tags: ['z'] });
    expect(added.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(base).toHaveLength(2);
    expect(removeTrayAction(added, 'b').map((a) => a.id)).toEqual(['a', 'c']);
    expect(moveTrayAction(added, 'c', -2).map((a) => a.id)).toEqual(['c', 'a', 'b']);
    expect(toggleTrayAction(base, 'a')[0]!.enabled).toBe(false);
  });

  it('clamps a move past either end rather than dropping the action', () => {
    expect(moveTrayAction(base, 'a', -5).map((a) => a.id)).toEqual(['a', 'b']);
    expect(moveTrayAction(base, 'a', 9).map((a) => a.id)).toEqual(['b', 'a']);
    expect(moveTrayAction(base, 'nope', 1).map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('validation refuses to half-run', () => {
  it('blocks on an unparseable regex and changes nothing at all', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [
      { id: 'ok', enabled: true, kind: 'add-tags', tags: ['keep'] },
      replace({ id: 'bad', find: '([', regex: true }),
    ]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.map((p) => p.code)).toEqual(['invalid-regex']);
    // The valid action in front of it must not have run.
    expect(plan.draft).toBe(d);
    expect(plan.journal.done).toHaveLength(0);
    expect(plan.changedNotes).toBe(0);
  });

  it('blocks an empty selection, an empty tray, and an empty parameter', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const tags: TrayAction = { id: 'a', enabled: true, kind: 'add-tags', tags: ['x'] };
    expect(planChangeTray(d, createEditJournal(), [], [tags]).problems[0]!.code).toBe(
      'empty-selection',
    );
    expect(planChangeTray(d, createEditJournal(), ['n1'], []).problems[0]!.code).toBe('no-actions');
    expect(
      planChangeTray(d, createEditJournal(), ['n1'], [{ ...tags, tags: ['  '] }]).problems[0]!.code,
    ).toBe('empty-parameter');
    // A disabled action does not save a tray from being empty.
    expect(
      planChangeTray(d, createEditJournal(), ['n1'], [{ ...tags, enabled: false }]).problems[0]!
        .code,
    ).toBe('no-actions');
  });
});

describe('planChangeTray', () => {
  it('is the apply: the returned draft is the result, and the input is untouched', () => {
    const d = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1', 'n2'], [replace()]);
    expect(plan.blocked).toBe(false);
    expect(plan.draft.notes.map((n) => n.fields[1]!.raw)).toEqual(['ねこ', 'ねこ']);
    expect(plan.draft.notes[0]!.fields[1]!.normalized).toBe('ねこ');
    expect(d.notes[0]!.fields[1]!.raw).toBe('cat');
    expect(plan.outcomes[0]).toMatchObject({ matched: 2, changed: 2, skipped: 0 });
    expect(plan.changedNotes).toBe(2);
  });

  it('applies actions in order, so a later rule sees the earlier rule’s output', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const forwards = planChangeTray(d, createEditJournal(), ['n1'], [
      replace({ id: 'a1', find: 'cat', replace: 'dog' }),
      replace({ id: 'a2', find: 'dog', replace: 'いぬ' }),
    ]);
    expect(forwards.draft.notes[0]!.fields[1]!.raw).toBe('いぬ');
    // Reversed, the second rule has nothing to find. Order is semantic, not cosmetic.
    const backwards = planChangeTray(d, createEditJournal(), ['n1'], [
      replace({ id: 'a2', find: 'dog', replace: 'いぬ' }),
      replace({ id: 'a1', find: 'cat', replace: 'dog' }),
    ]);
    expect(backwards.draft.notes[0]!.fields[1]!.raw).toBe('dog');
    expect(backwards.outcomes[0]!.changed).toBe(0);
  });

  it('reports one net diff per field when two actions touch it', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [
      replace({ id: 'a1', find: 'cat', replace: 'dog' }),
      replace({ id: 'a2', find: 'dog', replace: 'いぬ' }),
    ]);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.fields).toEqual([
      { ord: 1, name: 'Back', before: 'cat', after: 'いぬ' },
    ]);
  });

  it('resolves the field by name per note type, not by ord', () => {
    // `Back` is ord 1 in Basic and ord 2 in Reversed. An ord-addressed tray would
    // overwrite Reversed's `Meaning`.
    const d = draftOf([
      note({ id: 'n1' }),
      note({
        id: 'n2',
        noteTypeId: 'nt2',
        fields: [
          { ord: 0, name: 'Reading', raw: 'いぬ', normalized: 'いぬ' },
          { ord: 1, name: 'Meaning', raw: 'cat', normalized: 'cat' },
          { ord: 2, name: 'Back', raw: 'cat', normalized: 'cat' },
        ],
      }),
    ]);
    const plan = planChangeTray(d, createEditJournal(), ['n1', 'n2'], [replace()]);
    const n2 = plan.draft.notes.find((n) => n.id === 'n2')!;
    expect(n2.fields.map((f) => f.raw)).toEqual(['いぬ', 'cat', 'ねこ']);
  });

  it('warns rather than silently skipping when the field is absent from a note type', () => {
    const d = draftOf([
      note({
        id: 'n2',
        noteTypeId: 'nt2',
        fields: [
          { ord: 0, name: 'Reading', raw: 'x', normalized: 'x' },
          { ord: 1, name: 'Meaning', raw: 'x', normalized: 'x' },
          { ord: 2, name: 'Back', raw: 'x', normalized: 'x' },
        ],
      }),
    ]);
    const plan = planChangeTray(d, createEditJournal(), ['n2'], [replace({ fieldName: 'Front' })]);
    expect(plan.problems.map((p) => p.code)).toEqual(['field-absent']);
    expect(plan.problems[0]!.detail).toBe('Front');
    expect(plan.outcomes[0]).toMatchObject({ matched: 1, changed: 0, skipped: 1 });
  });

  it('replaces every occurrence in every field when no field is named', () => {
    const d = draftOf([
      note({
        id: 'n1',
        fields: [
          { ord: 0, name: 'Front', raw: 'a-a-a', normalized: 'a-a-a' },
          { ord: 1, name: 'Back', raw: 'a', normalized: 'a' },
        ],
      }),
    ]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [
      replace({ fieldName: null, find: 'a', replace: 'b' }),
    ]);
    // The `g` regex must be rebuilt per field: a shared `lastIndex` would leave
    // the second field's single match unmatched.
    expect(plan.draft.notes[0]!.fields.map((f) => f.raw)).toEqual(['b-b-b', 'b']);
  });

  it('honours matchCase in both directions and treats a literal find as literal', () => {
    const d = draftOf([
      note({ id: 'n1', fields: [
        { ord: 0, name: 'Front', raw: 'x', normalized: 'x' },
        { ord: 1, name: 'Back', raw: 'Cat a.b', normalized: 'Cat a.b' },
      ] }),
    ]);
    expect(
      planChangeTray(d, createEditJournal(), ['n1'], [replace({ matchCase: true })]).outcomes[0]!
        .changed,
    ).toBe(0);
    expect(
      planChangeTray(d, createEditJournal(), ['n1'], [replace({ matchCase: false })]).draft.notes[0]!
        .fields[1]!.raw,
    ).toBe('ねこ a.b');
    // A literal `.` must not behave as a regex wildcard.
    expect(
      planChangeTray(d, createEditJournal(), ['n1'], [replace({ find: 'a.b', replace: 'Z' })]).draft
        .notes[0]!.fields[1]!.raw,
    ).toBe('Cat Z');
  });

  it('adds and removes tags, keeps the marked flag honest, and skips no-ops', () => {
    const d = draftOf([note({ id: 'n1', tags: ['core'] }), note({ id: 'n2', tags: ['core', 'x'] })]);
    const added = planChangeTray(d, createEditJournal(), ['n1', 'n2'], [
      { id: 'a', enabled: true, kind: 'add-tags', tags: ['x', 'marked'] },
    ]);
    expect(added.draft.notes.map((n) => n.tags)).toEqual([
      ['core', 'x', 'marked'],
      ['core', 'x', 'marked'],
    ]);
    expect(added.draft.notes.every((n) => n.marked)).toBe(true);

    const removed = planChangeTray(added.draft, createEditJournal(), ['n1', 'n2'], [
      { id: 'r', enabled: true, kind: 'remove-tags', tags: ['marked', 'absent'] },
    ]);
    expect(removed.draft.notes.every((n) => n.marked)).toBe(false);
    expect(removed.outcomes[0]).toMatchObject({ matched: 2, changed: 2 });

    // A second removal of the same tags changes nothing and must say so.
    const again = planChangeTray(removed.draft, createEditJournal(), ['n1', 'n2'], [
      { id: 'r', enabled: true, kind: 'remove-tags', tags: ['marked'] },
    ]);
    expect(again.outcomes[0]).toMatchObject({ matched: 2, changed: 0, skipped: 2 });
    expect(again.journal.done).toHaveLength(0);
  });

  it('carries the cloze card consequence up from the single-note edit', () => {
    const d = draftOf(
      [
        note({
          id: 'n1',
          fields: [
            { ord: 0, name: 'Front', raw: '{{c1::ねこ}} が {{c2::いる}}', normalized: '' },
            { ord: 1, name: 'Back', raw: 'cat', normalized: 'cat' },
          ],
        }),
      ],
      { cloze: true },
    );
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [
      replace({ fieldName: 'Front', find: '{{c2::', replace: '{{c3::' }),
    ]);
    expect(plan.changes[0]!.clozeAdded).toEqual([3]);
    expect(plan.changes[0]!.clozeRemoved).toEqual([2]);
    expect(plan.problems.map((p) => p.code)).toEqual(['cloze-cards-change']);
  });

  it('flags a media reference the replacement invented and one it orphaned', () => {
    const d = draftOf([
      note({
        id: 'n1',
        fields: [
          { ord: 0, name: 'Front', raw: '<img src="have.png">', normalized: '' },
          { ord: 1, name: 'Back', raw: 'cat', normalized: 'cat' },
        ],
        media: [
          { reference: 'have.png', fileName: 'have.png', fieldOrd: 0, present: true },
        ],
      }),
    ]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [
      replace({ fieldName: 'Front', find: 'have.png', replace: 'gone.png' }),
    ]);
    expect(plan.changes[0]!.mediaMissing).toEqual(['gone.png']);
    expect(plan.changes[0]!.mediaDropped).toEqual(['have.png']);
    expect(summarizeTrayProblems(plan.problems).map((p) => `${p.code}:${p.count}`)).toEqual([
      'media-missing:1',
      'media-dropped:1',
    ]);
  });
});

describe('summarizeTrayProblems keeps the details it merges', () => {
  const problem = (detail: string, code: TrayProblemCode = 'media-missing'): TrayProblem => ({
    code,
    severity: 'warning',
    actionId: 'a1',
    count: 1,
    detail,
  });

  it('names every distinct detail rather than only the first', () => {
    // The per-note problems each carry one name; summing counts alone kept the
    // first and threw the rest away, leaving a number nobody could act on.
    const [merged] = summarizeTrayProblems([problem('a.png'), problem('b.png'), problem('a.png')]);
    expect(merged!.count).toBe(3);
    expect(merged!.detail).toBe('a.png, b.png');
  });

  it('stops at the cap and marks that it did', () => {
    const many = Array.from({ length: MAX_PROBLEM_DETAILS + 3 }, (_, i) => problem(`f${i}.png`));
    const [merged] = summarizeTrayProblems(many);
    expect(merged!.count).toBe(MAX_PROBLEM_DETAILS + 3);
    expect(merged!.detail).toBe('f0.png, f1.png, f2.png, f3.png, f4.png…');
  });

  it('keeps details of different codes and actions apart', () => {
    const summary = summarizeTrayProblems([
      problem('a.png'),
      problem('gone.png', 'media-dropped'),
      { ...problem('b.png'), actionId: 'a2' },
    ]);
    expect(summary.map((p) => `${p.code}/${p.actionId}:${p.detail}`)).toEqual([
      'media-missing/a1:a.png',
      'media-dropped/a1:gone.png',
      'media-missing/a2:b.png',
    ]);
  });
});

describe('one tray application is one undo', () => {
  it('takes back every note the tray touched in a single step, then redoes it', () => {
    const d = draftOf([note({ id: 'n1' }), note({ id: 'n2' }), note({ id: 'n3' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1', 'n2', 'n3'], [
      replace(),
      { id: 'tag', enabled: true, kind: 'add-tags', tags: ['batch'] },
    ]);
    expect(plan.journal.done).toHaveLength(6);
    expect(plan.journal.done.every((op) => op.group === plan.groupId)).toBe(true);
    expect(countJournalSteps(plan.journal.done)).toBe(1);

    const undone = undoLastEdit(plan.draft, plan.journal, normalize);
    expect(undone.changed).toBe(true);
    expect(undone.journal.done).toHaveLength(0);
    expect(undone.draft.notes.map((n) => n.fields[1]!.raw)).toEqual(['cat', 'cat', 'cat']);
    expect(undone.draft.notes.every((n) => n.tags.length === 0)).toBe(true);

    const redone = redoLastEdit(undone.draft, undone.journal, normalize);
    expect(redone.draft.notes.map((n) => n.fields[1]!.raw)).toEqual(['ねこ', 'ねこ', 'ねこ']);
    expect(redone.draft.notes.every((n) => n.tags.includes('batch'))).toBe(true);
    expect(redone.journal.undone).toHaveLength(0);
  });

  it('unwinds two ops on one field to the value the field held before the tray', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [
      replace({ id: 'a1', find: 'cat', replace: 'dog' }),
      replace({ id: 'a2', find: 'dog', replace: 'いぬ' }),
    ]);
    const undone = undoLastEdit(plan.draft, plan.journal, normalize);
    // Newest-first is what makes this 'cat' rather than 'dog'.
    expect(undone.draft.notes[0]!.fields[1]!.raw).toBe('cat');
  });

  it('leaves an ungrouped single edit as its own step, next to a batch', () => {
    const d = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    const batch = planChangeTray(d, createEditJournal(), ['n1', 'n2'], [replace()]);
    const withSingle = planChangeTray(batch.draft, batch.journal, ['n1'], [
      { id: 'tag', enabled: true, kind: 'add-tags', tags: ['solo'] },
    ]);
    expect(countJournalSteps(withSingle.journal.done)).toBe(2);
    expect(withSingle.groupId).not.toBe(batch.groupId);
    const undone = undoLastEdit(withSingle.draft, withSingle.journal, normalize);
    // Only the second tray comes back off; the first one's text stays.
    expect(undone.draft.notes[0]!.tags).toEqual([]);
    expect(undone.draft.notes.map((n) => n.fields[1]!.raw)).toEqual(['ねこ', 'ねこ']);
    expect(countJournalSteps(undone.journal.done)).toBe(1);
  });

  it('forks the history: a tray after an undo clears the redo stack', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const first = planChangeTray(d, createEditJournal(), ['n1'], [replace()]);
    const undone = undoLastEdit(first.draft, first.journal, normalize);
    expect(undone.journal.undone).toHaveLength(1);
    const second = planChangeTray(undone.draft, undone.journal, ['n1'], [
      { id: 'tag', enabled: true, kind: 'add-tags', tags: ['fork'] },
    ]);
    expect(second.journal.undone).toHaveLength(0);
  });

  it('keeps a blocked plan out of the journal entirely', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const first = planChangeTray(d, createEditJournal(), ['n1'], [replace()]);
    const blocked = planChangeTray(first.draft, first.journal, ['n1'], [
      replace({ find: '(', regex: true }),
    ]);
    expect(blocked.journal).toBe(first.journal);
  });
});
