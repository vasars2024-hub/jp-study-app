// Recipe 12's deck half — `ankiDeckNormalize.ts` and the reversible `deck-name`
// op in `ankiDraftEdit.ts`.

import { describe, expect, it } from 'vitest';
import {
  DECK_NORMALIZE_ORDER,
  planDeckNormalize,
  type DeckNormalizeOp,
} from '../ankiDeckNormalize';
import {
  createEditJournal,
  relinkDeckParents,
  renameDraftDeck,
  redoLastEdit,
  undoLastEdit,
  editedNoteIds,
  noteIsEdited,
} from '../ankiDraftEdit';
import { planChangeTray, type TrayAction } from '../ankiChangeTray';
import type { AnkiDraft, AnkiDraftDeck } from '../ankiDraft';
import { stripFieldHtml } from '../apkgParse';

const ALL: DeckNormalizeOp[] = [...DECK_NORMALIZE_ORDER];

function deck(id: string, name: string, filtered = false): AnkiDraftDeck {
  return { id, name, path: name.split('::'), filtered };
}

function draftWith(decks: AnkiDraftDeck[]): AnkiDraft {
  return {
    source: {
      kind: 'apkg',
      label: 'test',
      plainText: false,
      createdAtSec: 0,
    },
    decks,
    noteTypes: [],
    notes: [],
    cards: [],
    reviews: [],
    diagnostics: [],
    counts: { decks: decks.length, noteTypes: 0, notes: 0, cards: 0, reviews: 0 },
  } as unknown as AnkiDraft;
}

describe('planDeckNormalize', () => {
  it('repairs :: paths without touching a name that is already clean', () => {
    const plan = planDeckNormalize({
      decks: [deck('1', 'Japanese::::Core'), deck('2', '::Grammar::'), deck('3', 'Japanese::Core')],
      ops: ['trim-separators'],
    });
    expect(plan.renames).toEqual([
      { deckId: '2', from: '::Grammar::', to: 'Grammar' },
      // deck 1 would have become `Japanese::Core`, which deck 3 already holds.
    ]);
    expect(plan.collisions).toEqual([
      { deckId: '1', from: 'Japanese::::Core', to: 'Japanese::Core', heldByDeckId: '3' },
    ]);
    expect(plan.unchanged).toBe(1);
    expect(plan.considered).toBe(3);
  });

  it('takes the casing the deck itself uses most, never lowercase', () => {
    const plan = planDeckNormalize({
      decks: [
        deck('1', 'JLPT::N5'),
        deck('2', 'JLPT::N4'),
        deck('3', 'jlpt::N3'),
      ],
      ops: ['unify-case'],
    });
    expect(plan.renames).toEqual([{ deckId: '3', from: 'jlpt::N3', to: 'JLPT::N3' }]);
    expect(plan.unchanged).toBe(2);
  });

  it('folds fullwidth ASCII per segment', () => {
    const plan = planDeckNormalize({
      decks: [deck('1', 'ＪＬＰＴ::Ｎ５')],
      ops: ['ascii-width'],
    });
    expect(plan.renames).toEqual([{ deckId: '1', from: 'ＪＬＰＴ::Ｎ５', to: 'JLPT::N5' }]);
  });

  it('never drops a parent deck the way the tag half drops a parent tag', () => {
    // `JLPT` beside `JLPT::N5` is a redundant *tag* and a real *deck*.
    const plan = planDeckNormalize({
      decks: [deck('1', 'JLPT'), deck('2', 'JLPT::N5')],
      ops: ALL,
    });
    expect(plan.renames).toEqual([]);
    expect(plan.unchanged).toBe(2);
  });

  it('refuses a merge by name and keeps the other renames', () => {
    const plan = planDeckNormalize({
      decks: [deck('1', 'JLPT::N5'), deck('2', 'jlpt::n5'), deck('3', 'ｇｒａｍｍａｒ')],
      ops: ALL,
    });
    expect(plan.collisions).toEqual([
      { deckId: '2', from: 'jlpt::n5', to: 'JLPT::N5', heldByDeckId: '1' },
    ]);
    expect(plan.renames).toEqual([{ deckId: '3', from: 'ｇｒａｍｍａｒ', to: 'grammar' }]);
  });

  it('leaves a filtered deck alone and keeps it out of the census', () => {
    const plan = planDeckNormalize({
      decks: [
        deck('1', 'JLPT::N5'),
        deck('2', 'jlpt', true),
        deck('3', 'jlpt::N4'),
        deck('4', 'jlpt::N3'),
      ],
      ops: ['unify-case'],
    });
    // Two `jlpt` votes against one `JLPT` — but the filtered deck does not vote,
    // so the two renameable `jlpt`s win and `JLPT::N5` is the one that moves.
    expect(plan.renames).toEqual([{ deckId: '1', from: 'JLPT::N5', to: 'jlpt::N5' }]);
    expect(plan.filteredSkipped).toBe(1);
    expect(plan.considered).toBe(3);
  });

  it('will not rename a deck to nothing', () => {
    const plan = planDeckNormalize({ decks: [deck('1', '::::')], ops: ['trim-separators'] });
    expect(plan.renames).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it('reads a schema-18 0x1f name as a path and writes it back the same way', () => {
    const plan = planDeckNormalize({
      decks: [deck('1', 'JLPT\x1fN5'), deck('2', 'jlpt\x1fＮ４')],
      ops: ALL,
    });
    // `jlpt` loses the census to `JLPT`, and the fullwidth Ｎ４ folds — both of
    // which need the 0x1f to have been understood as a separator.
    expect(plan.renames).toEqual([{ deckId: '2', from: 'jlpt\x1fＮ４', to: 'JLPT\x1fN4' }]);
  });

  it('judges a collision on the deck path, not on the byte that separates it', () => {
    const plan = planDeckNormalize({
      decks: [deck('1', 'JLPT::N5'), deck('2', 'jlpt\x1fn5')],
      ops: ALL,
    });
    expect(plan.renames).toEqual([]);
    expect(plan.collisions).toEqual([
      { deckId: '2', from: 'jlpt\x1fn5', to: 'JLPT\x1fN5', heldByDeckId: '1' },
    ]);
  });

  it('runs the ops in the forced order whatever order they arrive in', () => {
    const reversed = planDeckNormalize({
      decks: [deck('1', '::ＪＬＰＴ::'), deck('2', 'JLPT')],
      ops: ['unify-case', 'ascii-width', 'trim-separators'],
    });
    // Only trim-then-fold-then-census reaches `JLPT`, and then it collides.
    expect(reversed.collisions).toEqual([
      { deckId: '1', from: '::ＪＬＰＴ::', to: 'JLPT', heldByDeckId: '2' },
    ]);
  });
});

describe('renameDraftDeck', () => {
  const normalize = stripFieldHtml;

  it('renames, relinks the tree, and undoes to the byte-identical name', () => {
    // `Japanese ` with a trailing space is a different deck name from `Japanese`,
    // so the child starts orphaned — this is the case the relink exists for.
    const draft = draftWith(
      relinkDeckParents([deck('1', 'Japanese '), deck('2', 'Japanese::Core')]),
    );
    expect(draft.decks[1].parentId).toBeUndefined();

    const renamed = renameDraftDeck(draft, createEditJournal(), '1', 'Japanese');
    expect(renamed.changed).toBe(true);
    expect(renamed.draft.decks[0].name).toBe('Japanese');
    expect(renamed.draft.decks[0].path).toEqual(['Japanese']);
    // The rename gave the child a parent it did not have a moment ago.
    expect(renamed.draft.decks[1].parentId).toBe('1');

    const back = undoLastEdit(renamed.draft, renamed.journal, normalize);
    expect(back.draft.decks[0].name).toBe('Japanese ');
    expect(back.draft.decks[1].parentId).toBeUndefined();
    const again = redoLastEdit(back.draft, back.journal, normalize);
    expect(again.draft.decks[0].name).toBe('Japanese');
    expect(again.draft.decks[1].parentId).toBe('1');
  });

  it('refuses a rename onto a name another deck holds', () => {
    const draft = draftWith([deck('1', 'JLPT'), deck('2', 'jlpt')]);
    const out = renameDraftDeck(draft, createEditJournal(), '2', 'JLPT');
    expect(out.changed).toBe(false);
    expect(out.reason).toBe('duplicate-deck-name');
    expect(out.draft).toBe(draft);
  });

  it('refuses an empty name, an unknown deck, and a no-op', () => {
    const draft = draftWith([deck('1', 'JLPT')]);
    const journal = createEditJournal();
    expect(renameDraftDeck(draft, journal, '1', '   ').reason).toBe('empty-deck-name');
    expect(renameDraftDeck(draft, journal, '9', 'x').reason).toBe('no-such-deck');
    expect(renameDraftDeck(draft, journal, '1', 'JLPT').reason).toBe('unchanged');
    // A refusal writes nothing to the journal, so Undo stays where it was.
    expect(journal.done).toHaveLength(0);
  });

  it('marks no note as edited — a deck rename belongs to no note', () => {
    const draft = draftWith([deck('1', 'JLPT')]);
    const out = renameDraftDeck(draft, createEditJournal(), '1', 'jlpt');
    expect(out.journal.done).toHaveLength(1);
    expect(editedNoteIds(out.journal)).toEqual([]);
    expect(noteIsEdited(out.journal, 'any-note')).toBe(false);
  });
});

describe('the normalize-decks tray action', () => {
  const action: TrayAction = { id: 'a1', enabled: true, kind: 'normalize-decks', ops: ALL };

  function withDecks(decks: AnkiDraftDeck[]): AnkiDraft {
    const d = draftWith(relinkDeckParents(decks));
    return {
      ...d,
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
    } as AnkiDraft;
  }

  it('renames whole-draft on an empty selection, and one undo puts every name back', () => {
    const draft = withDecks([
      deck('1', 'JLPT::N5'),
      deck('2', 'jlpt::N4'),
      deck('3', 'ＪＬＰＴ::N3'),
      deck('4', '::Grammar::'),
    ]);
    // No notes selected at all: a deck is not part of a selection.
    const plan = planChangeTray(draft, createEditJournal(), [], [action]);
    expect(plan.blocked).toBe(false);
    expect(plan.changedNotes).toBe(0);
    expect(plan.deckNormalize?.renames).toHaveLength(3);
    expect(plan.draft.decks.map((d) => d.name)).toEqual([
      'JLPT::N5',
      'JLPT::N4',
      'JLPT::N3',
      'Grammar',
    ]);
    // The tree follows the names: N3/N4 are now under the same parent as N5.
    expect(plan.draft.decks[1].parentId).toBeUndefined();
    expect(plan.problems.find((p) => p.code === 'deck-normalize-renamed')?.count).toBe(3);

    const back = undoLastEdit(plan.draft, plan.journal, stripFieldHtml);
    expect(back.draft.decks.map((d) => d.name)).toEqual([
      'JLPT::N5',
      'jlpt::N4',
      'ＪＬＰＴ::N3',
      '::Grammar::',
    ]);
  });

  it('names a refused merge as a warning and still runs the renames beside it', () => {
    const draft = withDecks([deck('1', 'JLPT::N5'), deck('2', 'jlpt::n5'), deck('3', 'ｇｒａｍｍａｒ')]);
    const plan = planChangeTray(draft, createEditJournal(), [], [action]);
    const refused = plan.problems.find((p) => p.code === 'deck-normalize-merge-refused');
    expect(refused?.severity).toBe('warning');
    expect(refused?.detail).toBe('jlpt::n5 -> JLPT::N5');
    expect(plan.draft.decks.map((d) => d.name)).toEqual(['JLPT::N5', 'jlpt::n5', 'grammar']);
  });

  it('refuses a run with no op chosen instead of normalising with a default set', () => {
    const plan = planChangeTray(withDecks([deck('1', 'jlpt')]), createEditJournal(), [], [
      { ...action, ops: [] },
    ]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.some((p) => p.code === 'empty-parameter' && p.severity === 'blocking')).toBe(
      true,
    );
  });

  it('says so when there was nothing to tidy, and returns the input draft', () => {
    const decks = [deck('1', 'JLPT::N5'), deck('2', 'JLPT::N4')];
    const draft = withDecks(decks);
    const plan = planChangeTray(draft, createEditJournal(), [], [action]);
    expect(plan.problems.find((p) => p.code === 'deck-normalize-clean')?.count).toBe(2);
    expect(plan.draft).toBe(draft);
  });

  it('reports the filtered decks it left alone rather than dropping them silently', () => {
    const draft = withDecks([deck('1', 'JLPT::N5'), deck('2', 'jlpt::n4', true)]);
    const plan = planChangeTray(draft, createEditJournal(), [], [action]);
    expect(plan.problems.find((p) => p.code === 'deck-normalize-filtered')?.count).toBe(1);
    expect(plan.draft.decks[1].name).toBe('jlpt::n4');
  });
});

describe('relinkDeckParents', () => {
  it('splits on 0x1f as well as ::, the way a draft was read', () => {
    const [parent, child] = relinkDeckParents([
      deck('1', 'Japanese'),
      { id: '2', name: 'Japanese\x1fCore', path: [], filtered: false },
    ]);
    expect(parent.path).toEqual(['Japanese']);
    expect(child.path).toEqual(['Japanese', 'Core']);
    expect(child.parentId).toBe('1');
  });
});
