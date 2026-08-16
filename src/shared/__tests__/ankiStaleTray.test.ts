/**
 * Recipe 18 through the tray — the write half the model and the panel cannot
 * prove on their own.
 *
 * `ankiStaleCards.test.ts` proves what `planStaleRemedy` *would* move.
 * `deckWorkbenchStale.test.tsx` proves the panel proposes it and writes nothing.
 * This proves `planChangeTray` turns that plan into `card-due` ops on the draft,
 * that one Apply is one undo, that the selection scopes the run, and that the
 * three refusals a user can walk into stop the tray by name instead of running
 * to a zero they would read as "nothing was stale".
 *
 * The load-bearing negative control is `withheld`: a suspended card is deep in
 * both thresholds and MUST NOT move. It is the one card in the fixture whose
 * `due` is asserted unchanged after a run that moved everything around it.
 */
import { describe, expect, it } from 'vitest';

import type { AnkiDraft, RawAnkiCardRow, RawAnkiCollection, RawAnkiRevlogRow } from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import { planChangeTray, type TrayAction, type TrayPlan } from '../ankiChangeTray';
import { countJournalSteps, createEditJournal, undoLastEdit } from '../ankiDraftEdit';
import { DEFAULT_DORMANT_DAYS, DEFAULT_OVERDUE_DAYS } from '../ankiStaleCards';

/** The collection origin every `due` day number counts from. 2020-01-01. */
const CRT = 1_577_836_800;
/** "Now" for every test: exactly 1,000 days after `CRT`, so `todayDay` is 1000. */
const NOW = (CRT + 1000 * 86_400) * 1000;
const TODAY = 1000;

type CardSpec = Partial<RawAnkiCardRow> & { id: string; nid: string };

function draftOf(
  cards: CardSpec[],
  options: { revlog?: RawAnkiRevlogRow[] | undefined; noOrigin?: boolean } = {},
): AnkiDraft {
  const noteIds = [...new Set(cards.map((c) => c.nid))];
  const raw: RawAnkiCollection = {
    col: { ver: 11, crt: CRT, mod: 0 },
    notes: noteIds.map((id, i) => ({
      id,
      guid: `g${i}`,
      mid: '1',
      flds: ['Front', 'Back'].join(ANKI_FIELD_SEP),
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
    revlog: options.revlog,
  };
  return buildAnkiDraft(raw, {
    source: options.noOrigin
      ? { kind: 'apkg', label: 'test.apkg' }
      : { kind: 'apkg', label: 'test.apkg', createdAtSec: CRT },
    normalize: (v) => v,
  });
}

/** A review card, `due` set so it is `overdueBy` days late. One card per note. */
function reviewCard(id: string, overdueBy: number, over: Partial<RawAnkiCardRow> = {}): CardSpec {
  return { id, nid: `n${id}`, type: 2, queue: 2, due: TODAY - overdueBy, ivl: 30, reps: 4, ...over };
}

function action(over: Partial<Extract<TrayAction, { kind: 'reschedule-stale' }>> = {}): TrayAction {
  return {
    id: 'a1',
    enabled: true,
    kind: 'reschedule-stale',
    mode: 'reschedule',
    overdueDays: DEFAULT_OVERDUE_DAYS,
    dormantDays: DEFAULT_DORMANT_DAYS,
    spreadDays: 3,
    nowMs: NOW,
    ...over,
  } as TrayAction;
}

function run(
  draft: AnkiDraft,
  over: Partial<Extract<TrayAction, { kind: 'reschedule-stale' }>> = {},
  noteIds?: string[],
): TrayPlan {
  return planChangeTray(
    draft,
    createEditJournal(),
    noteIds ?? draft.notes.map((n) => n.id),
    [action(over)],
    { groupId: 'g1' },
  );
}

const due = (d: AnkiDraft, cardId: string): number | undefined =>
  d.cards.find((c) => c.id === cardId)?.due;
const codes = (p: TrayPlan): string[] => p.problems.map((x) => x.code);
const countOf = (p: TrayPlan, code: string): number =>
  p.problems.find((x) => x.code === code)?.count ?? 0;

describe('reschedule-stale through planChangeTray', () => {
  it('moves every overdue card into the window and leaves the withheld one alone', () => {
    // 4 overdue (100/80/60/40 days late), 1 suspended and 200 days late, 1 fresh.
    const draft = draftOf([
      reviewCard('c1', 100),
      reviewCard('c2', 80),
      reviewCard('c3', 60),
      reviewCard('c4', 40),
      reviewCard('c5', 200, { queue: -1 }),
      reviewCard('c6', 0),
    ]);
    const plan = run(draft);

    expect(plan.blocked).toBe(false);
    expect(plan.changedCards).toBe(4);
    // Longest overdue first, round-robin over a 3-day window: 1000, 1001, 1002,
    // then back to 1000. The days themselves, not just the count — an off-by-one
    // in the spread is exactly what a bare `changedCards` cannot see.
    expect(due(plan.draft, 'c1')).toBe(TODAY);
    expect(due(plan.draft, 'c2')).toBe(TODAY + 1);
    expect(due(plan.draft, 'c3')).toBe(TODAY + 2);
    expect(due(plan.draft, 'c4')).toBe(TODAY);

    // The negative control. A suspended card is 200 days overdue — deeper than
    // any card that moved — and must still hold its original day.
    expect(due(plan.draft, 'c5')).toBe(TODAY - 200);
    expect(due(draft, 'c5')).toBe(TODAY - 200);
    // And a card inside both thresholds is not touched either.
    expect(due(plan.draft, 'c6')).toBe(TODAY);

    expect(codes(plan)).toContain('stale-withheld');
    expect(countOf(plan, 'stale-withheld')).toBe(1);
    expect(countOf(plan, 'stale-not-stale')).toBe(1);
    expect(codes(plan)).not.toContain('stale-clean');
    // No note field changed, so this is one of the actions whose whole effect is
    // invisible to `changedNotes` — the reason `TrayPlan.changedCards` exists.
    expect(plan.changedNotes).toBe(0);
    expect(plan.stale?.moves).toHaveLength(4);
  });

  it('spreads evenly: every day of the window is within one card of every other', () => {
    const draft = draftOf(
      Array.from({ length: 10 }, (_, i) => reviewCard(`c${i}`, 100 - i)),
    );
    const plan = run(draft, { spreadDays: 4 });

    const perDay = new Map<number, number>();
    for (const move of plan.stale?.moves ?? []) {
      perDay.set(move.after, (perDay.get(move.after) ?? 0) + 1);
    }
    expect([...perDay.keys()].sort((a, b) => a - b)).toEqual([1000, 1001, 1002, 1003]);
    const counts = [...perDay.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('one Apply is one undo, and undo restores every due day', () => {
    const draft = draftOf([reviewCard('c1', 100), reviewCard('c2', 80)]);
    const plan = run(draft);
    expect(countJournalSteps(plan.journal.done)).toBe(1);

    const back = undoLastEdit(plan.draft, plan.journal);
    expect(back).not.toBeNull();
    expect(due(back!.draft, 'c1')).toBe(TODAY - 100);
    expect(due(back!.draft, 'c2')).toBe(TODAY - 80);
    expect(countJournalSteps(back!.journal.done)).toBe(0);
  });

  it('the selection scopes the run, and unselected cards are not reported as skips', () => {
    const draft = draftOf([reviewCard('c1', 100), reviewCard('c2', 80), reviewCard('c3', 60)]);
    const plan = run(draft, {}, ['nc1']);

    expect(plan.changedCards).toBe(1);
    expect(due(plan.draft, 'c1')).toBe(TODAY);
    expect(due(plan.draft, 'c2')).toBe(TODAY - 80);
    // The two unselected cards produce no rows at all: they were never offered,
    // which is a different statement from "offered and left alone".
    expect(countOf(plan, 'stale-not-stale')).toBe(0);
    expect(countOf(plan, 'stale-withheld')).toBe(0);
  });

  it('says so when nothing was stale instead of reporting a silent zero', () => {
    const draft = draftOf([reviewCard('c1', 0), reviewCard('c2', 1)]);
    const plan = run(draft);

    expect(plan.blocked).toBe(false);
    expect(plan.changedCards).toBe(0);
    expect(codes(plan)).toContain('stale-clean');
    expect(countOf(plan, 'stale-not-stale')).toBe(2);
  });

  it('reports the dormant axis as unanswerable rather than answering it with zero', () => {
    // A revlog table that is present and empty, next to cards claiming reps.
    // That is the `dropped` case all 33 of the user's real packages turn out to
    // be — the export left the history behind.
    const draft = draftOf([reviewCard('c1', 100), reviewCard('c2', 0)], { revlog: [] });
    const plan = run(draft);

    expect(plan.changedCards).toBe(1);
    const row = plan.problems.find((p) => p.code === 'stale-history-unreadable');
    expect(row?.severity).toBe('warning');
    expect(row?.detail).toBe('dropped');
    // The count is what DID move, so the sentence can say the moved cards were
    // chosen on overdue days alone.
    expect(row?.count).toBe(1);
  });

  it('moves a dormant card whose due day is still in the future', () => {
    // The recipe's headline case and the defect writing this half found: a deck
    // abandoned long before its cards came due. `overdueDays` is null here
    // (nothing is late) while `dormant` fires on 200 days of silence, and the
    // remedy planner used to read the clamped `overdueDays` to decide whether a
    // card had a due day at all — so it refused this card as `not-review`,
    // which is false about a review card and skipped exactly the deck the user
    // opened the recipe for. See `StaleCardFacts.dueDay`.
    const draft = draftOf([reviewCard('c1', -50)], {
      revlog: [
        {
          id: String(NOW - 200 * 86_400_000),
          cid: 'c1',
          ease: 3,
          ivl: 30,
          lastIvl: 10,
          factor: 2500,
          time: 4000,
          type: 1,
        } as unknown as RawAnkiRevlogRow,
      ],
    });
    const plan = run(draft);

    expect(plan.changedCards).toBe(1);
    expect(plan.stale?.moves[0]).toMatchObject({
      cardId: 'c1',
      verdict: 'dormant',
      // The card's real day, not `todayDay - 0`: reporting `before: 1000` for a
      // card due on day 1050 would show the user a move that never happened.
      before: TODAY + 50,
      after: TODAY,
      overdueDays: 0,
    });
    expect(codes(plan)).not.toContain('stale-not-review');
    expect(due(plan.draft, 'c1')).toBe(TODAY);
  });

  it('a readable history raises no unreadable row', () => {
    const draft = draftOf([reviewCard('c1', 100)], {
      revlog: [{ id: '1', cid: 'c1', ease: 3, ivl: 30, time: 0, type: 1 } as RawAnkiRevlogRow],
    });
    const plan = run(draft);
    expect(codes(plan)).not.toContain('stale-history-unreadable');
  });

  it('refuses a reset by name and changes nothing', () => {
    const draft = draftOf([reviewCard('c1', 100)]);
    const plan = run(draft, { mode: 'reset' });

    expect(plan.blocked).toBe(true);
    expect(codes(plan)).toContain('stale-reset-unsupported');
    expect(plan.problems.find((p) => p.code === 'stale-reset-unsupported')?.severity).toBe('blocking');
    expect(plan.draft).toBe(draft);
    expect(due(plan.draft, 'c1')).toBe(TODAY - 100);
    expect(countJournalSteps(plan.journal.done)).toBe(0);
  });

  it('refuses a source with no collection origin', () => {
    const draft = draftOf([reviewCard('c1', 100)], { noOrigin: true });
    const plan = run(draft);

    expect(plan.blocked).toBe(true);
    expect(codes(plan)).toContain('stale-no-origin');
    expect(due(plan.draft, 'c1')).toBe(TODAY - 100);
  });

  it('refuses a threshold or a window below one day', () => {
    const draft = draftOf([reviewCard('c1', 100)]);
    for (const over of [
      { overdueDays: 0 },
      { dormantDays: 0 },
      { spreadDays: 0 },
      { overdueDays: Number.NaN },
      { nowMs: Number.NaN },
    ]) {
      const plan = run(draft, over);
      expect(codes(plan), JSON.stringify(over)).toContain('empty-parameter');
      expect(plan.blocked, JSON.stringify(over)).toBe(true);
    }
  });

  it('a disabled action is not run', () => {
    const draft = draftOf([reviewCard('c1', 100)]);
    const plan = planChangeTray(draft, createEditJournal(), ['nc1'], [action({ enabled: false })], {
      groupId: 'g1',
    });
    // `no-actions` blocks: the whole tray is disabled, which is not the same as
    // a tray that ran and moved nothing.
    expect(codes(plan)).toContain('no-actions');
    expect(due(plan.draft, 'c1')).toBe(TODAY - 100);
  });
});
