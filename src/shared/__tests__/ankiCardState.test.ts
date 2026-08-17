/**
 * Acceptance gate 5's three missing capabilities — flags, suspension and
 * interval/ease — from the draft edit down to the net change set.
 *
 * The gate reads "batch-edit tags, flags, deck, suspension, due date,
 * interval/ease … then reread Anki and prove the resulting state". Tags, deck
 * and due date were already journal-backed; these three were `journalOp: null`
 * and therefore unwritable BY CONSTRUCTION, because `buildApkgExportChanges`
 * folds `journal.done` and nothing else. So the claim under test here is not
 * "the setter works" — it is that each capability now reaches the change set,
 * folds like every other op, and comes back out again on undo.
 *
 * Every writable assertion is paired with the state that must NOT be written:
 * a scheduling edit on a new card, an unsuspend with no queue to return to, a
 * value set and set back again.
 */
import { describe, expect, it } from 'vitest';
import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote } from '../ankiDraft';
import { decodeCardFlag, encodeCardFlag, encodeCardQueue } from '../ankiDraft';
import {
  createEditJournal,
  editedNoteIds,
  redoLastEdit,
  restoredQueue,
  setCardFlag,
  setCardScheduling,
  setCardSuspended,
  undoLastEdit,
  type AnkiDraftEditJournal,
} from '../ankiDraftEdit';
import { buildApkgExportChanges, exportChangesEmpty } from '../ankiApkgExport';
import { buildWorkbenchReview } from '../ankiWorkbenchReview';
import { stripFieldHtml } from '../apkgParse';

const normalize = stripFieldHtml;

function note(id: string): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Front', raw: '猫', normalized: '猫' },
      { ord: 1, name: 'Back', raw: 'cat', normalized: 'cat' },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`c-${id}`],
    media: [],
  } as unknown as AnkiDraftNote;
}

function card(over: Partial<AnkiDraftCard> & { id: string; noteId: string }): AnkiDraftCard {
  return {
    deckId: 'd1',
    ord: 0,
    type: 'review',
    queue: 'review',
    due: 100,
    interval: 10,
    easeFactor: 2300,
    reps: 4,
    lapses: 1,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
    ...over,
  } as AnkiDraftCard;
}

function draftOf(cards: AnkiDraftCard[]): AnkiDraft {
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
    ],
    notes: [note('1001')],
    cards,
    diagnostics: [],
    counts: {
      notes: 1,
      cards: cards.length,
      decks: 1,
      noteTypes: 1,
      reviews: 0,
      mediaReferences: 0,
    },
  } as unknown as AnkiDraft;
}

const J = (): AnkiDraftEditJournal => createEditJournal();

describe('a card flag is an edit, and its inverse is exact', () => {
  it('journals the colour it replaced', () => {
    const draft = draftOf([card({ id: '5001', noteId: '1001', flag: 'blue' })]);
    const out = setCardFlag(draft, J(), '5001', 'red');
    expect(out.changed).toBe(true);
    expect(out.draft.cards[0].flag).toBe('red');
    expect(out.journal.done).toEqual([
      { kind: 'card-flag', noteId: '1001', cardId: '5001', before: 'blue', after: 'red' },
    ]);
    // The Browser's edited badge reads this, so a card op has to attribute.
    expect(editedNoteIds(out.journal)).toEqual(['1001']);
  });

  it('refuses the two states that are not edits', () => {
    const draft = draftOf([card({ id: '5001', noteId: '1001', flag: 'red' })]);
    expect(setCardFlag(draft, J(), '5001', 'red').reason).toBe('unchanged');
    expect(setCardFlag(draft, J(), 'nope', 'red').reason).toBe('no-such-card');
  });

  it('undo restores the colour and redo puts it back', () => {
    const draft = draftOf([card({ id: '5001', noteId: '1001', flag: 'none' })]);
    const set = setCardFlag(draft, J(), '5001', 'turquoise');
    const undone = undoLastEdit(set.draft, set.journal, normalize);
    expect(undone.draft.cards[0].flag).toBe('none');
    const redone = redoLastEdit(undone.draft, undone.journal, normalize);
    expect(redone.draft.cards[0].flag).toBe('turquoise');
  });

  it('encodes into the low three bits and leaves the reserved ones alone', () => {
    // The whole reason the live commit refuses this capability: the draft holds
    // the colour and nothing else, so only a writer with the stored column in
    // front of it can set one without clearing what it never read.
    const stored = 0b1011_0010; // reserved bits set, colour = 2 (orange)
    expect(decodeCardFlag(stored)).toBe('orange');
    const written = encodeCardFlag('purple', stored);
    expect(decodeCardFlag(written)).toBe('purple');
    expect(written & ~0b111).toBe(stored & ~0b111);
  });
});

describe('suspension is the only queue change offered, and it says so', () => {
  it('suspends a review card and journals the queue it left', () => {
    const draft = draftOf([card({ id: '5001', noteId: '1001' })]);
    const out = setCardSuspended(draft, J(), '5001', true);
    expect(out.changed).toBe(true);
    expect(out.draft.cards[0].queue).toBe('suspended');
    expect(out.journal.done[0]).toMatchObject({ kind: 'card-queue', before: 'review', after: 'suspended' });
  });

  it('restores the queue Anki would recompute, per card type', () => {
    expect(restoredQueue(card({ id: 'a', noteId: '1001', type: 'new' }))).toBe('new');
    expect(restoredQueue(card({ id: 'b', noteId: '1001', type: 'review' }))).toBe('review');
    // `due` is an epoch second for an intraday learning card and a day number
    // for a day-learn one; 10^9 cannot be a day number and cannot not be a
    // second, so it is the boundary rather than a tuned constant.
    expect(restoredQueue(card({ id: 'c', noteId: '1001', type: 'learning', due: 1_700_000_000 }))).toBe(
      'learning',
    );
    expect(restoredQueue(card({ id: 'd', noteId: '1001', type: 'relearning', due: 400 }))).toBe('day-learn');
  });

  it('REFUSES to unsuspend a card whose type did not decode, rather than guessing', () => {
    // The negative control for the restore rule above. Defaulting to queue 0
    // would file the card as new — a scheduling change nobody asked for.
    const draft = draftOf([card({ id: '5001', noteId: '1001', type: 'unknown', queue: 'suspended' })]);
    const out = setCardSuspended(draft, J(), '5001', false);
    expect(out.changed).toBe(false);
    expect(out.reason).toBe('unknown-card-state');
    expect(out.journal.done).toHaveLength(0);
  });

  it('treats a buried card as unsuspended, so suspending one is a real edit', () => {
    const draft = draftOf([card({ id: '5001', noteId: '1001', queue: 'buried-user' })]);
    const out = setCardSuspended(draft, J(), '5001', true);
    expect(out.draft.cards[0].queue).toBe('suspended');
    // …and undoing it returns the bury, because the op carries it verbatim
    // rather than recomputing a restore.
    const undone = undoLastEdit(out.draft, out.journal, normalize);
    expect(undone.draft.cards[0].queue).toBe('buried-user');
  });

  it('encodes every queue the model names, and refuses the one it does not', () => {
    expect(encodeCardQueue('suspended')).toBe(-1);
    expect(encodeCardQueue('new')).toBe(0);
    expect(encodeCardQueue('day-learn')).toBe(3);
    expect(encodeCardQueue('unknown')).toBeNull();
  });
});

describe('interval and ease move together, and only on a card that has one', () => {
  it('writes both and journals the pair', () => {
    const draft = draftOf([card({ id: '5001', noteId: '1001' })]);
    const out = setCardScheduling(draft, J(), '5001', { interval: 30, easeFactor: 2500 });
    expect(out.changed).toBe(true);
    expect(out.draft.cards[0]).toMatchObject({ interval: 30, easeFactor: 2500 });
    expect(out.journal.done[0]).toMatchObject({
      kind: 'card-scheduling',
      before: { interval: 10, easeFactor: 2300 },
      after: { interval: 30, easeFactor: 2500 },
    });
  });

  it('REFUSES a new card: it has no schedule to edit', () => {
    const draft = draftOf([card({ id: '5001', noteId: '1001', type: 'new', queue: 'new', interval: 0, easeFactor: 0 })]);
    const out = setCardScheduling(draft, J(), '5001', { interval: 30, easeFactor: 2500 });
    expect(out.reason).toBe('card-not-scheduled');
    expect(out.draft.cards[0].interval).toBe(0);
  });

  it('REFUSES an ease Anki’s own scheduler could not store', () => {
    const draft = draftOf([card({ id: '5001', noteId: '1001' })]);
    expect(setCardScheduling(draft, J(), '5001', { interval: 30, easeFactor: 900 }).reason).toBe(
      'invalid-scheduling',
    );
    expect(setCardScheduling(draft, J(), '5001', { interval: 1.5, easeFactor: 2500 }).reason).toBe(
      'invalid-scheduling',
    );
    // …and the control: the same call with a legal ease is an edit.
    expect(setCardScheduling(draft, J(), '5001', { interval: 30, easeFactor: 2500 }).changed).toBe(true);
  });

  it('undo restores both columns', () => {
    const draft = draftOf([card({ id: '5001', noteId: '1001' })]);
    const set = setCardScheduling(draft, J(), '5001', { interval: 30, easeFactor: 2500 });
    const undone = undoLastEdit(set.draft, set.journal, normalize);
    expect(undone.draft.cards[0]).toMatchObject({ interval: 10, easeFactor: 2300 });
  });
});

describe('the net change set carries all three, and folds them like every other op', () => {
  function threeEdits(): { draft: AnkiDraft; journal: AnkiDraftEditJournal } {
    let draft = draftOf([
      card({ id: '5001', noteId: '1001' }),
      card({ id: '5002', noteId: '1001' }),
      card({ id: '5003', noteId: '1001' }),
    ]);
    let journal = J();
    for (const step of [
      () => setCardFlag(draft, journal, '5001', 'red'),
      () => setCardSuspended(draft, journal, '5002', true),
      () => setCardScheduling(draft, journal, '5003', { interval: 45, easeFactor: 2600 }),
    ]) {
      const out = step();
      draft = out.draft;
      journal = out.journal;
    }
    return { draft, journal };
  }

  it('exports one entry per capability', () => {
    const { draft, journal } = threeEdits();
    const changes = buildApkgExportChanges(draft, journal);
    expect(changes.cardFlags).toEqual([{ cardId: '5001', noteId: '1001', flag: 'red' }]);
    expect(changes.cardQueues).toEqual([{ cardId: '5002', noteId: '1001', queue: 'suspended' }]);
    expect(changes.cardScheduling).toEqual([
      { cardId: '5003', noteId: '1001', interval: 45, easeFactor: 2600 },
    ]);
    expect(exportChangesEmpty(changes)).toBe(false);
  });

  it('NEGATIVE CONTROL: a value set and set back again exports nothing', () => {
    // The fold is the point. Three ops in the journal, zero changes on the wire.
    let draft = draftOf([card({ id: '5001', noteId: '1001', flag: 'none' })]);
    let journal = J();
    for (const step of [
      () => setCardFlag(draft, journal, '5001', 'red'),
      () => setCardFlag(draft, journal, '5001', 'green'),
      () => setCardFlag(draft, journal, '5001', 'none'),
    ]) {
      const out = step();
      draft = out.draft;
      journal = out.journal;
    }
    expect(journal.done).toHaveLength(3);
    const changes = buildApkgExportChanges(draft, journal);
    expect(changes.cardFlags).toEqual([]);
    expect(exportChangesEmpty(changes)).toBe(true);
  });

  it('keeps a flag and a reposition of the SAME card apart', () => {
    // The change-set key is `c:<kind>:<cardId>`; one key for both would let the
    // second op fold into the first and never export.
    const draft = draftOf([card({ id: '5001', noteId: '1001', type: 'new', queue: 'new', due: 7 })]);
    const flagged = setCardFlag(draft, J(), '5001', 'pink');
    const moved = {
      draft: { ...flagged.draft, cards: [{ ...flagged.draft.cards[0], due: 3 }] } as AnkiDraft,
      journal: {
        done: [
          ...flagged.journal.done,
          { kind: 'card-due' as const, noteId: '1001', cardId: '5001', before: 7, after: 3 },
        ],
        undone: [],
      },
    };
    const changes = buildApkgExportChanges(moved.draft, moved.journal);
    expect(changes.cardFlags).toHaveLength(1);
    expect(changes.cardMoves).toHaveLength(1);
  });

  it('step 6’s dry run counts them apart, so a suspension cannot read as a reposition', () => {
    const { draft, journal } = threeEdits();
    const review = buildWorkbenchReview(draft, journal);
    expect(review.cardFlags).toBe(1);
    expect(review.cardSuspensions).toBe(1);
    expect(review.cardScheduling).toBe(1);
    expect(review.cardMoves).toBe(0);
    expect(review.totalDiffs).toBe(3);
    const kinds = review.diffs.map((line) => line.kind).sort();
    expect(kinds).toEqual(['card-flag', 'card-queue', 'card-scheduling']);
    // Units, never relabelled: days over permille, exactly as stored.
    const sched = review.diffs.find((line) => line.kind === 'card-scheduling')!;
    expect(sched.before).toBe('10/2300');
    expect(sched.after).toBe('45/2600');
  });
});
