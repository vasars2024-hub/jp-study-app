import { describe, expect, it } from 'vitest';
import type { AnkiDraft, RawAnkiCardRow, RawAnkiCollection, RawAnkiRevlogRow } from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import {
  DEFAULT_DORMANT_DAYS,
  DEFAULT_OVERDUE_DAYS,
  DEFAULT_STALE_SPREAD_DAYS,
  MIN_STALE_THRESHOLD_DAYS,
  STALE_VERDICTS,
  buildStaleContext,
  emptyStaleTally,
  newestReviewByCard,
  parseStaleVerdict,
  planStaleRemedy,
  scanStaleCards,
  tallyStaleVerdicts,
  todayDueDay,
  type StaleScanResult,
} from '../ankiStaleCards';

const DAY = 86_400_000;
/** The collection origin every `due` day number counts from. 2020-01-01. */
const CRT = 1_577_836_800;
/** "Now" for every test: exactly 1,000 days after `CRT`, so `todayDay` is 1000. */
const NOW = (CRT + 1000 * 86_400) * 1000;

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
    // `buildAnkiDraft` does not read `col.crt` into the source — `apkgImport.ts`
    // does that at :465 — so the fixture has to carry it the same way.
    source: options.noOrigin
      ? { kind: 'apkg', label: 'test.apkg' }
      : { kind: 'apkg', label: 'test.apkg', createdAtSec: CRT },
    normalize: (v) => v,
  });
}

/** A review card, `due` days set so it is `overdueBy` days late. */
function reviewCard(id: string, overdueBy: number, over: Partial<RawAnkiCardRow> = {}): CardSpec {
  return { id, nid: `n${id}`, type: 2, queue: 2, due: 1000 - overdueBy, ivl: 30, reps: 4, ...over };
}

function ok(result: StaleScanResult): Extract<StaleScanResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected a scan, got refusal ${result.refusal}`);
  return result;
}

describe('parseStaleVerdict', () => {
  it('accepts every verdict it declares, case-insensitively', () => {
    for (const verdict of STALE_VERDICTS) {
      expect(parseStaleVerdict(verdict)).toBe(verdict);
      expect(parseStaleVerdict(` ${verdict.toUpperCase()} `)).toBe(verdict);
    }
  });

  it('refuses a value it does not know rather than guessing the nearest', () => {
    expect(parseStaleVerdict('stale')).toBeNull();
    expect(parseStaleVerdict('')).toBeNull();
  });
});

describe('todayDueDay', () => {
  it('counts whole days from the collection origin', () => {
    expect(todayDueDay(CRT, NOW)).toBe(1000);
    // Part-way through a day still reads as that day, never the next one.
    expect(todayDueDay(CRT, NOW + DAY - 1)).toBe(1000);
    expect(todayDueDay(CRT, NOW + DAY)).toBe(1001);
  });
});

describe('newestReviewByCard', () => {
  it('keeps the newest entry per card, whatever order the log arrives in', () => {
    const newest = newestReviewByCard([
      { cardId: 'a', reviewedAtMs: 300, ease: 3, interval: 1, lastInterval: 1, easeFactor: 2500, tookMs: 1, kind: 0 },
      { cardId: 'a', reviewedAtMs: 100, ease: 3, interval: 1, lastInterval: 1, easeFactor: 2500, tookMs: 1, kind: 0 },
      { cardId: 'b', reviewedAtMs: 200, ease: 3, interval: 1, lastInterval: 1, easeFactor: 2500, tookMs: 1, kind: 0 },
    ]);
    expect(newest.get('a')).toBe(300);
    expect(newest.get('b')).toBe(200);
    expect(newest.has('c')).toBe(false);
  });
});

describe('scanStaleCards refusals', () => {
  it('refuses a source with no collection origin instead of counting from zero', () => {
    const draft = draftOf([reviewCard('1', 400)], { noOrigin: true });
    const result = scanStaleCards({ draft, nowMs: NOW });
    expect(result).toEqual({ ok: false, refusal: 'no-collection-origin' });
  });

  it('refuses a threshold under one day, because the day boundary is already fuzzy', () => {
    const draft = draftOf([reviewCard('1', 400)]);
    expect(scanStaleCards({ draft, nowMs: NOW, overdueDays: 0 })).toEqual({
      ok: false,
      refusal: 'threshold-too-small',
    });
    expect(scanStaleCards({ draft, nowMs: NOW, dormantDays: Number.NaN })).toEqual({
      ok: false,
      refusal: 'threshold-too-small',
    });
    expect(ok(scanStaleCards({ draft, nowMs: NOW, overdueDays: MIN_STALE_THRESHOLD_DAYS })).overdueDays).toBe(1);
  });

  it('reports the resolved thresholds so a surface can state them', () => {
    const scan = ok(scanStaleCards({ draft: draftOf([reviewCard('1', 1)]), nowMs: NOW }));
    expect(scan.overdueDays).toBe(DEFAULT_OVERDUE_DAYS);
    expect(scan.dormantDays).toBe(DEFAULT_DORMANT_DAYS);
    expect(scan.todayDay).toBe(1000);
  });
});

describe('scanStaleCards verdicts', () => {
  it('calls a review card overdue only once it is past the threshold', () => {
    const draft = draftOf([
      reviewCard('1', DEFAULT_OVERDUE_DAYS - 1),
      reviewCard('2', DEFAULT_OVERDUE_DAYS),
      reviewCard('3', 400),
    ]);
    const scan = ok(scanStaleCards({ draft, nowMs: NOW }));
    expect(scan.cards.map((c) => c.verdict)).toEqual(['active', 'overdue', 'overdue']);
    expect(scan.cards.map((c) => c.overdueDays)).toEqual([20, 21, 400]);
  });

  it('never reports a negative overdue for a card that is not due yet', () => {
    const scan = ok(scanStaleCards({ draft: draftOf([reviewCard('1', -30)]), nowMs: NOW }));
    expect(scan.cards[0]?.overdueDays).toBeNull();
    expect(scan.cards[0]?.verdict).toBe('active');
  });

  it('leaves a never-reviewed new card out of the stale verdicts entirely', () => {
    const draft = draftOf([{ id: '1', nid: 'n1', type: 0, queue: 0, due: 9_000_000, reps: 0 }]);
    const scan = ok(scanStaleCards({ draft, nowMs: NOW }));
    // 9,000,000 is a queue position, not a day number: a day-number reading would
    // call this card 8,999,000 days *early* and the arithmetic would be nonsense.
    expect(scan.cards[0]).toMatchObject({ verdict: 'new', overdueDays: null, sinceReviewDays: null });
  });

  it('does not call a card new once it has a review history, even back in the new queue', () => {
    const draft = draftOf([{ id: '1', nid: 'n1', type: 0, queue: 0, due: 5, reps: 0 }], {
      revlog: [{ id: NOW - 400 * DAY, cid: '1', ease: 1, ivl: 1, lastIvl: 1, factor: 2500, time: 5000, type: 0 }],
    });
    const scan = ok(scanStaleCards({ draft, nowMs: NOW }));
    expect(scan.cards[0]?.verdict).toBe('dormant');
    expect(scan.cards[0]?.sinceReviewDays).toBe(400);
  });

  it('calls a card dormant on the review axis alone, with its due day still in the future', () => {
    const draft = draftOf([reviewCard('1', -50)], {
      revlog: [
        { id: NOW - 200 * DAY, cid: '1', ease: 3, ivl: 30, lastIvl: 10, factor: 2500, time: 4000, type: 1 },
      ],
    });
    const scan = ok(scanStaleCards({ draft, nowMs: NOW }));
    // The two axes disagree on purpose: nothing is overdue, and the user has not
    // seen this card in 200 days. One number could not say that.
    expect(scan.cards[0]).toMatchObject({ verdict: 'dormant', overdueDays: null, sinceReviewDays: 200 });
  });

  it('ranks dormant above overdue when both fire on the same card', () => {
    const draft = draftOf([reviewCard('1', 400)], {
      revlog: [
        { id: NOW - 430 * DAY, cid: '1', ease: 3, ivl: 30, lastIvl: 10, factor: 2500, time: 4000, type: 1 },
      ],
    });
    expect(ok(scanStaleCards({ draft, nowMs: NOW })).cards[0]?.verdict).toBe('dormant');
  });

  it('puts a suspended or buried card in withheld, however overdue it is', () => {
    const draft = draftOf([
      reviewCard('1', 400, { queue: -1 }),
      reviewCard('2', 400, { queue: -2 }),
      reviewCard('3', 400, { queue: -3 }),
    ]);
    const scan = ok(scanStaleCards({ draft, nowMs: NOW }));
    expect(scan.cards.map((c) => c.verdict)).toEqual(['withheld', 'withheld', 'withheld']);
    // The overdue reading is still reported — the card really is 400 days late.
    // What changes is the verdict, because a new due day would not show it.
    expect(scan.cards.map((c) => c.overdueDays)).toEqual([400, 400, 400]);
  });

  it('reports whether the source could answer the review axis at all', () => {
    const withLog = draftOf([reviewCard('1', 400)], { revlog: [] });
    const withoutLog = draftOf([reviewCard('1', 400)], { revlog: undefined });
    expect(ok(scanStaleCards({ draft: withLog, nowMs: NOW })).reviewHistory).toBe('present');
    expect(ok(scanStaleCards({ draft: withoutLog, nowMs: NOW })).reviewHistory).toBe('absent');
    // Negative control for the whole axis: with no log nothing can read dormant,
    // and the scan says so by name rather than calling every card fresh.
    expect(ok(scanStaleCards({ draft: withoutLog, nowMs: NOW })).tally.dormant).toBe(0);
  });

  it('partitions every card exactly once', () => {
    const draft = draftOf([
      { id: '1', nid: 'n1', type: 0, queue: 0, due: 1, reps: 0 },
      reviewCard('2', 1),
      reviewCard('3', 400),
      reviewCard('4', 400, { queue: -1 }),
      { id: '5', nid: 'n5', type: 1, queue: 1, due: Math.floor(NOW / 1000), reps: 2 },
    ]);
    const scan = ok(scanStaleCards({ draft, nowMs: NOW }));
    const total = Object.values(scan.tally).reduce((a, b) => a + b, 0);
    expect(total).toBe(5);
    expect(scan.tally).toEqual({ new: 1, active: 2, overdue: 1, dormant: 0, withheld: 1 });
  });
});

describe('tallyStaleVerdicts', () => {
  it('starts from zero on every verdict it declares', () => {
    expect(Object.keys(emptyStaleTally()).sort()).toEqual([...STALE_VERDICTS].sort());
    expect(tallyStaleVerdicts(['overdue', 'overdue', 'new'])).toEqual({
      new: 1,
      active: 0,
      overdue: 2,
      dormant: 0,
      withheld: 0,
    });
  });
});

describe('buildStaleContext', () => {
  it('gives a note its worst card verdict', () => {
    const draft = draftOf([
      { ...reviewCard('1', 1), nid: 'n1' },
      { ...reviewCard('2', 400), nid: 'n1' },
      { ...reviewCard('3', 1), nid: 'n2' },
    ]);
    const context = buildStaleContext(draft, NOW);
    expect(context?.get('n1')).toBe('overdue');
    expect(context?.get('n2')).toBe('active');
  });

  it('is null when the scan refuses, so the predicate refuses too', () => {
    const draft = draftOf([reviewCard('1', 400)], { noOrigin: true });
    expect(buildStaleContext(draft, NOW)).toBeNull();
  });

  it('gives a note with no cards no entry rather than a fabricated verdict', () => {
    const draft = draftOf([reviewCard('1', 1)]);
    expect(buildStaleContext(draft, NOW)?.has('nope')).toBe(false);
  });
});

describe('planStaleRemedy', () => {
  const scan = () =>
    ok(
      scanStaleCards({
        draft: draftOf([
          reviewCard('1', 400),
          reviewCard('2', 100),
          reviewCard('3', 1),
          reviewCard('4', 400, { queue: -1 }),
          { id: '5', nid: 'n5', type: 0, queue: 0, due: 3, reps: 0 },
        ]),
        nowMs: NOW,
      }),
    );

  it('refuses reset by name instead of writing only the due day', () => {
    expect(planStaleRemedy({ scan: scan(), mode: 'reset' })).toEqual({
      ok: false,
      refusal: 'reset-unsupported',
    });
  });

  it('reschedules only the stale review cards and names every refusal', () => {
    const result = planStaleRemedy({ scan: scan(), mode: 'reschedule' });
    if (!result.ok) throw new Error('expected a plan');
    expect(result.plan.moves.map((m) => m.cardId)).toEqual(['1', '2']);
    expect(result.plan.skips).toEqual([
      { cardId: '3', noteId: 'n3', refusal: 'not-stale' },
      { cardId: '4', noteId: 'n4', refusal: 'withheld' },
      { cardId: '5', noteId: 'n5', refusal: 'not-review' },
    ]);
    // Longest overdue first, and nothing is ever scheduled into the past.
    expect(result.plan.moves[0]).toMatchObject({ cardId: '1', before: 600, after: 1000, overdueDays: 400 });
    expect(result.plan.moves[1]).toMatchObject({ cardId: '2', before: 900, after: 1001, overdueDays: 100 });
    expect(result.plan.changedCards).toBe(2);
  });

  it('spreads the backlog round-robin rather than dumping it on one day', () => {
    const draft = draftOf(Array.from({ length: 9 }, (_, i) => reviewCard(String(i + 1), 100 + i)));
    const result = planStaleRemedy({
      scan: ok(scanStaleCards({ draft, nowMs: NOW })),
      mode: 'reschedule',
      spreadDays: 3,
    });
    if (!result.ok) throw new Error('expected a plan');
    expect(result.plan.moves.map((m) => m.after)).toEqual([1000, 1001, 1002, 1000, 1001, 1002, 1000, 1001, 1002]);
    // Every day carries the same load; no day is within one card of another.
    const perDay = new Map<number, number>();
    for (const move of result.plan.moves) perDay.set(move.after, (perDay.get(move.after) ?? 0) + 1);
    expect([...perDay.values()]).toEqual([3, 3, 3]);
  });

  it('defaults the spread rather than piling a backlog onto today', () => {
    const draft = draftOf(Array.from({ length: 30 }, (_, i) => reviewCard(String(i + 1), 100 + i)));
    const result = planStaleRemedy({ scan: ok(scanStaleCards({ draft, nowMs: NOW })), mode: 'reschedule' });
    if (!result.ok) throw new Error('expected a plan');
    const days = new Set(result.plan.moves.map((m) => m.after));
    expect(days.size).toBe(DEFAULT_STALE_SPREAD_DAYS);
  });

  it('honours an explicit selection and refuses nothing outside it', () => {
    const result = planStaleRemedy({ scan: scan(), mode: 'reschedule', cardIds: ['2'] });
    if (!result.ok) throw new Error('expected a plan');
    expect(result.plan.moves.map((m) => m.cardId)).toEqual(['2']);
    expect(result.plan.skips).toEqual([]);
  });

  it('reports a clean deck as no moves instead of inventing one', () => {
    const draft = draftOf([reviewCard('1', 1), reviewCard('2', 2)]);
    const result = planStaleRemedy({ scan: ok(scanStaleCards({ draft, nowMs: NOW })), mode: 'reschedule' });
    if (!result.ok) throw new Error('expected a plan');
    expect(result.plan.moves).toEqual([]);
    expect(result.plan.changedCards).toBe(0);
    expect(result.plan.skips.every((s) => s.refusal === 'not-stale')).toBe(true);
  });
});
