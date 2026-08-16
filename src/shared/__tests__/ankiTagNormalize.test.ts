// Normalising inconsistent tags — ANKI_DECK_WORKBENCH_PLAN.md Phase 7, recipe 12.
//
// Two negative controls carry this file, and both are the module's promises
// rather than edge cases:
//
//  1. **A minority spelling wins nothing, and a majority spelling is not
//     lowercased.** `unify-case` must move `jlpt::n5` onto `JLPT::N5` because
//     that is what the deck already says most often — not because uppercase is
//     "correct". A `toLowerCase()` slipped into the module would fail here.
//  2. **A tag no other note carries survives.** `drop-redundant-parents` removes
//     a parent only when a child of it is on the *same note*. A deck-wide reading
//     of "redundant" would strip a tag some note is the only holder of, and the
//     test asserts that byte-identically.
import { describe, expect, it } from 'vitest';
import {
  TAG_NORMALIZE_ORDER,
  buildTagCaseCensus,
  planTagNormalize,
  type TagNormalizeOp,
} from '../ankiTagNormalize';
import { planChangeTray, type TrayAction } from '../ankiChangeTray';
import { createEditJournal, undoLastEdit } from '../ankiDraftEdit';
import type { AnkiDraft, AnkiDraftNote } from '../ankiDraft';

const ALL_OPS: TagNormalizeOp[] = [...TAG_NORMALIZE_ORDER];

function noteOf(id: string, tags: string[]): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags,
    marked: tags.includes('marked'),
    fields: [{ ord: 0, name: 'Expression', raw: id, normalized: id }],
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
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp', plainText: true },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      {
        id: 'nt1',
        name: 'Vocab',
        kind: 'standard',
        css: '',
        fields: [{ ord: 0, name: 'Expression', sticky: false, rtl: false }],
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
      noteTypes: 1,
      reviews: 0,
      mediaReferences: 0,
    },
  };
}

// `JLPT::N5` three times against `jlpt::n5` once, so the majority is unambiguous
// and is the *upper*-case one — the control for promise 1.
const notes = [
  noteOf('n1', ['JLPT::N5', 'source::netflix']),
  noteOf('n2', ['JLPT::N5']),
  noteOf('n3', ['JLPT::N5', 'JLPT']),
  noteOf('n4', ['jlpt::n5', 'Source::::Netflix', '::anime::']),
  noteOf('n5', ['ＪＬＰＴ::Ｎ５']),
  noteOf('n6', ['grammar']),
];

function planAll(over?: { ops?: TagNormalizeOp[]; only?: string[] }) {
  const ids = over?.only ?? notes.map((n) => n.id);
  return planTagNormalize({
    notes: notes.filter((n) => ids.includes(n.id)),
    censusTags: notes.map((n) => n.tags),
    ops: over?.ops ?? ALL_OPS,
  });
}

describe('planTagNormalize', () => {
  it('unifies a minority spelling onto the deck majority rather than onto lower case', () => {
    const plan = planAll();
    const n4 = plan.changes.find((c) => c.noteId === 'n4');
    expect(n4?.after).toContain('JLPT::N5');
    expect(n4?.after).not.toContain('jlpt::n5');
    // The control: nothing anywhere in the result is the lowercased form, which
    // is what a `toLowerCase()` implementation would have produced everywhere.
    for (const change of plan.changes) {
      expect(change.after.some((tag) => tag === 'jlpt::n5')).toBe(false);
    }
  });

  it('repairs doubled, leading and trailing separators without changing the concept', () => {
    const plan = planAll({ only: ['n4'], ops: ['trim-separators'] });
    const n4 = plan.changes.find((c) => c.noteId === 'n4');
    expect(n4?.after).toEqual(['jlpt::n5', 'Source::Netflix', 'anime']);
  });

  it('folds full-width ASCII so a width variant is the same tag', () => {
    const plan = planAll({ only: ['n5'], ops: ['ascii-width'] });
    expect(plan.changes.find((c) => c.noteId === 'n5')?.after).toEqual(['JLPT::N5']);
  });

  it('drops a parent only when the same note carries its child', () => {
    const plan = planAll({ ops: ['drop-redundant-parents'] });
    // n3 holds both `JLPT` and `JLPT::N5`, so the bare parent goes.
    const n3 = plan.changes.find((c) => c.noteId === 'n3');
    expect(n3?.after).toEqual(['JLPT::N5']);
    expect(n3?.removed).toEqual(['JLPT']);
    // n6's `grammar` has no child anywhere and must be byte-identical — promise 2.
    expect(plan.changes.some((c) => c.noteId === 'n6')).toBe(false);
  });

  it('counts a collapse as a removal rather than pretending nothing was lost', () => {
    // `Source::::Netflix` normalises onto `source::netflix`, which n4 does not
    // already hold — so this note needs a second holder of the canonical form.
    const local = [noteOf('x1', ['tag::A', 'tag::a']), noteOf('x2', ['tag::A'])];
    const plan = planTagNormalize({
      notes: local,
      censusTags: local.map((n) => n.tags),
      ops: ['unify-case'],
    });
    const x1 = plan.changes.find((c) => c.noteId === 'x1');
    expect(x1?.after).toEqual(['tag::A']);
    expect(x1?.removed).toEqual(['tag::a']);
    expect(plan.removedTags).toBe(1);
  });

  it('keys the case census by path prefix, so two unrelated subtrees keep their own spelling', () => {
    const local = [
      noteOf('y1', ['Anime::Core', 'Grammar::core']),
      noteOf('y2', ['Anime::Core']),
    ];
    const census = buildTagCaseCensus(local.map((n) => n.tags));
    expect(census.get('anime::core')).toBe('Core');
    expect(census.get('grammar::core')).toBe('core');
    const plan = planTagNormalize({
      notes: local,
      censusTags: local.map((n) => n.tags),
      ops: ['unify-case'],
    });
    // Neither note changes: each subtree is already internally consistent.
    expect(plan.changes).toEqual([]);
    expect(plan.unchanged).toBe(2);
  });

  it('reports distinct tag counts, which is the number that says the sidebar got shorter', () => {
    const plan = planAll();
    expect(plan.distinctBefore).toBeGreaterThan(plan.distinctAfter);
    expect(plan.distinctAfter).toBe(new Set(plan.changes.flatMap((c) => c.after)).size + 1);
  });

  it('runs its ops in canonical order regardless of the order they were listed', () => {
    const forwards = planAll({ ops: ALL_OPS });
    const backwards = planAll({ ops: [...ALL_OPS].reverse() });
    expect(backwards.changes).toEqual(forwards.changes);
  });
});

describe('the normalize-tags tray action', () => {
  const action: TrayAction = { id: 'a1', enabled: true, kind: 'normalize-tags', ops: ALL_OPS };

  it('writes the normalised tags and is undone as one group', () => {
    const draft = draftOf(notes);
    const plan = planChangeTray(draft, createEditJournal(), notes.map((n) => n.id), [action]);
    expect(plan.blocked).toBe(false);
    // 8 distinct spellings in, 4 concepts out — the sidebar is four rows shorter.
    expect(plan.tagNormalize?.distinctBefore).toBe(8);
    expect(plan.tagNormalize?.distinctAfter).toBe(4);
    const n4 = plan.draft.notes.find((n) => n.id === 'n4');
    // `source` and `Source` are one each, so the tie breaks toward the spelling
    // seen first — n1's. Deterministic for a given draft, which is the promise.
    expect(n4?.tags).toEqual(['JLPT::N5', 'source::netflix', 'anime']);
    const outcome = plan.outcomes[0];
    expect(outcome.changed).toBe(plan.tagNormalize?.changes.length);
    expect(outcome.matched).toBe(6);

    // One group, one undo — the whole point of the tray's group id.
    const back = undoLastEdit(plan.draft, plan.journal);
    expect(back.changed).toBe(true);
    for (const original of notes) {
      expect(back.draft.notes.find((n) => n.id === original.id)?.tags).toEqual(original.tags);
    }
  });

  it('refuses a run with no op chosen instead of normalising with a default set', () => {
    const plan = planChangeTray(draftOf(notes), createEditJournal(), notes.map((n) => n.id), [
      { ...action, ops: [] },
    ]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.some((p) => p.code === 'empty-parameter' && p.severity === 'blocking')).toBe(
      true,
    );
  });

  it('says so when there was nothing to tidy, rather than reporting a silent zero', () => {
    const clean = [noteOf('c1', ['JLPT::N5']), noteOf('c2', ['JLPT::N5'])];
    const plan = planChangeTray(draftOf(clean), createEditJournal(), ['c1', 'c2'], [action]);
    expect(plan.changedNotes).toBe(0);
    const clean0 = plan.problems.find((p) => p.code === 'tag-normalize-clean');
    expect(clean0?.count).toBe(2);
    // Identity, not just equality: an unchanged tray must return the input draft.
    expect(plan.draft.notes[0]).toBe(clean[0]);
  });

  it('censuses the whole draft, so a one-note selection still gets the deck spelling', () => {
    const draft = draftOf(notes);
    // n4 alone holds the minority `jlpt::n5`. Censusing the selection would
    // make that spelling its own majority and change nothing.
    const plan = planChangeTray(draft, createEditJournal(), ['n4'], [action]);
    expect(plan.draft.notes.find((n) => n.id === 'n4')?.tags).toContain('JLPT::N5');
    expect(plan.problems.some((p) => p.code === 'tag-normalize-renamed')).toBe(true);
  });
});
