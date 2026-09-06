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
];

export function executionErrorKey(code: AgentExecutionFailureCode): string {
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
