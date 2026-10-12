import { useEffect, useState } from 'react';
import type { AgentTaskQueue } from '../../../shared/localAgentTaskQueue';
import type { AgentOperationDraft, AgentOperationLog } from '../../../shared/agentOperationLog';
import {
  agentExecutionTimelineProjection,
  agentOperationDraftFromExecution,
  agentPlanControlTimelineProjection,
  type AgentTimelineProjection,
} from '../../../shared/agentExecutionRecord';
import { useT } from '../../i18n';
import { confirmDialog } from '../ui';
import { studyAnswerOf } from '../../../shared/agentStudyCoach';
import { AgentStudyAnswerView } from './AgentStudyAnswer';
import { recoverAgentExecutionClaim } from '../../agentExecutionLeaseClient';
import { localizeAgentStepError } from './agentExecutionTargets';
import { agentOperationWasUndone, agentUndoActionForCall, type AgentUndoFailureCode } from '../../../shared/agentUndo';
import { performAgentUndo } from '../../agentUndoClient';
import {
  isAgentConversationPlanQuarantined,
  retryAgentConversationPlanSave,
  runAgentConversationPlan,
  updateAgentConversationPlanQueue,
  type AgentConversationRunAction,
  type AgentConversationQueueAction,
} from '../../agentConversationPlanner';

const VISIBLE_PLAN_LIMIT = 8;
const VALUE_PREVIEW_LIMIT = 240;

function valuePreview(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return '';
    return serialized.length > VALUE_PREVIEW_LIMIT
      ? `${serialized.slice(0, VALUE_PREVIEW_LIMIT - 1)}…`
      : serialized;
  } catch {
    return '';
  }
}

export function AgentConversationPlanQueue({
  conversationId,
  queue,
  disabled,
  onFailure,
  onTimeline,
  onOperation,
  operationLog,
}: {
  conversationId: string;
  queue: AgentTaskQueue | null;
  disabled: boolean;
  /**
   * This session's operation log. With it, a completed step whose effect can honestly be
   * taken back (a created event or card, a moved event) offers Undo right on the step.
   */
  operationLog?: AgentOperationLog;
  /** A failure code; `detail` is an already-localized sentence naming the exact rule. */
  onFailure: (code: string | null, detail?: string) => void;
  onTimeline?: (projection: AgentTimelineProjection) => void;
  onOperation?: (operation: AgentOperationDraft) => void;
}) {
  const { t } = useT();
  const [runningTaskIds, setRunningTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [, setQuarantineRevision] = useState(0);
  const [now, setNow] = useState(Date.now);
  const items = (queue?.items ?? [])
    .filter((item) => item.origin?.conversationId === conversationId)
    .slice(-VISIBLE_PLAN_LIMIT)
    .reverse();

  useEffect(() => {
    if (!items.some((item) => item.execution && item.execution.expiresAt > now)) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [items, now]);

  const act = async (taskId: string, action: AgentConversationQueueAction): Promise<void> => {
    const result = await updateAgentConversationPlanQueue(conversationId, taskId, action);
    onTimeline?.(agentPlanControlTimelineProjection(
      conversationId,
      taskId,
      action,
      result.ok ? { ok: true } : { ok: false, code: result.code },
    ));
    if (result.ok) onFailure(null);
    else onFailure(result.code);
  };

  const run = async (taskId: string, action: AgentConversationRunAction): Promise<void> => {
    if (runningTaskIds.has(taskId)) return;
    setRunningTaskIds((current) => new Set(current).add(taskId));
    try {
      const result = await runAgentConversationPlan(conversationId, taskId, action, t);
      for (const event of result.events ?? []) {
        onTimeline?.(agentExecutionTimelineProjection(conversationId, event));
      }
      if (result.task && result.stepId && result.events) {
        const operation = agentOperationDraftFromExecution(
          conversationId,
          result.task,
          result.stepId,
          result.events,
        );
        // The operation record describes the completed side effect, not the
        // queue receipt. Keep it available for inspection/Undo even when the
        // separate durable outcome save is quarantined.
        if (operation) onOperation?.(operation);
      }
      if (!result.ok && result.code === 'outcome-not-recorded') {
        onTimeline?.(agentPlanControlTimelineProjection(
          conversationId,
          taskId,
          'save-outcome',
          { ok: false, code: result.code },
        ));
      }
      if (result.ok) onFailure(null);
      else {
        onFailure(result.code, result.reason ? localizeAgentStepError(result.reason, t) : undefined);
      }
    } finally {
      setRunningTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  };

  const retrySave = async (taskId: string): Promise<void> => {
    if (runningTaskIds.has(taskId)) return;
    setRunningTaskIds((current) => new Set(current).add(taskId));
    try {
      const result = await retryAgentConversationPlanSave(conversationId, taskId);
      onTimeline?.(agentPlanControlTimelineProjection(
        conversationId,
        taskId,
        'retry-save',
        result.ok ? { ok: true } : { ok: false, code: result.code },
      ));
      if (result.ok) {
        onFailure(null);
        setQuarantineRevision((revision) => revision + 1);
      } else {
        onFailure(result.code);
      }
    } finally {
      setRunningTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  };

  /** Per step call id: an Undo in flight, done, or refused with its reason. */
  const [undoState, setUndoState] = useState<Record<string, 'running' | 'undone' | AgentUndoFailureCode>>({});
  const undoStep = async (callId: string, operationId: string, operation: string): Promise<void> => {
    if (!operationLog || undoState[callId] === 'running') return;
    const confirmed = await confirmDialog({
      title: t('agent.card.undo.title'),
      message: t('agent.plan.undo.confirm', { operation: t(`agent.capabilities.operation.${operation}`) }),
      confirmLabel: t('agent.card.undo.confirm'),
    });
    if (!confirmed) return;
    setUndoState((current) => ({ ...current, [callId]: 'running' }));
    // The whole gate is re-resolved inside: live entities, profile and permission as they are now.
    const result = await performAgentUndo(operationLog, operationId, t);
    if (result.ok) onOperation?.(result.operation);
    setUndoState((current) => ({ ...current, [callId]: result.ok ? 'undone' : result.code }));
  };

  const stepUndo = (step: AgentTaskQueue['items'][number]['task']['steps'][number]) => {
    if (!operationLog || step.status !== 'completed') return null;
    const callId = step.request.callId;
    const state = undoState[callId];
    if (state === 'undone' || agentOperationWasUndone(operationLog, callId)) {
      return <span className="agent-plan-undo-status">{t('agent.card.undo.undone')}</span>;
    }
    const action = agentUndoActionForCall(operationLog, callId);
    if (!action || action.effect.type !== 'undo') {
      return state && state !== 'running'
        ? <span className="agent-plan-error" role="alert">{t(`agent.undo.error.${state}`)}</span>
        : null;
    }
    const operationId = action.effect.operationId;
    return (
      <span className="agent-plan-undo">
        <button
          type="button"
          className="agent-action agent-plan-undo-button"
          disabled={disabled || state === 'running'}
          onClick={() => void undoStep(callId, operationId, step.request.operation)}
        >
          {state === 'running' ? t('agent.card.undo.running') : t('agent.plan.undo.button')}
        </button>
        {state && state !== 'running' ? (
          <span className="agent-plan-error" role="alert">{t(`agent.undo.error.${state}`)}</span>
        ) : null}
      </span>
    );
  };

  const recover = async (item: AgentTaskQueue['items'][number]): Promise<void> => {
    const claim = item.execution;
    if (!claim || runningTaskIds.has(item.id)) return;
    // The shell's own dialog, never the native one: a native confirm paints OS
    // chrome over a desktop that is pretending to be an operating system, and
    // `nativeDialogGate` fails the suite for it.
    const confirmed = await confirmDialog({
      title: t('agent.plan.executionRecoveryTitle'),
      message: t('agent.plan.executionRecoveryConfirm'),
      confirmLabel: t('agent.plan.executionRecoveryAction'),
      danger: true,
    });
    if (!confirmed) return;
    setRunningTaskIds((current) => new Set(current).add(item.id));
    try {
      const result = await recoverAgentExecutionClaim({
        taskId: item.id,
        origin: item.origin ?? null,
        stepId: claim.stepId,
        callId: claim.callId,
        startedAt: claim.startedAt,
      });
      onFailure(result.ok ? null : 'invalid-transition');
    } finally {
      setRunningTaskIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  return (
    <section className="agent-plan-queue" aria-label={t('agent.plan.queue.title')}>
      <h3 className="agent-subheading">{t('agent.plan.queue.title')}</h3>
      {queue === null ? (
        <p className="agent-plan-empty">{t('agent.plan.queue.loading')}</p>
      ) : items.length === 0 ? (
        <p className="agent-plan-empty">{t('agent.plan.queue.empty')}</p>
      ) : (
        <ul className="agent-plan-list">
          {items.map((item) => (
            <li key={item.id} className={`agent-plan-item agent-plan-${item.status}`}>
              <div className="agent-plan-head">
                <strong>{item.task.objective}</strong>
                <span className="agent-chip">{t(`agent.plan.status.${item.status}`)}</span>
              </div>
              {/* Opens by itself once a step has answered, so the answer is not one click away. */}
              <details
                className="agent-plan-details"
                open={item.task.steps.some((step) => studyAnswerOf(step.result) !== null) || undefined}
              >
                <summary>{t('agent.plan.steps', { count: item.task.steps.length })}</summary>
                <ol className="agent-plan-steps">
                  {item.task.steps.map((step) => {
                    const argumentsPreview = valuePreview(step.request.arguments);
                    // A study-coach answer reads as an answer, with the data it is based on;
                    // any other result keeps its raw preview.
                    const answer = studyAnswerOf(step.result);
                    const resultPreview = answer ? '' : valuePreview(step.result);
                    return (
                      <li key={step.id} className="agent-plan-step">
                        <span className="agent-plan-step-label">{step.label}</span>
                        {/* What the step does, in the UI language; the raw operation id stays
                            on hover for anyone matching it against the activity log. */}
                        <span className="agent-plan-step-meta" title={step.request.operation}>
                          {t(`agent.capabilities.operation.${step.request.operation}`)} · {t(`agent.plan.stepStatus.${step.status}`)}
                        </span>
                        {argumentsPreview ? (
                          <code>{t('agent.plan.arguments', { value: argumentsPreview })}</code>
                        ) : null}
                        {answer ? <AgentStudyAnswerView answer={answer} /> : null}
                        {resultPreview ? (
                          <code>{t('agent.plan.result', { value: resultPreview })}</code>
                        ) : null}
                        {step.error ? <span className="agent-plan-error">{localizeAgentStepError(step.error, t)}</span> : null}
                        {stepUndo(step)}
                      </li>
                    );
                  })}
                </ol>
              </details>
              {item.execution ? (
                <div className="agent-plan-quarantine">
                  <p className="agent-plan-error">{t('agent.plan.executionInDoubt')}</p>
                  <button
                    type="button"
                    className="agent-action"
                    disabled={
                      disabled
                      || runningTaskIds.has(item.id)
                      || now < item.execution.expiresAt
                    }
                    onClick={() => void recover(item)}
                  >
                    {t('agent.plan.action.recoverVerified')}
                  </button>
                </div>
              ) : isAgentConversationPlanQuarantined(conversationId, item.id) ? (
                <div className="agent-plan-quarantine">
                  <p className="agent-plan-error">{t('agent.plan.quarantined')}</p>
                  <button
                    type="button"
                    className="agent-action"
                    disabled={disabled || runningTaskIds.has(item.id)}
                    onClick={() => void retrySave(item.id)}
                  >
                    {runningTaskIds.has(item.id)
                      ? t('agent.plan.action.saving')
                      : t('agent.plan.action.retrySave')}
                  </button>
                </div>
              ) : item.status === 'queued' || item.status === 'paused' || item.status === 'failed' ? (
                <div className="agent-plan-actions">
                  {item.status === 'queued' ? (
                    <>
                      <button
                        type="button"
                        className="agent-action agent-action-primary"
                        disabled={disabled || runningTaskIds.has(item.id)}
                        onClick={() => void run(
                          item.id,
                          item.task.status === 'waiting-confirmation' ? 'confirm' : 'run-next',
                        )}
                      >
                        {runningTaskIds.has(item.id)
                          ? t('agent.plan.action.running')
                          : item.task.status === 'waiting-confirmation'
                            ? t('agent.plan.action.confirm')
                            : t('agent.plan.action.runNext')}
                      </button>
                      <button
                        type="button"
                        className="agent-action"
                        disabled={disabled}
                        onClick={() => void act(item.id, 'pause')}
                      >
                        {t('common.pause')}
                      </button>
                    </>
                  ) : item.status === 'paused' ? (
                    <button
                      type="button"
                      className="agent-action"
                      disabled={disabled}
                      onClick={() => void act(item.id, 'resume')}
                    >
                      {t('common.resume')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="agent-action agent-action-primary"
                      disabled={disabled || runningTaskIds.has(item.id)}
                      onClick={() => void run(item.id, 'retry')}
                    >
                      {runningTaskIds.has(item.id)
                        ? t('agent.plan.action.running')
                        : t('agent.plan.action.retry')}
                    </button>
                  )}
                  {item.status !== 'failed' ? (
                    <button
                      type="button"
                      className="agent-action agent-action-danger"
                      disabled={disabled}
                      onClick={() => void act(item.id, 'cancel')}
                    >
                      {t('common.cancel')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
