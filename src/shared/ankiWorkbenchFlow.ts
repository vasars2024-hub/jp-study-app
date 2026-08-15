// The Deck Workbench's numbered guided flow — Phase 2 of ANKI_DECK_WORKBENCH_PLAN.md.
//
// The plan asks for "one visible, resumable stepper so a new user always knows
// where they are", with seven steps, a short outcome sentence and affected count
// per step, safe Back/Next, free movement between completed steps, and the hard
// rule that **Back never loses work**.
//
// All of that is decidable from step state alone, so it lives here as pure data
// and the surface only renders it. Nothing in this module touches React, IPC or
// the draft model: a step's `affected` count is whatever the caller measured,
// and its outcome sentence is an i18n *key* the surface resolves, because a
// shared module must never hold user-visible English.

export const WORKBENCH_STEP_IDS = [
  'source',
  'browse',
  'enrich',
  'fields',
  'rules',
  'review',
  'apply',
] as const;

export type WorkbenchStepId = (typeof WORKBENCH_STEP_IDS)[number];

/**
 * `blocked` is the only value that stops the flow. `warning` needs the surface
 * to say something and still lets the user continue — this mirrors
 * `AnkiDraftDiagnostic.severity`, deliberately, so a diagnostic can be mapped
 * onto a step without a second vocabulary.
 */
export type WorkbenchStepValidation = 'ok' | 'warning' | 'blocked';

export interface WorkbenchStepState {
  id: WorkbenchStepId;
  /** The step's required decision has been made and the flow may advance past it. */
  satisfied: boolean;
  /**
   * Set when an earlier step changed underneath this one. The step keeps every
   * recorded value — that is the "Back never loses work" rule — but it no longer
   * counts as satisfied, so the flow cannot walk over it unexamined.
   */
  stale: boolean;
  /** i18n key for the step's one-line outcome sentence. Empty until recorded. */
  outcomeKey: string;
  /** Interpolation values for `outcomeKey`. */
  outcomeParams?: Record<string, string | number>;
  /** How many notes/cards this step's decisions affect. */
  affected: number;
  validation: WorkbenchStepValidation;
}

export interface WorkbenchFlowState {
  current: WorkbenchStepId;
  steps: WorkbenchStepState[];
}

function emptyStep(id: WorkbenchStepId): WorkbenchStepState {
  return { id, satisfied: false, stale: false, outcomeKey: '', affected: 0, validation: 'ok' };
}

export function createWorkbenchFlow(): WorkbenchFlowState {
  return { current: 'source', steps: WORKBENCH_STEP_IDS.map(emptyStep) };
}

export function stepIndex(id: WorkbenchStepId): number {
  return WORKBENCH_STEP_IDS.indexOf(id);
}

export function findStep(state: WorkbenchFlowState, id: WorkbenchStepId): WorkbenchStepState {
  return state.steps[stepIndex(id)] ?? emptyStep(id);
}

/** A step is passable when its decision is made, not stale, and nothing blocks it. */
export function stepIsPassable(step: WorkbenchStepState): boolean {
  return step.satisfied && !step.stale && step.validation !== 'blocked';
}

/**
 * The furthest step the user may stand on: every step up to and including the
 * first one that is not yet passable. Steps beyond it are locked, which is what
 * keeps required decisions from being scattered or skipped.
 */
export function furthestReachableIndex(state: WorkbenchFlowState): number {
  for (let i = 0; i < state.steps.length; i += 1) {
    if (!stepIsPassable(state.steps[i]!)) return i;
  }
  return state.steps.length - 1;
}

export function canEnterStep(state: WorkbenchFlowState, id: WorkbenchStepId): boolean {
  const target = stepIndex(id);
  if (target < 0) return false;
  return target <= furthestReachableIndex(state);
}

export type WorkbenchGotoReason = 'ok' | 'unknown-step' | 'locked';

export interface WorkbenchGotoResult {
  ok: boolean;
  reason: WorkbenchGotoReason;
  /** Unchanged when `ok` is false — a refused move must not half-apply. */
  state: WorkbenchFlowState;
  /** The first step that is not passable, when the move was refused as `locked`. */
  blockedBy?: WorkbenchStepId;
}

export function goToStep(state: WorkbenchFlowState, id: WorkbenchStepId): WorkbenchGotoResult {
  if (stepIndex(id) < 0) return { ok: false, reason: 'unknown-step', state };
  if (!canEnterStep(state, id)) {
    return {
      ok: false,
      reason: 'locked',
      state,
      blockedBy: WORKBENCH_STEP_IDS[furthestReachableIndex(state)],
    };
  }
  return { ok: true, reason: 'ok', state: { ...state, steps: state.steps, current: id } };
}

export function nextStep(state: WorkbenchFlowState): WorkbenchGotoResult {
  const at = stepIndex(state.current);
  const to = WORKBENCH_STEP_IDS[at + 1];
  if (!to) return { ok: false, reason: 'unknown-step', state };
  return goToStep(state, to);
}

/**
 * Back is always allowed as far as `source`. It never touches recorded values;
 * moving backwards is navigation, not an edit.
 */
export function previousStep(state: WorkbenchFlowState): WorkbenchGotoResult {
  const at = stepIndex(state.current);
  const to = WORKBENCH_STEP_IDS[at - 1];
  if (!to) return { ok: false, reason: 'unknown-step', state };
  return { ok: true, reason: 'ok', state: { ...state, current: to } };
}

export interface RecordStepInput {
  satisfied?: boolean;
  outcomeKey?: string;
  outcomeParams?: Record<string, string | number>;
  affected?: number;
  validation?: WorkbenchStepValidation;
  /**
   * Mark every later step stale. Pass this when the recorded decision changes
   * what those steps were computed from — picking a different source, for
   * instance. It never erases them: they keep their outcome and affected count
   * so the surface can say what went stale and why.
   */
  invalidatesLaterSteps?: boolean;
}

export function recordStep(
  state: WorkbenchFlowState,
  id: WorkbenchStepId,
  input: RecordStepInput,
): WorkbenchFlowState {
  const at = stepIndex(id);
  if (at < 0) return state;
  const steps = state.steps.map((step, i) => {
    if (i === at) {
      return {
        ...step,
        satisfied: input.satisfied ?? step.satisfied,
        // Recording a step is the act that clears its own staleness: the user
        // has now looked at it again with the new upstream state in place.
        stale: false,
        outcomeKey: input.outcomeKey ?? step.outcomeKey,
        outcomeParams: input.outcomeParams ?? step.outcomeParams,
        affected: input.affected ?? step.affected,
        validation: input.validation ?? step.validation,
      };
    }
    if (input.invalidatesLaterSteps && i > at && step.satisfied) {
      return { ...step, stale: true };
    }
    return step;
  });
  // A refusal to advance is not a reason to strand the user on a locked step.
  const current = steps[stepIndex(state.current)];
  const currentStillOk = current ? stepIndex(state.current) <= furthestReachableIndex({ ...state, steps }) : false;
  return {
    current: currentStillOk ? state.current : WORKBENCH_STEP_IDS[furthestReachableIndex({ ...state, steps })]!,
    steps,
  };
}

export interface WorkbenchFlowProgress {
  /** Steps whose decision is made, not stale and not blocked. */
  completed: number;
  total: number;
  /** Steps carrying values that an upstream change invalidated. */
  stale: number;
  /** The first step that is not passable — where "Next" would stop. */
  blockedAt: WorkbenchStepId;
  /** True once every step is passable, i.e. Apply itself has been recorded. */
  done: boolean;
}

export function workbenchFlowProgress(state: WorkbenchFlowState): WorkbenchFlowProgress {
  const completed = state.steps.filter(stepIsPassable).length;
  return {
    completed,
    total: state.steps.length,
    stale: state.steps.filter((s) => s.stale).length,
    blockedAt: WORKBENCH_STEP_IDS[furthestReachableIndex(state)]!,
    done: completed === state.steps.length,
  };
}
