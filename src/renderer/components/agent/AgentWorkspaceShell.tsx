import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as RKeyboardEvent,
} from 'react';
import Icon from '../Icons';
import { useT } from '../../i18n';
import {
  emptyAgentWorkspaceState,
  type AgentConversation,
  type AgentMessage,
  type AgentWorkspaceState,
} from '../../../shared/agentWorkspace';
import type { AiProviderId } from '../../../shared/aiProviders';
import {
  defaultAgentExecutionPolicy,
  type AgentExecutionFailureCode,
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
  saveAgentWorkspace,
} from '../../agentWorkspaceClient';
import {
  cancelAgentPrompt,
  executeAgentPrompt,
} from '../../agentExecutionClient';
import { AGENT_WORKSPACE_CHANGED_EVENT } from '../../agentContextHandoff';
import {
  agentContextDisclosure,
  agentConversationSummaries,
  agentRailFocusTarget,
  agentSelectedConversation,
  agentShellPhase,
  agentWorkspaceWithContextDetached,
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
  disabled,
}: {
  conversation: AgentConversation;
  onRemove: (contextId: string) => void;
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
          <li key={item.id} className="agent-context-item">
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

function MessageRow({ message }: { message: AgentMessage }) {
  const { t } = useT();
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
      {message.cards.length > 0 ? (
        <ul className="agent-cards">
          {message.cards.map((card) => (
            <li key={card.id} className="agent-card">
              <span className="agent-card-title">{card.title}</span>
              {card.summary ? <span className="agent-card-summary">{card.summary}</span> : null}
              {card.actions.length > 0 ? (
                <span className="agent-card-actions">
                  {t('agent.card.actionsPending', { count: card.actions.length })}
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
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState<AgentTargetChoice>('local');
  const [allowLocalFallback, setAllowLocalFallback] = useState(false);
  const [runningRequestId, setRunningRequestId] = useState<string | null>(null);
  const [runningPrompt, setRunningPrompt] = useState('');
  const [streamedText, setStreamedText] = useState('');
  const [executionFailure, setExecutionFailure] =
    useState<AgentExecutionFailureCode | null>(null);
  const railRef = useRef<HTMLUListElement | null>(null);

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
   * A hand-off from another surface (Dictionary's "Ask the Agent") writes context
   * straight into the main-owned workspace. Without this the shell keeps showing
   * what it read at mount, and an Agent that is already open reports "0
   * conversations" while the store holds one — measured live.
   */
  useEffect(() => {
    const reload = (): void => {
      void refresh();
    };
    window.addEventListener(AGENT_WORKSPACE_CHANGED_EVENT, reload);
    return () => window.removeEventListener(AGENT_WORKSPACE_CHANGED_EVENT, reload);
  }, [refresh]);

  /** Every mutation goes through here, so no two writes can overlap. */
  const run = useCallback(async (operation: () => Promise<AgentWorkspaceResult>) => {
    setBusy(true);
    apply(await operation());
    setConfirming(null);
    setBusy(false);
  }, [apply]);

  const summaries = useMemo(() => (state ? agentConversationSummaries(state) : []), [state]);
  const selected = state ? agentSelectedConversation(state) : null;
  const phase = agentShellPhase({ loading, failure, state });
  const activeId = state?.activeConversationId ?? null;
  const executing = runningRequestId !== null;
  const blocked = busy || executing;

  const submitPrompt = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!selected || !prompt || executing) return;
    const requestId = newExecutionId();
    const request: AgentExecutionRequest = {
      requestId,
      conversationId: selected.id,
      prompt,
      policy: defaultAgentExecutionPolicy(target),
      allowLocalFallback: target === 'local' ? false : allowLocalFallback,
    };
    setRunningRequestId(requestId);
    setRunningPrompt(prompt);
    setStreamedText('');
    setExecutionFailure(null);
    const result = await executeAgentPrompt(request, (streamEvent) => {
      setStreamedText((current) => current + streamEvent.text);
    });
    if (result.state) {
      apply({ ok: true, state: result.state });
      setDraft('');
    }
    if (!result.ok) setExecutionFailure(result.code);
    setRunningRequestId(null);
    setRunningPrompt('');
    setStreamedText('');
  }, [allowLocalFallback, apply, draft, executing, selected, target]);

  const cancelExecution = useCallback(() => {
    if (runningRequestId) void cancelAgentPrompt(runningRequestId);
  }, [runningRequestId]);

  const createConversation = useCallback(() => {
    const next = agentWorkspaceWithNewConversation(state ?? emptyAgentWorkspaceState(), {
      id: newConversationId(),
      title: t('agent.conversation.untitled'),
      now: Date.now(),
    });
    if (next) void run(() => saveAgentWorkspace(next));
    // `lang`, not `t`: `t`'s identity is stable by design, so depending on it
    // would silently go stale after a language switch instead of erroring.
  }, [lang, run, state, t]);

  const select = useCallback((conversationId: string) => {
    if (!state) return;
    const next = agentWorkspaceWithSelection(state, conversationId);
    if (next) void run(() => saveAgentWorkspace(next));
  }, [run, state]);

  const togglePin = useCallback((conversationId: string) => {
    if (!state) return;
    const next = agentWorkspaceWithPinToggled(state, conversationId, Date.now());
    if (next) void run(() => saveAgentWorkspace(next));
  }, [run, state]);

  /**
   * Removing context is not a cosmetic list edit — it is the user withdrawing
   * material from the next request, so it goes through the same main-owned save
   * as every other change rather than being held in component state.
   */
  const removeContext = useCallback((contextId: string) => {
    if (!state || !selected) return;
    const next = agentWorkspaceWithContextDetached(state, selected.id, contextId, Date.now());
    if (next) void run(() => saveAgentWorkspace(next));
  }, [run, selected, state]);

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
                  <span className="agent-chip">{t(`agent.mode.${selected.mode}`)}</span>
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
                    {selected.messages.slice(-VISIBLE_MESSAGE_LIMIT).map((message) => (
                      <MessageRow key={message.id} message={message} />
                    ))}
                  </ul>
                </>
              )}

              {executing ? (
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
                      onChange={(event) => setTarget(event.target.value as AgentTargetChoice)}
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
                      disabled={busy || draft.trim().length === 0}
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
