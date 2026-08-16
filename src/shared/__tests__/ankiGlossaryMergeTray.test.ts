// The `merge-glossary` tray action — recipe 14 wired into the change tray.
// `ankiGlossaryMerge.test.ts` covers the decision rules; this covers the seam:
// the refusals that block a plan, what a merge writes into a real draft, and
// that every write is one reversible journal op like any other field edit.
import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';
import { planChangeTray, summarizeTrayProblems, type TrayAction } from '../ankiChangeTray';
import { createEditJournal, undoLastEdit } from '../ankiDraftEdit';
import { wrapEnrichProvenance } from '../ankiEnrich';
import { buildGlossarySource, type GlossarySource } from '../ankiGlossaryMerge';
import { stripFieldHtml } from '../apkgParse';

const normalize = stripFieldHtml;

function note(id: string, expression: string, meaning: string): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Expression', raw: expression, normalized: normalize(expression) },
      { ord: 1, name: 'Meaning', raw: meaning, normalized: normalize(meaning) },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
  };
}

function draftOf(notes: AnkiDraftNote[]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'main.apkg', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      {
        id: 'nt1',
        name: 'Basic',
        kind: 'standard',
        css: '',
        fields: [
          { ord: 0, name: 'Expression', sticky: false, rtl: false },
          { ord: 1, name: 'Meaning', sticky: false, rtl: false },
        ],
        templates: [],
        sortFieldOrd: 0,
      },
    ],
    notes,
    cards: [],
    diagnostics: [],
    counts: { notes: notes.length, cards: 0, decks: 1, noteTypes: 1, reviews: 0, mediaReferences: 0 },
  };
}

/** A glossary built straight from rows, without a second apkg fixture. */
function glossaryOf(rows: Array<[string, string]>, id = 'src-1'): GlossarySource {
  return buildGlossarySource({
    id,
    label: 'glossary.apkg',
    notes: rows.map(([expr, meaning], i) => note(`s${i}`, expr, meaning)),
    noteTypes: draftOf([]).noteTypes,
    keyField: 'Expression',
    fieldNames: ['Meaning'],
  });
}

function merge(over: Partial<Extract<TrayAction, { kind: 'merge-glossary' }>> = {}): TrayAction {
  return {
    id: 'g1',
    enabled: true,
    kind: 'merge-glossary',
    sourceId: 'src-1',
    keyField: 'Expression',
    fieldPairs: [{ fromField: 'Meaning', toField: 'Meaning' }],
    mode: 'fill-empty',
    ...over,
  };
}

const codes = (plan: { problems: readonly { code: string }[] }): string[] =>
  summarizeTrayProblems(plan.problems as never).map((p) => p.code);

describe('merge-glossary refusals', () => {
  const d = draftOf([note('n1', '猫', '')]);

  it('blocks the whole plan when no glossary was supplied', () => {
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [merge()]);
    expect(plan.blocked).toBe(true);
    expect(codes(plan)).toContain('glossary-missing');
    expect(plan.draft).toBe(d);
  });

  it('blocks a tray built against a glossary the user has since replaced', () => {
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [merge()], {
      glossary: glossaryOf([['猫', 'cat']], 'src-2'),
    });
    expect(plan.blocked).toBe(true);
    const mismatch = summarizeTrayProblems(plan.problems).find((p) => p.code === 'glossary-mismatch');
    expect(mismatch?.detail).toBe('src-1');
  });

  it('blocks a pair that would rewrite the field the match was made on', () => {
    const plan = planChangeTray(
      d,
      createEditJournal(),
      ['n1'],
      [merge({ fieldPairs: [{ fromField: 'Meaning', toField: 'Expression' }] })],
      { glossary: glossaryOf([['猫', 'cat']]) },
    );
    expect(plan.blocked).toBe(true);
    expect(codes(plan)).toContain('same-field');
  });

  it('blocks an empty key field or an empty pair list', () => {
    const g = { glossary: glossaryOf([['猫', 'cat']]) };
    expect(planChangeTray(d, createEditJournal(), ['n1'], [merge({ keyField: '' })], g).blocked).toBe(
      true,
    );
    expect(planChangeTray(d, createEditJournal(), ['n1'], [merge({ fieldPairs: [] })], g).blocked).toBe(
      true,
    );
  });
});

describe('merge-glossary over a draft', () => {
  it('fills empty fields, names the misses, and leaves occupied ones alone', () => {
    const d = draftOf([
      note('n1', '猫', ''), // filled from the glossary
      note('n2', '犬', 'dog'), // occupied: fill-empty keeps it
      note('n3', '鳥', ''), // not in the glossary
      note('n4', '', ''), // no key to match on
      note('n5', '狐', ''), // ambiguous in the glossary
    ]);
    const glossary = glossaryOf([
      ['猫', 'cat'],
      ['犬', 'canine; dog'],
      ['狐', 'fox'],
      ['狐', 'vixen'],
    ]);
    expect(glossary.ambiguousKeys).toEqual(['狐']);

    const plan = planChangeTray(d, createEditJournal(), ['n1', 'n2', 'n3', 'n4', 'n5'], [merge()], {
      glossary,
    });
    expect(plan.blocked).toBe(false);
    expect(plan.changedNotes).toBe(1);
    expect(plan.draft.notes.map((n) => n.fields[1]!.raw)).toEqual(['cat', 'dog', '', '', '']);

    const summary = summarizeTrayProblems(plan.problems);
    const count = (code: string) => summary.find((p) => p.code === code)?.count ?? 0;
    expect(count('glossary-kept-occupied')).toBe(1);
    expect(count('glossary-unmatched')).toBe(1);
    expect(count('glossary-key-empty')).toBe(1);
    expect(count('glossary-key-ambiguous')).toBe(1);
    // The four skips plus the one write account for every selected note.
    expect(plan.outcomes[0]).toEqual({
      actionId: 'g1',
      kind: 'merge-glossary',
      matched: 5,
      changed: 1,
      skipped: 4,
    });
  });

  it('prefer-stronger overwrites the weaker half only, and says it did', () => {
    const attributed = wrapEnrichProvenance('cat; feline', ['JMdict (EN)'], 'inline');
    const d = draftOf([
      note('n1', '猫', 'cat'), // weaker than the glossary's attributed value
      note('n2', '犬', attributed), // stronger than the glossary's bare one
    ]);
    const plan = planChangeTray(
      d,
      createEditJournal(),
      ['n1', 'n2'],
      [merge({ mode: 'prefer-stronger' })],
      { glossary: glossaryOf([['猫', attributed], ['犬', 'dog']]) },
    );
    expect(plan.changedNotes).toBe(1);
    expect(plan.draft.notes[0]!.fields[1]!.raw).toBe(attributed);
    expect(plan.draft.notes[1]!.fields[1]!.raw).toBe(attributed);
    const summary = summarizeTrayProblems(plan.problems);
    // The one destructive write is counted, not implied.
    expect(summary.find((p) => p.code === 'overwrite-nonempty')?.count).toBe(1);
    expect(summary.find((p) => p.code === 'glossary-kept-stronger')?.count).toBe(1);
    expect(summary.find((p) => p.code === 'glossary-kept-stronger')?.detail).toContain('provenance');
  });

  it('merge-senses appends what is missing and reports what needed nothing', () => {
    const d = draftOf([
      note('n1', '猫', 'cat'),
      note('n2', '犬', 'dog; canine'),
    ]);
    const plan = planChangeTray(d, createEditJournal(), ['n1', 'n2'], [merge({ mode: 'merge-senses' })], {
      glossary: glossaryOf([['猫', 'feline; cat'], ['犬', 'canine']]),
    });
    expect(plan.draft.notes[0]!.fields[1]!.raw).toBe('cat; feline');
    expect(plan.draft.notes[1]!.fields[1]!.raw).toBe('dog; canine');
    expect(codes(plan)).toContain('glossary-nothing-to-add');
    // Nothing was overwritten: appending is not a destructive write.
    expect(codes(plan)).not.toContain('overwrite-nonempty');
  });

  it('reports a run that wrote nothing, with the glossary size, instead of a silent zero', () => {
    const d = draftOf([note('n1', '猫', 'cat')]);
    const plan = planChangeTray(d, createEditJournal(), ['n1'], [merge()], {
      glossary: glossaryOf([['猫', 'feline']]),
    });
    expect(plan.changedNotes).toBe(0);
    const clean = summarizeTrayProblems(plan.problems).find((p) => p.code === 'glossary-clean');
    expect(clean?.count).toBe(1);
    expect(clean?.detail).toBe('1');
  });

  it('is one reversible journal group, like every other field write', () => {
    const d = draftOf([note('n1', '猫', ''), note('n2', '犬', '')]);
    const plan = planChangeTray(d, createEditJournal(), ['n1', 'n2'], [merge()], {
      glossary: glossaryOf([['猫', 'cat'], ['犬', 'dog']]),
    });
    expect(plan.draft.notes.map((n) => n.fields[1]!.raw)).toEqual(['cat', 'dog']);
    const undone = undoLastEdit(plan.draft, plan.journal, normalize);
    expect(undone.draft.notes.map((n) => n.fields[1]!.raw)).toEqual(['', '']);
  });

  it('skips a note whose note type lacks the destination field rather than the whole run', () => {
    const d = draftOf([note('n1', '猫', '')]);
    const plan = planChangeTray(
      d,
      createEditJournal(),
      ['n1'],
      [merge({ fieldPairs: [{ fromField: 'Meaning', toField: 'Notes' }] })],
      { glossary: glossaryOf([['猫', 'cat']]) },
    );
    expect(plan.blocked).toBe(false);
    expect(plan.changedNotes).toBe(0);
    const absent = summarizeTrayProblems(plan.problems).find((p) => p.code === 'field-absent');
    expect(absent?.detail).toContain('Notes');
  });
});
