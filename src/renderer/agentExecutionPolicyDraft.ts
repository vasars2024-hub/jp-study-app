import type { AgentContextItem } from '../shared/agentWorkspace';
import type { AgentExecutionAttachment } from '../shared/agentExecutionBridge';

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
