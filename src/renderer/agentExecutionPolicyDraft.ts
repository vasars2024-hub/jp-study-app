import type { AgentContextItem } from '../shared/agentWorkspace';
import type { AgentExecutionAttachment } from '../shared/agentExecutionBridge';
import {
  AGENT_COST_BUDGET_DEFAULT_USD,
  AGENT_COST_BUDGET_MAX_USD,
  AGENT_COST_BUDGET_MIN_USD,
  normalizeAgentProviderPrice,
  type AgentProviderPrice,
} from '../shared/agentProviderPricing';

/**
 * What the two rate fields currently hold, as typed.
 *
 * Kept as text rather than numbers because a half-entered price must survive on
 * screen while it is being entered. Committing the pair only once both parse is
 * what keeps a partial price out of the store; discarding the digits the user
 * has already typed would make the first field impossible to fill in.
 */
export interface AgentProviderRateDraft {
  input: string;
  output: string;
}

/**
 * The complete price in a draft, or `null` — which is a clear, not a no-op.
 * A user who empties one field has withdrawn the estimate, and the cost cap that
 * depended on it has to go with it rather than keep refusing against a stale rate.
 */
export function agentPriceFromRateDraft(draft: AgentProviderRateDraft): AgentProviderPrice | null {
  const input = Number(draft.input.trim());
  const output = Number(draft.output.trim());
  if (draft.input.trim() === '' || draft.output.trim() === '') return null;
  return normalizeAgentProviderPrice({
    inputPerMillionTokens: input,
    outputPerMillionTokens: output,
  }) ?? null;
}

export function agentRateDraftFromPrice(price: AgentProviderPrice | undefined): AgentProviderRateDraft {
  return price
    ? {
      input: String(price.inputPerMillionTokens),
      output: String(price.outputPerMillionTokens),
    }
    : { input: '', output: '' };
}

export function clampAgentCostBudgetUsd(value: number): number {
  if (!Number.isFinite(value)) return AGENT_COST_BUDGET_DEFAULT_USD;
  return Math.min(AGENT_COST_BUDGET_MAX_USD, Math.max(AGENT_COST_BUDGET_MIN_USD, value));
}

export function clampAgentExecutionBudget(
  value: number,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * The part of provider input the composer can measure without duplicating the
 * main-owned prompt assembler. Mode instructions, conversation history,
 * context labels and framing are deliberately left to main's final check.
 */
export function agentKnownInputChars(
  prompt: string,
  attachments: readonly AgentExecutionAttachment[],
): number {
  return prompt.trim().length + attachments.reduce(
    (total, attachment) => total + attachment.contentText.length,
    0,
  );
}

export function agentSensitiveContextKey(
  conversationId: string | null,
  context: readonly AgentContextItem[],
): string {
  const disclosed = context
    .filter((item) => item.sensitivity === 'sensitive')
    .map((item) => ({
      id: item.id,
      label: item.label,
      preview: item.preview,
      route: item.source.route ?? '',
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify([conversationId ?? '', disclosed]);
}
