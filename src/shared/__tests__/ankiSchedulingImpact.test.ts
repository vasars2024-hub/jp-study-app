import { describe, expect, it } from 'vitest';
import type { AnkiDraft, RawAnkiCardRow, RawAnkiCollection } from '../ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../ankiDraft';
import {
  FSRS_DECAY,
  FSRS_FACTOR,
  MAX_FORECAST_DAYS,
  projectSchedulingImpact,
  retentionIntervalFactor,
  retentionIntervalRatio,
  type SchedulingImpactOutcome,
  type SchedulingImpactResult,
} from '../ankiSchedulingImpact';

/** The collection origin every `due` day number counts from. 2020-01-01. */
const CRT = 1_577_836_800;
/** "Now" for every test: exactly 1,000 days after `CRT`, so `todayDay` is 1000. */
const NOW = (CRT + 1000 * 86_400) * 1000;

type CardSpec = Partial<RawAnkiCardRow> & { id: string; nid: string };

function draftOf(
  cards: CardSpec[],
  options: { noOrigin?: boolean; zeroOrigin?: boolean } = {},
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
  };
  return buildAnkiDraft(raw, {
    source: options.noOrigin
      ? { kind: 'apkg', label: 'test.apkg' }
      : { kind: 'apkg', label: 'test.apkg', createdAtSec: options.zeroOrigin ? 0 : CRT },
    normalize: (v) => v,
  });
}

/** A review card with a real interval, due `dueIn` days from today. */
function reviewCard(id: string, ivl: number, dueIn = 1, over: Partial<RawAnkiCardRow> = {}): CardSpec {
  return { id, nid: `n${id}`, type: 2, queue: 2, due: 1000 + dueIn, ivl, reps: 4, factor: 2500, ...over };
}

function ok(result: SchedulingImpactOutcome): SchedulingImpactResult {
  if (!result.ok) throw new Error(`expected a projection, got refusal ${result.refusal}`);
  return result;
}

function project(
  cards: CardSpec[],
  proposal: Parameters<typeof projectSchedulingImpact>[0]['proposal'],
  extra: { forecastDays?: number; noOrigin?: boolean; zeroOrigin?: boolean } = {},
): SchedulingImpactOutcome {
  return projectSchedulingImpact({
    draft: draftOf(cards, { noOrigin: extra.noOrigin, zeroOrigin: extra.zeroOrigin }),
    proposal,
    nowMs: NOW,
    forecastDays: extra.forecastDays,
  });
}

describe('the FSRS forgetting curve constants', () => {
  it('puts the interval at exactly one stability when retention is 0.9', () => {
    // This is the definition of stability. If it does not hold, FSRS_DECAY and
    // FSRS_FACTOR do not describe the curve the ratio below is derived from.
    expect(retentionIntervalFactor(0.9)).toBeCloseTo(1, 10);
  });

  it('is the FSRS-4.5/5 curve and not some other exponent', () => {
    expect(FSRS_DECAY).toBe(-0.5);
    expect(FSRS_FACTOR).toBeCloseTo(19 / 81, 12);
    // R(t) = (1 + FACTOR·t/S)^DECAY, checked forwards at t = 2S.
    expect((1 + FSRS_FACTOR * 2) ** FSRS_DECAY).toBeCloseTo(retentionAtTwoStabilities(), 10);
  });

  function retentionAtTwoStabilities(): number {
    // Independently: solve the inverse for r such that factor(r) === 2.
    let lo = 0.5;
    let hi = 0.9999;
    for (let i = 0; i < 200; i += 1) {
      const mid = (lo + hi) / 2;
      if (retentionIntervalFactor(mid) > 2) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  it('lengthens intervals when retention drops and shortens them when it rises', () => {
    // Published FSRS behaviour, and the direction is the whole point of the
    // recipe: less retention is less work.
    expect(retentionIntervalRatio(0.9, 0.85)).toBeCloseTo(1.6374, 3);
    expect(retentionIntervalRatio(0.9, 0.95)).toBeCloseTo(0.4606, 3);
  });

  it('is exactly 1 when nothing changes', () => {
    expect(retentionIntervalRatio(0.9, 0.9)).toBe(1);
    expect(retentionIntervalRatio(0.83, 0.83)).toBe(1);
  });

  it('cancels stability: the ratio is the same whatever interval it scales', () => {
    // The claim the whole module rests on. If stability did not cancel, this
    // recipe would need `cards.data`, which the draft does not carry.
    const ratio = retentionIntervalRatio(0.9, 0.8);
    for (const stability of [1, 7, 365, 4_000]) {
      const before = retentionIntervalFactor(0.9) * stability;
      const after = retentionIntervalFactor(0.8) * stability;
      expect(after / before).toBeCloseTo(ratio, 12);
    }
  });
});

describe('projectSchedulingImpact — the workload comparison', () => {
  it('computes steady-state load as the sum of interval reciprocals', () => {
    const result = ok(project([reviewCard('1', 10), reviewCard('2', 20), reviewCard('3', 4)], {
      kind: 'retention',
      from: 0.9,
      to: 0.9,
    }));
    // 1/10 + 1/20 + 1/4 = 0.4 reviews a day.
    expect(result.current.reviewsPerDay).toBeCloseTo(0.4, 12);
    expect(result.scheduledCards).toBe(3);
    expect(result.current.meanIntervalDays).toBeCloseTo(34 / 3, 12);
  });

  it('scales the load by the reciprocal of the interval ratio', () => {
    const result = ok(project([reviewCard('1', 10), reviewCard('2', 10)], {
      kind: 'retention',
      from: 0.9,
      to: 0.85,
    }));
    const ratio = retentionIntervalRatio(0.9, 0.85);
    expect(result.intervalRatio).toBeCloseTo(ratio, 12);
    expect(result.current.reviewsPerDay).toBeCloseTo(0.2, 12);
    expect(result.proposed.reviewsPerDay).toBeCloseTo(0.2 / ratio, 12);
    // Longer intervals, so strictly less work: the delta must be negative.
    expect(result.reviewsPerDayDelta).toBeLessThan(0);
    expect(result.proposed.meanIntervalDays).toBeCloseTo(10 * ratio, 12);
  });

  it('reports an unchanged deck as exactly zero rather than as a rounding smudge', () => {
    const result = ok(project([reviewCard('1', 13), reviewCard('2', 90)], {
      kind: 'retention',
      from: 0.9,
      to: 0.9,
    }));
    expect(result.intervalRatio).toBe(1);
    expect(result.reviewsPerDayDelta).toBe(0);
    expect(result.proposed.reviewsPerDay).toBe(result.current.reviewsPerDay);
  });

  it('treats an interval modifier as a plain multiplier, unlike retention', () => {
    const result = ok(project([reviewCard('1', 10)], {
      kind: 'interval-modifier',
      from: 1,
      to: 1.5,
    }));
    expect(result.intervalRatio).toBeCloseTo(1.5, 12);
    expect(result.proposed.reviewsPerDay).toBeCloseTo(0.1 / 1.5, 12);
    // A modifier proposal has no curve behind it, so it must not claim a decay.
    expect(result.provenance.decay).toBeUndefined();
  });

  it('states the decay for a retention proposal, because it is a constant and not the user’s', () => {
    const result = ok(project([reviewCard('1', 10)], { kind: 'retention', from: 0.9, to: 0.8 }));
    expect(result.provenance.decay).toBe(FSRS_DECAY);
    expect(result.provenance.intervals).toBe('read');
    expect(result.provenance.proposal).toBe('stated');
  });
});

describe('projectSchedulingImpact — what is excluded, and why the tally must sum', () => {
  it('excludes each kind of non-workload card by its own reason', () => {
    const result = ok(project(
      [
        reviewCard('1', 10),
        { id: '2', nid: 'n2', type: 0, queue: 0, due: 1 }, // new
        { id: '3', nid: 'n3', type: 1, queue: 1, due: NOW / 1000, ivl: 0 }, // learning
        reviewCard('4', 10, 1, { queue: -1 }), // suspended
        reviewCard('5', 10, 1, { queue: -2 }), // buried sibling
        reviewCard('6', 10, 1, { odid: '9', odue: 1005 }), // on loan to a filtered deck
        reviewCard('7', -600), // legacy negative-seconds interval
      ],
      { kind: 'retention', from: 0.9, to: 0.8 },
    ));
    expect(result.scheduledCards).toBe(1);
    expect(result.excluded).toEqual({ unscheduled: 2, withheld: 2, filtered: 1, noInterval: 1 });
    // The partition is exact: nothing is counted twice and nothing is dropped.
    const { unscheduled, withheld, filtered, noInterval } = result.excluded;
    expect(result.scheduledCards + unscheduled + withheld + filtered + noInterval).toBe(7);
  });

  it('excludes a suspended card even though it has a perfectly good interval', () => {
    // The negative control for `withheld`: identical cards, one suspended, and
    // the suspended one must contribute no workload at all.
    const active = ok(project([reviewCard('1', 10)], { kind: 'retention', from: 0.9, to: 0.8 }));
    const suspended = project([reviewCard('1', 10, 1, { queue: -1 })], {
      kind: 'retention',
      from: 0.9,
      to: 0.8,
    });
    expect(active.current.reviewsPerDay).toBeCloseTo(0.1, 12);
    expect(suspended.ok).toBe(false);
    if (!suspended.ok) expect(suspended.refusal).toBe('no-scheduled-cards');
  });
});

describe('projectSchedulingImpact — the horizon forecast', () => {
  it('buckets real due days and marks itself unchanged by the proposal', () => {
    const result = ok(project(
      [
        reviewCard('1', 10, 0),
        reviewCard('2', 10, 0),
        reviewCard('3', 10, 3),
        reviewCard('4', 10, 29),
        reviewCard('5', 10, 30), // outside a 30-day horizon
      ],
      { kind: 'retention', from: 0.9, to: 0.8 },
    ));
    expect(result.forecastDays).toBe(30);
    expect(result.horizon).toHaveLength(30);
    expect(result.todayDay).toBe(1000);
    expect(result.horizon[0]).toEqual({ day: 1000, offset: 0, cards: 2 });
    expect(result.horizon[3]).toEqual({ day: 1003, offset: 3, cards: 1 });
    expect(result.horizon[29]).toEqual({ day: 1029, offset: 29, cards: 1 });
    expect(result.horizon.reduce((sum, d) => sum + d.cards, 0)).toBe(4);
    expect(result.horizonUnchangedByProposal).toBe(true);
  });

  it('produces the identical horizon for opposite proposals on the same cards', () => {
    // The lie this recipe could most naturally tell. Anki reschedules a card
    // when it is next answered, so no already-scheduled due day moves.
    const cards = [reviewCard('1', 10, 0), reviewCard('2', 40, 5), reviewCard('3', 7, 12)];
    const lower = ok(project(cards, { kind: 'retention', from: 0.9, to: 0.8 }));
    const higher = ok(project(cards, { kind: 'retention', from: 0.9, to: 0.95 }));
    expect(lower.horizon).toEqual(higher.horizon);
    expect(lower.backlogCards).toBe(higher.backlogCards);
    // …while the thing that *does* change moves in opposite directions.
    expect(lower.reviewsPerDayDelta).toBeLessThan(0);
    expect(higher.reviewsPerDayDelta).toBeGreaterThan(0);
  });

  it('counts overdue cards as backlog and keeps them out of the horizon', () => {
    const result = ok(project(
      [reviewCard('1', 10, -40), reviewCard('2', 10, -1), reviewCard('3', 10, 0)],
      { kind: 'retention', from: 0.9, to: 0.8 },
    ));
    expect(result.backlogCards).toBe(2);
    expect(result.horizon.reduce((sum, d) => sum + d.cards, 0)).toBe(1);
    // Backlog is still workload: all three cards carry an interval.
    expect(result.scheduledCards).toBe(3);
  });

  it('clamps a hostile horizon length instead of building it', () => {
    const proposal = { kind: 'retention', from: 0.9, to: 0.8 } as const;
    expect(ok(project([reviewCard('1', 10)], proposal, { forecastDays: 100_000 })).forecastDays)
      .toBe(MAX_FORECAST_DAYS);
    expect(ok(project([reviewCard('1', 10)], proposal, { forecastDays: 0 })).forecastDays).toBe(1);
    expect(ok(project([reviewCard('1', 10)], proposal, { forecastDays: Number.NaN })).forecastDays)
      .toBe(30);
  });
});

describe('projectSchedulingImpact — refusals, each by its own name', () => {
  it('refuses a deck with no scheduled card rather than comparing 0 with 0', () => {
    // The user's own mined deck is exactly this shape: recipe 10 measured 0
    // cards with any SRS state on it.
    const result = project(
      [
        { id: '1', nid: 'n1', type: 0, queue: 0, due: 1 },
        { id: '2', nid: 'n2', type: 0, queue: 0, due: 2 },
      ],
      { kind: 'retention', from: 0.9, to: 0.8 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('no-scheduled-cards');
  });

  it('refuses a retention outside Anki’s own band, at either end and on either side', () => {
    for (const [from, to] of [
      [0.9, 0.5],
      [0.5, 0.9],
      [0.9, 1],
      [0.9, Number.NaN],
    ] as [number, number][]) {
      const result = project([reviewCard('1', 10)], { kind: 'retention', from, to });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe('retention-out-of-range');
    }
    // …and accepts both ends of the band it declares.
    expect(project([reviewCard('1', 10)], { kind: 'retention', from: 0.7, to: 0.99 }).ok).toBe(true);
  });

  it('refuses a modifier at or below zero', () => {
    for (const [from, to] of [
      [1, 0],
      [0, 1],
      [1, -0.5],
    ] as [number, number][]) {
      const result = project([reviewCard('1', 10)], { kind: 'interval-modifier', from, to });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe('modifier-out-of-range');
    }
  });

  it('refuses a draft with no collection origin, because every due day would be shifted', () => {
    const result = project([reviewCard('1', 10)], { kind: 'retention', from: 0.9, to: 0.8 }, {
      noOrigin: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('no-collection-origin');
  });

  it('refuses a `crt` of 0, which is how a real package on disk spells "no origin"', () => {
    // Found live, not in a fixture: `Ginga Eiyuu Densetsu.apkg` reports
    // `crt: 0`, and `apkgImport.ts:465` passes it straight through. Zero is
    // finite, so an isFinite guard alone dates every due day ~20,700 days early
    // — the whole deck lands in backlog and the horizon renders 30 empty rows
    // that read like a measurement.
    const result = project([reviewCard('1', 10)], { kind: 'retention', from: 0.9, to: 0.8 }, {
      zeroOrigin: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('no-collection-origin');
    // The control that proves the guard is about the origin and not the deck:
    // the identical card with a real `crt` projects.
    expect(project([reviewCard('1', 10)], { kind: 'retention', from: 0.9, to: 0.8 }).ok).toBe(true);
  });

  it('checks the proposal before the draft, so a bad number is named before a bad deck', () => {
    const result = project([], { kind: 'retention', from: 0.9, to: 0.1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe('retention-out-of-range');
  });
});
