// Recipe 13 — `ankiDeckSplit.ts`, the four axes and every refusal that keeps a
// card out of a deck it does not belong in.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MASTERY_SEGMENTS,
  deckSplitNewDecks,
  jlptLevelsFromTags,
  planDeckSplit,
  sanitizeDeckSegment,
  type DeckSplitInput,
} from '../ankiDeckSplit';
import type {
  AnkiDraftCard,
  AnkiDraftDeck,
  AnkiDraftNote,
  AnkiDraftNoteType,
} from '../ankiDraft';

function deck(id: string, name: string, filtered = false): AnkiDraftDeck {
  return { id, name, path: name.split('::'), filtered };
}

function note(id: string, tags: string[] = [], noteTypeId = 'nt1'): AnkiDraftNote {
  return {
    id,
    guid: `g${id}`,
    noteTypeId,
    tags,
    marked: false,
    fields: [],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
  };
}

function card(id: string, noteId: string, deckId: string, extra: Partial<AnkiDraftCard> = {}): AnkiDraftCard {
  return {
    id,
    noteId,
    deckId,
    ord: 0,
    type: 'new',
    queue: 'new',
    due: 0,
    interval: 0,
    easeFactor: 0,
    reps: 0,
    lapses: 0,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
    ...extra,
  };
}

function noteType(id: string, name: string): AnkiDraftNoteType {
  return { id, name, kind: 'standard', fields: [], templates: [], css: '' } as unknown as AnkiDraftNoteType;
}

const DECKS = [deck('1', 'Japanese'), deck('2', 'Japanese::Core'), deck('9', 'Other')];

function input(over: Partial<DeckSplitInput>): DeckSplitInput {
  return {
    noteIds: [],
    notes: [],
    cards: [],
    decks: DECKS,
    noteTypes: [noteType('nt1', 'Basic')],
    axis: 'jlpt',
    parentDeckId: '1',
    unmatched: 'leave',
    ...over,
  };
}

describe('jlptLevelsFromTags', () => {
  it('reads a level out of every spelling a real deck uses', () => {
    expect(jlptLevelsFromTags(['JLPT::N5'])).toEqual([5]);
    expect(jlptLevelsFromTags(['jlpt-n3'])).toEqual([3]);
    expect(jlptLevelsFromTags(['N1'])).toEqual([1]);
    expect(jlptLevelsFromTags(['2020_N4_list'])).toEqual([4]);
    expect(jlptLevelsFromTags(['ＪＬＰＴ::Ｎ２'])).toEqual([2]);
  });

  it('does not find a level inside a word that merely ends in one', () => {
    expect(jlptLevelsFromTags(['LESSON5'])).toEqual([]);
    expect(jlptLevelsFromTags(['unit::n6'])).toEqual([]);
    expect(jlptLevelsFromTags(['kanji'])).toEqual([]);
  });

  it('reports every distinct level, ascending', () => {
    expect(jlptLevelsFromTags(['JLPT::N5', 'jlpt::n2', 'JLPT::N5'])).toEqual([2, 5]);
  });
});

describe('sanitizeDeckSegment', () => {
  it('collapses a :: that would nest, and keeps a single colon', () => {
    expect(sanitizeDeckSegment('Core::Extra')).toBe('Core:Extra');
    expect(sanitizeDeckSegment('Vol 1: Verbs')).toBe('Vol 1: Verbs');
  });

  it('strips the 0x1f Anki nests schema-18 names on', () => {
    expect(sanitizeDeckSegment(`Core${String.fromCharCode(0x1f)}Extra`)).toBe('Core Extra');
  });
});

describe('planDeckSplit — refusals before anything moves', () => {
  it('refuses an empty selection, a missing parent and a filtered parent', () => {
    expect(planDeckSplit(input({ noteIds: [] })).problem).toBe('empty-selection');
    expect(planDeckSplit(input({ noteIds: ['n1'], parentDeckId: 'nope' })).problem).toBe(
      'no-such-parent',
    );
    expect(
      planDeckSplit(
        input({ noteIds: ['n1'], parentDeckId: 'f', decks: [...DECKS, deck('f', 'Custom', true)] }),
      ).problem,
    ).toBe('parent-filtered');
  });

  it('refuses frequency bands that are absent, unsorted or not positive integers', () => {
    const base = { noteIds: ['n1'], axis: 'frequency' as const };
    expect(planDeckSplit(input(base)).problem).toBe('invalid-bands');
    expect(planDeckSplit(input({ ...base, bands: [] })).problem).toBe('invalid-bands');
    expect(planDeckSplit(input({ ...base, bands: [5000, 1000] })).problem).toBe('invalid-bands');
    expect(planDeckSplit(input({ ...base, bands: [0] })).problem).toBe('invalid-bands');
    expect(planDeckSplit(input({ ...base, bands: [1.5] })).problem).toBe('invalid-bands');
  });

  it('refuses collect with no name for the deck it would collect into', () => {
    expect(
      planDeckSplit(input({ noteIds: ['n1'], unmatched: 'collect', unmatchedSegment: '  ' }))
        .problem,
    ).toBe('empty-unmatched-name');
  });
});

describe('planDeckSplit — the JLPT axis', () => {
  const notes = [
    note('n1', ['JLPT::N5']),
    note('n2', ['jlpt-n5']),
    note('n3', ['JLPT::N3']),
    note('n4', ['vocab']),
  ];
  const cards = [
    card('c1', 'n1', '1'),
    card('c2', 'n2', '1'),
    card('c3', 'n3', '1'),
    card('c4', 'n4', '1'),
  ];

  it('buckets N5 before N3 and leaves the untagged note where it is', () => {
    const plan = planDeckSplit(
      input({ noteIds: ['n1', 'n2', 'n3', 'n4'], notes, cards, axis: 'jlpt' }),
    );
    expect(plan.problem).toBeUndefined();
    expect(plan.targets.map((t) => t.segment)).toEqual(['N5', 'N3']);
    expect(plan.targets[0].cardIds).toEqual(['c1', 'c2']);
    expect(plan.targets[0].name).toBe('Japanese::N5');
    expect(plan.targets.every((t) => t.created)).toBe(true);
    expect(plan.unmatchedNoteIds).toEqual(['n4']);
    expect(plan.moves).toHaveLength(3);
    expect(plan.moves.every((m) => m.fromDeckId === '1')).toBe(true);
    expect(plan.considered).toBe(4);
    expect(plan.fromDeckCount).toBe(1);
  });

  it('collects the untagged note into the named deck when asked', () => {
    const plan = planDeckSplit(
      input({
        noteIds: ['n1', 'n4'],
        notes,
        cards,
        unmatched: 'collect',
        unmatchedSegment: 'Unsorted',
      }),
    );
    expect(plan.targets.map((t) => t.segment)).toEqual(['N5', 'Unsorted']);
    // Last, whatever it is called — the collected deck is not sorted by spelling.
    expect(plan.targets[1].unmatchedBucket).toBe(true);
    expect(plan.targets[1].cardIds).toEqual(['c4']);
    expect(plan.unmatchedNoteIds).toEqual(['n4']);
  });

  it('sorts the collected deck last even when its name would sort first', () => {
    const plan = planDeckSplit(
      input({
        noteIds: ['n1', 'n4'],
        notes,
        cards,
        unmatched: 'collect',
        unmatchedSegment: 'AAA',
      }),
    );
    expect(plan.targets.map((t) => t.segment)).toEqual(['N5', 'AAA']);
  });

  it('refuses a note tagged with two levels instead of picking one', () => {
    const conflicted = [note('n5', ['JLPT::N5', 'JLPT::N2'])];
    const plan = planDeckSplit(
      input({ noteIds: ['n5'], notes: conflicted, cards: [card('c5', 'n5', '1')] }),
    );
    expect(plan.refusals).toEqual([{ code: 'ambiguous-jlpt', noteIds: ['n5'], cardIds: [] }]);
    expect(plan.moves).toEqual([]);
    // Refused, therefore not *also* counted as having no level.
    expect(plan.unmatchedNoteIds).toEqual([]);
  });

  it('still refuses the ambiguous note when collect would otherwise sweep it up', () => {
    const conflicted = [note('n5', ['JLPT::N5', 'JLPT::N2'])];
    const plan = planDeckSplit(
      input({
        noteIds: ['n5'],
        notes: conflicted,
        cards: [card('c5', 'n5', '1')],
        unmatched: 'collect',
        unmatchedSegment: 'Unsorted',
      }),
    );
    expect(plan.refusals[0].code).toBe('ambiguous-jlpt');
    expect(plan.moves).toEqual([]);
    expect(plan.targets).toEqual([]);
  });
});

describe('planDeckSplit — scope and cards that must not move', () => {
  it('refuses a selected card sitting outside the deck being split', () => {
    const plan = planDeckSplit(
      input({
        noteIds: ['n1'],
        notes: [note('n1', ['JLPT::N5'])],
        cards: [card('c1', 'n1', '9')],
      }),
    );
    expect(plan.refusals).toEqual([
      { code: 'outside-parent', noteIds: ['n1'], cardIds: ['c1'] },
    ]);
    expect(plan.moves).toEqual([]);
  });

  it('takes a card in a subdeck of the parent, because the subtree is the scope', () => {
    const plan = planDeckSplit(
      input({
        noteIds: ['n1'],
        notes: [note('n1', ['JLPT::N5'])],
        cards: [card('c1', 'n1', '2')],
      }),
    );
    expect(plan.moves).toEqual([
      { cardId: 'c1', noteId: 'n1', fromDeckId: '2', toDeckId: 'split:1:N5' },
    ]);
  });

  it('does not treat a deck merely named with the parent as a prefix as inside it', () => {
    const decks = [deck('1', 'Japanese'), deck('7', 'Japanese Extra')];
    const plan = planDeckSplit(
      input({
        decks,
        noteIds: ['n1'],
        notes: [note('n1', ['JLPT::N5'])],
        cards: [card('c1', 'n1', '7')],
      }),
    );
    expect(plan.refusals[0].code).toBe('outside-parent');
  });

  it('never moves a card on loan to a filtered deck', () => {
    const decks = [...DECKS, deck('f', 'Custom Study', true)];
    const plan = planDeckSplit(
      input({
        decks: [deck('1', 'Japanese'), deck('f', 'Japanese::Custom Study', true), ...decks.slice(2)],
        noteIds: ['n1'],
        notes: [note('n1', ['JLPT::N5'])],
        cards: [card('c1', 'n1', 'f', { originalDeckId: '1' })],
      }),
    );
    expect(plan.refusals).toEqual([{ code: 'filtered-card', noteIds: ['n1'], cardIds: ['c1'] }]);
    expect(plan.moves).toEqual([]);
  });

  it('reports a selected note that generates no card rather than dropping it', () => {
    const plan = planDeckSplit(
      input({ noteIds: ['n1'], notes: [note('n1', ['JLPT::N5'])], cards: [] }),
    );
    expect(plan.refusals).toEqual([
      { code: 'note-without-cards', noteIds: ['n1'], cardIds: [] },
    ]);
  });

  it('files both of a note’s cards under one level rather than splitting siblings', () => {
    const plan = planDeckSplit(
      input({
        noteIds: ['n1'],
        notes: [note('n1', ['JLPT::N5'])],
        cards: [card('c1', 'n1', '1'), card('c2', 'n1', '2', { ord: 1 })],
      }),
    );
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0].cardIds).toEqual(['c1', 'c2']);
    expect(plan.fromDeckCount).toBe(2);
  });
});

describe('planDeckSplit — existing decks and idempotence', () => {
  it('reuses a subdeck that already exists instead of minting a second one', () => {
    const decks = [...DECKS, deck('5', 'Japanese::N5')];
    const plan = planDeckSplit(
      input({
        decks,
        noteIds: ['n1'],
        notes: [note('n1', ['JLPT::N5'])],
        cards: [card('c1', 'n1', '1')],
      }),
    );
    expect(plan.targets[0].deckId).toBe('5');
    expect(plan.targets[0].created).toBe(false);
    expect(deckSplitNewDecks(plan)).toEqual([]);
    expect(plan.moves[0].toDeckId).toBe('5');
  });

  it('moves nothing the second time: a card already in its target is unchanged', () => {
    const decks = [...DECKS, deck('5', 'Japanese::N5')];
    const plan = planDeckSplit(
      input({
        decks,
        noteIds: ['n1'],
        notes: [note('n1', ['JLPT::N5'])],
        cards: [card('c1', 'n1', '5')],
      }),
    );
    expect(plan.moves).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.targets[0].cardIds).toEqual(['c1']);
  });

  it('writes the parent’s own separator into a schema-18 name', () => {
    const decks = [deck('1', `Japanese${String.fromCharCode(0x1f)}Core`)];
    const plan = planDeckSplit(
      input({
        decks,
        parentDeckId: '1',
        noteIds: ['n1'],
        notes: [note('n1', ['JLPT::N5'])],
        cards: [card('c1', 'n1', '1')],
      }),
    );
    expect(plan.targets[0].name).toBe(`Japanese${String.fromCharCode(0x1f)}Core${String.fromCharCode(0x1f)}N5`);
  });
});

describe('planDeckSplit — the frequency axis', () => {
  const notes = [note('n1'), note('n2'), note('n3'), note('n4')];
  const cards = [
    card('c1', 'n1', '1'),
    card('c2', 'n2', '1'),
    card('c3', 'n3', '1'),
    card('c4', 'n4', '1'),
  ];
  const ranks = new Map<string, number | null>([
    ['n1', 1],
    ['n2', 1000],
    ['n3', 1001],
    ['n4', null],
  ]);

  it('names each band by its own edges and puts the tail in an open one', () => {
    const plan = planDeckSplit(
      input({
        axis: 'frequency',
        bands: [1000, 5000],
        rankByNote: ranks,
        noteIds: ['n1', 'n2', 'n3', 'n4'],
        notes,
        cards,
      }),
    );
    expect(plan.targets.map((t) => t.segment)).toEqual(['1-1000', '1001-5000']);
    expect(plan.targets[0].noteIds).toEqual(['n1', 'n2']);
    expect(plan.targets[1].noteIds).toEqual(['n3']);
    expect(plan.unmatchedNoteIds).toEqual(['n4']);
  });

  it('opens the last band when a rank is past every edge', () => {
    const plan = planDeckSplit(
      input({
        axis: 'frequency',
        bands: [1000],
        rankByNote: new Map([['n1', 99999]]),
        noteIds: ['n1'],
        notes,
        cards,
      }),
    );
    expect(plan.targets.map((t) => t.segment)).toEqual(['1001+']);
  });

  it('treats an unranked word as unranked, never as the rarest band', () => {
    const plan = planDeckSplit(
      input({
        axis: 'frequency',
        bands: [1000],
        rankByNote: new Map<string, number | null>([['n4', null]]),
        noteIds: ['n4'],
        notes,
        cards,
      }),
    );
    expect(plan.targets).toEqual([]);
    expect(plan.unmatchedNoteIds).toEqual(['n4']);
  });
});

describe('planDeckSplit — the source and mastery axes', () => {
  it('splits by note type name, which is the only per-note origin a package carries', () => {
    const plan = planDeckSplit(
      input({
        axis: 'source',
        noteTypes: [noteType('nt1', 'Core 2k'), noteType('nt2', 'Mined::Anime')],
        noteIds: ['n1', 'n2'],
        notes: [note('n1', [], 'nt1'), note('n2', [], 'nt2')],
        cards: [card('c1', 'n1', '1'), card('c2', 'n2', '1')],
      }),
    );
    expect(plan.targets.map((t) => t.segment)).toEqual(['Core 2k', 'Mined:Anime']);
    expect(plan.targets[1].name).toBe('Japanese::Mined:Anime');
  });

  it('leaves a note whose note type the package never declared unmatched', () => {
    const plan = planDeckSplit(
      input({
        axis: 'source',
        noteIds: ['n1'],
        notes: [note('n1', [], 'gone')],
        cards: [card('c1', 'n1', '1')],
      }),
    );
    expect(plan.targets).toEqual([]);
    expect(plan.unmatchedNoteIds).toEqual(['n1']);
  });

  it('splits by mastery rung and keeps a never-judged word out of New', () => {
    const plan = planDeckSplit(
      input({
        axis: 'mastery',
        masteryByNote: new Map([
          ['n1', 0 as const],
          ['n2', 3 as const],
        ]),
        noteIds: ['n1', 'n2', 'n3'],
        notes: [note('n1'), note('n2'), note('n3')],
        cards: [card('c1', 'n1', '1'), card('c2', 'n2', '1'), card('c3', 'n3', '1')],
      }),
    );
    expect(plan.targets.map((t) => t.segment)).toEqual([
      DEFAULT_MASTERY_SEGMENTS[0],
      DEFAULT_MASTERY_SEGMENTS[3],
    ]);
    expect(plan.unmatchedNoteIds).toEqual(['n3']);
  });

  it('uses the caller’s translated rung names when it passes them', () => {
    const plan = planDeckSplit(
      input({
        axis: 'mastery',
        masterySegments: { 0: '新規', 1: '学習中', 2: '見覚え', 3: '既知' },
        masteryByNote: new Map([['n1', 3 as const]]),
        noteIds: ['n1'],
        notes: [note('n1')],
        cards: [card('c1', 'n1', '1')],
      }),
    );
    expect(plan.targets[0].name).toBe('Japanese::既知');
  });
});
