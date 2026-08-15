// Tray field operations — ANKI_DECK_WORKBENCH_PLAN.md Phase 4, "field/template
// swap", and acceptance gate 1's "swap front/back".
//
// What these tests are really guarding is the two ways a bulk field move loses
// data silently: reading the destination after the source has already been
// written (a swap that copies one value into both fields), and writing the half
// of a pair that exists on a note type that lacks the other half.
import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import { planChangeTray, type TrayAction } from '../ankiChangeTray';
import { countJournalSteps, createEditJournal, undoLastEdit } from '../ankiDraftEdit';
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

/** `nt2` has no `Front` at all, and puts `Back` at a different ord than `nt1`. */
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
    counts: { notes: notes.length, cards: 0, decks: 1, noteTypes: 2, reviews: 0, mediaReferences: 0 },
  };
}

const nt2Note = (id: string, back: string): AnkiDraftNote =>
  note({
    id,
    noteTypeId: 'nt2',
    fields: [
      { ord: 0, name: 'Reading', raw: 'よむ', normalized: 'よむ' },
      { ord: 1, name: 'Meaning', raw: 'to read', normalized: 'to read' },
      { ord: 2, name: 'Back', raw: back, normalized: back },
    ],
  });

const swap = (over: Partial<Extract<TrayAction, { kind: 'swap-fields' }>> = {}): TrayAction => ({
  id: 'a1',
  enabled: true,
  kind: 'swap-fields',
  fieldA: 'Front',
  fieldB: 'Back',
  ...over,
});

const copy = (over: Partial<Extract<TrayAction, { kind: 'copy-field' }>> = {}): TrayAction => ({
  id: 'a1',
  enabled: true,
  kind: 'copy-field',
  fromField: 'Front',
  toField: 'Back',
  onConflict: 'keep',
  ...over,
});

const raw = (draft: AnkiDraft, id: string, name: string): string | undefined =>
  draft.notes.find((n) => n.id === id)?.fields.find((f) => f.name === name)?.raw;

describe('tray swap-fields', () => {
  it('exchanges both values instead of writing one over the other', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [swap()]);
    expect(plan.blocked).toBe(false);
    expect(raw(plan.draft, 'n1', 'Front')).toBe('cat');
    expect(raw(plan.draft, 'n1', 'Back')).toBe('ねこ');
    expect(plan.changedNotes).toBe(1);
    // One diff row per field, each showing that field's own before/after.
    const fields = plan.changes[0]!.fields;
    expect(fields.map((f) => [f.name, f.before, f.after])).toEqual([
      ['Front', 'ねこ', 'cat'],
      ['Back', 'cat', 'ねこ'],
    ]);
  });

  it('leaves a note whose type lacks one of the two fields completely alone', () => {
    const d = draftOf([note({ id: 'n1' }), nt2Note('n2', 'inu')]);
    const plan = planChangeTray(d, createEditJournal(), ['n1', 'n2'], [swap()]);
    // `nt2` has `Back` but no `Front`: writing the half that exists would drop
    // the surviving value on the floor, so the whole note is skipped.
    expect(raw(plan.draft, 'n2', 'Back')).toBe('inu');
    expect(raw(plan.draft, 'n2', 'Reading')).toBe('よむ');
    expect(plan.outcomes[0]).toMatchObject({ matched: 2, changed: 1, skipped: 1 });
    expect(plan.problems.filter((p) => p.code === 'field-absent')).toEqual([
      { code: 'field-absent', severity: 'warning', actionId: 'a1', count: 1, detail: 'Front' },
    ]);
  });

  it('changes nothing when the two fields already hold the same text', () => {
    const d = draftOf([note({ id: 'n1', fields: [
      { ord: 0, name: 'Front', raw: 'same', normalized: 'same' },
      { ord: 1, name: 'Back', raw: 'same', normalized: 'same' },
    ] })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [swap()]);
    expect(plan.changedNotes).toBe(0);
    expect(plan.draft).toBe(d);
  });

  it('refuses a swap of a field with itself and applies none of the tray', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [
      swap({ fieldB: 'Front' }),
      { id: 'a2', enabled: true, kind: 'add-tags', tags: ['later'] },
    ]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.map((p) => p.code)).toEqual(['same-field']);
    expect(plan.problems[0]!.detail).toBe('Front');
    expect(plan.draft).toBe(d);
    expect(plan.draft.notes[0]!.tags).toEqual([]);
  });

  it('is a single undo across every field it touched', () => {
    const d = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1', 'n2'], [swap()]);
    expect(countJournalSteps(plan.journal.done)).toBe(1);
    const undone = undoLastEdit(plan.draft, plan.journal, normalize);
    expect(raw(undone.draft, 'n1', 'Front')).toBe('ねこ');
    expect(raw(undone.draft, 'n1', 'Back')).toBe('cat');
    expect(raw(undone.draft, 'n2', 'Front')).toBe('ねこ');
  });

  it('targets by name across note types, not by ord', () => {
    // `Back` is ord 1 on nt1 and ord 2 on nt2; both must move, and nothing else.
    const d = draftOf([note({ id: 'n1' }), nt2Note('n2', 'inu')]);
    const plan = planChangeTray(d, createEditJournal(), ['n1', 'n2'], [
      swap({ fieldA: 'Back', fieldB: 'Meaning' }),
    ]);
    expect(raw(plan.draft, 'n2', 'Back')).toBe('to read');
    expect(raw(plan.draft, 'n2', 'Meaning')).toBe('inu');
    expect(raw(plan.draft, 'n2', 'Reading')).toBe('よむ');
    // nt1 has no `Meaning`, so it is the skipped one this time.
    expect(raw(plan.draft, 'n1', 'Back')).toBe('cat');
  });
});

describe('tray copy-field', () => {
  it('keeps an occupied destination when that is the chosen conflict rule', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [copy()]);
    expect(raw(plan.draft, 'n1', 'Back')).toBe('cat');
    expect(plan.changedNotes).toBe(0);
    expect(plan.problems).toEqual([]);
  });

  it('fills an empty destination even under `keep`', () => {
    const d = draftOf([note({ id: 'n1', fields: [
      { ord: 0, name: 'Front', raw: 'ねこ', normalized: 'ねこ' },
      { ord: 1, name: 'Back', raw: '   ', normalized: '' },
    ] })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [copy()]);
    // Whitespace is not text: `keep` protects a value, not a blank.
    expect(raw(plan.draft, 'n1', 'Back')).toBe('ねこ');
  });

  it('overwrites only when asked, and counts every note that lost text', () => {
    const d = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1', 'n2'], [
      copy({ onConflict: 'overwrite' }),
    ]);
    expect(raw(plan.draft, 'n1', 'Back')).toBe('ねこ');
    expect(raw(plan.draft, 'n2', 'Back')).toBe('ねこ');
    const overwrites = plan.problems.filter((p) => p.code === 'overwrite-nonempty');
    expect(overwrites).toHaveLength(2);
    expect(overwrites.every((p) => p.severity === 'warning' && p.detail === 'Back')).toBe(true);
  });

  it('does not warn about overwriting a destination that was empty', () => {
    const d = draftOf([note({ id: 'n1', fields: [
      { ord: 0, name: 'Front', raw: 'ねこ', normalized: 'ねこ' },
      { ord: 1, name: 'Back', raw: '', normalized: '' },
    ] })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [
      copy({ onConflict: 'overwrite' }),
    ]);
    expect(plan.changedNotes).toBe(1);
    expect(plan.problems.filter((p) => p.code === 'overwrite-nonempty')).toEqual([]);
  });

  it('appends after the existing value, with the default separator or a given one', () => {
    const d = draftOf([note({ id: 'n1' }), note({ id: 'n2' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [copy({ onConflict: 'append' })]);
    expect(raw(plan.draft, 'n1', 'Back')).toBe('cat<br>ねこ');
    const custom = planChangeTray(d, createEditJournal(), ['n2'], [
      copy({ onConflict: 'append', separator: ' / ' }),
    ]);
    expect(raw(custom.draft, 'n2', 'Back')).toBe('cat / ねこ');
  });

  it('sees the previous action’s output, so order stays semantic', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [
      { id: 'a0', enabled: true, kind: 'find-replace', fieldName: 'Front', find: 'ねこ', replace: 'いぬ', regex: false, matchCase: true },
      copy({ id: 'a1', onConflict: 'overwrite' }),
    ]);
    expect(raw(plan.draft, 'n1', 'Back')).toBe('いぬ');
    // One net diff row for `Back`, from its original value to the final one.
    const back = plan.changes[0]!.fields.find((f) => f.name === 'Back');
    expect(back).toMatchObject({ before: 'cat', after: 'いぬ' });
  });

  it('refuses an empty field name before it touches anything', () => {
    const d = draftOf([note({ id: 'n1' })]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [copy({ toField: '' })]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.map((p) => p.code)).toEqual(['empty-parameter']);
  });
});
