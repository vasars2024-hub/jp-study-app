/**
 * FSRS-5 against the reference implementations' own test data.
 *
 * The expected numbers below are copied from the published test suites, not
 * computed here:
 *
 * - fsrs-rs v1.4.0 (`src/inference.rs`: `test_memo_state`, `next_states`,
 *   `test_next_interval`, `memory_from_sm2`), the FSRS-5 engine Anki 24.11 runs.
 * - ts-fsrs v4.5.0 (`__tests__/FSRSV5.test.ts`: `first repeat`, `memory state`,
 *   `get retrievability`).
 *
 * Both use the published FSRS-5 defaults, which are `DEFAULT_FSRS_WEIGHTS`.
 * fsrs-rs computes in f32, so its numbers are matched to ~5 significant digits.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FSRS_WEIGHTS,
  fsrsInitialMemory,
  fsrsInterval,
  fsrsMemoryFromSm2,
  fsrsRetrievability,
  fsrsReview,
  fsrsShortTermReview,
  type FsrsGrade,
  type FsrsMemory,
} from '../fsrs';
import { replayFsrsMemory } from '../fsrsMemoryReplay';

/** fsrs-rs v1.4.0's test-module `PARAMETERS`, which its memory-state tests run under. */
const FSRS_RS_TEST_PARAMETERS = [
  0.6845422, 1.6790825, 4.7349424, 10.042885, 7.4410233, 0.64219797, 1.071918, 0.0025195254,
  1.432437, 0.1544, 0.8692766, 2.0696752, 0.0953, 0.2975, 2.4691248, 0.19542035, 3.201072,
  0.18046261, 0.121442534,
];

const PUBLISHED_FSRS5_DEFAULTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

/** fsrs-rs `memory_state`: delta_t 0 after the first review is a short-term step. */
function memoryState(
  item: ReadonlyArray<[FsrsGrade, number]>,
  weights: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): FsrsMemory {
  let memory: FsrsMemory | null = null;
  for (const [grade, deltaT] of item) {
    memory = memory && deltaT === 0
      ? fsrsShortTermReview(memory, grade, weights)
      : fsrsReview(memory, grade, deltaT, weights);
  }
  if (!memory) throw new Error('empty item');
  return memory;
}

/** Relative closeness, for f32 reference values. */
function expectNear(actual: number, expected: number, relative = 2e-5): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relative + 1e-6);
}

describe('FSRS-5 defaults', () => {
  it('are the published nineteen parameters, in order', () => {
    expect([...DEFAULT_FSRS_WEIGHTS]).toEqual(PUBLISHED_FSRS5_DEFAULTS);
  });
});

describe('fsrs-rs v1.4.0 reference vectors', () => {
  const W = FSRS_RS_TEST_PARAMETERS;

  it('test_memo_state: 1/0, 3/1, 3/3, 3/8, 3/21 → S 31.722975, D 7.382128', () => {
    const memory = memoryState([[1, 0], [3, 1], [3, 3], [3, 8], [3, 21]], W);
    expectNear(memory.stability, 31.722975);
    expectNear(memory.difficulty, 7.382128);
  });

  it('test_memo_state: Good from S 20.925528 / D 7.005062 after 21 days → S 40.874535, D 6.9913807', () => {
    const next = fsrsReview({ stability: 20.925528, difficulty: 7.005062 }, 3, 21, W);
    expectNear(next.stability, 40.874535);
    expectNear(next.difficulty, 6.9913807);
  });

  it('next_states: all four buttons after 1/0, 3/1, 3/3, 3/8 and 21 days', () => {
    const memory = memoryState([[1, 0], [3, 1], [3, 3], [3, 8]], W);
    const expected: Record<FsrsGrade, [number, number, number]> = {
      1: [2.969144, 8.000659, 2.9691453],
      2: [17.091442, 7.6913934, 17.09145],
      3: [31.722975, 7.382128, 31.722988],
      4: [71.75015, 7.0728626, 71.75018],
    };
    for (const grade of [1, 2, 3, 4] as FsrsGrade[]) {
      const next = fsrsReview(memory, grade, 21, W);
      const [s, d, interval] = expected[grade];
      expectNear(next.stability, s);
      expectNear(next.difficulty, d);
      expectNear(fsrsInterval(next.stability, 0.9), interval);
    }
    expectNear(fsrsInterval(121.01552, 0.9), 121.01557);
  });

  it('test_next_interval: S 1 at retention 0.5 … 0.9 rounds to 13, 8, 4, 2, 1', () => {
    const got = [0.5, 0.6, 0.7, 0.8, 0.9].map((r) => Math.max(1, Math.round(fsrsInterval(1, r))));
    expect(got).toEqual([13, 8, 4, 2, 1]);
  });

  it('memory_from_sm2: ease, interval and SM-2 retention to S/D', () => {
    const cases: Array<[number, number, number, number, number]> = [
      [2.5, 10, 0.9, 9.999996, 7.079161],
      [2.5, 10, 0.8, 4.170096, 9.323614],
      [2.5, 10, 0.95, 21.712555, 2.174237],
      [1.3, 20, 0.9, 19.999992, 10],
    ];
    for (const [ease, interval, retention, s, d] of cases) {
      const memory = fsrsMemoryFromSm2(ease, interval, retention);
      expectNear(memory.stability, s, 1e-5);
      expectNear(memory.difficulty, d, 1e-5);
    }
  });
});

describe('ts-fsrs v4.5.0 reference vectors', () => {
  it('first repeat: initial stability and difficulty per grade', () => {
    const s = [1, 2, 3, 4].map((g) => fsrsInitialMemory(g as FsrsGrade).stability);
    const d = [1, 2, 3, 4].map((g) => fsrsInitialMemory(g as FsrsGrade).difficulty);
    s.forEach((value, i) => expectNear(value, [0.40255, 1.18385, 3.173, 15.69105][i], 1e-9));
    d.forEach((value, i) => expectNear(value, [7.1949, 6.48830527, 5.28243442, 3.22450159][i], 1e-8));
    // Easy graduates straight to review: 16 days at 90%.
    expect(Math.round(fsrsInterval(15.69105, 0.9))).toBe(16);
  });

  /*
   * ts-fsrs's loop reads the Good result of the next repeat, so the reviews are
   * Again, Good, Good on one day, then Good after 1, 3, 8 and 21 days. ts-fsrs
   * applies the short-term formula only in the Learning/Relearning STATE: the
   * first same-day Good (Learning) is short-term, the second (the card is in
   * Review by then) is a long-term step with t = 0, which leaves S unchanged.
   * fsrs-rs, and so Anki, uses the short-term formula for every delta_t = 0;
   * this app follows Anki. The vector is reproduced here with ts-fsrs's rule to
   * check the two formulas themselves.
   */
  it('memory state: Again, Good, Good same day, then Good after 1, 3, 8, 21 days → S 48.4848, D 7.0866', () => {
    let memory = fsrsReview(null, 1, 0);
    memory = fsrsShortTermReview(memory, 3);
    memory = fsrsReview(memory, 3, 0);
    for (const t of [1, 3, 8, 21]) memory = fsrsReview(memory, 3, t);
    expect(memory.stability).toBeCloseTo(48.4848, 4);
    expect(memory.difficulty).toBeCloseTo(7.0866, 4);
  });

  it('get retrievability: an Easy card at its 16-day due date is at 0.89832125', () => {
    expect(fsrsRetrievability(15.69105, 16)).toBeCloseTo(0.89832125, 7);
  });
});

describe('replay reproduces the reference sequence from a review log', () => {
  it('matches test_memo_state when the reviews are a log with 4 am study days', () => {
    // Local noon on consecutive study days: delta_t 1, 3, 8, 21.
    const day = (n: number) => new Date(2026, 0, 1 + n, 12, 0, 0).getTime();
    const rows = [
      { cardId: 'c', at: day(0), rating: 'again' as const, isNew: true },
      { cardId: 'c', at: day(1), rating: 'good' as const },
      { cardId: 'c', at: day(4), rating: 'good' as const },
      { cardId: 'c', at: day(12), rating: 'good' as const },
      { cardId: 'c', at: day(33), rating: 'good' as const },
    ];
    const replay = replayFsrsMemory(rows, { dayStartHour: 4, weights: FSRS_RS_TEST_PARAMETERS });
    expect(replay).not.toBeNull();
    expectNear(replay?.memory.stability ?? 0, 31.722975);
    expectNear(replay?.memory.difficulty ?? 0, 7.382128);
  });
});
