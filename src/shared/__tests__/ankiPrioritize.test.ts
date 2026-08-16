// Prioritizing high-frequency unknowns — ANKI_DECK_WORKBENCH_PLAN.md Phase 4,
// recipe 6.
//
// The load-bearing test here is not the ordering, it is the negative control:
// a word the user already knows must appear in NO op and its card must come out
// byte-identical. That is the recipe's title and the thing that makes it safe to
// run on a deck in daily use, so it is asserted on the card object itself and
// not only on a count.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIORITIZE_START,
  planPrioritizeNew,
  type PrioritizeRefusal,
} from '../ankiPrioritize';
import {
  PRIORITIZE_PROBLEM_CODES,
  planChangeTray,
  type TrayAction,
} from '../ankiChangeTray';
import { buildVocabContext } from '../ankiVocabContext';
import {
  collapsePlainText,
  createEditJournal,
  redoLastEdit,
  undoLastEdit,
} from '../ankiDraftEdit';
import type {
  AnkiDraft,
  AnkiDraftCard,
  AnkiCardType,
  AnkiDraftNote,
} from '../ankiDraft';

function noteOf(id: string, expression: string): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Expression', raw: expression, normalized: expression },
      { ord: 1, name: 'Meaning', raw: 'gloss', normalized: 'gloss' },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [],
    media: [],
  };
}

function cardOf(
  id: string,
  noteId: string,
  due: number,
  type: AnkiCardType = 'new',
  ord = 0,
): AnkiDraftCard {
  return {
    id,
    noteId,
    deckId: 'd1',
    ord,
    type,
    queue: type === 'new' ? 'new' : 'review',
    due,
    interval: type === 'new' ? 0 : 30,
    easeFactor: type === 'new' ? 0 : 2500,
    reps: type === 'new' ? 0 : 9,
    lapses: 0,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
  };
}

function draftOf(notes: AnkiDraftNote[], cards: AnkiDraftCard[]): AnkiDraft {
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
        fields: [
          { ord: 0, name: 'Expression', sticky: false, rtl: false },
          { ord: 1, name: 'Meaning', sticky: false, rtl: false },
        ],
        templates: [],
        sortFieldOrd: 0,
      },
    ],
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

// 猫 rank 200 unknown, 犬 rank 50 unknown, 食べる rank 10 but KNOWN, 燦然 unranked,
// 水 rank 5, still unknown (5-day interval is under the 21-day mature bar) but
// its card has already left the new queue, so a position would not apply to it.
const notes = [
  noteOf('n-neko', '猫'),
  noteOf('n-inu', '犬'),
  noteOf('n-taberu', '食べる'),
  noteOf('n-sanzen', '燦然'),
  noteOf('n-mizu', '水'),
];
const cards = [
  cardOf('c-neko', 'n-neko', 700),
  cardOf('c-inu', 'n-inu', 701),
  cardOf('c-taberu', 'n-taberu', 702),
  cardOf('c-sanzen', 'n-sanzen', 703),
  { ...cardOf('c-mizu', 'n-mizu', 44, 'review'), interval: 5 },
];
const ranks = new Map<string, number | null>([
  ['猫', 200],
  ['犬', 50],
  ['食べる', 10],
  ['燦然', null],
  ['水', 5],
]);
const localLevels = new Map<string, number>([['食べる', 3]]);
const vocab = buildVocabContext({ notes, noteTypes: draftOf(notes, cards).noteTypes, cards, ranks, localLevels });
const draft = draftOf(notes, cards);
const allIds = notes.map((n) => n.id);

const prioritizeAction = (
  over: Partial<Extract<TrayAction, { kind: 'prioritize-new' }>> = {},
): TrayAction => ({
  id: 'a1',
  enabled: true,
  kind: 'prioritize-new',
  startPosition: 0,
  ...over,
});

describe('planPrioritizeNew', () => {
  it('orders the unknown ranked words most frequent first', () => {
    const plan = planPrioritizeNew({ notes, cards, vocab, startPosition: 0 });
    expect(plan.moves.map((m) => [m.term, m.after])).toEqual([
      ['犬', 0],
      ['猫', 1],
    ]);
    expect(plan.changedCards).toBe(2);
  });

  it('never touches a card whose word the user already knows', () => {
    // The negative control the whole recipe rests on. 食べる is rank 10 — the
    // most frequent unknown-looking word in the set — so a broken filter puts
    // it first, which is the loudest possible failure.
    const plan = planPrioritizeNew({ notes, cards, vocab, startPosition: 0 });
    expect(plan.moves.some((m) => m.noteId === 'n-taberu')).toBe(false);
    expect(plan.skips).toContainEqual({ noteId: 'n-taberu', refusal: 'known', term: '食べる' });
  });

  it('keeps every other reason for skipping apart', () => {
    const plan = planPrioritizeNew({ notes, cards, vocab, startPosition: 0 });
    const byNote = new Map(plan.skips.map((s) => [s.noteId, s.refusal] as const));
    expect(byNote.get('n-sanzen')).toBe('no-rank');
    expect(byNote.get('n-mizu')).toBe('not-new');
  });

  it('reports a note with no card and a note with no word separately', () => {
    const orphan = noteOf('n-orphan', '林檎');
    const prose = noteOf('n-prose', '');
    const localNotes = [...notes, orphan, prose];
    const localVocab = buildVocabContext({
      notes: localNotes,
      noteTypes: draft.noteTypes,
      cards,
      ranks: new Map([...ranks, ['林檎', 900]]),
      localLevels,
    });
    const plan = planPrioritizeNew({ notes: localNotes, cards, vocab: localVocab, startPosition: 0 });
    const byNote = new Map(plan.skips.map((s) => [s.noteId, s.refusal] as const));
    expect(byNote.get('n-orphan')).toBe('no-cards');
    expect(byNote.get('n-prose')).toBe('no-word');
  });

  it('starts where it is told, and treats a missing start as position 0', () => {
    const from500 = planPrioritizeNew({ notes, cards, vocab, startPosition: 500 });
    expect(from500.moves.map((m) => m.after)).toEqual([500, 501]);
    const noStart = planPrioritizeNew({ notes, cards, vocab });
    expect(noStart.moves[0].after).toBe(DEFAULT_PRIORITIZE_START);
  });

  it('counts a card that already sits where it would be moved as unchanged', () => {
    // 犬 is rank 50 and would take position 0. Give it 0 already: it is still a
    // move in the list (the ordering did include it) and must not be an op.
    const settled = cards.map((c) => (c.id === 'c-inu' ? { ...c, due: 0 } : c));
    const plan = planPrioritizeNew({ notes, cards: settled, vocab, startPosition: 0 });
    expect(plan.moves).toHaveLength(2);
    expect(plan.changedCards).toBe(1);
  });

  it('keeps a note’s siblings together and in template order', () => {
    const twoCards = [
      cardOf('c-neko-1', 'n-neko', 700, 'new', 1),
      cardOf('c-neko-0', 'n-neko', 700, 'new', 0),
      cardOf('c-inu-1', 'n-inu', 701, 'new', 1),
      cardOf('c-inu-0', 'n-inu', 701, 'new', 0),
    ];
    const sameRank = new Map<string, number | null>([['猫', 50], ['犬', 50]]);
    const pair = [notes[0], notes[1]];
    const localVocab = buildVocabContext({
      notes: pair,
      noteTypes: draft.noteTypes,
      cards: twoCards,
      ranks: sameRank,
    });
    const plan = planPrioritizeNew({ notes: pair, cards: twoCards, vocab: localVocab, startPosition: 0 });
    expect(plan.moves.map((m) => m.cardId)).toEqual(['c-inu-0', 'c-inu-1', 'c-neko-0', 'c-neko-1']);
  });
});

describe('the prioritize-new tray action', () => {
  it('refuses the whole plan without a vocabulary context', () => {
    const plan = planChangeTray(draft, createEditJournal(), allIds, [prioritizeAction()]);
    expect(plan.blocked).toBe(true);
    expect(plan.problems.map((p) => p.code)).toContain('no-vocab-context');
    expect(plan.draft).toBe(draft);
  });

  it('refuses a negative start position rather than wrapping it', () => {
    const plan = planChangeTray(
      draft,
      createEditJournal(),
      allIds,
      [prioritizeAction({ startPosition: -1 })],
      { prioritize: { vocab } },
    );
    expect(plan.blocked).toBe(true);
    expect(plan.problems.map((p) => p.code)).toContain('empty-parameter');
  });

  it('writes the new positions into the draft and leaves the known card alone', () => {
    const plan = planChangeTray(draft, createEditJournal(), allIds, [prioritizeAction()], {
      prioritize: { vocab },
    });
    expect(plan.blocked).toBe(false);
    expect(plan.changedCards).toBe(2);
    // Notes are untouched — a reposition is card data, and a caller that gated
    // Apply on changedNotes alone would call this a no-op.
    expect(plan.changedNotes).toBe(0);
    const after = new Map(plan.draft.cards.map((c) => [c.id, c.due]));
    expect(after.get('c-inu')).toBe(0);
    expect(after.get('c-neko')).toBe(1);
    // Byte-identical, not merely equal-due: the known card is the same object.
    expect(plan.draft.cards.find((c) => c.id === 'c-taberu')).toBe(
      draft.cards.find((c) => c.id === 'c-taberu'),
    );
    expect(plan.draft.cards.find((c) => c.id === 'c-mizu')?.due).toBe(44);
  });

  it('names every refusal with its own code, not one generic skip', () => {
    const plan = planChangeTray(draft, createEditJournal(), allIds, [prioritizeAction()], {
      prioritize: { vocab },
    });
    const codes = plan.problems.map((p) => p.code);
    expect(codes).toContain('prioritize-known');
    expect(codes).toContain('prioritize-no-rank');
    expect(codes).toContain('prioritize-not-new');
    expect(plan.problems.find((p) => p.code === 'prioritize-known')?.detail).toBe('食べる');
    // "You already know it" is the recipe working, so it is info, not a warning.
    expect(plan.problems.find((p) => p.code === 'prioritize-known')?.severity).toBe('info');
    expect(plan.outcomes[0]).toMatchObject({ matched: 5, changed: 2, skipped: 3 });
  });

  it('maps every refusal the planner can emit', () => {
    // The table is enumerable precisely so a new refusal cannot reach the user
    // as `undefined` the way a ternary chain let one reach it as the wrong code.
    const emitted: PrioritizeRefusal[] = ['known', 'no-rank', 'no-word', 'not-new', 'no-cards'];
    expect(PRIORITIZE_PROBLEM_CODES.map(([refusal]) => refusal).sort()).toEqual([...emitted].sort());
    for (const [, code] of PRIORITIZE_PROBLEM_CODES) expect(code.startsWith('prioritize-')).toBe(true);
  });

  it('undoes the whole reposition as one step and redoes it', () => {
    const plan = planChangeTray(draft, createEditJournal(), allIds, [prioritizeAction()], {
      prioritize: { vocab },
    });
    const undone = undoLastEdit(plan.draft, plan.journal, collapsePlainText);
    expect(undone.changed).toBe(true);
    expect(undone.journal.done).toHaveLength(0);
    const back = new Map(undone.draft.cards.map((c) => [c.id, c.due]));
    expect(back.get('c-inu')).toBe(701);
    expect(back.get('c-neko')).toBe(700);
    const redone = redoLastEdit(undone.draft, undone.journal, collapsePlainText);
    const again = new Map(redone.draft.cards.map((c) => [c.id, c.due]));
    expect(again.get('c-inu')).toBe(0);
    expect(again.get('c-neko')).toBe(1);
  });
});
