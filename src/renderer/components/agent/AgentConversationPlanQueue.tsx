import { useEffect, useState } from 'react';
import type { AgentTaskQueue } from '../../../shared/localAgentTaskQueue';
import type { AgentOperationDraft } from '../../../shared/agentOperationLog';
import {
  agentExecutionTimelineProjection,
  agentOperationDraftFromExecution,
  agentPlanControlTimelineProjection,
  type AgentTimelineProjection,
} from '../../../shared/agentExecutionRecord';
import { useT } from '../../i18n';
import { confirmDialog } from '../ui';
import { recoverAgentExecutionClaim } from '../../agentExecutionLeaseClient';
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
}: {
  conversationId: string;
  queue: AgentTaskQueue | null;
  disabled: boolean;
  onFailure: (code: string | null) => void;
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
              <details className="agent-plan-details">
                <summary>{t('agent.plan.steps', { count: item.task.steps.length })}</summary>
                <ol className="agent-plan-steps">
                  {item.task.steps.map((step) => {
                    const argumentsPreview = valuePreview(step.request.arguments);
                    const resultPreview = valuePreview(step.result);
                    return (
                      <li key={step.id} className="agent-plan-step">
                        <span className="agent-plan-step-label">{step.label}</span>
                        <span className="agent-plan-step-meta">
                          {step.request.operation} · {t(`agent.plan.stepStatus.${step.status}`)}
                        </span>
                        {argumentsPreview ? (
                          <code>{t('agent.plan.arguments', { value: argumentsPreview })}</code>
                        ) : null}
                        {resultPreview ? (
                          <code>{t('agent.plan.result', { value: resultPreview })}</code>
                        ) : null}
                        {step.error ? <span className="agent-plan-error">{step.error}</span> : null}
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
