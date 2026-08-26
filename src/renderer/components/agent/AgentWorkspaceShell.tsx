import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as RKeyboardEvent,
} from 'react';
import Icon from '../Icons';
import { ContextualSurface } from '../liquid/LiquidSurface';
import { useT } from '../../i18n';
import {
  AGENT_WORKSPACE_MODES,
  emptyAgentWorkspaceState,
  type AgentConversation,
  type AgentMessage,
  type AgentWorkspaceMode,
  type AgentWorkspaceState,
} from '../../../shared/agentWorkspace';
import {
  providerAcceptsImageInput,
  type AiProviderHealth,
  type AiProviderId,
} from '../../../shared/aiProviders';
import {
  AGENT_EXECUTION_DEFAULT_INPUT_BUDGET,
  AGENT_EXECUTION_DEFAULT_OUTPUT_BUDGET,
  AGENT_EXECUTION_INPUT_BUDGET_MAX,
  AGENT_EXECUTION_INPUT_BUDGET_MIN,
  AGENT_EXECUTION_OUTPUT_BUDGET_MAX,
  AGENT_EXECUTION_OUTPUT_BUDGET_MIN,
  agentExecutionMessageIds,
  defaultAgentExecutionPolicy,
  type AgentExecutionFailureCode,
  type AgentExecutionAttachment,
  type AgentExecutionRequest,
} from '../../../shared/agentExecutionBridge';
import type {
  AgentWorkspaceFailureCode,
  AgentWorkspaceResult,
} from '../../../shared/agentWorkspaceBridge';
import {
  clearAgentWorkspace,
  deleteAgentConversation,
  loadAgentWorkspace,
  onAgentWorkspaceChanged,
  updateAgentWorkspace,
} from '../../agentWorkspaceClient';
import {
  agentMessageAgentContext,
  branchAgentConversationFromMessage,
} from '../../agentContextHandoff';
import {
  cancelAgentPrompt,
  executeAgentPrompt,
} from '../../agentExecutionClient';
import {
  agentKnownInputChars,
  agentPriceFromRateDraft,
  agentRateDraftFromPrice,
  agentSensitiveContextKey,
  clampAgentCostBudgetUsd,
  clampAgentExecutionBudget,
  type AgentProviderRateDraft,
} from '../../agentExecutionPolicyDraft';
import {
  AGENT_COST_BUDGET_DEFAULT_USD,
  AGENT_COST_BUDGET_MAX_USD,
  AGENT_COST_BUDGET_MIN_USD,
  AGENT_PROVIDER_PRICE_MAX,
  agentEstimatedTokens,
  agentProviderPrice,
  estimateAgentProviderCostUsd,
  formatAgentCostUsd,
  type AgentProviderPricingTable,
} from '../../../shared/agentProviderPricing';
import {
  agentPlanDisabledReason,
  agentSendDisabledReason,
  type AgentComposerState,
} from '../../../shared/agentComposerReason';
import {
  loadAgentProviderPricing,
  onAgentProviderPricingChanged,
  saveAgentProviderPrice,
} from '../../agentProviderPricingStore';
import { AgentSpendPanel } from './AgentSpendPanel';
import {
  AGENT_CONVERSATION_PLAN_OBJECTIVE_LIMIT,
  createAgentConversationPlan,
  type AgentConversationPlanFailureCode,
} from '../../agentConversationPlanner';
import { AgentConversationPlanQueue } from './AgentConversationPlanQueue';
import { AgentCapabilityDirectory } from './AgentCapabilityDirectory';
import { AgentGovernancePanel } from './AgentGovernancePanel';
import { LOCAL_AGENT_CHAT_HISTORY_TURNS } from '../../../shared/localAgentSettings';
import {
  loadLocalAgentSettings,
  onLocalAgentSettingsChanged,
} from '../../localAgentSettingsStore';
import { AgentPromptLibrary } from './AgentPromptLibrary';
import { AgentContextSuggestions } from './AgentContextSuggestions';
import { AgentPipelineTerminal } from './AgentPipelineTerminal';
import { buildAgentPipelineLines } from '../../agentPipelineVerify';
import {
  AGENT_NAVIGATION_IDLE,
  AGENT_NAVIGATION_SECTION_LABEL_KEYS,
  agentNavigationReduce,
  type AgentNavigationEvent,
  type AgentNavigationRun,
} from '../../../shared/agentNavigation';
import {
  agentTimelineForConversation,
  agentTimelineRecord,
  type AgentTimelineEffect,
  type AgentTimelineEntry,
  type AgentTimelineEvent,
} from '../../../shared/agentTimeline';
import type { AgentTimelineProjection } from '../../../shared/agentExecutionRecord';
import {
  AGENT_STEP_APPROVAL_IDLE,
  agentStepApprovalReduce,
  resolveAgentStepApproval,
  type AgentStepApprovalEvent,
  type AgentStepApprovalRun,
} from '../../../shared/agentStepApproval';
import {
  grantAgentStepApproval,
  observeAgentStepApprovalContext,
  readAgentStepApprovalContext,
  type AgentStepApprovalContext,
} from '../../agentStepApprovalClient';
import {
  AGENT_SAVE_IDLE,
  agentSaveOperationCallId,
  agentSaveReduce,
  resolveAgentSave,
  type AgentSaveEvent,
  type AgentSaveRun,
} from '../../../shared/agentSave';
import { grantAgentSave, readAgentSaveContext } from '../../agentSaveClient';
import {
  AGENT_OPERATION_LOG_EMPTY,
  agentOperationLogAppend,
  type AgentOperationDraft,
  type AgentOperationLog,
} from '../../../shared/agentOperationLog';
import { agentOperationHistoryEntryFrom } from '../../../shared/agentOperationHistory';
import { appendAgentOperationHistorySnapshot } from '../../agentOperationalClient';
import {
  AGENT_UNDO_IDLE,
  agentOperationWasUndone,
  agentUndoActionForCall,
  agentUndoReduce,
  resolveAgentUndo,
  type AgentUndoEvent,
  type AgentUndoRun,
} from '../../../shared/agentUndo';
import { performAgentUndo, readAgentUndoContext } from '../../agentUndoClient';
import { runAgentNavigation } from '../../agentNavigationClient';
import {
  AGENT_ATTACHMENT_ACCEPT,
  readAgentAttachmentFiles,
  type AgentAttachmentReadFailureCode,
} from '../../agentAttachments';
import { mergeStagedImageAttachments } from '../../../shared/agentImageStaging';
import { onAgentImageStaged, takeAgentImages } from '../../agentImageStagingClient';
import {
  agentContextDisclosure,
  agentConversationSummaries,
  agentHistorySearch,
  agentRailFocusTarget,
  agentSelectedConversation,
  agentShellPhase,
  agentWorkspaceWithContextDetached,
  agentWorkspaceWithMode,
  agentWorkspaceWithNewConversation,
  agentWorkspaceWithPinToggled,
  agentWorkspaceWithSelection,
} from '../../agentShellModel';
import './agent.css';

/**
 * The Agent workspace surface — the first renderer consumer of the main-owned
 * conversation store.
 *
 * What it is: the persistent workspace over stored conversations. Load, select,
 * create, pin, delete and clear all go through the four bridge methods and that
 * one store; this window keeps no copy of its own, which is exactly what the
 * older renderer/localStorage-owned Agent stores could not say.
 *
 * Prompt execution crosses the typed Agent execution bridge into the existing
 * privacy-gated provider router. Streaming is presentation-only until the main
 * process commits the final message to the same workspace store.
 *
 * No decorative emoji and no giant internal window title. The rail's heading is
 * a section label; the taskbar already says which app this is.
 */

const VISIBLE_MESSAGE_LIMIT = 200;
type AgentTargetChoice = 'local' | AiProviderId;

/**
 * The cloud rows of the target picker, in the order they are offered.
 *
 * Translation *keys*, resolved during render — a module-level registry that
 * stored the rendered strings would keep an English picker after a language
 * switch. Listed here rather than derived from `AI_PROVIDERS` because the
 * Agent's own labels are shorter than the catalog's marketing ones.
 */
const AGENT_CLOUD_TARGETS: readonly { providerId: AiProviderId; labelKey: string }[] = [
  { providerId: 'gemini-2.5-flash', labelKey: 'agent.execute.provider.gemini' },
  { providerId: 'deepseek-v4-flash', labelKey: 'agent.execute.provider.deepseekFlash' },
  { providerId: 'deepseek-v4-pro', labelKey: 'agent.execute.provider.deepseekPro' },
];

const EXECUTION_ERROR_CODES = new Set<AgentExecutionFailureCode>([
  'invalid-request',
  'conversation-not-found',
  'busy',
  'store-failed',
  'cancelled',
  'timeout',
  'missing-credential',
  'persistent-cache-unavailable',
  'cloud-disabled',
  'sensitive-context',
  'input-budget',
  'cost-budget',
  'spend-budget',
  'authentication',
  'rate-limit',
  'upstream',
  'network',
  'invalid-response',
  'provider-failed',
  'bridge-unavailable',
]);

function executionErrorKey(code: AgentExecutionFailureCode): string {
  if (code === 'busy') return 'agent.execute.error.busy';
  if (code === 'store-failed') return 'agent.execute.error.store';
  if (code === 'cancelled') return 'agent.execute.error.cancelled';
  if (code === 'missing-credential') return 'agent.execute.error.credential';
  if (code === 'authentication') return 'agent.execute.error.authentication';
  if (code === 'bridge-unavailable') return 'agent.execute.error.bridge';
  // Deliberately not folded into `privacy`: this is a capability of the chosen
  // model, and the fix is to switch target rather than to grant consent.
  if (code === 'vision-unsupported') return 'agent.attachment.visionUnsupported';
  // Split out of `privacy` now that a cost cap can actually be set: the generic
  // "privacy or budget policy" wording names no control the user can reach, and
  // this refusal has exactly one remedy.
  if (code === 'cost-budget') return 'agent.execute.error.costBudget';
  // Separate from `costBudget` for the same reason that one was separated from
  // `privacy`: the control is a different one, in a different place, and telling
  // someone their request was too expensive when the truth is that their month
  // is spent sends them to shrink a prompt that was never the problem.
  if (code === 'spend-budget') return 'agent.execute.error.spendBudget';
  if (
    code === 'cloud-disabled'
    || code === 'sensitive-context'
    || code === 'input-budget'
    || code === 'persistent-cache-unavailable'
  ) {
    return 'agent.execute.error.privacy';
  }
  if (code === 'timeout' || code === 'rate-limit' || code === 'upstream' || code === 'network') {
    return 'agent.execute.error.transient';
  }
  if (code === 'invalid-response' || code === 'provider-failed') {
    return 'agent.execute.error.provider';
  }
  return 'agent.execute.error.request';
}

function planFailureKey(code: AgentConversationPlanFailureCode): string {
  return `agent.plan.error.${code}`;
}

function attachmentErrorKey(code: AgentAttachmentReadFailureCode): string {
  return `agent.attachment.error.${code}`;
}

function newConversationId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `agent-${uuid}`;
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newExecutionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `run-${uuid}`;
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type PendingConfirmation =
  | { kind: 'delete'; conversationId: string }
  | { kind: 'clear' }
  | null;

/**
 * The context shelf: what the Agent can currently see.
 *
 * This used to render the three counts alone, which was the honest thing to show
 * while nothing in the app could produce a context item — the shelf was always
 * empty and there was nothing to list. Now that producers exist
 * (`shared/agentContext.ts`), the counts are a summary *of* a list rather than a
 * substitute for one: the user has to be able to see the actual material that
 * will be sent, and remove a piece of it before sending.
 */
function ContextShelf({
  conversation,
  onRemove,
  onItemRef,
  openedContextId,
  disabled,
}: {
  conversation: AgentConversation;
  onRemove: (contextId: string) => void;
  onItemRef: (contextId: string, element: HTMLLIElement | null) => void;
  openedContextId: string | null;
  disabled: boolean;
}) {
  const { t } = useT();
  const disclosure = agentContextDisclosure(conversation.context);
  if (conversation.context.length === 0) {
    return <p className="agent-context-empty">{t('agent.context.empty')}</p>;
  }
  return (
    <>
      {/* A definition list, not an assembled sentence: label and number stay
          separate so no catalog has to guess at word order or agreement. */}
      <dl className="agent-context-facts">
        <dt>{t('agent.context.retained')}</dt>
        <dd>{disclosure.retained}</dd>
        <dt>{t('agent.context.session')}</dt>
        <dd>{disclosure.sessionOnly}</dd>
        <dt>{t('agent.context.sensitive')}</dt>
        <dd>{disclosure.sensitive}</dd>
      </dl>
      <ul className="agent-context-items">
        {conversation.context.map((item) => (
          <li
            key={item.id}
            ref={(element) => onItemRef(item.id, element)}
            className={`agent-context-item${openedContextId === item.id ? ' is-opened' : ''}`}
            data-agent-context={item.id}
            tabIndex={-1}
          >
            <div className="agent-context-item-head">
              <span className="agent-chip agent-chip-kind">
                {t(`agent.context.kind.${item.kind}`)}
              </span>
              <span className="agent-context-item-label">{item.label}</span>
              <span
                className={`agent-chip agent-chip-sensitivity agent-sensitivity-${item.sensitivity}`}
              >
                <Icon name={item.sensitivity === 'ordinary' ? 'globe' : 'lock'} size={13} />
                {t(`agent.context.sensitivity.${item.sensitivity}`)}
              </span>
              <span className="agent-chip agent-chip-retention">
                {item.retained ? t('agent.context.retainedBadge') : t('agent.context.sessionBadge')}
              </span>
              <button
                type="button"
                className="agent-action agent-context-remove"
                onClick={() => onRemove(item.id)}
                disabled={disabled}
                aria-label={t('agent.context.remove', { label: item.label })}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
            {item.preview ? <p className="agent-context-item-preview">{item.preview}</p> : null}
            <p className="agent-context-item-source">
              {t('agent.context.source', { app: item.source.app })}
              {item.source.route ? ` · ${item.source.route}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function MessageRow({
  message,
  conversation,
  approvalContext,
  operationLog,
  onAppendOperation,
  onOpenContext,
  onRecord,
}: {
  message: AgentMessage;
  conversation: AgentConversation;
  approvalContext: AgentStepApprovalContext | null;
  operationLog: AgentOperationLog;
  onAppendOperation: (operation: AgentOperationDraft) => void;
  onOpenContext: (contextId: string, sourceContextIds: readonly string[]) => boolean;
  /**
   * Reports a navigation transition to the conversation's timeline. The runs
   * below stay per-message and ephemeral; the timeline is per-conversation
   * because reviewing step three means reading steps one and two, which are
   * messages of their own.
   */
  onRecord: (
    cardId: string,
    actionId: string,
    effect: AgentTimelineEffect,
    event: AgentTimelineEvent,
  ) => void;
}) {
  const { t } = useT();
  // Two thin wrappers rather than an `effect` argument threaded through every
  // call: the effect is a property of which gate is running, not of the
  // transition, and passing it per call is how a refusal ends up filed under the
  // wrong control.
  const recordNavigation = (cardId: string, actionId: string, event: AgentTimelineEvent): void => {
    onRecord(cardId, actionId, 'navigate', event);
  };
  const recordApproval = (cardId: string, actionId: string, event: AgentTimelineEvent): void => {
    onRecord(cardId, actionId, 'approve-step', event);
  };
  const recordSave = (cardId: string, actionId: string, event: AgentTimelineEvent): void => {
    onRecord(cardId, actionId, 'save', event);
  };
  const recordUndo = (cardId: string, actionId: string, event: AgentTimelineEvent): void => {
    onRecord(cardId, actionId, 'undo', event);
  };
  const [failedActionId, setFailedActionId] = useState<string | null>(null);
  /**
   * One lifecycle per navigation action, keyed by card and action.
   *
   * Held here rather than in the store on purpose: an approval is a decision
   * about *this* window at *this* moment, not a property of the conversation.
   * Persisting it would make "you approved this" outlive the reason the user
   * approved it, and would sync a granted permission into every other window.
   */
  const [navigationRuns, setNavigationRuns] = useState<Record<string, AgentNavigationRun>>({});
  /** One lifecycle per approval action, held here for the same reason. */
  const [approvalRuns, setApprovalRuns] = useState<Record<string, AgentStepApprovalRun>>({});
  /** And one per save action. */
  const [saveRuns, setSaveRuns] = useState<Record<string, AgentSaveRun>>({});
  /** One per deterministic Undo action emitted from the session operation log. */
  const [undoRuns, setUndoRuns] = useState<Record<string, AgentUndoRun>>({});
  const provider = message.provider;

  const dispatchNavigation = (key: string, event: AgentNavigationEvent): void => {
    setNavigationRuns((previous) => ({
      ...previous,
      [key]: agentNavigationReduce(previous[key] ?? AGENT_NAVIGATION_IDLE, event),
    }));
  };

  /**
   * Resolves the destination for the review step. Never opens anything —
   * `approved: false` is main's guarantee, not this component's promise.
   */
  const reviewNavigation = async (
    key: string,
    cardId: string,
    actionId: string,
  ): Promise<void> => {
    let blocked = false;
    setNavigationRuns((previous) => {
      const current = previous[key] ?? AGENT_NAVIGATION_IDLE;
      // A window open is already in flight; re-resolving would race it.
      if (current.status === 'running') {
        blocked = true;
        return previous;
      }
      return { ...previous, [key]: { status: 'idle', attempts: current.attempts } };
    });
    if (blocked) return;
    // The attempt opens when the user asks, not when resolution succeeds — a
    // refusal is something that happened and has to be in the record.
    recordNavigation(cardId, actionId, { type: 'review' });
    const result = await runAgentNavigation({
      conversationId: conversation.id,
      messageId: message.id,
      cardId,
      actionId,
      approved: false,
    });
    dispatchNavigation(key, result.ok
      ? { type: 'review', destination: result.destination }
      : { type: 'refused', code: result.code });
    if (!result.ok) recordNavigation(cardId, actionId, { type: 'refused', code: result.code });
  };

  const approveNavigation = async (
    key: string,
    cardId: string,
    actionId: string,
  ): Promise<void> => {
    dispatchNavigation(key, { type: 'approve' });
    recordNavigation(cardId, actionId, { type: 'running' });
    const result = await runAgentNavigation({
      conversationId: conversation.id,
      messageId: message.id,
      cardId,
      actionId,
      approved: true,
    });
    // `ok` without `opened` cannot happen for an approved request, but reporting
    // success on it would be the one lie this gate cannot afford.
    if (result.ok && result.opened) {
      dispatchNavigation(key, { type: 'succeeded' });
      recordNavigation(cardId, actionId, { type: 'succeeded' });
    } else {
      const code = result.ok ? 'open-failed' : result.code;
      dispatchNavigation(key, { type: 'failed', code });
      recordNavigation(cardId, actionId, { type: 'failed', code });
    }
  };

  const retryNavigation = async (
    key: string,
    cardId: string,
    actionId: string,
  ): Promise<void> => {
    // Straight back to review, not straight back to running: the second attempt
    // re-resolves the destination and asks again, so a retry cannot reuse an
    // approval the user gave for a destination that has since changed.
    dispatchNavigation(key, { type: 'retry' });
    await reviewNavigation(key, cardId, actionId);
  };

  const dispatchApproval = (key: string, event: AgentStepApprovalEvent): void => {
    setApprovalRuns((previous) => ({
      ...previous,
      [key]: agentStepApprovalReduce(previous[key] ?? AGENT_STEP_APPROVAL_IDLE, event),
    }));
  };

  /**
   * Asks the gate whether this step may be approved, and shows what approving it
   * would run. Resolves against the queue and the profile as they are *now* —
   * never against anything captured when the card was produced.
   */
  const reviewApproval = (key: string, cardId: string, actionId: string): void => {
    // The attempt opens when the user asks, so a refusal is something that
    // happened and stays in the record.
    recordApproval(cardId, actionId, { type: 'review' });
    const context = readAgentStepApprovalContext(t);
    const resolution = resolveAgentStepApproval(
      conversation,
      context.queue,
      message.id,
      cardId,
      actionId,
      context.permission,
      context.allowedOperations,
    );
    if (!resolution.ok) {
      dispatchApproval(key, { type: 'refused', code: resolution.code });
      recordApproval(cardId, actionId, { type: 'refused', code: resolution.code });
      return;
    }
    dispatchApproval(key, { type: 'review', approval: resolution.approval });
  };

  const grantApproval = async (
    key: string,
    cardId: string,
    actionId: string,
  ): Promise<void> => {
    const current = approvalRuns[key];
    // Nothing to grant that was never resolved and never shown. The reducer
    // refuses this too; checking here keeps the step from running before it.
    if (current?.status !== 'review' || !current.approval) return;
    dispatchApproval(key, { type: 'grant' });
    // The grant re-resolves the whole gate against inputs read now — the queue,
    // the profile and the shelf. Nothing the review captured is reused, because
    // any of the three is allowed to have changed while the user was reading.
    const result = await grantAgentStepApproval(conversation, message.id, cardId, actionId, t);
    if (result.ok) {
      recordApproval(cardId, actionId, { type: 'succeeded' });
      return;
    }
    dispatchApproval(key, { type: 'failed', code: result.code });
    recordApproval(cardId, actionId, { type: 'failed', code: result.code });
  };

  const dispatchSave = (key: string, event: AgentSaveEvent): void => {
    setSaveRuns((previous) => ({
      ...previous,
      [key]: agentSaveReduce(previous[key] ?? AGENT_SAVE_IDLE, event),
    }));
  };

  /**
   * Asks the gate what saving this would create. Resolves against the deck and
   * the profile as they are now, and writes nothing.
   */
  const reviewSave = (key: string, cardId: string, actionId: string): void => {
    recordSave(cardId, actionId, { type: 'review' });
    const context = readAgentSaveContext(t);
    const resolution = resolveAgentSave(
      conversation,
      message.id,
      cardId,
      actionId,
      context.permission,
      context.savedWords,
      context.allowedOperations,
    );
    if (!resolution.ok) {
      dispatchSave(key, { type: 'refused', code: resolution.code });
      recordSave(cardId, actionId, { type: 'refused', code: resolution.code });
      return;
    }
    dispatchSave(key, { type: 'review', target: resolution.target });
  };

  const confirmSave = (key: string, cardId: string, actionId: string): void => {
    const current = saveRuns[key];
    if (current?.status !== 'review' || !current.target) return;
    dispatchSave(key, { type: 'confirm' });
    // The reviewed target is display-only. Confirmation re-reads the shelf,
    // deck, permission and profile allow-list before it writes anything.
    const result = grantAgentSave(conversation, message.id, cardId, actionId, t);
    if (result.ok) {
      onAppendOperation(result.operation);
      recordSave(cardId, actionId, { type: 'succeeded' });
      return;
    }
    dispatchSave(key, { type: 'failed', code: result.code });
    recordSave(cardId, actionId, { type: 'failed', code: result.code });
  };

  const dispatchUndo = (key: string, event: AgentUndoEvent): void => {
    setUndoRuns((previous) => ({
      ...previous,
      [key]: agentUndoReduce(previous[key] ?? AGENT_UNDO_IDLE, event),
    }));
  };

  const reviewUndo = async (
    key: string,
    cardId: string,
    actionId: string,
    operationId: string,
  ): Promise<void> => {
    recordUndo(cardId, actionId, { type: 'review' });
    // Awaited because live media ids come from main; the other three entity
    // types are local, but one async source makes the whole read async.
    let context: Awaited<ReturnType<typeof readAgentUndoContext>>;
    try {
      context = await readAgentUndoContext(t);
    } catch {
      dispatchUndo(key, { type: 'refused', code: 'store-failed' });
      recordUndo(cardId, actionId, { type: 'refused', code: 'store-failed' });
      return;
    }
    const resolution = resolveAgentUndo(
      operationLog,
      operationId,
      context.permission,
      context.liveEntityIds,
      context.allowedOperations,
    );
    if (!resolution.ok) {
      dispatchUndo(key, { type: 'refused', code: resolution.code });
      recordUndo(cardId, actionId, { type: 'refused', code: resolution.code });
      return;
    }
    dispatchUndo(key, { type: 'review', target: resolution.target });
  };

  const confirmUndo = async (
    key: string,
    cardId: string,
    actionId: string,
    operationId: string,
  ): Promise<void> => {
    const current = undoRuns[key];
    if (current?.status !== 'review' || !current.target) return;
    dispatchUndo(key, { type: 'confirm' });
    recordUndo(cardId, actionId, { type: 'running' });
    const result = await performAgentUndo(operationLog, operationId, t);
    if (result.ok) {
      onAppendOperation(result.operation);
      dispatchUndo(key, { type: 'succeeded' });
      recordUndo(cardId, actionId, { type: 'succeeded' });
      return;
    }
    dispatchUndo(key, { type: 'failed', code: result.code });
    recordUndo(cardId, actionId, { type: 'failed', code: result.code });
  };
  return (
    <li className={`agent-message agent-message-${message.role}`}>
      <div className="agent-message-head">
        <span className="agent-message-role">{t(`agent.message.role.${message.role}`)}</span>
        <span className={`agent-chip agent-chip-status agent-status-${message.status}`}>
          {t(`agent.message.status.${message.status}`)}
        </span>
        {provider ? (
          <span className="agent-chip agent-chip-provider">
            <Icon name={provider.cloud ? 'globe' : 'lock'} size={13} />
            {provider.cloud && provider.target.kind === 'cloud'
              ? t('agent.message.providerCloud', { provider: provider.target.providerId })
              : t('agent.message.providerLocal')}
          </span>
        ) : null}
        {/*
          Only ever present when the provider returned real token usage and the
          user had entered rates for it. An absent figure is left absent rather
          than shown as zero — this run's cost is unknown, not free.
        */}
        {provider?.estimatedCostUsd !== undefined ? (
          <span className="agent-chip agent-chip-cost">
            {t('agent.message.estimatedCost', {
              amount: formatAgentCostUsd(provider.estimatedCostUsd),
            })}
          </span>
        ) : null}
        {/*
          L5 bullet 1's fourth producer. Branch, not pin: the active conversation
          is the one this message already lives in, so attaching it there would
          change nothing a user can see. Absent when there is no text, because a
          failed or still-running message has nothing to follow up on — an
          enabled control over an empty body is the dead-control shape §2.3 names.
        */}
        {message.text ? (
          <button
            type="button"
            className="agent-chip agent-message-branch"
            onClick={() => {
              void branchAgentConversationFromMessage(
                agentMessageAgentContext(
                  message.id,
                  t(`agent.message.role.${message.role}`),
                  message.text,
                ),
                t('agent.conversation.fromMessage', { label: message.text.slice(0, 40) }),
              );
            }}
          >
            {t('agent.message.branch')}
          </button>
        ) : null}
      </div>
      {message.text ? <p className="agent-message-text">{message.text}</p> : null}
      {message.error ? (
        <p className="agent-message-error">
          {EXECUTION_ERROR_CODES.has(message.error as AgentExecutionFailureCode)
            ? t(executionErrorKey(message.error as AgentExecutionFailureCode))
            : message.error}
        </p>
      ) : null}
      {message.attachments.length > 0 ? (
        <ul className="agent-message-attachments" aria-label={t('agent.attachment.selected')}>
          {message.attachments.map((attachment) => (
            <li key={attachment.id} className="agent-attachment-chip">
              <span>{attachment.name}</span>
              <span className="agent-chip agent-chip-sensitivity agent-sensitivity-sensitive">
                <Icon name="lock" size={12} />
                {t('agent.context.sensitivity.sensitive')}
              </span>
              <span className="agent-chip agent-chip-retention">
                {t('agent.context.sessionBadge')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {message.cards.length > 0 ? (
        <ul className="agent-cards">
          {message.cards.map((card) => {
            const sources = card.sourceContextIds.flatMap((contextId) => {
              const source = conversation.context.find((item) => item.id === contextId);
              return source ? [source] : [];
            });
            const navigateActions = card.actions.filter(
              (action) => action.effect.type === 'navigate',
            );
            return (
              <li key={card.id} className="agent-card">
                <span className="agent-card-title">{card.title}</span>
                {card.summary ? <span className="agent-card-summary">{card.summary}</span> : null}
                {sources.length > 0 ? (
                  <ul className="agent-card-sources" aria-label={t('agent.context.title')}>
                    {sources.map((source) => (
                      <li key={source.id} className="agent-chip agent-card-source">
                        <span>{source.label}</span>
                        <span>{t('agent.context.source', { app: source.source.app })}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {navigateActions.map((action) => {
                  const key = `${card.id}:${action.id}`;
                  const run = navigationRuns[key] ?? AGENT_NAVIGATION_IDLE;
                  // Every word of the destination comes from main's resolution
                  // against live context. The stored action label is never shown
                  // and never names a place.
                  const destination = run.destination;
                  const section = destination
                    ? t(AGENT_NAVIGATION_SECTION_LABEL_KEYS[destination.section])
                    : '';
                  return (
                    <span
                      key={action.id}
                      className={`agent-card-navigate agent-navigate-${run.status}`}
                      role="group"
                      aria-label={t('agent.card.navigate.title')}
                    >
                      {run.status === 'idle' ? (
                        <button
                          type="button"
                          className="agent-action agent-card-action"
                          onClick={() => void reviewNavigation(key, card.id, action.id)}
                        >
                          <Icon name="external" size={13} />
                          {t('agent.card.navigate.review')}
                        </button>
                      ) : null}
                      {run.status === 'review' && destination ? (
                        <>
                          <span className="agent-card-navigate-destination">
                            {t('agent.card.navigate.destination', { section })}
                            {destination.page
                              ? ` · ${t('agent.card.navigate.page', { page: destination.page })}`
                              : ''}
                            {destination.controlId
                              ? ` · ${t('agent.card.navigate.control', { control: destination.controlId })}`
                              : ''}
                            {destination.highlight === true
                              ? ` · ${t('agent.card.navigate.highlight')}`
                              : ''}
                          </span>
                          <button
                            type="button"
                            className="agent-action agent-card-action agent-card-navigate-approve"
                            onClick={() => void approveNavigation(key, card.id, action.id)}
                          >
                            <Icon name="check" size={13} />
                            {t('agent.card.navigate.approve', { section })}
                          </button>
                          <button
                            type="button"
                            className="agent-action agent-card-action"
                            onClick={() => {
                              dispatchNavigation(key, { type: 'cancel' });
                              recordNavigation(card.id, action.id, { type: 'cancelled' });
                            }}
                          >
                            {t('agent.card.navigate.cancel')}
                          </button>
                        </>
                      ) : null}
                      {run.status === 'running' ? (
                        <span className="agent-card-navigate-status">
                          {t('agent.card.navigate.running')}
                        </span>
                      ) : null}
                      {run.status === 'succeeded' ? (
                        <span className="agent-card-navigate-status">
                          {t('agent.card.navigate.opened', { section })}
                        </span>
                      ) : null}
                      {run.status === 'cancelled' ? (
                        <>
                          <span className="agent-card-navigate-status">
                            {t('agent.card.navigate.cancelled')}
                          </span>
                          <button
                            type="button"
                            className="agent-action agent-card-action"
                            onClick={() => void retryNavigation(key, card.id, action.id)}
                          >
                            {t('agent.card.navigate.review')}
                          </button>
                        </>
                      ) : null}
                      {run.status === 'failed' ? (
                        <>
                          <span className="agent-card-action-error" role="alert">
                            {t(`agent.navigate.error.${run.code ?? 'open-failed'}`)}
                          </span>
                          <button
                            type="button"
                            className="agent-action agent-card-action"
                            onClick={() => void retryNavigation(key, card.id, action.id)}
                          >
                            {t('agent.card.navigate.retry')}
                          </button>
                        </>
                      ) : null}
                      {run.attempts > 1 && (run.status === 'failed' || run.status === 'succeeded') ? (
                        <span className="agent-card-navigate-attempts">
                          {t('agent.card.navigate.attempt', { count: run.attempts })}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
                {card.actions.map((action) => {
                  if (action.effect.type !== 'approve-step') return null;
                  const key = `${card.id}:${action.id}`;
                  const run = approvalRuns[key] ?? AGENT_STEP_APPROVAL_IDLE;
                  const availability = approvalContext === null
                    ? null
                    : resolveAgentStepApproval(
                        conversation,
                        approvalContext.queue,
                        message.id,
                        card.id,
                        action.id,
                        approvalContext.permission,
                        approvalContext.allowedOperations,
                      );
                  const liveApproval = availability?.ok ? availability.approval : null;
                  const canAct = liveApproval !== null;
                  const availabilityStatus = availability === null
                    ? t('agent.card.approve.checking')
                    : availability.ok
                      ? null
                      : t(`agent.approve.error.${availability.code}`);
                  // Every word of the objective, the step and the operation comes
                  // from the gate's resolution against the live queue. The stored
                  // action label is never shown and names nothing.
                  return (
                    <span
                      key={action.id}
                      className={`agent-card-approve agent-approve-${run.status}`}
                      role="group"
                      aria-label={t('agent.card.approve.title')}
                    >
                      {run.status === 'idle' && canAct ? (
                        <button
                          type="button"
                          className="agent-action agent-card-action"
                          onClick={() => reviewApproval(key, card.id, action.id)}
                        >
                          <Icon name="check" size={13} />
                          {t('agent.card.approve.review')}
                        </button>
                      ) : null}
                      {run.status === 'review' && liveApproval ? (
                        <>
                          <span className="agent-card-approve-step">
                            {t('agent.card.approve.objective', { objective: liveApproval.objective })}
                            {' · '}
                            {t('agent.card.approve.step', { step: liveApproval.label })}
                          </span>
                          <span className="agent-card-approve-operation">
                            {/*
                              The operation id goes into a translated frame
                              verbatim, the same way the context chip renders
                              `source.app`. It is a stable machine identifier the
                              user is being asked to authorize, and inventing a
                              friendlier name for it here would be the one place
                              this control could misdescribe what it runs.
                            */}
                            {t('agent.card.approve.operation', { operation: liveApproval.operation })}
                          </span>
                          <button
                            type="button"
                            className="agent-action agent-card-action agent-card-approve-grant"
                            onClick={() => void grantApproval(key, card.id, action.id)}
                          >
                            <Icon name="check" size={13} />
                            {t('agent.card.approve.grant')}
                          </button>
                          <button
                            type="button"
                            className="agent-action agent-card-action"
                            onClick={() => {
                              dispatchApproval(key, { type: 'cancel' });
                              recordApproval(card.id, action.id, { type: 'cancelled' });
                            }}
                          >
                            {t('agent.card.approve.cancel')}
                          </button>
                        </>
                      ) : null}
                      {run.status === 'granted' ? (
                        <span className="agent-card-approve-status">
                          {t('agent.card.approve.granted')}
                        </span>
                      ) : null}
                      {run.status === 'cancelled' && canAct ? (
                        <>
                          <span className="agent-card-approve-status">
                            {t('agent.card.approve.cancelled')}
                          </span>
                          <button
                            type="button"
                            className="agent-action agent-card-action"
                            onClick={() => {
                              dispatchApproval(key, { type: 'retry' });
                              reviewApproval(key, card.id, action.id);
                            }}
                          >
                            {t('agent.card.approve.review')}
                          </button>
                        </>
                      ) : null}
                      {run.status === 'failed' && canAct ? (
                        <>
                          <span className="agent-card-action-error" role="alert">
                            {t(`agent.approve.error.${run.code ?? 'approve-failed'}`)}
                          </span>
                          <button
                            type="button"
                            className="agent-action agent-card-action"
                            onClick={() => {
                              dispatchApproval(key, { type: 'retry' });
                              reviewApproval(key, card.id, action.id);
                            }}
                          >
                            {t('agent.card.approve.retry')}
                          </button>
                        </>
                      ) : null}
                      {(run.status === 'idle'
                        || run.status === 'review'
                        || run.status === 'cancelled'
                        || run.status === 'failed') && availabilityStatus ? (
                        <span
                          className="agent-card-approve-availability"
                          role="status"
                          aria-live="polite"
                        >
                          <Icon name="lock" size={13} />
                          {availabilityStatus}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
                {card.actions.map((action) => {
                  if (action.effect.type !== 'save') return null;
                  const key = `${card.id}:${action.id}`;
                  const run = saveRuns[key] ?? AGENT_SAVE_IDLE;
                  // The word and the gloss come from the gate's resolution
                  // against the live shelf item; the stored label names nothing.
                  const target = run.target;
                  const saveCallId = agentSaveOperationCallId(
                    conversation.id,
                    message.id,
                    card.id,
                    action.id,
                  );
                  const undoAction = agentUndoActionForCall(operationLog, saveCallId);
                  const undoKey = `${key}:undo`;
                  const undoRun = undoRuns[undoKey] ?? AGENT_UNDO_IDLE;
                  const wasUndone = agentOperationWasUndone(operationLog, saveCallId);
                  const saveRecorded = operationLog.entries.some(
                    (entry) => entry.callId === saveCallId && entry.operation === 'flashcard.add-cards',
                  );
                  return (
                    <span
                      key={action.id}
                      className={`agent-card-save agent-save-${run.status}`}
                      role="group"
                      aria-label={t('agent.card.save.title')}
                    >
                      {run.status === 'idle' && !saveRecorded ? (
                        <button
                          type="button"
                          className="agent-action agent-card-action"
                          onClick={() => reviewSave(key, card.id, action.id)}
                        >
                          <Icon name="plus" size={13} />
                          {t('agent.card.save.review')}
                        </button>
                      ) : null}
                      {run.status === 'review' && target ? (
                        <>
                          <span className="agent-card-save-entry">
                            {t('agent.card.save.entry', { word: target.word })}
                          </span>
                          <button
                            type="button"
                            className="agent-action agent-card-action agent-card-save-confirm"
                            onClick={() => confirmSave(key, card.id, action.id)}
                          >
                            <Icon name="check" size={13} />
                            {t('agent.card.save.confirm')}
                          </button>
                          <button
                            type="button"
                            className="agent-action agent-card-action"
                            onClick={() => {
                              dispatchSave(key, { type: 'cancel' });
                              recordSave(card.id, action.id, { type: 'cancelled' });
                            }}
                          >
                            {t('agent.card.save.cancel')}
                          </button>
                        </>
                      ) : null}
                      {run.status === 'saved' || saveRecorded ? (
                        <span className="agent-card-save-status">
                          {t('agent.card.save.saved')}
                        </span>
                      ) : null}
                      {(run.status === 'saved' || saveRecorded) && undoAction ? (
                        <span
                          className={`agent-card-undo agent-undo-${undoRun.status}`}
                          role="group"
                          aria-label={t('agent.card.undo.title')}
                        >
                          {undoRun.status === 'idle' ? (
                            <button
                              type="button"
                              className="agent-action agent-card-action"
                              onClick={() => void reviewUndo(
                                undoKey,
                                card.id,
                                undoAction.id,
                                undoAction.effect.type === 'undo'
                                  ? undoAction.effect.operationId
                                  : '',
                              )}
                            >
                              <Icon name="refresh" size={13} />
                              {t('agent.card.undo.review')}
                            </button>
                          ) : null}
                          {undoRun.status === 'review' && undoRun.target ? (
                            <>
                              <span className="agent-card-save-entry">
                                {t('agent.card.undo.target', {
                                  operation: undoRun.target.operation,
                                  count: undoRun.target.entityIds.length,
                                })}
                              </span>
                              <button
                                type="button"
                                className="agent-action agent-card-action agent-card-undo-confirm"
                                onClick={() => void confirmUndo(
                                  undoKey,
                                  card.id,
                                  undoAction.id,
                                  undoAction.effect.type === 'undo'
                                    ? undoAction.effect.operationId
                                    : '',
                                )}
                              >
                                {t('agent.card.undo.confirm')}
                              </button>
                              <button
                                type="button"
                                className="agent-action agent-card-action"
                                onClick={() => {
                                  dispatchUndo(undoKey, { type: 'cancel' });
                                  recordUndo(card.id, undoAction.id, { type: 'cancelled' });
                                }}
                              >
                                {t('agent.card.undo.cancel')}
                              </button>
                            </>
                          ) : null}
                          {undoRun.status === 'running' ? (
                            <span className="agent-card-save-status">{t('agent.card.undo.running')}</span>
                          ) : null}
                          {undoRun.status === 'cancelled' ? (
                            <>
                              <span className="agent-card-save-status">
                                {t('agent.card.undo.cancelled')}
                              </span>
                              <button
                                type="button"
                                className="agent-action agent-card-action"
                                onClick={() => {
                                  dispatchUndo(undoKey, { type: 'retry' });
                                  void reviewUndo(
                                    undoKey,
                                    card.id,
                                    undoAction.id,
                                    undoAction.effect.type === 'undo'
                                      ? undoAction.effect.operationId
                                      : '',
                                  );
                                }}
                              >
                                {t('agent.card.undo.review')}
                              </button>
                            </>
                          ) : null}
                          {undoRun.status === 'failed' ? (
                            <>
                              <span className="agent-card-action-error" role="alert">
                                {t(`agent.undo.error.${undoRun.code ?? 'undo-failed'}`)}
                              </span>
                              <button
                                type="button"
                                className="agent-action agent-card-action"
                                onClick={() => {
                                  dispatchUndo(undoKey, { type: 'retry' });
                                  void reviewUndo(
                                    undoKey,
                                    card.id,
                                    undoAction.id,
                                    undoAction.effect.type === 'undo'
                                      ? undoAction.effect.operationId
                                      : '',
                                  );
                                }}
                              >
                                {t('agent.card.undo.retry')}
                              </button>
                            </>
                          ) : null}
                        </span>
                      ) : null}
                      {(run.status === 'saved' || saveRecorded) && wasUndone ? (
                        <span className="agent-card-save-status">{t('agent.card.undo.undone')}</span>
                      ) : null}
                      {run.status === 'cancelled' ? (
                        <>
                          <span className="agent-card-save-status">
                            {t('agent.card.save.cancelled')}
                          </span>
                          <button
                            type="button"
                            className="agent-action agent-card-action"
                            onClick={() => {
                              dispatchSave(key, { type: 'retry' });
                              reviewSave(key, card.id, action.id);
                            }}
                          >
                            {t('agent.card.save.review')}
                          </button>
                        </>
                      ) : null}
                      {run.status === 'failed' ? (
                        <>
                          <span className="agent-card-action-error" role="alert">
                            {t(`agent.save.error.${run.code ?? 'save-failed'}`)}
                          </span>
                          <button
                            type="button"
                            className="agent-action agent-card-action"
                            onClick={() => {
                              dispatchSave(key, { type: 'retry' });
                              reviewSave(key, card.id, action.id);
                            }}
                          >
                            {t('agent.card.save.retry')}
                          </button>
                        </>
                      ) : null}
                    </span>
                  );
                })}
                {card.actions.some((action) => action.effect.type === 'open-context') ? (
                  <span className="agent-card-actions">
                     {card.actions.map((action) => {
                       if (action.effect.type !== 'open-context') return null;
                       const contextId = action.effect.contextId;
                       const target = conversation.context.find(
                         (item) => item.id === contextId,
                      );
                      const actionKey = `${card.id}:${action.id}`;
                      const label = target
                        ? t('agent.context.source', { app: target.source.app })
                        : t('agent.context.title');
                      return (
                        <span key={action.id} className="agent-card-action-wrap">
                          <button
                            type="button"
                            className="agent-action agent-card-action"
                            aria-label={label}
                            onClick={() => {
                              const opened = onOpenContext(
                                contextId,
                                card.sourceContextIds,
                              );
                              setFailedActionId(opened ? null : actionKey);
                            }}
                          >
                            <Icon name="external" size={13} />
                            {label}
                          </button>
                          {failedActionId === actionKey ? (
                            <span className="agent-card-action-error" role="alert">
                              {t('agent.error.invalid-request')}
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * The activity inspector: what was attempted here, newest first.
 *
 * Every attempt names its effect and its outcome and **nothing else**. There is
 * no destination and no stored label — the timeline holds ids only, so there is
 * no untrusted string here to render, which is the same property that makes the
 * navigation channel safe. A failed attempt keeps its code so a retry beside it
 * does not erase why the first one did not work.
 */
function ActivityTimeline({ entries }: { entries: readonly AgentTimelineEntry[] }) {
  const { t } = useT();
  if (entries.length === 0) return null;
  return (
    <section className="agent-timeline" aria-label={t('agent.timeline.title')}>
      <h3 className="agent-timeline-title">{t('agent.timeline.title')}</h3>
      <ol className="agent-timeline-list">
        {entries.map((entry) => (
          <li key={entry.id} className={`agent-timeline-entry agent-timeline-${entry.status}`}>
            <span className="agent-timeline-effect">
              {t(`agent.timeline.effect.${entry.effect}`)}
            </span>
            <span className="agent-timeline-status">
              {t(`agent.timeline.status.${entry.status}`)}
            </span>
            {entry.attempt > 1 ? (
              <span className="agent-timeline-attempt">
                {t('agent.timeline.attempt', { count: entry.attempt })}
              </span>
            ) : null}
            {entry.code ? (
              <span className="agent-timeline-code">
                {entry.effect === 'execute-step'
                  ? t('agent.plan.queue.error.run-failed')
                  : entry.effect === 'plan-control' || entry.effect === 'plan-save'
                    ? t(`agent.plan.queue.error.${entry.code}`)
                    : t(`agent.${entry.effect === 'approve-step' ? 'approve' : entry.effect}.error.${entry.code}`)}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function AgentWorkspaceShell() {
  const { t, lang } = useT();
  const [state, setState] = useState<AgentWorkspaceState | null>(null);
  const [failure, setFailure] = useState<AgentWorkspaceFailureCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<PendingConfirmation>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState<AgentTargetChoice>('local');
  const [allowLocalFallback, setAllowLocalFallback] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [planNotice, setPlanNotice] = useState<{
    kind: 'status' | 'error';
    text: string;
  } | null>(null);
  const [planQueueFailure, setPlanQueueFailure] = useState<string | null>(null);
  const [maxInputChars, setMaxInputChars] = useState(AGENT_EXECUTION_DEFAULT_INPUT_BUDGET);
  const [maxOutputTokens, setMaxOutputTokens] = useState(AGENT_EXECUTION_DEFAULT_OUTPUT_BUDGET);
  /**
   * The user's per-provider rates, and whether a cap is being enforced from them.
   *
   * The rates persist; the cap is session-only like the two budgets above it,
   * because it is a decision about the run in front of the user. `costCapOn` is
   * separate from the amount so that turning the cap off does not throw away the
   * figure the user chose, and so that "no cap" is never expressed as a cap of
   * zero — which the runtime would read as "refuse everything".
   */
  const [pricingTable, setPricingTable] = useState<AgentProviderPricingTable>(() => (
    loadAgentProviderPricing()
  ));
  const [costCapOn, setCostCapOn] = useState(false);
  const [costCapUsd, setCostCapUsd] = useState(AGENT_COST_BUDGET_DEFAULT_USD);
  const [rateDraft, setRateDraft] = useState<AgentProviderRateDraft>({ input: '', output: '' });
  const [attachments, setAttachments] = useState<AgentExecutionAttachment[]>([]);
  /**
   * Bumped by main's "a capture is waiting" announcement, and the reason the
   * claim below is not keyed on the conversation id alone.
   *
   * Two things would go wrong without it. A second hand-off into the *same*
   * conversation leaves `activeConversationId` unchanged, so an effect watching
   * only that never runs again. And the hand-off stages its capture *after* it
   * saves the context — the conversation id is what the save decides — so the
   * `agentWorkspace:changed` push arrives at an already-open Agent before the
   * image exists. Both were live defects; the announcement fixes both, and it is
   * the workspace push that is deliberately *not* wired here, so an ordinary
   * message does not cost an IPC round trip.
   */
  const [claimTicket, setClaimTicket] = useState(0);
  /**
   * A view preference for this window only. The inspector disclosure never
   * enters the main-owned workspace document, so another window and the next
   * launch are not made to inherit a momentary layout choice.
   */
  const [inspectorExpanded, setInspectorExpanded] = useState(true);
  const [capabilitiesExpanded, setCapabilitiesExpanded] = useState(false);
  const [governanceExpanded, setGovernanceExpanded] = useState(false);
  const [promptLibraryExpanded, setPromptLibraryExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'simple' | 'full'>('simple');
  const inspectorContentId = `agent-inspector-${useId().replace(/:/g, '')}`;
  /**
   * What this window actually tried to do, newest attempt first.
   *
   * Session-only and per-window, for the same reason `navigationRuns` is: it is
   * a record of what the user watched happen here, not a property of the
   * conversation, and syncing it would put one window's execution history in
   * front of another window's user.
   */
  const [timeline, setTimeline] = useState<AgentTimelineEntry[]>([]);
  /**
   * What this window actually changed, ids only and bounded by the shared log.
   * It is session-only for the same reason the execution timeline is: another
   * window did not witness or authorize these effects.
   */
  const [operationLog, setOperationLog] = useState<AgentOperationLog>(AGENT_OPERATION_LOG_EMPTY);
  /**
   * One hydrated authority snapshot for the whole shell. Historical messages
   * share it so the number of queue/profile/settings listeners never grows with
   * the conversation. A null snapshot is rendered as a passive availability
   * check, never as an optimistic Review control.
   */
  const [approvalContext, setApprovalContext] = useState<AgentStepApprovalContext | null>(null);

  useEffect(() => {
    setApprovalContext(null);
    return observeAgentStepApprovalContext(t, setApprovalContext);
  }, [lang, t]);

  const appendOperation = useCallback((operation: AgentOperationDraft): void => {
    setOperationLog((previous) => agentOperationLogAppend(previous, operation, Date.now()));
  }, []);

  /**
   * Ids this window has already handed to the durable history.
   *
   * The projection below runs over the whole log rather than the newest entry,
   * because a state updater is not where a side effect belongs and the effect
   * therefore sees a log, not a delta. Without this ref that costs a full
   * history scan per retained entry on every append; with it, an already-durable
   * entry is skipped before the module is called at all.
   *
   * It is a fast path and not the correctness guarantee — that stays in
   * `agentOperationHistoryAppend`, which is idempotent on the entry id and so
   * still holds for a remount (the ref resets) and for a second window (the ref
   * never saw the other window's entries).
   */
  const durableOperationIds = useRef<Set<string>>(new Set());

  /**
   * The durable record of what the Agent changed, projected out of the
   * session log — see `agentOperationHistory.ts` for why the two are separate
   * documents rather than one persisted log. Oldest first, so the stored order
   * matches the order the operations actually ran in.
   */
  useEffect(() => {
    for (let index = operationLog.entries.length - 1; index >= 0; index -= 1) {
      const operation = operationLog.entries[index];
      if (durableOperationIds.current.has(operation.id)) continue;
      durableOperationIds.current.add(operation.id);
      appendAgentOperationHistorySnapshot(agentOperationHistoryEntryFrom(operation));
    }
  }, [operationLog]);

  /**
   * The pipeline terminal's lines. Recomputed when the operation log changes,
   * which re-reads the live stores — so a card deleted by hand after the Agent
   * created it stops being reported as verified the next time a step lands.
   */
  const pipelineLines = useMemo(() => buildAgentPipelineLines(operationLog), [operationLog]);

  const recordTimelineProjection = useCallback((projection: AgentTimelineProjection): void => {
    const startedAt = Date.now();
    setTimeline((previous) => projection.events.reduce(
      (current, event, index) => agentTimelineRecord(
        current,
        projection.target,
        event,
        startedAt + index,
      ),
      previous,
    ));
  }, []);

  const recordTimeline = (
    conversationId: string,
    messageId: string,
    cardId: string,
    actionId: string,
    effect: AgentTimelineEffect,
    event: AgentTimelineEvent,
  ): void => {
    setTimeline((previous) => agentTimelineRecord(
      previous,
      { conversationId, messageId, cardId, actionId, effect },
      event,
      Date.now(),
    ));
  };
  const [attachmentFailure, setAttachmentFailure] = useState<{
    code: AgentAttachmentReadFailureCode;
    fileName?: string;
  } | null>(null);
  const [attachmentReading, setAttachmentReading] = useState(false);
  const [cloudSensitiveConsent, setCloudSensitiveConsent] = useState(false);
  const [agentSettings, setAgentSettings] = useState(loadLocalAgentSettings);
  const [runningRequestId, setRunningRequestId] = useState<string | null>(null);
  const [runningPrompt, setRunningPrompt] = useState('');
  const [streamedText, setStreamedText] = useState('');
  const [executionFailure, setExecutionFailure] =
    useState<AgentExecutionFailureCode | null>(null);
  const railRef = useRef<HTMLUListElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const contextItemRefs = useRef(new Map<string, HTMLLIElement>());
  const [openedContext, setOpenedContext] = useState<{
    conversationId: string;
    contextId: string;
  } | null>(null);

  const apply = useCallback((result: AgentWorkspaceResult) => {
    if (result.ok) {
      setState(result.state);
      setFailure(null);
      return;
    }
    // Whatever was on screen stays there. A failed write did not change the
    // file, so blanking the surface would tell a lie the store never told.
    setFailure(result.code);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    apply(await loadAgentWorkspace());
    setLoading(false);
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * The shell is no longer the only writer. A hand-off from another surface
   * (Dictionary's "Ask the Agent") writes context straight into the main-owned
   * workspace, and without this the shell keeps showing what it read at mount:
   * an Agent already open reports "0 conversations" while the store holds one,
   * measured live before the push existed.
   *
   * Main's state is adopted directly rather than triggering a re-read. The push
   * carries the document that was just committed, so a `load` round trip would
   * fetch the same bytes, and the loading flag would flicker the surface for a
   * change that is already in hand.
   */
  useEffect(() => onAgentWorkspaceChanged((next) => {
    setState(next);
    setFailure(null);
  }), []);

  /**
   * Main's announcement that a capture is waiting.
   *
   * The conversation it names is deliberately ignored: the claim below is scoped
   * to whatever this window has open, and a capture staged for a conversation
   * this window is not showing is collected when the user switches to it. Acting
   * on the id here would mean trusting it to match a `activeConversationId` this
   * window may not have applied yet.
   */
  useEffect(() => onAgentImageStaged(() => {
    setClaimTicket((current) => current + 1);
  }), []);

  /** Every mutation goes through here, so no two writes can overlap. */
  const run = useCallback(async (operation: () => Promise<AgentWorkspaceResult>) => {
    setBusy(true);
    apply(await operation());
    setConfirming(null);
    setBusy(false);
  }, [apply]);

  const summaries = useMemo(() => (state ? agentConversationSummaries(state) : []), [state]);
  /**
   * History search is a *view*, so the query lives here rather than in the
   * main-owned workspace: it is not something a second window should inherit,
   * and it must never reach disk.
   */
  const searching = query.trim().length > 0;
  const results = useMemo(
    () => (state && searching ? agentHistorySearch(state, query) : []),
    [query, searching, state],
  );
  const selected = state ? agentSelectedConversation(state) : null;
  const phase = agentShellPhase({ loading, failure, state });
  const activeId = state?.activeConversationId ?? null;
  const executing = runningRequestId !== null;
  const blocked = busy || executing || planning;
  const runningMessageIds = runningRequestId
    ? agentExecutionMessageIds(runningRequestId)
    : null;
  const hasPersistedRunningExchange = Boolean(
    runningMessageIds
    && selected?.messages.some((message) => message.id === runningMessageIds.assistant),
  );
  const sensitiveContextKey = agentSensitiveContextKey(activeId, selected?.context ?? []);
  const hasSensitiveContext = selected?.context.some(
    (item) => item.sensitivity === 'sensitive',
  ) ?? false;
  const hasSensitiveMaterial = attachments.length > 0 || hasSensitiveContext;
  const sensitiveContextExcluded = target !== 'local'
    && agentSettings.excludeSensitiveContext
    && hasSensitiveMaterial;
  const sensitiveConsentRequired = target !== 'local'
    && !agentSettings.excludeSensitiveContext
    && hasSensitiveMaterial;
  // Main refuses this combination with `vision-unsupported` rather than
  // answering from the prompt alone. Saying so here, and refusing to submit,
  // turns a failed round trip into a visible reason and a target the user can
  // change — `providerAcceptsImageInput` is false for `'local'` too.
  const visionUnsupported = !sensitiveContextExcluded
    && attachments.some((attachment) => attachment.kind === 'image')
    && !providerAcceptsImageInput(target);
  const knownInputChars = agentKnownInputChars(
    draft,
    sensitiveContextExcluded ? [] : attachments,
  );
  const knownInputOverBudget = knownInputChars > maxInputChars;
  const planObjectiveTooLong = draft.trim().length > AGENT_CONVERSATION_PLAN_OBJECTIVE_LIMIT;
  /**
   * Why the composer's two buttons are greyed out, in the order the user should
   * act on them.
   *
   * The rules live in `shared/agentComposerReason` so their PRIORITY is
   * testable; `disabled` is derived from the reason rather than repeating the
   * condition list, so a greyed-out button with no reason is not expressible
   * here. Four of the conditions already render a `role="alert"` paragraph above
   * the row, and these reuse those SAME keys rather than inventing a second
   * wording for one state — but that paragraph is a sibling of
   * `.agent-composer-actions`, not of the button, so nothing tied the two
   * together for a screen reader or for a user reading the row.
   */
  const composerState: AgentComposerState = {
    busy,
    planning,
    attachmentReading,
    attachmentCount: attachments.length,
    draft,
    planObjectiveTooLong,
    knownInputOverBudget,
    visionUnsupported,
    sensitiveConsentRequired,
    cloudSensitiveConsent,
  };
  const planReasonKey = agentPlanDisabledReason(composerState);
  const sendReasonKey = agentSendDisabledReason(composerState);
  // `inputOverBudget` is the one reason that interpolates, and it takes the same
  // limit the alert above the row already shows.
  const planDisabledReason = planReasonKey ? t(planReasonKey) : undefined;
  const sendDisabledReason = sendReasonKey
    ? t(sendReasonKey, sendReasonKey === 'agent.execute.inputOverBudget'
      ? { limit: maxInputChars }
      : undefined)
    : undefined;
  const selectedPrice = agentProviderPrice(pricingTable, target);
  /**
   * A floor, not a forecast, and labelled as one.
   *
   * It is computed from what the composer can measure — the same characters
   * `agentKnownInputChars` counts — while main additionally prices conversation
   * history, the mode preset and context labels. It also assumes the whole output
   * budget is spent, which is the honest direction for a number a spending
   * decision is made from: the part it cannot see only pushes the real figure up.
   */
  const estimatedCostUsd = estimateAgentProviderCostUsd(
    agentEstimatedTokens(knownInputChars),
    maxOutputTokens,
    selectedPrice,
  );
  const costCapActive = costCapOn && Boolean(selectedPrice);

  // Consent is scoped to this exact conversation/sensitive-context snapshot.
  // A context shelf update or conversation switch must require a fresh choice.
  useEffect(() => {
    setCloudSensitiveConsent(false);
  }, [agentSettings.excludeSensitiveContext, sensitiveContextKey]);

  useEffect(() => onLocalAgentSettingsChanged(setAgentSettings), []);

  /**
   * Credential presence per cloud provider, so the picker can say a provider is
   * unusable *before* a prompt is spent on it rather than after the run comes
   * back `missing-credential`.
   *
   * Re-read on every target change, because the key is entered on a different
   * surface (AI Studio) and in a different window: a "no key" cached from mount
   * would still be showing after the user went and saved one. An empty report —
   * the pre-answer state, and a failed read — deliberately warns about nothing,
   * so a bridge hiccup cannot invent a missing key.
   */
  const [providerHealth, setProviderHealth] = useState<readonly AiProviderHealth[]>([]);
  useEffect(() => {
    let alive = true;
    void window.api
      .aiProviderHealth()
      .then((report) => {
        if (alive) setProviderHealth(report);
      })
      .catch(() => {
        if (alive) setProviderHealth([]);
      });
    return () => {
      alive = false;
    };
  }, [target]);

  const providerNeedsKey = useCallback(
    (providerId: AiProviderId): boolean => providerHealth.some(
      (entry) => entry.providerId === providerId && !entry.configured,
    ),
    [providerHealth],
  );
  const targetNeedsKey = target !== 'local' && providerNeedsKey(target);

  // A rate entered in the pop-out Agent has to reach the docked one, and the
  // reverse. Rates are the only piece of this panel that is not per-window.
  useEffect(() => onAgentProviderPricingChanged(setPricingTable), []);

  /**
   * The two rate fields show the *selected* provider's price. Keyed on the target
   * alone rather than on the table: re-seeding on every table change would
   * overwrite the digits being typed with the committed value on each keystroke.
   */
  useEffect(() => {
    setRateDraft(agentRateDraftFromPrice(agentProviderPrice(loadAgentProviderPricing(), target)));
  }, [target]);

  /**
   * Persisting from the event handler rather than from inside the state updater:
   * an updater has to stay pure, and React invokes it twice under StrictMode.
   */
  const editRate = useCallback((half: 'input' | 'output', text: string): void => {
    if (target === 'local') return;
    const next: AgentProviderRateDraft = { ...rateDraft, [half]: text };
    setRateDraft(next);
    setPricingTable(saveAgentProviderPrice(target, agentPriceFromRateDraft(next)));
  }, [rateDraft, target]);

  /**
   * The composer's own attachments, readable from an effect that must not re-run
   * when they change.
   *
   * The claim below needs to know what is already attached in order to merge,
   * but putting `attachments` in its dependency array would make every pick and
   * every removal fire another claim. Declared before that effect so it is
   * already current when the claim reads it: effects in one commit run in
   * declaration order.
   */
  const attachmentsRef = useRef<AgentExecutionAttachment[]>(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  /**
   * Claims whatever capture a hand-off staged for this conversation.
   *
   * This is the receiving end of `shared/agentImageStaging.ts`: a surface that
   * captured a screenshot cannot hand the payload over through the persisted
   * workspace, so it leaves it in main keyed by the conversation its context
   * landed in, and the window that opens that conversation collects it here.
   *
   * The claim is **single-use in main**, which decides the error handling. Once
   * `take` has answered, the capture exists nowhere else; a claim this window
   * cannot fit is gone rather than waiting for the next attempt, so the merge
   * reports what it had to leave out instead of quietly shortening the list.
   *
   * Runs on every workspace push as well as on a conversation switch, and the
   * overwhelmingly common answer is an empty list — `take` is a map lookup, and
   * paying for it on each push is what makes a second hand-off into an
   * already-open conversation work at all.
   */
  useEffect(() => {
    if (!activeId) return undefined;
    let alive = true;
    void (async () => {
      const claimed = await takeAgentImages(activeId);
      if (!alive || !claimed.ok || claimed.images.length === 0) return;
      const merged = mergeStagedImageAttachments(attachmentsRef.current, claimed.images);
      setAttachments(merged.attachments);
      // A capture is `sensitive`, so an arriving one invalidates a consent the
      // user gave for the material that was on the shelf before it.
      setCloudSensitiveConsent(false);
      setAttachmentFailure(merged.dropped > 0 ? { code: 'too-many-images' } : null);
    })();
    return () => {
      alive = false;
    };
  }, [activeId, claimTicket]);

  const selectAttachments = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    setAttachmentReading(true);
    const result = await readAgentAttachmentFiles(files, attachments);
    setAttachmentReading(false);
    if (!result.ok) {
      setAttachmentFailure({ code: result.code, fileName: result.fileName });
      return;
    }
    setAttachments(result.attachments);
    setAttachmentFailure(null);
    setCloudSensitiveConsent(false);
  }, [attachments]);

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    setAttachmentFailure(null);
    setCloudSensitiveConsent(false);
  }, []);

  const submitPrompt = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (
      !selected
      || !prompt
      || executing
      || attachmentReading
      || knownInputOverBudget
      || visionUnsupported
      || (sensitiveConsentRequired && !cloudSensitiveConsent)
    ) return;
    const requestId = newExecutionId();
    const basePolicy = defaultAgentExecutionPolicy(target);
    // Read at submit rather than held in state: this is the policy the user had
    // set when they pressed send, and it cannot go stale behind a governance
    // edit made in this window or a sibling one between renders.
    const executionSettings = loadLocalAgentSettings();
    const request: AgentExecutionRequest = {
      requestId,
      conversationId: selected.id,
      prompt,
      policy: {
        ...basePolicy,
        excludeSensitiveContext: executionSettings.excludeSensitiveContext,
        allowSensitiveContext: sensitiveConsentRequired && cloudSensitiveConsent,
        historyTurns: LOCAL_AGENT_CHAT_HISTORY_TURNS[executionSettings.chatHistory],
        maxInputChars,
        maxOutputTokens,
        // Both or neither. The bridge normalizer drops a cap that arrives
        // without rates anyway; sending them together is what makes the
        // refusal the user was promised actually reachable.
        ...(selectedPrice ? { pricing: selectedPrice } : {}),
        ...(costCapActive ? { maxEstimatedCostUsd: costCapUsd } : {}),
      },
      allowLocalFallback: target === 'local' ? false : allowLocalFallback,
      attachments,
    };
    setRunningRequestId(requestId);
    setRunningPrompt(prompt);
    setStreamedText('');
    setExecutionFailure(null);
    const result = await executeAgentPrompt(request, (streamEvent) => {
      setStreamedText((current) => current + streamEvent.text);
    });
    if (result.ok) {
      apply({ ok: true, state: result.state });
      setDraft('');
      setAttachments([]);
      setAttachmentFailure(null);
      setCloudSensitiveConsent(false);
    } else if (result.state) {
      // The failed assistant row is a real workspace change. Adopt it without
      // clearing the prompt or selected files so the user can retry.
      apply({ ok: true, state: result.state });
    }
    if (!result.ok) setExecutionFailure(result.code);
    setRunningRequestId(null);
    setRunningPrompt('');
    setStreamedText('');
  }, [
    allowLocalFallback,
    apply,
    knownInputOverBudget,
    attachmentReading,
    attachments,
    cloudSensitiveConsent,
    draft,
    executing,
    selected,
    sensitiveConsentRequired,
    target,
    maxInputChars,
    maxOutputTokens,
    selectedPrice,
    costCapActive,
    costCapUsd,
  ]);

  const cancelExecution = useCallback(() => {
    if (runningRequestId) void cancelAgentPrompt(runningRequestId);
  }, [runningRequestId]);

  const createPlan = useCallback(async (): Promise<void> => {
    if (!selected || planning || attachments.length > 0) return;
    const objective = draft.trim();
    if (!objective || objective.length > AGENT_CONVERSATION_PLAN_OBJECTIVE_LIMIT) return;
    setPlanning(true);
    setPlanNotice({ kind: 'status', text: t('agent.plan.planning') });
    const result = await createAgentConversationPlan(selected, objective, t);
    if (result.ok) {
      setPlanNotice({
        kind: 'status',
        text: t('agent.plan.queued', {
          summary: result.summary,
          count: result.queue.items.find((item) => item.id === result.taskId)?.task.steps.length ?? 0,
        }),
      });
      setPlanQueueFailure(null);
    } else {
      const base = result.summary || t(planFailureKey(result.code));
      setPlanNotice({
        kind: result.code === 'no-approved-actions' ? 'status' : 'error',
        text: base,
      });
    }
    setPlanning(false);
  }, [attachments.length, draft, planning, selected, t]);

  const createConversation = useCallback(() => {
    const base = state ?? emptyAgentWorkspaceState();
    const input = {
      id: newConversationId(),
      title: t('agent.conversation.untitled'),
      now: Date.now(),
    };
    void run(() => updateAgentWorkspace(
      base,
      (current) => agentWorkspaceWithNewConversation(current, input),
    ));
    // `lang`, not `t`: `t`'s identity is stable by design, so depending on it
    // would silently go stale after a language switch instead of erroring.
  }, [lang, run, state, t]);

  const select = useCallback((conversationId: string) => {
    if (!state) return;
    void run(() => updateAgentWorkspace(
      state,
      (current) => agentWorkspaceWithSelection(current, conversationId),
    ));
  }, [run, state]);

  /**
   * A mode switch is a change to what the next request will say, so it goes
   * through the same main-owned save as every other edit rather than living in
   * component state — a pop-out showing a different preset than the one that
   * will actually be sent would be worse than no picker at all.
   */
  const setMode = useCallback((mode: AgentWorkspaceMode) => {
    if (!state || !selected) return;
    const now = Date.now();
    void run(() => updateAgentWorkspace(
      state,
      (current) => agentWorkspaceWithMode(current, selected.id, mode, now),
    ));
  }, [run, selected, state]);

  const togglePin = useCallback((conversationId: string) => {
    if (!state) return;
    const now = Date.now();
    void run(() => updateAgentWorkspace(
      state,
      (current) => agentWorkspaceWithPinToggled(current, conversationId, now),
    ));
  }, [run, state]);

  /**
   * Removing context is not a cosmetic list edit — it is the user withdrawing
   * material from the next request, so it goes through the same main-owned save
   * as every other change rather than being held in component state.
   */
  const removeContext = useCallback((contextId: string) => {
    if (!state || !selected) return;
    const now = Date.now();
    void run(() => updateAgentWorkspace(
      state,
      (current) => agentWorkspaceWithContextDetached(current, selected.id, contextId, now),
    ));
  }, [run, selected, state]);

  const registerContextItem = useCallback((
    contextId: string,
    element: HTMLLIElement | null,
  ) => {
    if (element) contextItemRefs.current.set(contextId, element);
    else contextItemRefs.current.delete(contextId);
  }, []);

  useEffect(() => {
    if (!inspectorExpanded || !openedContext || openedContext.conversationId !== selected?.id) {
      return;
    }
    const element = contextItemRefs.current.get(openedContext.contextId);
    if (!element) return;
    element.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    element.focus({ preventScroll: true });
  }, [inspectorExpanded, openedContext, selected?.id]);

  /**
   * Result cards are provider-authored data, so an effect is never used as a
   * selector or a route. The only connected slice resolves an exact id through
   * the selected conversation and the card's declared provenance, then moves
   * focus to its shelf item. A source action also opens the presentation-only
   * inspector when needed; it still does not navigate or mutate the workspace.
   */
  const openContext = useCallback((
    contextId: string,
    sourceContextIds: readonly string[],
  ): boolean => {
    if (!selected || !sourceContextIds.includes(contextId)) return false;
    const item = selected.context.find((candidate) => candidate.id === contextId);
    if (!item) return false;
    setInspectorExpanded(true);
    setOpenedContext({ conversationId: selected.id, contextId });
    return true;
  }, [selected]);

  const railKeyDown = useCallback((event: RKeyboardEvent<HTMLUListElement>) => {
    const ids = summaries.map((summary) => summary.id);
    const active = document.activeElement as HTMLElement | null;
    const currentId = active?.dataset?.agentConversation ?? null;
    let targetId: string | null = null;
    if (event.key === 'ArrowDown') targetId = agentRailFocusTarget(ids, currentId, 1);
    else if (event.key === 'ArrowUp') targetId = agentRailFocusTarget(ids, currentId, -1);
    else if (event.key === 'Home') targetId = ids[0] ?? null;
    else if (event.key === 'End') targetId = ids[ids.length - 1] ?? null;
    if (!targetId) return;
    event.preventDefault();
    // Matched on the dataset rather than through a built selector: a
    // conversation id is opaque store data and is never spliced into a query.
    const entries = railRef.current?.querySelectorAll<HTMLElement>('[data-agent-conversation]');
    for (const entry of entries ?? []) {
      if (entry.dataset.agentConversation === targetId) {
        entry.focus();
        return;
      }
    }
  }, [summaries]);

  const pendingDeleteId = confirming?.kind === 'delete' ? confirming.conversationId : null;
  const pendingClear = confirming?.kind === 'clear';

  return (
    <div className="agent-root">
      <section
        className="agent-shell"
        aria-label={t('agent.shell.aria')}
        aria-busy={blocked || loading}
      >
        {/* L5 — the conversation rail is navigation, the Liquid role §2.3 names
            first, and it takes the same primitive `medialib-rail` took. A role
            declaration, not a paint: `lq-contextual` is inert by construction
            and only a window explicitly put in Liquid presentation picks up the
            shared material, so the conventional shell renders the pixels it
            always did. */}
        <ContextualSurface as="nav" className="agent-rail" aria-label={t('agent.rail.aria')}>
          <div className="agent-rail-head">
            <h2 className="agent-rail-title">{t('agent.rail.aria')}</h2>
            <span className="agent-rail-count">
              {t('agent.rail.conversationCount', { count: summaries.length })}
            </span>
          </div>

          <button
            type="button"
            className="agent-action agent-action-primary"
            onClick={createConversation}
            disabled={blocked}
          >
            <Icon name="plus" size={15} />
            {t('agent.rail.new')}
          </button>

          {/*
            Search replaces the rail list rather than filtering it in place: a
            result carries a snippet and a match count the rail entries do not,
            and archived conversations appear here while the rail deliberately
            hides them. Two different lists, so two different renderings.
          */}
          <div className="agent-search">
            <label className="agent-search-field">
              <span className="agent-visually-hidden">{t('agent.search.label')}</span>
              <Icon name="search" size={14} />
              <input
                type="search"
                className="agent-search-input"
                value={query}
                placeholder={t('agent.search.placeholder')}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
            {searching ? (
              <span className="agent-rail-count">
                {t('agent.search.resultCount', { count: results.length })}
              </span>
            ) : null}
          </div>

          {searching ? (
            results.length === 0 ? (
              <p className="agent-placeholder" role="status">{t('agent.search.none')}</p>
            ) : (
              <ul className="agent-rail-list agent-search-results">
                {results.map((result) => (
                  <li key={result.conversationId} className="agent-rail-item">
                    <button
                      type="button"
                      className={`agent-rail-entry${result.conversationId === activeId ? ' is-selected' : ''}`}
                      aria-current={result.conversationId === activeId ? 'true' : undefined}
                      // The query is deliberately kept after a click, so several
                      // results can be read one after another without retyping.
                      onClick={() => select(result.conversationId)}
                      disabled={blocked}
                    >
                      <span className="agent-rail-entry-title">{result.title}</span>
                      <span className="agent-search-snippet">{result.snippet}</span>
                      <span className="agent-rail-entry-meta">
                        {result.archived ? (
                          <span className="agent-chip">{t('agent.search.archived')}</span>
                        ) : null}
                        {result.titleMatched ? (
                          <span className="agent-chip">{t('agent.search.titleMatch')}</span>
                        ) : null}
                        {result.messageMatches > 0 ? (
                          <span className="agent-rail-entry-messages">
                            {t('agent.search.matchCount', { count: result.messageMatches })}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
          <ul className="agent-rail-list" ref={railRef} onKeyDown={railKeyDown}>
            {summaries.map((summary) => (
              <li key={summary.id} className="agent-rail-item">
                <button
                  type="button"
                  data-agent-conversation={summary.id}
                  className={`agent-rail-entry${summary.id === activeId ? ' is-selected' : ''}`}
                  aria-current={summary.id === activeId ? 'true' : undefined}
                  onClick={() => select(summary.id)}
                  disabled={blocked}
                >
                  <span className="agent-rail-entry-title">{summary.title}</span>
                  <span className="agent-rail-entry-meta">
                    <span className="agent-chip">{t(`agent.mode.${summary.mode}`)}</span>
                    <span className="agent-rail-entry-messages">
                      {t('agent.rail.messageCount', { count: summary.messageCount })}
                    </span>
                    {summary.usedCloud ? (
                      <span className="agent-chip agent-chip-cloud">
                        <Icon name="globe" size={12} />
                        {t('agent.rail.cloud')}
                      </span>
                    ) : null}
                  </span>
                </button>
                <button
                  type="button"
                  className={`agent-icon-button${summary.pinned ? ' is-active' : ''}`}
                  aria-label={summary.pinned ? t('agent.rail.unpin') : t('agent.rail.pin')}
                  aria-pressed={summary.pinned}
                  onClick={() => togglePin(summary.id)}
                  disabled={blocked}
                >
                  <Icon name="pin" size={15} />
                </button>
              </li>
            ))}
          </ul>
          )}

          <div className="agent-rail-foot">
            {pendingClear ? (
              <>
                <button
                  type="button"
                  className="agent-action agent-action-danger"
                  onClick={() => void run(clearAgentWorkspace)}
                  disabled={blocked}
                >
                  {t('agent.rail.clearConfirm')}
                </button>
                <button
                  type="button"
                  className="agent-action"
                  onClick={() => setConfirming(null)}
                  disabled={blocked}
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="agent-action"
                onClick={() => setConfirming({ kind: 'clear' })}
                disabled={blocked || summaries.length === 0}
              >
                <Icon name="trash" size={15} />
                {t('agent.rail.clear')}
              </button>
            )}
          </div>
        </ContextualSurface>

        <div className="agent-canvas">
          {failure ? (
            <div className="agent-banner" role="alert">
              <span className="agent-banner-text">{t(`agent.error.${failure}`)}</span>
              <button
                type="button"
                className="agent-action"
                onClick={() => void refresh()}
                disabled={blocked}
              >
                <Icon name="refresh" size={15} />
                {t('agent.state.retry')}
              </button>
            </div>
          ) : null}

          {phase === 'loading' ? (
            <p className="agent-placeholder" role="status">{t('agent.state.loading')}</p>
          ) : null}

          {phase === 'empty' ? (
            <div className="agent-placeholder agent-empty">
              <Icon name="chat" size={26} />
              <p className="agent-empty-title">{t('agent.state.emptyTitle')}</p>
              <p className="agent-empty-body">{t('agent.state.emptyBody')}</p>
              <button
                type="button"
                className="agent-action agent-action-primary"
                onClick={createConversation}
                disabled={blocked}
              >
                <Icon name="plus" size={15} />
                {t('agent.state.emptyAction')}
              </button>
            </div>
          ) : null}

          {phase === 'ready' && !selected ? (
            <p className="agent-placeholder" role="status">{t('agent.state.noSelection')}</p>
          ) : null}

          {phase === 'ready' && selected ? (
            <article className="agent-conversation" aria-label={selected.title}>
              {/* L5 — the contextual tool for this conversation: what it is, the
                  mode that shapes the next request, the simple/full disclosure
                  switch and the destructive action. Everything below stays
                  conventional Work — the messages are conversation, the composer
                  is a form, and the inspector carries the pipeline log and the
                  activity timeline, which §2.3 keeps on stable anchors. */}
              <ContextualSurface as="header" className="agent-conversation-head">
                <div className="agent-conversation-identity">
                  <span className="agent-conversation-title">{selected.title}</span>
                  {/*
                    A real control, not the chip it used to be: the mode shapes
                    the next request's prompt, so it has to be changeable where
                    the user can see what it currently is.
                  */}
                  <label className="agent-mode-picker">
                    <span className="agent-visually-hidden">{t('agent.mode.label')}</span>
                    <select
                      className="agent-mode-select"
                      value={selected.mode}
                      disabled={blocked}
                      title={t(`agent.mode.${selected.mode}.hint`)}
                      onChange={(event) => setMode(event.currentTarget.value as AgentWorkspaceMode)}
                    >
                      {AGENT_WORKSPACE_MODES.map((mode) => (
                        <option key={mode} value={mode}>{t(`agent.mode.${mode}`)}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="agent-view-toggle" role="group" aria-label={t('agent.view.label')}>
                  {(['simple', 'full'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`agent-view-toggle-button${viewMode === mode ? ' is-selected' : ''}`}
                      aria-pressed={viewMode === mode}
                      onClick={() => setViewMode(mode)}
                    >
                      {t(`agent.view.${mode}`)}
                    </button>
                  ))}
                </div>
                {pendingDeleteId === selected.id ? (
                  <div className="agent-conversation-actions">
                    <button
                      type="button"
                      className="agent-action agent-action-danger"
                      onClick={() => void run(() => deleteAgentConversation(selected.id))}
                      disabled={blocked}
                    >
                      {t('agent.conversation.deleteConfirm')}
                    </button>
                    <button
                      type="button"
                      className="agent-action"
                      onClick={() => setConfirming(null)}
                      disabled={blocked}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="agent-action"
                    onClick={() => setConfirming({ kind: 'delete', conversationId: selected.id })}
                    disabled={blocked}
                  >
                    <Icon name="trash" size={15} />
                    {t('agent.conversation.delete')}
                  </button>
                )}
              </ContextualSurface>

              <div
                className={`agent-conversation-workspace${inspectorExpanded
                  ? ' is-inspector-expanded'
                  : ' is-inspector-collapsed'}`}
              >
                <div className="agent-conversation-main">
                {selected.messages.length === 0 ? (
                <p className="agent-placeholder">{t('agent.conversation.empty')}</p>
              ) : (
                <>
                  {selected.messages.length > VISIBLE_MESSAGE_LIMIT ? (
                    <p className="agent-older">
                      <span>{t('agent.conversation.olderHidden')}</span>
                      <span className="agent-count">
                        {selected.messages.length - VISIBLE_MESSAGE_LIMIT}
                      </span>
                    </p>
                  ) : null}
                  <ul className="agent-messages">
                    {selected.messages.slice(-VISIBLE_MESSAGE_LIMIT).map((message) => {
                      const liveAssistant = message.id === runningMessageIds?.assistant
                        && message.status === 'streaming';
                      return (
                        <MessageRow
                          key={message.id}
                          conversation={selected}
                          approvalContext={approvalContext}
                          operationLog={operationLog}
                          onAppendOperation={appendOperation}
                          onOpenContext={openContext}
                          onRecord={(cardId, actionId, effect, event) => recordTimeline(
                            selected.id,
                            message.id,
                            cardId,
                            actionId,
                            effect,
                            event,
                          )}
                          message={liveAssistant
                            ? {
                                ...message,
                                text: streamedText || t('agent.execute.waiting'),
                              }
                            : message}
                        />
                      );
                    })}
                  </ul>
                </>
              )}

              {executing && !hasPersistedRunningExchange ? (
                <div className="agent-live-exchange" role="status" aria-live="polite">
                  <div className="agent-message agent-message-user">
                    <div className="agent-message-head">
                      <span className="agent-message-role">{t('agent.message.role.user')}</span>
                    </div>
                    <p className="agent-message-text">{runningPrompt}</p>
                  </div>
                  <div className="agent-message agent-message-assistant">
                    <div className="agent-message-head">
                      <span className="agent-message-role">{t('agent.message.role.assistant')}</span>
                      <span className="agent-chip agent-chip-status agent-status-streaming">
                        {t('agent.message.status.streaming')}
                      </span>
                    </div>
                    <p className="agent-message-text">
                      {streamedText || t('agent.execute.waiting')}
                    </p>
                  </div>
                </div>
              ) : null}

              <form className="agent-composer" onSubmit={submitPrompt}>
                <div className="agent-composer-options" hidden={viewMode === 'simple'}>
                  <label className="agent-field">
                    <span>{t('agent.execute.provider')}</span>
                    <select
                      value={target}
                      onChange={(event) => {
                        setTarget(event.target.value as AgentTargetChoice);
                        setCloudSensitiveConsent(false);
                      }}
                      disabled={blocked}
                    >
                      <option value="local">{t('agent.execute.provider.local')}</option>
                      {AGENT_CLOUD_TARGETS.map(({ providerId, labelKey }) => {
                        const label = t(labelKey);
                        return (
                          <option key={providerId} value={providerId}>
                            {providerNeedsKey(providerId)
                              ? t('agent.execute.provider.noKey', { provider: label })
                              : label}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {targetNeedsKey ? (
                    <p className="agent-cloud-notice agent-provider-no-key" role="status">
                      {t('agent.execute.provider.noKeyHint')}
                    </p>
                  ) : null}
                  {target !== 'local' ? (
                    <label className="agent-check">
                      <input
                        type="checkbox"
                        checked={allowLocalFallback}
                        onChange={(event) => setAllowLocalFallback(event.target.checked)}
                        disabled={blocked}
                      />
                      <span>{t('agent.execute.localFallback')}</span>
                    </label>
                  ) : null}
                </div>

                <details className="agent-execution-limits" hidden={viewMode === 'simple'}>
                  <summary>{t('agent.execute.limits')}</summary>
                  <div className="agent-execution-limit-grid">
                    <label className="agent-field agent-budget-field">
                      <span>{t('agent.execute.inputBudget')}</span>
                      <input
                        type="number"
                        min={AGENT_EXECUTION_INPUT_BUDGET_MIN}
                        max={AGENT_EXECUTION_INPUT_BUDGET_MAX}
                        step={1}
                        value={maxInputChars}
                        onChange={(event) => setMaxInputChars(clampAgentExecutionBudget(
                          event.currentTarget.valueAsNumber,
                          AGENT_EXECUTION_DEFAULT_INPUT_BUDGET,
                          AGENT_EXECUTION_INPUT_BUDGET_MIN,
                          AGENT_EXECUTION_INPUT_BUDGET_MAX,
                        ))}
                        disabled={blocked}
                      />
                    </label>
                    <label className="agent-field agent-budget-field">
                      <span>{t('agent.execute.outputBudget')}</span>
                      <input
                        type="number"
                        min={AGENT_EXECUTION_OUTPUT_BUDGET_MIN}
                        max={AGENT_EXECUTION_OUTPUT_BUDGET_MAX}
                        step={1}
                        value={maxOutputTokens}
                        onChange={(event) => setMaxOutputTokens(clampAgentExecutionBudget(
                          event.currentTarget.valueAsNumber,
                          AGENT_EXECUTION_DEFAULT_OUTPUT_BUDGET,
                          AGENT_EXECUTION_OUTPUT_BUDGET_MIN,
                          AGENT_EXECUTION_OUTPUT_BUDGET_MAX,
                        ))}
                        disabled={blocked}
                      />
                    </label>
                  </div>
                  <p className="agent-budget-usage">
                    {t('agent.execute.inputUsage', {
                      count: knownInputChars,
                      limit: maxInputChars,
                    })}
                  </p>
                  <p className="agent-budget-note">{t('agent.execute.inputBudgetNote')}</p>

                  {target !== 'local' ? (
                    <div className="agent-cost-controls">
                      <p className="agent-budget-note">{t('agent.execute.costRatesNote')}</p>
                      <div className="agent-execution-limit-grid">
                        <label className="agent-field agent-budget-field">
                          <span>{t('agent.execute.costInputRate')}</span>
                          <input
                            type="number"
                            min={0}
                            max={AGENT_PROVIDER_PRICE_MAX}
                            step={0.01}
                            value={rateDraft.input}
                            placeholder={t('agent.execute.costRateUnset')}
                            onChange={(event) => editRate('input', event.currentTarget.value)}
                            disabled={blocked}
                          />
                        </label>
                        <label className="agent-field agent-budget-field">
                          <span>{t('agent.execute.costOutputRate')}</span>
                          <input
                            type="number"
                            min={0}
                            max={AGENT_PROVIDER_PRICE_MAX}
                            step={0.01}
                            value={rateDraft.output}
                            placeholder={t('agent.execute.costRateUnset')}
                            onChange={(event) => editRate('output', event.currentTarget.value)}
                            disabled={blocked}
                          />
                        </label>
                      </div>

                      {selectedPrice ? (
                        <>
                          <p className="agent-budget-usage">
                            {t('agent.execute.costEstimate', {
                              amount: formatAgentCostUsd(estimatedCostUsd ?? 0),
                            })}
                          </p>
                          <label className="agent-check">
                            <input
                              type="checkbox"
                              checked={costCapOn}
                              onChange={(event) => setCostCapOn(event.target.checked)}
                              disabled={blocked}
                            />
                            <span>{t('agent.execute.costCapEnable')}</span>
                          </label>
                          {costCapOn ? (
                            <label className="agent-field agent-budget-field">
                              <span>{t('agent.execute.costCap')}</span>
                              <input
                                type="number"
                                min={AGENT_COST_BUDGET_MIN_USD}
                                max={AGENT_COST_BUDGET_MAX_USD}
                                step={0.01}
                                value={costCapUsd}
                                onChange={(event) => setCostCapUsd(clampAgentCostBudgetUsd(
                                  event.currentTarget.valueAsNumber,
                                ))}
                                disabled={blocked}
                              />
                            </label>
                          ) : null}
                          <p className="agent-budget-note">{t('agent.execute.costEstimateNote')}</p>
                        </>
                      ) : (
                        <p className="agent-budget-note">{t('agent.execute.costUnpriced')}</p>
                      )}

                      {/* Outside the `selectedPrice` branch on purpose: the
                          monthly ceiling is one number across every cloud
                          provider, so it is just as real when THIS provider has
                          no rates entered — that is precisely the case the
                          panel's unpriced count exists to report. */}
                      <AgentSpendPanel disabled={blocked} />
                    </div>
                  ) : null}
                </details>

                {target !== 'local' ? (
                  <p className="agent-cloud-notice">
                    <Icon name="globe" size={14} />
                    {t('agent.execute.cloudNotice', { provider: target })}
                  </p>
                ) : (
                  <p className="agent-cloud-notice">
                    <Icon name="lock" size={14} />
                    {t('agent.execute.localNotice')}
                  </p>
                )}

                <div className="agent-attachment-picker">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    hidden
                    multiple
                    accept={AGENT_ATTACHMENT_ACCEPT}
                    onChange={selectAttachments}
                    disabled={blocked || attachmentReading}
                  />
                  <button
                    type="button"
                    className="agent-action agent-attachment-add"
                    onClick={() => attachmentInputRef.current?.click()}
                    disabled={blocked || attachmentReading}
                  >
                    {attachmentReading
                      ? t('agent.attachment.reading')
                      : t('agent.attachment.add')}
                  </button>
                  <span className="agent-attachment-session-note">
                    {t('agent.attachment.sessionOnly')}
                  </span>
                </div>

                {attachments.length > 0 ? (
                  <ul className="agent-attachment-list" aria-label={t('agent.attachment.selected')}>
                    {attachments.map((attachment) => (
                      <li key={attachment.id} className="agent-attachment-chip">
                        <span className="agent-attachment-name">{attachment.name}</span>
                        <span className="agent-attachment-size">
                          {t('agent.attachment.size', { count: attachment.sizeBytes ?? 0 })}
                        </span>
                        <button
                          type="button"
                          className="agent-action agent-attachment-remove"
                          onClick={() => removeAttachment(attachment.id)}
                          disabled={blocked || attachmentReading}
                          aria-label={t('agent.attachment.remove', { name: attachment.name })}
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {attachmentFailure ? (
                  <p className="agent-message-error" role="alert">
                    {t(attachmentErrorKey(attachmentFailure.code), {
                      name: attachmentFailure.fileName ?? '',
                    })}
                  </p>
                ) : null}

                {visionUnsupported ? (
                  <p className="agent-message-error" role="alert">
                    {t('agent.attachment.visionUnsupported')}
                  </p>
                ) : null}

                {sensitiveConsentRequired ? (
                  <label className="agent-check agent-attachment-consent">
                    <input
                      type="checkbox"
                      checked={cloudSensitiveConsent}
                      onChange={(event) => setCloudSensitiveConsent(event.target.checked)}
                      disabled={blocked || attachmentReading}
                    />
                    <span>{t('agent.execute.sensitiveConsent', { provider: target })}</span>
                  </label>
                ) : null}

                {sensitiveContextExcluded ? (
                  <p className="agent-governance-note" role="status">
                    {t('agent.execute.sensitiveExcluded')}
                  </p>
                ) : null}

                <AgentContextSuggestions conversation={selected} onUse={(text) => setDraft(text)} />

                <label className="agent-prompt-label">
                  <span className="sr-only">{t('agent.execute.prompt')}</span>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t('agent.execute.placeholder')}
                    maxLength={20_000}
                    rows={3}
                    disabled={blocked}
                  />
                </label>

                {executionFailure ? (
                  <p className="agent-message-error" role="alert">
                    {t(executionErrorKey(executionFailure))}
                  </p>
                ) : null}

                {knownInputOverBudget ? (
                  <p className="agent-message-error" role="alert">
                    {t('agent.execute.inputOverBudget', { limit: maxInputChars })}
                  </p>
                ) : null}

                {planObjectiveTooLong ? (
                  <p className="agent-message-error" role="alert">
                    {t('agent.plan.error.invalid-objective')}
                  </p>
                ) : null}

                {attachments.length > 0 ? (
                  <p className="agent-plan-notice">
                    {t('agent.plan.attachmentsUnsupported')}
                  </p>
                ) : null}

                {planNotice ? (
                  <p
                    className={planNotice.kind === 'error'
                      ? 'agent-message-error agent-plan-notice'
                      : 'agent-plan-notice'}
                    role={planNotice.kind === 'error' ? 'alert' : 'status'}
                  >
                    {planNotice.text}
                  </p>
                ) : null}

                <div className="agent-composer-actions">
                  {executing ? (
                    <button
                      type="button"
                      className="agent-action agent-action-danger"
                      onClick={cancelExecution}
                    >
                      {t('agent.execute.cancel')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="agent-action agent-plan-create"
                        disabled={planDisabledReason !== undefined}
                        title={planDisabledReason}
                        onClick={() => void createPlan()}
                      >
                        <Icon name="sparkle" size={15} />
                        {planning ? t('agent.plan.planning') : t('agent.plan.create')}
                      </button>
                      <button
                        type="submit"
                        className="agent-action agent-action-primary"
                        disabled={sendDisabledReason !== undefined}
                        title={sendDisabledReason}
                      >
                        <Icon name="chat" size={15} />
                        {t('agent.execute.send')}
                      </button>
                    </>
                  )}
                </div>
              </form>

              <footer className="agent-scope">
                <p>{t('agent.notice.scope')}</p>
                <p>{t('agent.notice.retention')}</p>
              </footer>
                </div>

                <aside
                  className={`agent-inspector${inspectorExpanded ? '' : ' is-collapsed'}`}
                  aria-label={t('agent.inspector.title')}
                >
                  <button
                    type="button"
                    className="agent-inspector-toggle"
                    aria-expanded={inspectorExpanded}
                    aria-controls={inspectorContentId}
                    aria-label={t(inspectorExpanded
                      ? 'agent.inspector.collapse'
                      : 'agent.inspector.expand')}
                    onClick={() => setInspectorExpanded((expanded) => !expanded)}
                  >
                    <Icon name="chevron" size={14} className="agent-inspector-chevron" flat />
                    <span className="agent-inspector-toggle-label">
                      {t('agent.inspector.title')}
                    </span>
                  </button>
                  <div
                    id={inspectorContentId}
                    className="agent-inspector-content"
                    hidden={!inspectorExpanded}
                  >
                    <section className="agent-context" aria-label={t('agent.context.title')}>
                      <h3 className="agent-subheading">{t('agent.context.title')}</h3>
                      <ContextShelf
                        conversation={selected}
                        onRemove={removeContext}
                        onItemRef={registerContextItem}
                        openedContextId={openedContext?.conversationId === selected.id
                          ? openedContext.contextId
                          : null}
                        disabled={blocked}
                      />
                    </section>
                    <div className="agent-full-inspector" hidden={viewMode === 'simple'}>
                      <button
                        type="button"
                        className="agent-action agent-prompt-library-open"
                        aria-expanded={promptLibraryExpanded}
                        onClick={() => setPromptLibraryExpanded((expanded) => !expanded)}
                      >
                        {t('agent.promptLibrary.title')}
                      </button>
                      {promptLibraryExpanded ? (
                        <AgentPromptLibrary onUse={(text) => setDraft(text)} />
                      ) : null}
                      <button
                        type="button"
                        className="agent-action agent-capability-open"
                        aria-expanded={capabilitiesExpanded}
                        onClick={() => setCapabilitiesExpanded((expanded) => !expanded)}
                      >
                        {t('agent.capabilities.title')}
                      </button>
                      {capabilitiesExpanded ? <AgentCapabilityDirectory /> : null}
                      <button
                        type="button"
                        className="agent-action agent-governance-open"
                        aria-expanded={governanceExpanded}
                        onClick={() => setGovernanceExpanded((expanded) => !expanded)}
                      >
                        {t('agent.governance.title')}
                      </button>
                      {governanceExpanded ? <AgentGovernancePanel /> : null}
                      <AgentConversationPlanQueue
                        conversationId={selected.id}
                        queue={approvalContext?.queue ?? null}
                        disabled={blocked}
                        onFailure={setPlanQueueFailure}
                        onTimeline={recordTimelineProjection}
                        onOperation={appendOperation}
                      />
                      <AgentPipelineTerminal lines={pipelineLines} />
                      {planQueueFailure ? (
                        <p className="agent-plan-error" role="alert">
                          {t(`agent.plan.queue.error.${planQueueFailure}`)}
                        </p>
                      ) : null}
                      <ActivityTimeline entries={agentTimelineForConversation(timeline, selected.id)} />
                    </div>
                  </div>
                </aside>
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
