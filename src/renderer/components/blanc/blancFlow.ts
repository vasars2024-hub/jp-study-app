/**
 * Flow — Blanc's one-run study session.
 *
 * One keyboard-driven run chains the day's work with no navigation: due
 * reviews, then today's allowance of new cards, then the Capture inbox, then
 * the book read most recently. Each stage hands over to the next on its own.
 *
 * This module is the run's pure core (blancFlow.test.ts): what goes in the run
 * (`planFlow`), how it moves (`flowReducer`) and what it reports
 * (`formatFlowReport`). It never schedules anything. Which cards are due and
 * how many new ones today allows come from the same `shared/localSrs` filters
 * the deck uses (`filterLocalReviewsDue`, `limitNewCards`), and every grade is
 * written by the runner through `reviewDeckCard` — the deck's one scheduling
 * seam — so a Flow review and a Cards-tab review are the same review.
 */
import {
  filterLocalReviewsDue,
  isLocalSrsState,
  limitNewCards,
  type LocalSrsRating,
} from '../../../shared/localSrs';

export type FlowCardStage = 'reviews' | 'new';
export type FlowStage = 'setup' | FlowCardStage | 'inbox' | 'read' | 'done';
export type FlowEndReason = 'complete' | 'timebox' | 'stopped' | 'empty';

/** The stages a run can visit, in order (setup and done are its ends). */
export const FLOW_WORK_STAGES = ['reviews', 'new', 'inbox', 'read'] as const;

/** An Again card comes back this many times in one run, then leaves it. */
export const FLOW_MAX_REQUEUE = 3;

const UNDO_DEPTH = 20;

export interface FlowReadTarget {
  id: string;
  title: string;
}

export interface FlowPlan {
  /** Scheduled cards due now, most overdue first. */
  reviews: string[];
  /** Never-reviewed cards today's new-card allowance admits, in deck order. */
  news: string[];
  /** Items waiting in the Capture inbox (0 when the stage is off). */
  inbox: number;
  /** The book to resume at the end (null when there is none or the stage is off). */
  read: FlowReadTarget | null;
}

export interface FlowPlanInput<T extends { id: string; srs?: unknown }> {
  cards: readonly T[];
  now: number;
  /** The active profile's new cards per day; undefined = no cap (as in the deck). */
  newPerDay: number | undefined;
  /** New cards already introduced today, deck-wide. */
  introducedToday: number;
  inboxCount: number;
  readTarget: FlowReadTarget | null;
  includeInbox: boolean;
  includeReading: boolean;
}

function dueAtOf(srs: unknown): number {
  return isLocalSrsState(srs) ? srs.dueAt : 0;
}

export function planFlow<T extends { id: string; srs?: unknown }>(input: FlowPlanInput<T>): FlowPlan {
  const due = filterLocalReviewsDue(input.cards, input.now);
  const reviews = due
    .filter((card) => isLocalSrsState(card.srs))
    .map((card, index) => ({ card, index }))
    .sort((a, b) => dueAtOf(a.card.srs) - dueAtOf(b.card.srs) || a.index - b.index)
    .map(({ card }) => card.id);
  const unscheduled = due.filter((card) => !isLocalSrsState(card.srs));
  const news = limitNewCards(unscheduled, input.newPerDay, input.introducedToday).map((card) => card.id);
  return {
    reviews,
    news,
    inbox: input.includeInbox ? Math.max(0, Math.floor(input.inboxCount)) : 0,
    read: input.includeReading ? input.readTarget : null,
  };
}

export type FlowGrades = Record<LocalSrsRating, number>;

function emptyGrades(): FlowGrades {
  return { again: 0, hard: 0, good: 0, easy: 0 };
}

interface FlowUndoSnapshot {
  stage: FlowStage;
  queue: string[];
  grades: Record<FlowCardStage, FlowGrades>;
  graded: Record<string, FlowCardStage>;
  againCounts: Record<string, number>;
  /** The card the undone grade was for, shown again revealed. */
  cardId: string;
}

export interface FlowState {
  stage: FlowStage;
  plan: FlowPlan;
  /** The current card stage's remaining cards; the head is on screen. */
  queue: string[];
  revealed: boolean;
  grades: Record<FlowCardStage, FlowGrades>;
  /** Every card graded at least once, and the stage it was graded in. */
  graded: Record<string, FlowCardStage>;
  againCounts: Record<string, number>;
  inbox: { added: number; discarded: number };
  readOpened: boolean;
  sprintMinutes: number;
  timeUp: boolean;
  endReason: FlowEndReason | null;
  startedAt: number | null;
  /** Active time banked before the current running stretch. */
  activeMs: number;
  /** Start of the current running stretch; null while paused or not running. */
  resumedAt: number | null;
  paused: boolean;
  undo: FlowUndoSnapshot[];
}

export function createFlowState(plan: FlowPlan, sprintMinutes = 0): FlowState {
  return {
    stage: 'setup',
    plan,
    queue: [],
    revealed: false,
    grades: { reviews: emptyGrades(), new: emptyGrades() },
    graded: {},
    againCounts: {},
    inbox: { added: 0, discarded: 0 },
    readOpened: false,
    sprintMinutes: Math.max(0, Math.floor(sprintMinutes)),
    timeUp: false,
    endReason: null,
    startedAt: null,
    activeMs: 0,
    resumedAt: null,
    paused: false,
    undo: [],
  };
}

export type FlowAction =
  | { type: 'setSprint'; minutes: number }
  | { type: 'start'; now: number }
  | { type: 'reveal' }
  | { type: 'grade'; rating: LocalSrsRating; now: number }
  | { type: 'undo' }
  | { type: 'skipStage'; now: number }
  | { type: 'next'; now: number }
  | { type: 'openRead'; now: number }
  | { type: 'inboxResult'; added?: number; discarded?: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'timeUp'; now: number }
  | { type: 'stop'; now: number };

function stageHasWork(plan: FlowPlan, stage: (typeof FLOW_WORK_STAGES)[number]): boolean {
  if (stage === 'reviews') return plan.reviews.length > 0;
  if (stage === 'new') return plan.news.length > 0;
  if (stage === 'inbox') return plan.inbox > 0;
  return plan.read !== null;
}

/** True when the plan has nothing at all to do. */
export function flowPlanIsEmpty(plan: FlowPlan): boolean {
  return FLOW_WORK_STAGES.every((stage) => !stageHasWork(plan, stage));
}

export function flowElapsedMs(state: FlowState, now: number): number {
  return state.activeMs + (state.resumedAt !== null ? Math.max(0, now - state.resumedAt) : 0);
}

function finish(state: FlowState, reason: FlowEndReason, now: number): FlowState {
  return {
    ...state,
    stage: 'done',
    queue: [],
    revealed: false,
    endReason: reason,
    activeMs: flowElapsedMs(state, now),
    resumedAt: null,
    paused: false,
    undo: [],
  };
}

/** Enter the first stage after `from` (exclusive) that has work, or finish. */
function enterNextStage(state: FlowState, from: FlowStage, now: number): FlowState {
  const order: readonly FlowStage[] = FLOW_WORK_STAGES;
  const start = from === 'setup' ? 0 : order.indexOf(from) + 1;
  for (let i = Math.max(0, start); i < order.length; i += 1) {
    const stage = order[i] as (typeof FLOW_WORK_STAGES)[number];
    if (!stageHasWork(state.plan, stage)) continue;
    // A sprint that ran out between stages ends the run here rather than
    // opening a stage it would cut off at once.
    if (state.timeUp) return finish(state, 'timebox', now);
    const queue = stage === 'reviews' ? [...state.plan.reviews] : stage === 'new' ? [...state.plan.news] : [];
    return { ...state, stage, queue, revealed: false };
  }
  return finish(state, state.timeUp ? 'timebox' : 'complete', now);
}

function isCardStage(stage: FlowStage): stage is FlowCardStage {
  return stage === 'reviews' || stage === 'new';
}

/** The card on screen, or null outside a card stage. */
export function currentFlowCard(state: FlowState): string | null {
  return isCardStage(state.stage) ? state.queue[0] ?? null : null;
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  const running = state.stage !== 'setup' && state.stage !== 'done';
  switch (action.type) {
    case 'setSprint':
      if (state.stage !== 'setup') return state;
      return { ...state, sprintMinutes: Math.max(0, Math.floor(action.minutes)) };
    case 'start': {
      if (state.stage !== 'setup') return state;
      const started = { ...state, startedAt: action.now, resumedAt: action.now, paused: false };
      if (flowPlanIsEmpty(state.plan)) return finish(started, 'empty', action.now);
      return enterNextStage(started, 'setup', action.now);
    }
    case 'reveal':
      if (!running || state.paused || !currentFlowCard(state)) return state;
      return { ...state, revealed: true };
    case 'grade': {
      const id = currentFlowCard(state);
      if (!id || !state.revealed || state.paused || !isCardStage(state.stage)) return state;
      const stage = state.stage;
      const snapshot: FlowUndoSnapshot = {
        stage,
        queue: state.queue,
        grades: state.grades,
        graded: state.graded,
        againCounts: state.againCounts,
        cardId: id,
      };
      const grades = {
        ...state.grades,
        [stage]: { ...state.grades[stage], [action.rating]: state.grades[stage][action.rating] + 1 },
      };
      const graded = state.graded[id] ? state.graded : { ...state.graded, [id]: stage };
      let queue = state.queue.slice(1);
      let againCounts = state.againCounts;
      if (action.rating === 'again' && (state.againCounts[id] ?? 0) < FLOW_MAX_REQUEUE) {
        // Same convention as the Cards tab: an Again card returns at the end of
        // the sitting. The schedule itself was already written by the runner.
        queue = [...queue, id];
        againCounts = { ...state.againCounts, [id]: (state.againCounts[id] ?? 0) + 1 };
      }
      const next: FlowState = {
        ...state,
        queue,
        revealed: false,
        grades,
        graded,
        againCounts,
        undo: [...state.undo, snapshot].slice(-UNDO_DEPTH),
      };
      if (state.timeUp) return finish(next, 'timebox', action.now);
      if (!queue.length) return enterNextStage(next, stage, action.now);
      return next;
    }
    case 'undo': {
      const snapshot = state.undo[state.undo.length - 1];
      if (!snapshot || state.stage === 'done' || state.stage === 'setup') return state;
      return {
        ...state,
        stage: snapshot.stage,
        queue: snapshot.queue,
        grades: snapshot.grades,
        graded: snapshot.graded,
        againCounts: snapshot.againCounts,
        revealed: true,
        undo: state.undo.slice(0, -1),
      };
    }
    case 'skipStage':
      if (!running || state.paused) return state;
      return enterNextStage({ ...state, undo: [] }, state.stage, action.now);
    case 'next':
      if (!running || state.paused || isCardStage(state.stage)) return state;
      return enterNextStage(state, state.stage, action.now);
    case 'openRead':
      if (!running || state.paused || state.stage !== 'read') return state;
      return finish({ ...state, readOpened: true }, state.timeUp ? 'timebox' : 'complete', action.now);
    case 'inboxResult':
      return {
        ...state,
        inbox: {
          added: state.inbox.added + Math.max(0, action.added ?? 0),
          discarded: state.inbox.discarded + Math.max(0, action.discarded ?? 0),
        },
      };
    case 'pause':
      if (!running || state.paused) return state;
      return { ...state, paused: true, activeMs: flowElapsedMs(state, action.now), resumedAt: null };
    case 'resume':
      if (!running || !state.paused) return state;
      return { ...state, paused: false, resumedAt: action.now };
    case 'timeUp': {
      if (!running) return state;
      const flagged = { ...state, timeUp: true };
      // Mid-card with the answer showing: let that one grade land first.
      if (isCardStage(state.stage) && state.revealed && currentFlowCard(state)) return flagged;
      return finish(flagged, 'timebox', action.now);
    }
    case 'stop':
      if (!running) return state;
      return finish(state, 'stopped', action.now);
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Totals and the report

export interface FlowTotals {
  reviewCards: number;
  newCards: number;
  answers: number;
  correct: number;
  /** 0..100, or null with no answers. */
  accuracy: number | null;
}

function sumGrades(grades: FlowGrades): number {
  return grades.again + grades.hard + grades.good + grades.easy;
}

export function flowTotals(state: FlowState): FlowTotals {
  const stages = Object.values(state.graded);
  const answers = sumGrades(state.grades.reviews) + sumGrades(state.grades.new);
  const again = state.grades.reviews.again + state.grades.new.again;
  return {
    reviewCards: stages.filter((stage) => stage === 'reviews').length,
    newCards: stages.filter((stage) => stage === 'new').length,
    answers,
    correct: answers - again,
    accuracy: answers ? Math.round(((answers - again) / answers) * 100) : null,
  };
}

/** `m:ss` under an hour, `h:mm:ss` from there: no words, so no language. */
export function formatFlowDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export type FlowTranslate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The plain-text session report (copyable). Every line comes from the catalog;
 * the numbers come from `flowTotals`. `dateLabel` is formatted by the caller in
 * the UI language.
 */
export function formatFlowReport(state: FlowState, now: number, t: FlowTranslate, dateLabel: string): string {
  const totals = flowTotals(state);
  const lines: string[] = [t('blanc.mech.flow.report.title', { date: dateLabel })];
  const time = formatFlowDuration(flowElapsedMs(state, now));
  lines.push(state.sprintMinutes > 0
    ? t('blanc.mech.flow.report.timeSprint', { time, count: state.sprintMinutes })
    : t('blanc.mech.flow.report.time', { time }));
  const breakdown = (grades: FlowGrades): string => t('blanc.mech.flow.report.grades', {
    again: grades.again,
    hard: grades.hard,
    good: grades.good,
    easy: grades.easy,
  });
  lines.push(`${t('blanc.mech.flow.report.reviews', { count: totals.reviewCards })} (${breakdown(state.grades.reviews)})`);
  lines.push(`${t('blanc.mech.flow.report.new', { count: totals.newCards })} (${breakdown(state.grades.new)})`);
  lines.push(totals.accuracy === null
    ? t('blanc.mech.flow.report.noAnswers')
    : t('blanc.mech.flow.report.accuracy', { pct: totals.accuracy, correct: totals.correct, count: totals.answers }));
  if (state.inbox.added || state.inbox.discarded) {
    lines.push(t('blanc.mech.flow.report.inbox', { added: state.inbox.added, discarded: state.inbox.discarded }));
  }
  if (state.readOpened && state.plan.read) {
    lines.push(t('blanc.mech.flow.report.reading', { title: state.plan.read.title }));
  }
  if (state.endReason) lines.push(t(`blanc.mech.flow.end.${state.endReason}`));
  return lines.join('\n');
}
