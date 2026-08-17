import { describe, expect, it } from 'vitest';
import type { AnkiDraft, RawAnkiCollection, RawAnkiNoteTypeRow } from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import { draftTemplateGroups } from '../ankiSiblingAudit';
import {
  applyTemplateRemoval,
  planTemplateRemoval,
  removableTemplateOrds,
  templateRemovalOrphans,
} from '../ankiTemplateRemoval';

type Tpl = RawAnkiNoteTypeRow['templates'][number];

const FIELDS = ['Front', 'Back', 'Notes'];

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
const FORWARD_TWIN: Tpl = {
  ord: 1,
  name: 'Card 1 copy',
  qfmt: '{{ Front }}',
  afmt: '{{FrontSide}}{{ Back }}',
};
/** Same question as FORWARD, a different answer — an `ambiguous` group. */
const FORWARD_OTHER_BACK: Tpl = {
  ord: 1,
  name: 'Card 3',
  qfmt: '{{Front}}',
  afmt: '{{FrontSide}}{{Notes}}',
};
const REVERSE: Tpl = { ord: 1, name: 'Card 2', qfmt: '{{Back}}', afmt: '{{FrontSide}}{{Front}}' };
/** A third template rendering FORWARD again, so a group can hold three ords. */
const FORWARD_TWIN_2: Tpl = {
  ord: 2,
  name: 'Card 1 copy 2',
  qfmt: '{{Front}}',
  afmt: '{{FrontSide}}{{Back}}',
};
const REVERSE_AT_2: Tpl = { ...REVERSE, ord: 2 };

const ROWS = [
  { values: ['ねこ', 'cat', 'a note'], ords: [0, 1] },
  { values: ['いぬ', 'dog', 'another'], ords: [0, 1] },
];
const ROWS_3 = [
  { values: ['ねこ', 'cat', 'a note'], ords: [0, 1, 2] },
  { values: ['いぬ', 'dog', 'another'], ords: [0, 1, 2] },
];

describe('removableTemplateOrds', () => {
  it('offers a duplicate group everything after its lowest ord, and offers ambiguous nothing', () => {
    const dup = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const dupOffer = removableTemplateOrds(draftTemplateGroups(dup));
    expect([...(dupOffer.get('1') ?? new Map())]).toEqual([[1, 0]]);

    const amb = draftOf([noteType([FORWARD, FORWARD_OTHER_BACK])], ROWS);
    const groups = draftTemplateGroups(amb);
    expect(groups.map((g) => g.verdict)).toEqual(['ambiguous']);
    expect(removableTemplateOrds(groups).size).toBe(0);
  });
});

describe('planTemplateRemoval refusals', () => {
  const dup = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
  const dupGroups = draftTemplateGroups(dup);

  it('refuses an ambiguous group by name rather than leaving it out of the offer', () => {
    const amb = draftOf([noteType([FORWARD, FORWARD_OTHER_BACK])], ROWS);
    const plan = planTemplateRemoval(amb, draftTemplateGroups(amb), [
      { noteTypeId: '1', removeOrds: [1] },
    ]);
    expect(plan.removals).toEqual([]);
    expect(plan.skips).toEqual([
      { noteTypeId: '1', ord: 1, refusal: 'not-duplicate', detail: 'Basic' },
    ]);
  });

  it('tells the keeper apart from a template no group covers', () => {
    const plan = planTemplateRemoval(dup, dupGroups, [{ noteTypeId: '1', removeOrds: [0] }]);
    expect(plan.skips.map((s) => s.refusal)).toEqual(['is-keeper']);

    const distinct = draftOf([noteType([FORWARD, REVERSE])], ROWS);
    const other = planTemplateRemoval(distinct, draftTemplateGroups(distinct), [
      { noteTypeId: '1', removeOrds: [1] },
    ]);
    expect(other.skips.map((s) => s.refusal)).toEqual(['not-duplicate']);
  });

  it('refuses a missing note type, a missing ord and a cloze note type', () => {
    expect(
      planTemplateRemoval(dup, dupGroups, [{ noteTypeId: '99', removeOrds: [1] }]).skips,
    ).toEqual([{ noteTypeId: '99', ord: -1, refusal: 'note-type-missing' }]);

    expect(
      planTemplateRemoval(dup, dupGroups, [{ noteTypeId: '1', removeOrds: [7] }]).skips.map(
        (s) => s.refusal,
      ),
    ).toEqual(['template-missing']);

    const cloze = draftOf([noteType([FORWARD, FORWARD_TWIN], { type: 1 })], ROWS);
    expect(
      planTemplateRemoval(cloze, [], [{ noteTypeId: '1', removeOrds: [0] }]).skips.map(
        (s) => s.refusal,
      ),
    ).toEqual(['cloze']);
  });

  it('refuses to empty a note type even when every ord is a legitimate duplicate', () => {
    const three = draftOf([noteType([FORWARD, FORWARD_TWIN, FORWARD_TWIN_2])], ROWS_3);
    const groups = draftTemplateGroups(three);
    expect(groups[0].ords).toEqual([0, 1, 2]);
    // Naming all three, including the keeper, is the only way to reach it.
    const plan = planTemplateRemoval(three, groups, [{ noteTypeId: '1', removeOrds: [0, 1, 2] }]);
    expect(plan.removals).toEqual([]);
    expect(plan.skips.map((s) => s.refusal)).toEqual([
      'last-template',
      'last-template',
      'last-template',
    ]);
  });
});

describe('planTemplateRemoval cost', () => {
  it('names the surviving template and counts the cards and notes it deletes', () => {
    const dup = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    const plan = planTemplateRemoval(dup, draftTemplateGroups(dup), [
      { noteTypeId: '1', removeOrds: [1] },
    ]);
    expect(plan.skips).toEqual([]);
    expect(plan.removals).toHaveLength(1);
    const [removal] = plan.removals;
    expect(removal).toMatchObject({
      noteTypeId: '1',
      noteTypeName: 'Basic',
      ord: 1,
      name: 'Card 1 copy',
      keptOrd: 0,
      keptName: 'Card 1',
      noteCount: 2,
    });
    expect(removal.cardIds).toHaveLength(2);
  });
});

describe('applyTemplateRemoval', () => {
  it('returns the identical draft object when every request was refused', () => {
    const distinct = draftOf([noteType([FORWARD, REVERSE])], ROWS);
    const plan = applyTemplateRemoval(distinct, draftTemplateGroups(distinct), [
      { noteTypeId: '1', removeOrds: [1] },
    ]);
    expect(plan.draft).toBe(distinct);
    expect(plan.removedCards).toBe(0);
    expect(plan.renumbered).toEqual([]);
  });

  it('drops the template and its cards, and leaves no ord gap', () => {
    const dup = draftOf([noteType([FORWARD, FORWARD_TWIN])], ROWS);
    expect(dup.cards).toHaveLength(4);
    const plan = applyTemplateRemoval(dup, draftTemplateGroups(dup), [
      { noteTypeId: '1', removeOrds: [1] },
    ]);
    expect(plan.removedCards).toBe(2);
    expect(plan.draft.cards).toHaveLength(2);
    expect(plan.draft.cards.every((c) => c.ord === 0)).toBe(true);
    expect(plan.draft.noteTypes[0].templates.map((t) => t.ord)).toEqual([0]);
    expect(plan.draft.noteTypes[0].templates.map((t) => t.name)).toEqual(['Card 1']);
    // Removing the last ord shifts nothing, so there is nothing to renumber.
    expect(plan.renumbered).toEqual([]);
    // Notes are untouched: this recipe deletes cards, never content.
    expect(plan.draft.notes).toEqual(dup.notes);
  });

  it('renumbers the survivor and its cards when the removed ord is not the last', () => {
    // [0 forward, 1 forward-twin, 2 reverse] — the duplicate pair is 0/1, so
    // removing 1 must pull the *reverse* template and its cards down to ord 1.
    const three = draftOf([noteType([FORWARD, FORWARD_TWIN, REVERSE_AT_2])], ROWS_3);
    const groups = draftTemplateGroups(three);
    expect(groups.map((g) => `${g.verdict}:${g.ords.join(',')}`)).toEqual(['duplicate:0,1']);

    const plan = applyTemplateRemoval(three, groups, [{ noteTypeId: '1', removeOrds: [1] }]);
    expect(plan.removedCards).toBe(2);
    expect(plan.renumbered).toEqual([{ noteTypeId: '1', from: 2, to: 1 }]);
    expect(plan.draft.noteTypes[0].templates.map((t) => [t.ord, t.name])).toEqual([
      [0, 'Card 1'],
      [1, 'Card 2'],
    ]);
    // Every reverse card followed its template down; no card is still at ord 2.
    const ords = plan.draft.cards.map((c) => c.ord).sort();
    expect(ords).toEqual([0, 0, 1, 1]);
    expect(templateRemovalOrphans(plan.draft)).toBe(0);
  });

  it('NEGATIVE CONTROL: skipping the card renumbering is what produces orphans', () => {
    const three = draftOf([noteType([FORWARD, FORWARD_TWIN, REVERSE_AT_2])], ROWS_3);
    const groups = draftTemplateGroups(three);
    const plan = applyTemplateRemoval(three, groups, [{ noteTypeId: '1', removeOrds: [1] }]);
    expect(templateRemovalOrphans(plan.draft)).toBe(0);

    // The same after-draft with the card half of the renumbering undone — which
    // is what a removal that only edited the note type would produce.
    const doomed = new Set(plan.removals.flatMap((r) => r.cardIds));
    const unrenumbered = {
      ...plan.draft,
      cards: three.cards.filter((c) => !doomed.has(c.id)),
    };
    expect(templateRemovalOrphans(unrenumbered)).toBe(2);
  });

  it('renumbers two removals on one note type together, not one after the other', () => {
    // Five templates, ords 0..4; 1 and 3 both duplicate ord 0. Survivors are
    // 0, 2, 4 -> 0, 1, 2. Applying the removals sequentially would compute the
    // shift for 4 against a numbering that had already moved.
    const twin3: Tpl = { ...FORWARD_TWIN, ord: 3, name: 'Card 1 copy 3' };
    const reverse2: Tpl = { ...REVERSE, ord: 2 };
    const reverse4: Tpl = { ord: 4, name: 'Card 5', qfmt: '{{Notes}}', afmt: '{{Front}}' };
    const five = draftOf([noteType([FORWARD, FORWARD_TWIN, reverse2, twin3, reverse4])], [
      { values: ['ねこ', 'cat', 'a note'], ords: [0, 1, 2, 3, 4] },
      { values: ['いぬ', 'dog', 'another'], ords: [0, 1, 2, 3, 4] },
    ]);
    const groups = draftTemplateGroups(five);
    expect(groups.map((g) => `${g.verdict}:${g.ords.join(',')}`)).toEqual(['duplicate:0,1,3']);

    const plan = applyTemplateRemoval(five, groups, [{ noteTypeId: '1', removeOrds: [1, 3] }]);
    expect(plan.removedCards).toBe(4);
    expect(plan.renumbered).toEqual([
      { noteTypeId: '1', from: 2, to: 1 },
      { noteTypeId: '1', from: 4, to: 2 },
    ]);
    expect(plan.draft.noteTypes[0].templates.map((t) => [t.ord, t.name])).toEqual([
      [0, 'Card 1'],
      [1, 'Card 2'],
      [2, 'Card 5'],
    ]);
    expect(plan.draft.cards.map((c) => c.ord).sort()).toEqual([0, 0, 1, 1, 2, 2]);
    expect(templateRemovalOrphans(plan.draft)).toBe(0);
  });

  it('leaves another note type and its cards alone', () => {
    const other = noteType([FORWARD, REVERSE], { id: '2', name: 'Other' });
    const dup = draftOf([noteType([FORWARD, FORWARD_TWIN]), other], [
      ...ROWS,
      { mid: '2', values: ['うま', 'horse', 'x'], ords: [0, 1] },
    ]);
    const plan = applyTemplateRemoval(dup, draftTemplateGroups(dup), [
      { noteTypeId: '1', removeOrds: [1] },
    ]);
    expect(plan.removedCards).toBe(2);
    const otherAfter = plan.draft.noteTypes.find((nt) => nt.id === '2');
    expect(otherAfter?.templates.map((t) => t.ord)).toEqual([0, 1]);
    const otherNoteId = dup.notes.find((n) => n.noteTypeId === '2')?.id;
    expect(
      plan.draft.cards.filter((c) => c.noteId === otherNoteId).map((c) => c.ord).sort(),
    ).toEqual([0, 1]);
  });
});
