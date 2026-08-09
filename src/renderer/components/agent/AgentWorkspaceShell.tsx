import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as RKeyboardEvent,
} from 'react';
import Icon from '../Icons';
import { useT } from '../../i18n';
import {
  AGENT_WORKSPACE_MODES,
  emptyAgentWorkspaceState,
  type AgentConversation,
  type AgentMessage,
  type AgentWorkspaceMode,
  type AgentWorkspaceState,
} from '../../../shared/agentWorkspace';
import type { AiProviderId } from '../../../shared/aiProviders';
import {
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
  cancelAgentPrompt,
  executeAgentPrompt,
} from '../../agentExecutionClient';
import {
  AGENT_ATTACHMENT_ACCEPT,
  readAgentAttachmentFiles,
  type AgentAttachmentReadFailureCode,
} from '../../agentAttachments';
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
  if (
    code === 'cloud-disabled'
    || code === 'sensitive-context'
    || code === 'input-budget'
    || code === 'cost-budget'
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
  onOpenContext,
}: {
  message: AgentMessage;
  conversation: AgentConversation;
  onOpenContext: (contextId: string, sourceContextIds: readonly string[]) => boolean;
}) {
  const { t } = useT();
  const [failedActionId, setFailedActionId] = useState<string | null>(null);
  const provider = message.provider;
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
          {message.cards.map((card) => (
            <li key={card.id} className="agent-card">
              <span className="agent-card-title">{card.title}</span>
              {card.summary ? <span className="agent-card-summary">{card.summary}</span> : null}
              {card.actions.some((action) => action.effect.type === 'open-context') ? (
                <span className="agent-card-actions">
                  {card.actions.map((action) => {
                    if (action.effect.type !== 'open-context') return null;
                    const target = conversation.context.find(
                      (item) => item.id === action.effect.contextId,
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
                              action.effect.contextId,
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
          ))}
        </ul>
      ) : null}
    </li>
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
  const [attachments, setAttachments] = useState<AgentExecutionAttachment[]>([]);
  const [attachmentFailure, setAttachmentFailure] = useState<{
    code: AgentAttachmentReadFailureCode;
    fileName?: string;
  } | null>(null);
  const [attachmentReading, setAttachmentReading] = useState(false);
  const [cloudAttachmentConsent, setCloudAttachmentConsent] = useState(false);
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
  const blocked = busy || executing;
  const runningMessageIds = runningRequestId
    ? agentExecutionMessageIds(runningRequestId)
    : null;
  const hasPersistedRunningExchange = Boolean(
    runningMessageIds
    && selected?.messages.some((message) => message.id === runningMessageIds.assistant),
  );
  const attachmentConsentRequired = target !== 'local' && attachments.length > 0;

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
    setCloudAttachmentConsent(false);
  }, [attachments]);

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    setAttachmentFailure(null);
    setCloudAttachmentConsent(false);
  }, []);

  const submitPrompt = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (
      !selected
      || !prompt
      || executing
      || attachmentReading
      || (attachmentConsentRequired && !cloudAttachmentConsent)
    ) return;
    const requestId = newExecutionId();
    const basePolicy = defaultAgentExecutionPolicy(target);
    const request: AgentExecutionRequest = {
      requestId,
      conversationId: selected.id,
      prompt,
      policy: {
        ...basePolicy,
        allowSensitiveContext: attachmentConsentRequired && cloudAttachmentConsent,
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
      setCloudAttachmentConsent(false);
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
    attachmentConsentRequired,
    attachmentReading,
    attachments,
    cloudAttachmentConsent,
    draft,
    executing,
    selected,
    target,
  ]);

  const cancelExecution = useCallback(() => {
    if (runningRequestId) void cancelAgentPrompt(runningRequestId);
  }, [runningRequestId]);

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

  /**
   * Result cards are provider-authored data, so an effect is never used as a
   * selector or a route. The only connected slice resolves an exact id through
   * the selected conversation and the card's declared provenance, then moves
   * focus to the already-rendered shelf item. Everything else remains inert.
   */
  const openContext = useCallback((
    contextId: string,
    sourceContextIds: readonly string[],
  ): boolean => {
    if (!selected || !sourceContextIds.includes(contextId)) return false;
    const item = selected.context.find((candidate) => candidate.id === contextId);
    const element = contextItemRefs.current.get(contextId);
    if (!item || !element) return false;
    element.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    element.focus({ preventScroll: true });
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
        <nav className="agent-rail" aria-label={t('agent.rail.aria')}>
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
        </nav>

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
              <header className="agent-conversation-head">
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
              </header>

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
                          onOpenContext={openContext}
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
                <div className="agent-composer-options">
                  <label className="agent-field">
                    <span>{t('agent.execute.provider')}</span>
                    <select
                      value={target}
                      onChange={(event) => {
                        setTarget(event.target.value as AgentTargetChoice);
                        setCloudAttachmentConsent(false);
                      }}
                      disabled={blocked}
                    >
                      <option value="local">{t('agent.execute.provider.local')}</option>
                      <option value="gemini-2.5-flash">
                        {t('agent.execute.provider.gemini')}
                      </option>
                      <option value="deepseek-v4-flash">
                        {t('agent.execute.provider.deepseekFlash')}
                      </option>
                      <option value="deepseek-v4-pro">
                        {t('agent.execute.provider.deepseekPro')}
                      </option>
                    </select>
                  </label>
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

                {attachmentConsentRequired ? (
                  <label className="agent-check agent-attachment-consent">
                    <input
                      type="checkbox"
                      checked={cloudAttachmentConsent}
                      onChange={(event) => setCloudAttachmentConsent(event.target.checked)}
                      disabled={blocked || attachmentReading}
                    />
                    <span>{t('agent.attachment.cloudConsent', { provider: target })}</span>
                  </label>
                ) : null}

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
                    <button
                      type="submit"
                      className="agent-action agent-action-primary"
                      disabled={
                        busy
                        || attachmentReading
                        || draft.trim().length === 0
                        || (attachmentConsentRequired && !cloudAttachmentConsent)
                      }
                    >
                      <Icon name="chat" size={15} />
                      {t('agent.execute.send')}
                    </button>
                  )}
                </div>
              </form>

              <footer className="agent-scope">
                <p>{t('agent.notice.scope')}</p>
                <p>{t('agent.notice.retention')}</p>
              </footer>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
