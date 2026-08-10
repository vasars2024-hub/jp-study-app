/**
 * Provenance-safe projections from the Agent executor into the session audit
 * surfaces.
 *
 * The executor is the authority for whether a handler actually ran. This file
 * therefore refuses to derive a completed operation from a task result alone:
 * it requires a matching `tool-completed` event and a completed step carrying
 * the same task, step, call and operation ids. It also never searches arbitrary
 * result JSON for strings called `id`. Each supported operation has a narrow,
 * explicit extractor for an id that its installed adapter already returns.
 */

import type { AgentOperationClaim, AgentOperationDraft } from './agentOperationLog';
import type {
  AgentExecutionEvent,
  AgentTask,
  AgentTaskStep,
  AgentToolOperationId,
} from './localAgent';
import type { AgentTimelineEvent, AgentTimelineTarget } from './agentTimeline';

export interface AgentExecutionOrigin {
  conversationId: string;
  taskId: string;
  stepId: string;
  callId: string;
  operation: AgentToolOperationId;
}

interface AgentOperationRecordContract {
  claim: AgentOperationClaim;
  entityType: string;
  entityIds: (result: unknown) => string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringId(value: unknown): string[] {
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(stringId))];
}

function objectId(result: unknown): string[] {
  return stringId(record(result)?.id);
}

function propertyId(property: string): (result: unknown) => string[] {
  return (result) => stringId(record(result)?.[property]);
}

function propertyIds(property: string): (result: unknown) => string[] {
  return (result) => stringIds(record(result)?.[property]);
}

function arrayObjectIds(result: unknown): string[] {
  if (!Array.isArray(result)) return [];
  return [...new Set(result.flatMap((item) => objectId(item)))];
}

/**
 * Only operations whose live adapter returns or tracks authoritative entity
 * ids belong here. Absence is intentional: it means the completed step still
 * belongs in the timeline, but cannot honestly become an operation-log/Undo
 * target yet.
 */
export const AGENT_OPERATION_RECORD_CONTRACTS: Readonly<
  Partial<Record<AgentToolOperationId, AgentOperationRecordContract>>
> = {
  'flashcard.create-deck': {
    claim: 'created',
    entityType: 'flashcard-deck',
    entityIds: propertyId('createdName'),
  },
  'flashcard.add-cards': {
    claim: 'created',
    entityType: 'flashcard',
    entityIds: propertyIds('createdIds'),
  },
  'study.filter-vocabulary': {
    claim: 'updated',
    entityType: 'study-workspace',
    entityIds: propertyId('workspaceId'),
  },
  'study.undo-filter': {
    claim: 'updated',
    entityType: 'study-workspace',
    entityIds: propertyId('workspaceId'),
  },
  'study.create-cards': {
    claim: 'created',
    entityType: 'flashcard',
    entityIds: propertyIds('createdIds'),
  },
  'calendar.schedule-session': {
    claim: 'created',
    entityType: 'calendar-event',
    entityIds: objectId,
  },
  'calendar.create-reminder': {
    claim: 'created',
    entityType: 'calendar-event',
    entityIds: objectId,
  },
  'media.add-item': {
    claim: 'created',
    entityType: 'media-item',
    entityIds: arrayObjectIds,
  },
};

function matchingCompletedEvent(
  task: AgentTask,
  step: AgentTaskStep,
  events: readonly AgentExecutionEvent[],
): AgentExecutionEvent | null {
  const matches = events.filter((event) => (
    event.type === 'tool-completed'
    && event.taskId === task.id
    && event.stepId === step.id
    && event.callId === step.request.callId
    && event.operation === step.request.operation
  ));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Build one operation-log draft only after an exact completed handler event.
 * An extractor yielding no id refuses rather than creating an empty, misleading
 * Undo entry (including a create-deck call that was an existing-folder no-op).
 */
export function agentOperationDraftFromExecution(
  conversationId: string,
  task: AgentTask,
  stepId: string,
  events: readonly AgentExecutionEvent[],
): AgentOperationDraft | null {
  const step = task.steps.find((candidate) => candidate.id === stepId);
  if (!step || step.status !== 'completed') return null;
  if (!matchingCompletedEvent(task, step, events)) return null;
  const contract = AGENT_OPERATION_RECORD_CONTRACTS[step.request.operation];
  if (!contract) return null;
  const entityIds = contract.entityIds(step.result);
  if (entityIds.length === 0) return null;
  return {
    operation: step.request.operation,
    claim: contract.claim,
    entityType: contract.entityType,
    entityIds,
    // The request's own arguments, not a reconstruction: the terminal's whole
    // claim is that it reports what the step was given, and anything rebuilt
    // here could differ from what the handler actually received.
    arguments: step.request.arguments,
    callId: step.request.callId,
    conversationId,
    taskId: task.id,
    stepId: step.id,
  };
}

/** Stable exact target: retries naturally become later attempts of one step. */
export function agentPlanStepTimelineTarget(
  origin: AgentExecutionOrigin,
): AgentTimelineTarget {
  return {
    conversationId: origin.conversationId,
    messageId: `plan:${origin.taskId}`,
    cardId: `step:${origin.stepId}`,
    actionId: `call:${origin.callId}`,
    effect: 'execute-step',
    taskId: origin.taskId,
    stepId: origin.stepId,
    callId: origin.callId,
    operation: origin.operation,
  };
}

export interface AgentTimelineProjection {
  target: AgentTimelineTarget;
  events: readonly AgentTimelineEvent[];
}

/**
 * Project the executor's ordered events without creating a completion it did
 * not emit. `review` opens the attempt; retrying the same failed step therefore
 * gets the timeline's next attempt number instead of overwriting history.
 */
export function agentExecutionTimelineProjection(
  conversationId: string,
  event: AgentExecutionEvent,
): AgentTimelineProjection {
  const target = agentPlanStepTimelineTarget({
    conversationId,
    taskId: event.taskId,
    stepId: event.stepId,
    callId: event.callId,
    operation: event.operation,
  });
  switch (event.type) {
    case 'confirmation-required':
      return { target, events: [{ type: 'review' }] };
    case 'tool-started':
      return { target, events: [{ type: 'review' }, { type: 'running' }] };
    case 'tool-completed':
      return { target, events: [{ type: 'succeeded' }] };
    case 'tool-failed':
      return { target, events: [{ type: 'failed', code: 'tool-failed' }] };
  }
}

export type AgentPlanControl = 'pause' | 'resume' | 'cancel' | 'save-outcome' | 'retry-save';

/**
 * Queue/save controls have task provenance but no tool-call provenance. This
 * helper gives the UI one honest lifecycle; a save recovery is never presented
 * as a rerun of the tool operation.
 */
export function agentPlanControlTimelineProjection(
  conversationId: string,
  taskId: string,
  control: AgentPlanControl,
  outcome: { ok: true } | { ok: false; code: string },
): AgentTimelineProjection {
  const save = control === 'save-outcome' || control === 'retry-save';
  return {
    target: {
      conversationId,
      messageId: `plan:${taskId}`,
      cardId: `task:${taskId}`,
      actionId: control,
      effect: save ? 'plan-save' : 'plan-control',
      taskId,
    },
    events: [
      { type: 'review' },
      { type: 'running' },
      outcome.ok ? { type: 'succeeded' } : { type: 'failed', code: outcome.code },
    ],
  };
}
