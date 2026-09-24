import type { AiProviderId } from './aiProviders';
import { AI_PROVIDERS } from './aiProviders';

/**
 * What a cloud provider charges, per million tokens, in US dollars.
 *
 * The user's own figure wins, and every figure is editable. Until 2026-09 there
 * was deliberately NO built-in figure, on the argument that a shipped price
 * table rots into a confident lie. The cost of that argument turned out to be
 * worse than the lie: an unpriced request is always allowed by the monthly
 * limit, and none of the app's cloud callers outside the Agent composer passed
 * rates, so the limit could not stop most of the spending it claimed to cap.
 * `AGENT_PROVIDER_DEFAULT_PRICING` below is therefore a labelled ESTIMATE the
 * surface shows as such, and a rate the user enters replaces it.
 *
 * Both halves are required together. A price with an input rate and no output
 * rate is not a cheaper price — it is an estimate that under-reports every
 * request, which is worse than no estimate at all, because a cost cap would then
 * pass requests it should have refused.
 */
export interface AgentProviderPrice {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
}

export type AgentProviderPricingTable = Partial<Record<AiProviderId, AgentProviderPrice>>;

/**
 * Per-million-token rates above this are rejected as a typo rather than stored.
 * The most expensive model any of these providers has ever listed is under $100
 * per million output tokens, so $1,000 is a wide margin that still catches the
 * user who meant 0.30 and typed 30000.
 */
export const AGENT_PROVIDER_PRICE_MAX = 1_000;

/**
 * Bounds for the per-request cost cap. The floor is a hundredth of a cent
 * because a single short Agent turn on a flash-tier model genuinely costs less
 * than that, and a cap that cannot be set below one cent would be a cap that
 * refuses nothing.
 */
export const AGENT_COST_BUDGET_MIN_USD = 0.0001;
export const AGENT_COST_BUDGET_MAX_USD = 100;
export const AGENT_COST_BUDGET_DEFAULT_USD = 0.05;

export const EMPTY_AGENT_PROVIDER_PRICING: AgentProviderPricingTable = {};

/**
 * Built-in ESTIMATES, used only where the user has entered nothing, and shown in
 * Settings > AI as estimates the user can edit.
 *
 * Read from each provider's published price page on 2026-09-24, taking the
 * HIGHER published tier where there is more than one (DeepSeek's peak-hour
 * rate, cache-miss input): an estimate that errs high refuses a request near the
 * limit a little early, one that errs low lets the month end above it.
 * - Gemini 2.5 Flash, standard paid tier: $0.30 input / $2.50 output (thinking included).
 * - DeepSeek V4 Flash: $0.30 / $1.20. DeepSeek V4 Pro: $1.32 / $3.96.
 */
export const AGENT_PROVIDER_DEFAULT_PRICING: Readonly<Record<AiProviderId, AgentProviderPrice>> = {
  'gemini-2.5-flash': { inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 },
  'deepseek-v4-flash': { inputPerMillionTokens: 0.3, outputPerMillionTokens: 1.2 },
  'deepseek-v4-pro': { inputPerMillionTokens: 1.32, outputPerMillionTokens: 3.96 },
};

/** The user's rate for a provider, else the built-in estimate. */
export function effectiveAgentProviderPrice(
  userTable: AgentProviderPricingTable,
  providerId: AiProviderId,
): AgentProviderPrice | undefined {
  return userTable[providerId] ?? AGENT_PROVIDER_DEFAULT_PRICING[providerId];
}

/** Every provider's governing rate: the user's figure where entered, the estimate elsewhere. */
export function effectiveAgentProviderPricingTable(
  userTable: AgentProviderPricingTable,
): AgentProviderPricingTable {
  const table: AgentProviderPricingTable = {};
  for (const provider of AI_PROVIDERS) {
    const price = effectiveAgentProviderPrice(userTable, provider.id);
    if (price) table[provider.id] = price;
  }
  return table;
}

const PROVIDER_IDS: ReadonlySet<string> = new Set(AI_PROVIDERS.map((provider) => provider.id));

function rate(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > AGENT_PROVIDER_PRICE_MAX) return null;
  return value;
}

/**
 * A price, or nothing. Never a partial price — see the interface doc above.
 */
export function normalizeAgentProviderPrice(value: unknown): AgentProviderPrice | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<AgentProviderPrice>;
  const input = rate(raw.inputPerMillionTokens);
  const output = rate(raw.outputPerMillionTokens);
  if (input === null || output === null) return undefined;
  return { inputPerMillionTokens: input, outputPerMillionTokens: output };
}

export function normalizeAgentProviderPricingTable(value: unknown): AgentProviderPricingTable {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const table: AgentProviderPricingTable = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!PROVIDER_IDS.has(id)) continue;
    const price = normalizeAgentProviderPrice(entry);
    if (price) table[id as AiProviderId] = price;
  }
  return table;
}

/**
 * The price that governs a request aimed at `target`, if the user has entered
 * one. A local target has no price by construction, and returning a zero here
 * rather than nothing would report "this run cost $0.00" for a run whose cost
 * was never a dollar amount in the first place.
 */
export function agentProviderPrice(
  table: AgentProviderPricingTable,
  target: 'local' | AiProviderId,
): AgentProviderPrice | undefined {
  if (target === 'local') return undefined;
  return table[target];
}

/**
 * The runtime's own character-to-token approximation, lifted into shared code so
 * the composer's preview and main's preflight refusal cannot drift apart.
 */
export function agentEstimatedTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

export function estimateAgentProviderCostUsd(
  inputTokens: number,
  outputTokens: number,
  price?: AgentProviderPrice,
): number | undefined {
  if (!price) return undefined;
  if (!Number.isFinite(price.inputPerMillionTokens) || !Number.isFinite(price.outputPerMillionTokens)) {
    return undefined;
  }
  return (
    Math.max(0, inputTokens) * Math.max(0, price.inputPerMillionTokens)
    + Math.max(0, outputTokens) * Math.max(0, price.outputPerMillionTokens)
  ) / 1_000_000;
}

/**
 * A dollar amount rendered at a precision that does not round a real charge away
 * to nothing. `toFixed(2)` would print every ordinary Agent turn as `0.00`,
 * which reads as free; below the fourth decimal the honest statement is that the
 * amount is smaller than the smallest figure worth printing, not that it is zero.
 */
export function formatAgentCostUsd(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value === 0) return '0';
  if (value >= 0.01) return value.toFixed(2);
  if (value >= 0.0001) return value.toFixed(4);
  return '<0.0001';
}
