import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  agentContextDisclosure,
  agentConversationSummaries,
  agentRailFocusTarget,
  agentSelectedConversation,
  agentShellPhase,
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
 * What it deliberately is not, in this slice: a place to run a prompt. The
 * provider router lives in main with no bridge of its own, so there is no
 * composer here rather than a composer that cannot send — the canvas says so in
 * as many words. Result-card actions render as a count for the same reason: a
 * button that does nothing is worse than an honest label.
 *
 * No decorative emoji and no giant internal window title. The rail's heading is
 * a section label; the taskbar already says which app this is.
 */

const VISIBLE_MESSAGE_LIMIT = 200;

function newConversationId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `agent-${uuid}`;
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type PendingConfirmation =
  | { kind: 'delete'; conversationId: string }
  | { kind: 'clear' }
  | null;

function ContextDisclosure({ conversation }: { conversation: AgentConversation }) {
  const { t } = useT();
  const disclosure = agentContextDisclosure(conversation.context);
  if (conversation.context.length === 0) {
    return <p className="agent-context-empty">{t('agent.context.empty')}</p>;
  }
  // A definition list, not an assembled sentence: label and number stay separate
  // so no catalog has to guess at word order or agreement.
  return (
    <dl className="agent-context-facts">
      <dt>{t('agent.context.retained')}</dt>
      <dd>{disclosure.retained}</dd>
      <dt>{t('agent.context.session')}</dt>
      <dd>{disclosure.sessionOnly}</dd>
      <dt>{t('agent.context.sensitive')}</dt>
      <dd>{disclosure.sensitive}</dd>
    </dl>
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
      {message.error ? <p className="agent-message-error">{message.error}</p> : null}
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
        aria-busy={busy || loading}
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
            disabled={busy}
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
                  disabled={busy}
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
                  disabled={busy}
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
                  disabled={busy}
                >
                  {t('agent.rail.clearConfirm')}
                </button>
                <button
                  type="button"
                  className="agent-action"
                  onClick={() => setConfirming(null)}
                  disabled={busy}
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="agent-action"
                onClick={() => setConfirming({ kind: 'clear' })}
                disabled={busy || summaries.length === 0}
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
                disabled={busy}
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
                disabled={busy}
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
                      disabled={busy}
                    >
                      {t('agent.conversation.deleteConfirm')}
                    </button>
                    <button
                      type="button"
                      className="agent-action"
                      onClick={() => setConfirming(null)}
                      disabled={busy}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="agent-action"
                    onClick={() => setConfirming({ kind: 'delete', conversationId: selected.id })}
                    disabled={busy}
                  >
                    <Icon name="trash" size={15} />
                    {t('agent.conversation.delete')}
                  </button>
                )}
              </header>

              <section className="agent-context" aria-label={t('agent.context.title')}>
                <h3 className="agent-subheading">{t('agent.context.title')}</h3>
                <ContextDisclosure conversation={selected} />
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
