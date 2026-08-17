/**
 * Acceptance gate 5's BATCH half — `set-card-state` through `planChangeTray`.
 *
 * `ankiCardState.test.ts` proves the three ops fold to a change set and come
 * back on undo. This proves the tray turns one queued action into those ops
 * across a selection, that one Apply is one undo, and that each refusal stops
 * by name rather than running to a zero the user reads as "nothing matched".
 *
 * The load-bearing negative control is `outside`: a note that is NOT in the
 * selection and must come out of every run untouched on all three columns.
 */
import { describe, expect, it } from 'vitest';

import type { AnkiDraft, RawAnkiCardRow, RawAnkiCollection } from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import { planChangeTray, type TrayAction } from '../ankiChangeTray';
import { countJournalSteps, createEditJournal, undoLastEdit } from '../ankiDraftEdit';

const CRT = 1_577_836_800;

type CardSpec = Partial<RawAnkiCardRow> & { id: string; nid: string };

function draftOf(cards: CardSpec[]): AnkiDraft {
  const noteIds = [...new Set(cards.map((c) => c.nid))];
  const raw: RawAnkiCollection = {
    col: { ver: 11, crt: CRT, mod: 0 },
    notes: noteIds.map((id, i) => ({
      id,
      guid: `g${i}`,
      mid: '1',
      flds: [`Front ${id}`, 'Back'].join(ANKI_FIELD_SEP),
    })),
    cards: cards.map((c) => ({ did: '1', ord: 0, ...c })),
    decks: [{ id: '1', name: 'Deck' }],
    noteTypes: [
      {
        id: '1',
        name: 'Basic',
        fields: [
          { name: 'Front', ord: 0 },
          { name: 'Back', ord: 1 },
        ],
        templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
      },
    ],
  };
  return buildAnkiDraft(raw, {
    source: { kind: 'apkg', label: 'test.apkg', createdAtSec: CRT },
    normalize: (v) => v,
  });
}

/** A graduated review card: it has an interval, an ease and a queue to leave. */
function reviewCard(id: string, nid: string, over: Partial<RawAnkiCardRow> = {}): CardSpec {
  return { id, nid, type: 2, queue: 2, due: 900, ivl: 30, factor: 2300, reps: 4, ...over };
}

const action = (over: Partial<Extract<TrayAction, { kind: 'set-card-state' }>>): TrayAction =>
  ({ id: 'a1', kind: 'set-card-state', enabled: true, ...over }) as TrayAction;

const plan = (draft: AnkiDraft, noteIds: string[], a: TrayAction) =>
  planChangeTray(draft, createEditJournal(), noteIds, [a]);

describe('set-card-state writes every column the gate names', () => {
  const draft = () =>
    draftOf([
      reviewCard('5001', 'n1'),
      reviewCard('5002', 'n1', { ord: 1 }),
      reviewCard('5003', 'n2', { flags: 3 }),
      // The control: never selected, so nothing about it may move.
      reviewCard('5009', 'outside', { flags: 1 }),
    ]);

  it('sets all three at once, per card and not per note', () => {
    const out = plan(
      draft(),
      ['n1', 'n2'],
      action({ flag: 'blue', suspended: true, scheduling: { interval: 45, easeFactor: 2600 } }),
    );
    // n1 has two cards, n2 has one: three cards, three of each op, one group.
    const kinds = out.journal.done.map((op) => op.kind);
    expect(kinds.filter((k) => k === 'card-flag')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'card-queue')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'card-scheduling')).toHaveLength(3);
    expect(countJournalSteps(out.journal.done)).toBe(1);

    const byId = new Map(out.draft.cards.map((c) => [c.id, c]));
    for (const id of ['5001', '5002', '5003']) {
      expect(byId.get(id)).toMatchObject({
        flag: 'blue',
        queue: 'suspended',
        interval: 45,
        easeFactor: 2600,
      });
    }
    // NEGATIVE CONTROL: the unselected note, on all three columns.
    expect(byId.get('5009')).toMatchObject({
      flag: 'red',
      queue: 'review',
      interval: 30,
      easeFactor: 2300,
    });
    expect(out.outcomes[0]).toMatchObject({ kind: 'set-card-state', matched: 2, changed: 2 });
  });

  it('one Apply is one undo, and it restores every column', () => {
    const out = plan(
      draft(),
      ['n1', 'n2'],
      action({ flag: 'blue', suspended: true, scheduling: { interval: 45, easeFactor: 2600 } }),
    );
    const undone = undoLastEdit(out.draft, out.journal, (v) => v);
    expect(undone.journal.done).toHaveLength(0);
    const byId = new Map(undone.draft.cards.map((c) => [c.id, c]));
    // `5003` started GREEN (`flags: 3`) while `5001` started unflagged, so undo
    // restoring a default would be visible here: the op carries the colour it
    // replaced, per card.
    expect(byId.get('5003')).toMatchObject({
      flag: 'green',
      queue: 'review',
      interval: 30,
      easeFactor: 2300,
    });
    expect(byId.get('5001')!.flag).toBe('none');
  });

  it('writes only the columns the action names', () => {
    const out = plan(draft(), ['n2'], action({ flag: 'pink' }));
    expect(out.journal.done.every((op) => op.kind === 'card-flag')).toBe(true);
    const card = out.draft.cards.find((c) => c.id === '5003')!;
    expect(card.flag).toBe('pink');
    expect(card.queue).toBe('review');
    expect(card.interval).toBe(30);
  });
});

describe('every refusal stops by name instead of running to a zero', () => {
  it('BLOCKS an action that sets nothing', () => {
    const out = plan(draftOf([reviewCard('5001', 'n1')]), ['n1'], action({}));
    expect(out.problems.map((p) => p.code)).toContain('card-state-empty');
    expect(out.problems.find((p) => p.code === 'card-state-empty')!.severity).toBe('blocking');
    expect(out.journal.done).toHaveLength(0);
  });

  it('BLOCKS an ease Anki could not store, and lets a legal one through', () => {
    const draft = draftOf([reviewCard('5001', 'n1')]);
    const bad = plan(draft, ['n1'], action({ scheduling: { interval: 45, easeFactor: 900 } }));
    expect(bad.problems.map((p) => p.code)).toContain('card-state-invalid');
    expect(bad.journal.done).toHaveLength(0);
    // The control: the same action with a legal ease writes.
    const good = plan(draft, ['n1'], action({ scheduling: { interval: 45, easeFactor: 2500 } }));
    expect(good.journal.done).toHaveLength(1);
  });

  it('reports a new card as unscheduled and still flags it', () => {
    const draft = draftOf([{ id: '5001', nid: 'n1', type: 0, queue: 0, due: 5 }]);
    const out = plan(
      draft,
      ['n1'],
      action({ flag: 'red', scheduling: { interval: 45, easeFactor: 2500 } }),
    );
    const problem = out.problems.find((p) => p.code === 'card-state-not-scheduled');
    expect(problem).toMatchObject({ severity: 'warning', count: 1 });
    // The flag half still landed: one refused column does not cancel the others.
    expect(out.draft.cards[0].flag).toBe('red');
    expect(out.draft.cards[0].interval).toBe(0);
  });

  it('refuses to unsuspend a card whose state it cannot read back', () => {
    // `queue: 9` is not a queue Anki numbers and `type: 9` is not a type, so
    // there is nothing to restore to. The card must stay suspended.
    const draft = draftOf([{ id: '5001', nid: 'n1', type: 9, queue: -1, due: 5 }]);
    const out = plan(draft, ['n1'], action({ suspended: false }));
    expect(out.problems.find((p) => p.code === 'card-state-unknown')).toMatchObject({ count: 1 });
    expect(out.draft.cards[0].queue).toBe('suspended');
    expect(out.journal.done).toHaveLength(0);
  });

  it('says so when the batch was already true, as info rather than a warning', () => {
    const draft = draftOf([reviewCard('5001', 'n1', { flags: 2 })]);
    const out = plan(draft, ['n1'], action({ flag: 'orange' }));
    expect(out.problems.find((p) => p.code === 'card-state-already')).toMatchObject({
      severity: 'info',
      count: 1,
    });
    expect(out.journal.done).toHaveLength(0);
    expect(out.outcomes[0]).toMatchObject({ changed: 0, skipped: 1 });
  });
});
