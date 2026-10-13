// @vitest-environment jsdom
/**
 * Grammar review must schedule a point exactly as the flashcard scheduler
 * schedules a card. `reviewGrammarPoint` used to treat ANY state with zero
 * repetitions and a zero-day interval as a brand-new card, and a card inside its
 * learning or relearning steps looks exactly like that:
 *
 *   - SM-2 (defaults): Good x3, Again, Good after the 10-minute step came back
 *     with lapses 0 / ease 2.5 instead of the scheduler's lapses 1 / ease 2.3, so
 *     the lapse and ease penalty vanished and leeches could never trigger;
 *   - FSRS: the same sequence reset the memory model (and the lapse);
 *   - learning steps "1m 10m": Good repeated "step 1, 10 min" forever.
 *
 * The practice test also wrote every answer into the schedule, due or not, so
 * three Goods inside one sitting pushed a new point out to an 8-day interval.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  enrolGrammarPoints,
  isUnreviewedGrammarState,
  recordTestAnswer,
  restoreGrammarPoint,
  reviewGrammarPoint,
  schedulerPrior,
  seedMissed,
} from '../grammarSrs';
import {
  DEFAULT_SCHEDULING_CONFIG,
  previewScheduleDelays,
  scheduleReview,
  type SchedulingConfig,
} from '../../shared/flashcardScheduling';
import type { LocalSrsRating, LocalSrsState } from '../../shared/localSrs';

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);

/** Good (day 0), Good (+1 d), Good (+3 d), Again (+8 d), Good after the 10-minute step. */
const LAPSE_SEQUENCE: Array<[LocalSrsRating, number]> = [
  ['good', 0],
  ['good', DAY],
  ['good', 3 * DAY],
  ['again', 8 * DAY],
  ['good', 10 * MIN],
];

/** The same ratings through the grammar path (from an enrolled point) and straight through the scheduler. */
function bothPaths(config: SchedulingConfig, ratings: Array<[LocalSrsRating, number]>) {
  let grammar: Record<string, LocalSrsState> = enrolGrammarPoints({}, ['p'], T0);
  let direct: LocalSrsState | undefined;
  let at = T0;
  for (const [rating, wait] of ratings) {
    at += wait;
    grammar = reviewGrammarPoint(grammar, 'p', rating, config, at);
    direct = scheduleReview(direct, rating, config, at);
  }
  return { grammar: grammar.p, direct: direct! };
}

beforeEach(() => localStorage.clear());

describe('grammar review follows the flashcard scheduler through steps', () => {
  it('SM-2 (default config): a lapse keeps its lapse count and ease penalty', () => {
    const { grammar, direct } = bothPaths(DEFAULT_SCHEDULING_CONFIG, LAPSE_SEQUENCE);
    expect(direct.lapses).toBe(1);
    expect(direct.ease).toBeCloseTo(2.3, 5);
    // Before the fix: lapses 0, ease 2.5.
    expect(grammar.lapses).toBe(1);
    expect(grammar.ease).toBeCloseTo(2.3, 5);
    expect(grammar).toEqual(direct);
  });

  it('SM-2: the relearning step itself is not read as a new card', () => {
    let s: Record<string, LocalSrsState> = enrolGrammarPoints({}, ['p'], T0);
    s = reviewGrammarPoint(s, 'p', 'good', DEFAULT_SCHEDULING_CONFIG, T0);
    s = reviewGrammarPoint(s, 'p', 'again', DEFAULT_SCHEDULING_CONFIG, T0 + DAY);
    expect(s.p.phase).toBe('relearning');
    expect(isUnreviewedGrammarState(s.p)).toBe(false);
  });

  it('FSRS: a lapse keeps the memory model and the lapse', () => {
    const fsrs: SchedulingConfig = { ...DEFAULT_SCHEDULING_CONFIG, algorithm: 'fsrs' };
    const { grammar, direct } = bothPaths(fsrs, LAPSE_SEQUENCE);
    expect(direct.lapses).toBe(1);
    expect(grammar.lapses).toBe(1);
    expect(grammar.stability).toBeCloseTo(direct.stability!, 10);
    expect(grammar.difficulty).toBeCloseTo(direct.difficulty!, 10);
    expect(grammar).toEqual(direct);
  });

  it('learning steps 1m 10m: Good walks the steps and graduates', () => {
    const steps: SchedulingConfig = { ...DEFAULT_SCHEDULING_CONFIG, learningStepsMinutes: [1, 10] };
    let s: Record<string, LocalSrsState> = enrolGrammarPoints({}, ['p'], T0);
    let at = T0;
    const trail: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      s = reviewGrammarPoint(s, 'p', 'good', steps, at);
      trail.push(s.p.phase ? `${s.p.phase}:${s.p.step}:${Math.round((s.p.dueAt - at) / MIN)}m` : `review:${s.p.intervalDays}d`);
      at = s.p.dueAt;
    }
    // Before the fix: learning:1:10m three times over, never graduating.
    expect(trail).toEqual(['learning:1:10m', 'review:1d', 'review:3d']);
    const { grammar, direct } = bothPaths(steps, [['good', 0], ['good', 10 * MIN], ['good', DAY]]);
    expect(grammar).toEqual(direct);
  });

  it('enrolled and seeded placeholders still review as new cards', () => {
    const enrolled = enrolGrammarPoints({}, ['e'], T0);
    const seeded = seedMissed({}, ['m'], T0);
    expect(isUnreviewedGrammarState(enrolled.e)).toBe(true);
    expect(isUnreviewedGrammarState(seeded.m)).toBe(true);
    expect(reviewGrammarPoint(enrolled, 'e', 'good', DEFAULT_SCHEDULING_CONFIG, T0).e).toEqual(
      scheduleReview(undefined, 'good', DEFAULT_SCHEDULING_CONFIG, T0),
    );
    const steps: SchedulingConfig = { ...DEFAULT_SCHEDULING_CONFIG, learningStepsMinutes: [1, 10] };
    expect(reviewGrammarPoint(seeded, 'm', 'good', steps, T0).m.phase).toBe('learning');
  });

  it('an SM-2 Again on a new card (no learning steps) keeps its lowered ease', () => {
    const { grammar, direct } = bothPaths(DEFAULT_SCHEDULING_CONFIG, [['again', 0], ['good', 10 * MIN]]);
    expect(grammar).toEqual(direct);
  });

  it('the interval preview sees the relearning step, not a new card', () => {
    let s: Record<string, LocalSrsState> = enrolGrammarPoints({}, ['p'], T0);
    s = reviewGrammarPoint(s, 'p', 'good', DEFAULT_SCHEDULING_CONFIG, T0);
    s = reviewGrammarPoint(s, 'p', 'again', DEFAULT_SCHEDULING_CONFIG, T0 + DAY);
    const at = s.p.dueAt;
    const preview = previewScheduleDelays(schedulerPrior(s.p), DEFAULT_SCHEDULING_CONFIG, at);
    const direct = previewScheduleDelays(s.p, DEFAULT_SCHEDULING_CONFIG, at);
    expect(preview).toEqual(direct);
    // Again in relearning goes back to the 10-minute step.
    expect(preview.again * 24 * 60).toBeCloseTo(10, 5);
  });
});

describe('practice-test answers and the schedule', () => {
  it('writes only for a point that is due or unscheduled', () => {
    let s: Record<string, LocalSrsState> | Readonly<Record<string, LocalSrsState>> = {};
    // Three Goods within minutes on a new point.
    for (let i = 0; i < 3; i += 1) s = recordTestAnswer(s, 'p', 'good', DEFAULT_SCHEDULING_CONFIG, T0 + i * MIN);
    // Before the fix: interval 8 days after three answers.
    expect(s.p.intervalDays).toBe(1);
    expect(s.p.repetitions).toBe(1);
    expect(s.p.lastReviewedAt).toBe(T0);
  });

  it('returns the same state object when the answer is practice only', () => {
    const s = reviewGrammarPoint({}, 'p', 'good', DEFAULT_SCHEDULING_CONFIG, T0);
    expect(recordTestAnswer(s, 'p', 'again', DEFAULT_SCHEDULING_CONFIG, T0 + MIN)).toBe(s);
  });

  it('a due point is written, Again included', () => {
    const s = reviewGrammarPoint({}, 'p', 'good', DEFAULT_SCHEDULING_CONFIG, T0);
    const next = recordTestAnswer(s, 'p', 'again', DEFAULT_SCHEDULING_CONFIG, s.p.dueAt);
    expect(next).not.toBe(s);
    expect(next.p.lapses).toBe(1);
    // Enrolled (due now) points are written too.
    const enrolled = enrolGrammarPoints({}, ['q'], T0);
    expect(recordTestAnswer(enrolled, 'q', 'good', DEFAULT_SCHEDULING_CONFIG, T0).q.repetitions).toBe(1);
  });
});

describe('restoreGrammarPoint (Review undo)', () => {
  it('puts back the previous state, or removes a point that had none', () => {
    const before = enrolGrammarPoints({}, ['a'], T0);
    const after = reviewGrammarPoint(before, 'a', 'good', DEFAULT_SCHEDULING_CONFIG, T0);
    expect(restoreGrammarPoint(after, 'a', before.a)).toEqual(before);
    const fresh = reviewGrammarPoint({}, 'b', 'good', DEFAULT_SCHEDULING_CONFIG, T0);
    expect(restoreGrammarPoint(fresh, 'b', undefined)).toEqual({});
  });
});
