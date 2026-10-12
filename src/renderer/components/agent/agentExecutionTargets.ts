/**
 * The provider/execution seam's shared vocabulary: which targets a request may
 * be aimed at, and what a refusal is called in the user's language.
 *
 * Extracted from `AgentWorkspaceShell.tsx` on 2026-09-06 because it acquired a
 * SECOND consumer — Blanc's `agent` tool — and a copied cloud-target list is a
 * list that silently drifts. A provider added to one picker and not the other
 * is not a compile error anywhere, so the only way to keep them honest is for
 * there to be one list. Same for the failure map: two shells that name the same
 * refusal differently teach the user two different remedies for one cause.
 *
 * Deliberately NOT derived from `AI_PROVIDERS`: the Agent's own labels are
 * shorter than the catalog's marketing ones, and only a subset of providers is
 * offered here.
 */

import type { AiProviderId } from '../../../shared/aiProviders';
import type { AgentExecutionFailureCode } from '../../../shared/agentExecutionBridge';
import { AGENT_TOOL_OPERATIONS } from '../../../shared/localAgent';

export type AgentTargetChoice = 'local' | AiProviderId;

/**
 * The cloud rows of the target picker, in the order they are offered.
 *
 * Translation *keys*, resolved during render — a module-level registry that
 * stored the rendered strings would keep an English picker after a language
 * switch.
 */
export const AGENT_CLOUD_TARGETS: readonly { providerId: AiProviderId; labelKey: string }[] = [
  { providerId: 'gemini-2.5-flash', labelKey: 'agent.execute.provider.gemini' },
  { providerId: 'deepseek-v4-flash', labelKey: 'agent.execute.provider.deepseekFlash' },
  { providerId: 'deepseek-v4-pro', labelKey: 'agent.execute.provider.deepseekPro' },
  { providerId: 'claude-haiku-5-5', labelKey: 'aiAgent.target.claudeHaiku' },
  { providerId: 'claude-sonnet-5-5', labelKey: 'aiAgent.target.claudeSonnet' },
  { providerId: 'claude-opus-5-5', labelKey: 'aiAgent.target.claudeOpus' },
  { providerId: 'openai', labelKey: 'aiAgent.target.openai' },
  // Last because it is not "the cloud" when it runs on this computer (Ollama,
  // LM Studio); it still goes through the same governed provider runtime.
  { providerId: 'openai-compatible', labelKey: 'aiAgent.target.compatible' },
];

/**
 * Targets that may run on this computer or the LAN rather than across the
 * internet. The offline preflight does not refuse them: a local server answers
 * with the network down, and if it is not running main says so.
 */
const POSSIBLY_LOCAL_TARGETS: ReadonlySet<AiProviderId> = new Set<AiProviderId>(['openai-compatible']);

/**
 * What to CALL a target in a sentence the user reads.
 *
 * The picker resolved `labelKey` and the privacy disclosure beneath it did not,
 * so the app told the user their prompt was going to `deepseek-v4-flash` two
 * rows under an option reading "DeepSeek V4 Flash". Blanc's copy of the same
 * sentence had already been written correctly; one resolver is what stops the
 * two shells naming one destination two ways.
 *
 * An unrecognised id falls back to the id itself rather than to a friendly
 * name for something else: in a disclosure, an ugly true answer beats a tidy
 * wrong one.
 */
export function agentTargetLabel(
  target: AgentTargetChoice,
  t: (key: string) => string,
): string {
  if (target === 'local') return t('agent.execute.provider.local');
  const found = AGENT_CLOUD_TARGETS.find((entry) => entry.providerId === target);
  return found ? t(found.labelKey) : target;
}

export function executionErrorKey(code: AgentExecutionFailureCode): string {
  if (code === 'busy') return 'agent.execute.error.busy';
  if (code === 'store-failed') return 'agent.execute.error.store';
  if (code === 'cancelled') return 'agent.execute.error.cancelled';
  if (code === 'missing-credential') return 'agent.execute.error.credential';
  if (code === 'authentication') return 'agent.execute.error.authentication';
  if (code === 'bridge-unavailable') return 'agent.execute.error.bridge';
  // Typed end to end since 2026-09: a missing model used to arrive here as a
  // plain failure and read "the provider returned an unusable response".
  if (code === 'local-model-missing') return 'agent.execute.error.localModelMissing';
  if (code === 'ai-off') return 'agent.execute.error.aiOff';
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
  // Three different remedies, so three messages: check the connection (a local model
  // still works offline), wait out the provider's limit, or simply retry.
  if (code === 'network') return 'agent.execute.error.offline';
  if (code === 'rate-limit') return 'agent.execute.error.rateLimit';
  if (code === 'timeout') return 'agent.execute.error.timeout';
  if (code === 'upstream') {
    return 'agent.execute.error.transient';
  }
  if (code === 'invalid-response' || code === 'provider-failed') {
    return 'agent.execute.error.provider';
  }
  return 'agent.execute.error.request';
}

/**
 * The cheap preflight before a send: with no network a cloud request cannot leave, so the
 * offline message is shown at once instead of after main's round trip and timeout. A local
 * target needs no network, and a cloud request allowed to fall back to the offline model is
 * still worth sending — main answers it locally.
 */
export function agentOfflinePreflight(
  target: AgentTargetChoice,
  online: boolean,
  allowLocalFallback: boolean,
): AgentExecutionFailureCode | null {
  if (target === 'local' || online || allowLocalFallback || POSSIBLY_LOCAL_TARGETS.has(target)) return null;
  return 'network';
}

/** `navigator.onLine`, read defensively: an environment without it counts as online. */
export function readOnline(): boolean {
  try {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  } catch {
    return true;
  }
}

/**
 * The executor's own refusal and failure sentences, in the user's language.
 *
 * `shared/localAgent.ts` writes these in English on purpose: they are what the MODEL reads
 * back (a refused step quotes the operation's English label), and the queue persists them in
 * main. The words a person reads are a separate matter, so the surfaces that print a step's
 * error pass it through here. Recognised by shape, never by guesswork: a sentence this does
 * not know — an adapter's own error, already written with `t()` — comes back unchanged.
 */
export function localizeAgentStepError(
  error: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const text = error.trim();
  const operationName = (labelOrId: string): string => {
    const definition = AGENT_TOOL_OPERATIONS.find((entry) => entry.id === labelOrId || entry.label === labelOrId);
    return definition ? t(`agent.capabilities.operation.${definition.id}`) : labelOrId;
  };
  if (text === 'The requested operation is not approved.') return t('agent.refusal.notApproved');
  if (text === 'The approved tool failed.') return t('agent.refusal.toolFailed');
  let m = /^No approved adapter is installed for (.+)\.$/.exec(text);
  if (m) return t('agent.refusal.noAdapter', { operation: operationName(m[1]) });
  m = /^(.+) is not enabled for the active agent profile\.$/.exec(text);
  if (m) return t('agent.refusal.notEnabled', { operation: operationName(m[1]) });
  m = /^(.+) requires (read-only|limited-actions|full-automation) permission\.$/.exec(text);
  if (m) {
    return t('agent.refusal.needsPermission', {
      operation: operationName(m[1]),
      level: t(`agent.capabilities.permission.${m[2]}`),
    });
  }
  m = /^(.+) was requested at an unrecognized permission level\.$/.exec(text);
  if (m) return t('agent.refusal.unknownPermission', { operation: operationName(m[1]) });
  return error;
}

/** Failures whose remedy is in Settings > AI; a surface shows "Set up AI" beside them. */
export function executionErrorNeedsSetup(code: AgentExecutionFailureCode): boolean {
  return code === 'local-model-missing' || code === 'ai-off' || code === 'missing-credential';
}

/** Ids only, for a caller that needs to validate a persisted or dispatched target. */
export function isAgentCloudTarget(value: string): value is AiProviderId {
  return AGENT_CLOUD_TARGETS.some((entry) => entry.providerId === value);
}

function randomId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The two ids the seam mints, shared for the same reason the target list is:
 * main correlates a stream to a request by `requestId` and a message to a
 * conversation by `conversationId`, so two shells minting them in two shapes is
 * a correlation bug waiting for the first shell that gets the shape wrong.
 */
export function newAgentConversationId(): string {
  return randomId('agent');
}

export function newAgentExecutionId(): string {
  return randomId('run');
}
