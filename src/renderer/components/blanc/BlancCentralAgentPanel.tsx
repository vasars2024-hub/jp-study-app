/**
 * Blanc's `agent` tool — the CENTRAL Agent's provider/execution seam.
 *
 * Why this exists beside Blanc's already-shipping `local-agent` tool, since that
 * is the near-miss `blanc-coverage.json` was written to prevent: `LocalAgentPanel`
 * is the local-RUNTIME half. It plans and queues objectives through
 * `window.api.localAgentPlan`, and it has no provider target, no cloud fallback,
 * no request budgets, no spend ledger and no per-conversation plan approval. The
 * Study OS section (`AppSection.tsx` -> `AgentWorkspaceShell`) is the other half:
 * a request aimed at local Qwen or a named cloud provider, bounded by an input
 * and an output budget, charged against a monthly ceiling, over a main-owned
 * conversation store shared by every window. That is the half ported here.
 *
 * It is a COMPOSITION, not a rewrite. The spend dial, the governance writer and
 * the conversation plan queue are the same three components the Study OS shell
 * mounts, imported unchanged; the target list, the refusal vocabulary and the
 * two id shapes come from `agentExecutionTargets.ts`, which was extracted from
 * that shell in the same commit precisely so there is one of each. Pillar 0
 * forbids mounting a `*View` or importing `AppChrome` — it does not ask for the
 * domain logic to be written twice, and writing it twice is how two shells come
 * to disagree about one user's money.
 *
 * What is deliberately NOT here, so `covered` is not misread as parity: the
 * capability directory, the prompt library, the pipeline terminal, context
 * suggestions, attachments and vision, result cards, the context shelf, history
 * search, pinning and archiving. Those are the workspace's editing surface and
 * they stay in the Study OS app. This is the EXECUTION surface — pick a target,
 * bound it, send it, and see honestly what it cost and what came back.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import {
  emptyAgentWorkspaceState,
  type AgentWorkspaceState,
} from '../../../shared/agentWorkspace';
import {
  agentConversationSummaries,
  agentSelectedConversation,
  agentWorkspaceWithNewConversation,
  agentWorkspaceWithSelection,
} from '../../agentShellModel';
import {
  loadAgentWorkspace,
  onAgentWorkspaceChanged,
  updateAgentWorkspace,
} from '../../agentWorkspaceClient';
import type { AgentWorkspaceFailureCode } from '../../../shared/agentWorkspaceBridge';
import { executeAgentPrompt } from '../../agentExecutionClient';
import {
  AGENT_EXECUTION_DEFAULT_INPUT_BUDGET,
  AGENT_EXECUTION_DEFAULT_OUTPUT_BUDGET,
  AGENT_EXECUTION_INPUT_BUDGET_MAX,
  AGENT_EXECUTION_INPUT_BUDGET_MIN,
  AGENT_EXECUTION_OUTPUT_BUDGET_MAX,
  AGENT_EXECUTION_OUTPUT_BUDGET_MIN,
  defaultAgentExecutionPolicy,
  type AgentExecutionFailureCode,
  type AgentExecutionRequest,
} from '../../../shared/agentExecutionBridge';
import { clampAgentExecutionBudget } from '../../agentExecutionPolicyDraft';
import { LOCAL_AGENT_CHAT_HISTORY_TURNS } from '../../../shared/localAgentSettings';
import { loadLocalAgentSettings } from '../../localAgentSettingsStore';
import { AgentSpendPanel } from '../agent/AgentSpendPanel';
import { AgentGovernancePanel } from '../agent/AgentGovernancePanel';
import { AgentConversationPlanQueue } from '../agent/AgentConversationPlanQueue';
import {
  AGENT_CLOUD_TARGETS,
  agentTargetLabel,
  executionErrorKey,
  newAgentConversationId,
  newAgentExecutionId,
  type AgentTargetChoice,
} from '../agent/agentExecutionTargets';
import type { AgentTaskQueue } from '../../../shared/localAgentTaskQueue';
import {
  loadLocalAgentTaskQueue,
  onLocalAgentTaskQueueChanged,
} from '../../localAgentTaskQueueStore';
import type { AiProviderId, AiProviderHealth } from '../../../shared/aiProviders';
// Styles are wired through `theme/blanc.css` (`@import './blanc-agent.css'`),
// not imported here: blanc.css is the one sheet Blanc's shells load, and a
// second entry point for the same file would double-load it under Vite.

/** The tail of the transcript this surface shows. The full history lives in the app. */
const VISIBLE_MESSAGE_LIMIT = 8;

/**
 * Why a stored workspace could not be reached, in that failure's own words.
 *
 * Keyed by the strict SUBSET a reader can produce — the same idiom
 * `APPROVAL_REFUSAL_KEYS` uses next door — so `conflict` is absent by design:
 * it is a compare-and-swap refusal on a WRITE, `updateAgentWorkspace` already
 * retries it, and an unresolvable one arrives as `write-failed`. Naming a read
 * failure "could not be saved" points the user at a save they never made.
 */
const WORKSPACE_FAILURE_KEYS: Record<
  Exclude<AgentWorkspaceFailureCode, 'conflict'>,
  string
> = {
  'invalid-request': 'agent.error.invalid-request',
  'read-failed': 'agent.error.read-failed',
  'write-failed': 'agent.error.write-failed',
  'bridge-unavailable': 'agent.error.bridge-unavailable',
};

export function BlancCentralAgentPanel() {
  const { t, lang } = useT();
  const [state, setState] = useState<AgentWorkspaceState | null>(null);
  const [workspaceFailure, setWorkspaceFailure] = useState<AgentWorkspaceFailureCode | null>(null);
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState<AgentTargetChoice>('local');
  const [allowLocalFallback, setAllowLocalFallback] = useState(false);
  const [maxInputChars, setMaxInputChars] = useState(AGENT_EXECUTION_DEFAULT_INPUT_BUDGET);
  const [maxOutputTokens, setMaxOutputTokens] = useState(AGENT_EXECUTION_DEFAULT_OUTPUT_BUDGET);
  const [running, setRunning] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [failure, setFailure] = useState<AgentExecutionFailureCode | null>(null);
  const [planFailure, setPlanFailure] = useState<string | null>(null);
  const [providerHealth, setProviderHealth] = useState<readonly AiProviderHealth[]>([]);
  const [taskQueue, setTaskQueue] = useState<AgentTaskQueue>(() => loadLocalAgentTaskQueue());

  useEffect(() => {
    let live = true;
    // Subscribed before the load so a hand-off main commits during hydration is
    // not lost between the read and the first render.
    const unsubscribe = onAgentWorkspaceChanged((pushed) => {
      if (!live) return;
      setWorkspaceFailure(null);
      setState(pushed);
    });
    void loadAgentWorkspace().then((result) => {
      if (!live) return;
      if (result.ok) setState(result.state);
      else setWorkspaceFailure(result.code);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setTaskQueue(loadLocalAgentTaskQueue());
    return onLocalAgentTaskQueueChanged(setTaskQueue);
  }, []);

  useEffect(() => {
    let alive = true;
    const api = (window as { api?: { aiProviderHealth?: () => Promise<readonly AiProviderHealth[]> } }).api;
    if (typeof api?.aiProviderHealth !== 'function') return undefined;
    void api.aiProviderHealth()
      .then((report) => {
        // `Array.isArray`, not a cast. A preload that predates the channel, or a
        // main-side read that fails soft, resolves this promise with `undefined`
        // — and `providerHealth.some(...)` then throws DURING RENDER. There is
        // no per-tool error boundary inside Blanc's tool detail, so that throw
        // takes the WHOLE Blanc shell into `AppErrorBoundary` and every other
        // tool with it. Measured live on 2026-09-06 against the harness bridge,
        // which answers unknown methods with `Promise.resolve(undefined)`: the
        // rail rendered, the tool opened, and the shell went to "Something went
        // wrong." The typed signature does not make the value an array.
        if (alive) setProviderHealth(Array.isArray(report) ? report : []);
      })
      .catch(() => {
        // An unanswered health probe must not invent a missing key: an empty
        // report means "nothing is known to be unconfigured", which is what the
        // no-key hint below is keyed on.
        if (alive) setProviderHealth([]);
      });
    return () => {
      alive = false;
    };
  }, [target]);

  const summaries = useMemo(
    () => (state ? agentConversationSummaries(state) : []),
    [state],
  );
  const selected = state ? agentSelectedConversation(state) : null;
  const providerNeedsKey = useCallback(
    (providerId: AiProviderId): boolean => providerHealth.some(
      (entry) => entry.providerId === providerId && !entry.configured,
    ),
    [providerHealth],
  );
  const targetNeedsKey = target !== 'local' && providerNeedsKey(target);
  const prompt = draft.trim();
  const overBudget = prompt.length > maxInputChars;
  const blocked = running || state === null;

  const createConversation = useCallback(() => {
    const base = state ?? emptyAgentWorkspaceState();
    const input = {
      id: newAgentConversationId(),
      title: t('agent.conversation.untitled'),
      now: Date.now(),
    };
    void updateAgentWorkspace(
      base,
      (current) => agentWorkspaceWithNewConversation(current, input),
    ).then((result) => {
      // A New that did not land must say so rather than looking like a no-op.
      if (result.ok) setState(result.state);
      else setWorkspaceFailure(result.code);
    });
    // `lang`, not `t`: `t`'s identity is stable by design, so depending on it
    // would go stale after a language switch instead of erroring.
  }, [lang, state, t]);

  const select = useCallback((conversationId: string) => {
    if (!state) return;
    void updateAgentWorkspace(
      state,
      (current) => agentWorkspaceWithSelection(current, conversationId),
    ).then((result) => {
      if (result.ok) setState(result.state);
      else setWorkspaceFailure(result.code);
    });
  }, [state]);

  const send = useCallback(async (): Promise<void> => {
    if (!selected || !prompt || running || overBudget) return;
    const requestId = newAgentExecutionId();
    const basePolicy = defaultAgentExecutionPolicy(target);
    // Read HERE and not held in state, for the same reason the Study OS shell
    // gives: a governance edit made in another window between renders must not
    // be overridden by a stale copy this window happened to mount with.
    const executionSettings = loadLocalAgentSettings();
    const request: AgentExecutionRequest = {
      requestId,
      conversationId: selected.id,
      prompt,
      policy: {
        ...basePolicy,
        excludeSensitiveContext: executionSettings.excludeSensitiveContext,
        // Blanc's execution surface ships no sensitive-context consent control,
        // so it never claims consent it did not collect. A conversation holding
        // sensitive context aimed at a cloud provider is refused by the boundary
        // with `sensitive-context`, and the refusal below says so.
        allowSensitiveContext: false,
        historyTurns: LOCAL_AGENT_CHAT_HISTORY_TURNS[executionSettings.chatHistory],
        maxInputChars,
        maxOutputTokens,
      },
      allowLocalFallback: target === 'local' ? false : allowLocalFallback,
      attachments: [],
    };
    setRunning(true);
    setStreamedText('');
    setFailure(null);
    const result = await executeAgentPrompt(request, (streamEvent) => {
      setStreamedText((current) => current + streamEvent.text);
    });
    if (result.ok) {
      setState(result.state);
      setDraft('');
    } else {
      // A failed assistant turn is still a real workspace change. Adopt the
      // state main returned so the failure is visible in the transcript rather
      // than only in a banner, and keep the prompt so it can be retried.
      if (result.state) setState(result.state);
      setFailure(result.code);
    }
    setRunning(false);
    setStreamedText('');
  }, [allowLocalFallback, maxInputChars, maxOutputTokens, overBudget, prompt, running, selected, target]);

  const messages = selected ? selected.messages.slice(-VISIBLE_MESSAGE_LIMIT) : [];

  return (
    <div className="blanc-agent">
      <p className="blanc-agent-lead">
        {t('agent.execute.modelAndLimits')}
      </p>

      {workspaceFailure && workspaceFailure !== 'conflict' ? (
        <p className="blanc-agent-error" role="status">
          {t(WORKSPACE_FAILURE_KEYS[workspaceFailure])}
        </p>
      ) : null}

      <div className="blanc-agent-conversations">
        <label className="blanc-agent-field">
          <span>{t('agent.rail.aria')}</span>
          <select
            value={selected?.id ?? ''}
            onChange={(event) => select(event.target.value)}
            disabled={blocked || summaries.length === 0}
          >
            {selected ? null : <option value="">{t('agent.search.none')}</option>}
            {summaries.map((summary) => (
              <option key={summary.id} value={summary.id}>
                {`${summary.title} — ${t('agent.rail.messageCount', { count: summary.messageCount })}`}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={createConversation} disabled={blocked}>
          {t('agent.rail.new')}
        </button>
        <p className="blanc-agent-note">
          {t('agent.rail.conversationCount', { count: summaries.length })}
        </p>
      </div>

      <div className="blanc-agent-policy">
        <label className="blanc-agent-field">
          <span>{t('agent.execute.provider')}</span>
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value as AgentTargetChoice)}
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
          <p className="blanc-agent-error" role="status">
            {t('agent.execute.provider.noKeyHint')}
          </p>
        ) : null}
        {target !== 'local' ? (
          <label className="blanc-agent-check">
            <input
              type="checkbox"
              checked={allowLocalFallback}
              onChange={(event) => setAllowLocalFallback(event.target.checked)}
              disabled={blocked}
            />
            <span>{t('agent.execute.localFallback')}</span>
          </label>
        ) : null}
        <p className="blanc-agent-note">
          {target === 'local'
            ? t('agent.execute.localNotice')
            : t('agent.execute.cloudNotice', { provider: agentTargetLabel(target, t) })}
        </p>

        <div className="blanc-agent-budgets">
          <label className="blanc-agent-field">
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
          <label className="blanc-agent-field">
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
        <p className="blanc-agent-note">
          {t('agent.execute.inputUsage', { count: prompt.length, limit: maxInputChars })}
        </p>
        <p className="blanc-agent-note">{t('agent.execute.inputBudgetNote')}</p>
      </div>

      <label className="blanc-agent-field blanc-agent-composer">
        <span>{t('agent.execute.prompt')}</span>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('agent.execute.placeholder')}
          rows={3}
          disabled={blocked}
        />
      </label>
      {overBudget ? (
        <p className="blanc-agent-error" role="status">
          {t('agent.execute.inputOverBudget', { limit: maxInputChars })}
        </p>
      ) : null}
      <div className="blanc-agent-actions">
        <button
          type="button"
          onClick={() => void send()}
          disabled={blocked || !selected || !prompt || overBudget}
        >
          {t('agent.execute.send')}
        </button>
        {/*
          Every reason the button is off is stated. A disabled control whose only
          account of itself is being grey is the defect this repo keeps finding.
        */}
        <span className="blanc-agent-note" role="status">
          {running
            ? t('agent.execute.reason.busy')
            : !selected
              ? t('agent.conversation.empty')
              : !prompt
                ? t('agent.execute.reason.emptyDraft')
                : ''}
        </span>
      </div>

      {failure ? (
        <p className="blanc-agent-error" role="status">{t(executionErrorKey(failure))}</p>
      ) : null}

      <div className="blanc-agent-transcript">
        {running ? (
          <p className="blanc-agent-streaming">
            {streamedText || t('agent.execute.waiting')}
          </p>
        ) : null}
        {selected && messages.length === 0 && !running ? (
          <p className="blanc-agent-note">{t('agent.conversation.empty')}</p>
        ) : null}
        {messages.slice().reverse().map((message) => (
          <article key={message.id} className="blanc-agent-message">
            <p className="blanc-agent-message-head">
              <span>{t(`agent.message.role.${message.role}`)}</span>
              <span>{t(`agent.message.status.${message.status}`)}</span>
              {message.provider ? (
                <span>
                  {message.provider.target.kind === 'cloud'
                    ? t('agent.message.providerCloud', {
                      provider: agentTargetLabel(message.provider.target.providerId, t),
                    })
                    : t('agent.message.providerLocal')}
                </span>
              ) : null}
            </p>
            <p className="blanc-agent-message-text">{message.text}</p>
          </article>
        ))}
      </div>

      {selected ? (
        <AgentConversationPlanQueue
          conversationId={selected.id}
          queue={taskQueue}
          disabled={blocked}
          onFailure={setPlanFailure}
        />
      ) : null}
      {planFailure ? (
        <p className="blanc-agent-error" role="status">
          {t(`agent.plan.queue.error.${planFailure}`)}
        </p>
      ) : null}

      <AgentSpendPanel disabled={running} />
      <AgentGovernancePanel />
    </div>
  );
}

export default BlancCentralAgentPanel;
