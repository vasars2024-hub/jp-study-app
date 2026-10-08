import { describe, expect, it } from 'vitest';
import type { LocalSrsState } from '../../shared/localSrs';
import { dueDeckCards } from '../flashcardDeck';
import {
  FLOW_MAX_REQUEUE,
  createFlowState,
  currentFlowCard,
  flowElapsedMs,
  flowReducer,
  flowTotals,
  formatFlowDuration,
  formatFlowReport,
  planFlow,
  type FlowAction,
  type FlowPlan,
  type FlowState,
} from '../components/blanc/blancFlow';

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const HOUR = 3_600_000;

function srs(dueAt: number): LocalSrsState {
  return {
    version: 1,
    dueAt,
    intervalDays: 3,
    ease: 2.5,
    repetitions: 2,
    lapses: 0,
    lastReviewedAt: dueAt - 3 * 24 * HOUR,
    lastRating: 'good',
  };
}

const CARDS = [
  { id: 'due-late', srs: srs(NOW - HOUR) },
  { id: 'new-1' },
  { id: 'future', srs: srs(NOW + 24 * HOUR) },
  { id: 'due-early', srs: srs(NOW - 5 * HOUR) },
  { id: 'new-2' },
  { id: 'new-3' },
  { id: 'broken-srs', srs: { version: 9 } },
];

function plan(overrides: Partial<Parameters<typeof planFlow>[0]> = {}): FlowPlan {
  return planFlow({
    cards: CARDS,
    now: NOW,
    newPerDay: 10,
    introducedToday: 0,
    inboxCount: 2,
    readTarget: { id: 'book-1', title: 'Book' },
    includeInbox: true,
    includeReading: true,
    ...overrides,
  });
}

function run(state: FlowState, ...actions: FlowAction[]): FlowState {
  return actions.reduce(flowReducer, state);
}

const reveal: FlowAction = { type: 'reveal' };
const good: FlowAction = { type: 'grade', rating: 'good', now: NOW };
const again: FlowAction = { type: 'grade', rating: 'again', now: NOW };

describe('planFlow', () => {
  it('takes due scheduled cards most-overdue first and leaves future ones out', () => {
    expect(plan().reviews).toEqual(['due-early', 'due-late']);
  });

  it('treats unscheduled (and unreadable) schedules as new, in deck order', () => {
    expect(plan().news).toEqual(['new-1', 'new-2', 'new-3', 'broken-srs']);
  });

  it('respects the daily new-card allowance minus what today already introduced', () => {
    expect(plan({ newPerDay: 3, introducedToday: 1 }).news).toEqual(['new-1', 'new-2']);
    expect(plan({ newPerDay: 3, introducedToday: 5 }).news).toEqual([]);
    expect(plan({ newPerDay: undefined }).news).toHaveLength(4);
  });

  it('admits exactly the cards the deck itself calls due (same filters, no forked math)', () => {
    const p = plan({ newPerDay: 2, introducedToday: 0 });
    const deckDue = dueDeckCards(CARDS, NOW, 2, 0).map((card) => card.id).sort();
    expect([...p.reviews, ...p.news].sort()).toEqual(deckDue);
  });

  it('drops the inbox and reading stages when they are switched off', () => {
    const p = plan({ includeInbox: false, includeReading: false });
    expect(p.inbox).toBe(0);
    expect(p.read).toBeNull();
  });
});

describe('flowReducer stage sequencing', () => {
  it('runs reviews, then new cards, then inbox, then reading, then reports', () => {
    let s = run(createFlowState(plan()), { type: 'start', now: NOW });
    expect(s.stage).toBe('reviews');
    expect(currentFlowCard(s)).toBe('due-early');
    s = run(s, reveal, good, reveal, good);
    expect(s.stage).toBe('new');
    expect(currentFlowCard(s)).toBe('new-1');
    s = run(s, reveal, good, reveal, good, reveal, good, reveal, good);
    expect(s.stage).toBe('inbox');
    s = run(s, { type: 'inboxResult', added: 1, discarded: 1 }, { type: 'next', now: NOW });
    expect(s.stage).toBe('read');
    s = run(s, { type: 'openRead', now: NOW + 60_000 });
    expect(s.stage).toBe('done');
    expect(s.endReason).toBe('complete');
    expect(s.readOpened).toBe(true);
    expect(flowTotals(s)).toMatchObject({ reviewCards: 2, newCards: 4, answers: 6, correct: 6, accuracy: 100 });
  });

  it('skips stages with nothing in them', () => {
    const p = plan({ cards: [{ id: 'new-only' }], inboxCount: 0, readTarget: null });
    let s = run(createFlowState(p), { type: 'start', now: NOW });
    expect(s.stage).toBe('new');
    s = run(s, reveal, good);
    expect(s.stage).toBe('done');
    expect(s.endReason).toBe('complete');
  });

  it('ends at once, as "empty", when there is nothing to do', () => {
    const p = plan({ cards: [], inboxCount: 0, readTarget: null });
    const s = run(createFlowState(p), { type: 'start', now: NOW });
    expect(s.stage).toBe('done');
    expect(s.endReason).toBe('empty');
  });

  it('grades only a revealed card', () => {
    const s = run(createFlowState(plan()), { type: 'start', now: NOW }, good);
    expect(currentFlowCard(s)).toBe('due-early');
    expect(flowTotals(s).answers).toBe(0);
  });

  it('sends an Again card to the back of its stage, at most FLOW_MAX_REQUEUE times', () => {
    let s = run(createFlowState(plan()), { type: 'start', now: NOW }, reveal, again);
    expect(s.queue).toEqual(['due-late', 'due-early']);
    s = run(s, reveal, good); // due-late done
    for (let i = 1; i < FLOW_MAX_REQUEUE; i += 1) {
      s = run(s, reveal, again);
      expect(s.queue).toEqual(['due-early']);
    }
    s = run(s, reveal, again); // the cap: it leaves the run
    expect(s.stage).toBe('new');
    expect(s.grades.reviews.again).toBe(FLOW_MAX_REQUEUE + 1);
    expect(flowTotals(s).reviewCards).toBe(2);
  });

  it('skips the rest of a stage with S', () => {
    const s = run(createFlowState(plan()), { type: 'start', now: NOW }, { type: 'skipStage', now: NOW });
    expect(s.stage).toBe('new');
  });

  it('undoes the last grade, card back on screen and revealed', () => {
    const s = run(createFlowState(plan()), { type: 'start', now: NOW }, reveal, good, { type: 'undo' });
    expect(s.stage).toBe('reviews');
    expect(currentFlowCard(s)).toBe('due-early');
    expect(s.revealed).toBe(true);
    expect(flowTotals(s).answers).toBe(0);
  });

  it('undo also walks back across a stage boundary', () => {
    const p = plan({ cards: [{ id: 'a', srs: srs(NOW - HOUR) }, { id: 'b' }], inboxCount: 0, readTarget: null });
    const s = run(createFlowState(p), { type: 'start', now: NOW }, reveal, good, { type: 'undo' });
    expect(s.stage).toBe('reviews');
    expect(currentFlowCard(s)).toBe('a');
  });

  it('stops early with Q', () => {
    const s = run(createFlowState(plan()), { type: 'start', now: NOW }, { type: 'stop', now: NOW });
    expect(s.stage).toBe('done');
    expect(s.endReason).toBe('stopped');
  });
});

describe('flowReducer time box and pause', () => {
  it('ends right away when the sprint runs out before the answer is shown', () => {
    const s = run(createFlowState(plan(), 10), { type: 'start', now: NOW }, { type: 'timeUp', now: NOW });
    expect(s.stage).toBe('done');
    expect(s.endReason).toBe('timebox');
  });

  it('lets the card on screen be graded first when the answer is showing', () => {
    let s = run(createFlowState(plan(), 10), { type: 'start', now: NOW }, reveal, { type: 'timeUp', now: NOW });
    expect(s.stage).toBe('reviews');
    expect(s.timeUp).toBe(true);
    s = run(s, good);
    expect(s.stage).toBe('done');
    expect(s.endReason).toBe('timebox');
    expect(flowTotals(s).answers).toBe(1);
  });

  it('counts only active time: a pause does not run the clock', () => {
    let s = run(createFlowState(plan()), { type: 'start', now: NOW });
    s = run(s, { type: 'pause', now: NOW + 60_000 });
    expect(s.paused).toBe(true);
    expect(flowElapsedMs(s, NOW + 10 * 60_000)).toBe(60_000);
    // Paused: keys do nothing.
    expect(run(s, reveal)).toBe(s);
    s = run(s, { type: 'resume', now: NOW + 10 * 60_000 });
    expect(flowElapsedMs(s, NOW + 10 * 60_000 + 30_000)).toBe(90_000);
  });
});

describe('formatFlowReport', () => {
  const t = (key: string, vars: Record<string, string | number> = {}): string =>
    `${key}${Object.keys(vars).length ? `(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : ''}`;

  it('reports counts, grades, accuracy, inbox, reading and how it ended, one line each', () => {
    let s = run(createFlowState(plan(), 20), { type: 'start', now: NOW });
    s = run(s, reveal, again, reveal, good, reveal, good); // due-early again, due-late good, due-early good
    s = run(s, { type: 'skipStage', now: NOW }, { type: 'inboxResult', added: 2 }, { type: 'next', now: NOW });
    s = run(s, { type: 'openRead', now: NOW + 125_000 });
    const report = formatFlowReport(s, NOW + 125_000, t, 'DATE').split('\n');
    expect(report).toEqual([
      'blanc.mech.flow.report.title(date=DATE)',
      'blanc.mech.flow.report.timeSprint(time=2:05,count=20)',
      'blanc.mech.flow.report.reviews(count=2) (blanc.mech.flow.report.grades(again=1,hard=0,good=2,easy=0))',
      'blanc.mech.flow.report.new(count=0) (blanc.mech.flow.report.grades(again=0,hard=0,good=0,easy=0))',
      'blanc.mech.flow.report.accuracy(pct=67,correct=2,count=3)',
      'blanc.mech.flow.report.inbox(added=2,discarded=0)',
      'blanc.mech.flow.report.reading(title=Book)',
      'blanc.mech.flow.end.complete',
    ]);
  });

  it('formats durations without words', () => {
    expect(formatFlowDuration(0)).toBe('0:00');
    expect(formatFlowDuration(65_000)).toBe('1:05');
    expect(formatFlowDuration(3_725_000)).toBe('1:02:05');
  });
});
