/**
 * The typed contract between the main-owned spend ledger
 * (`main/agentSpendStore.ts`) and its renderer consumer.
 *
 * Shaped like `agentOperationalBridge.ts`, for the same two reasons: failures
 * carry a closed set of codes rather than prose that could name a user-data
 * path, and both directions are re-derived rather than trusted.
 *
 * One difference from the operational bridge is worth stating, because it is the
 * whole reason this store exists separately: **there is no `save`.** The
 * operational document is read, edited and written back wholesale by the
 * renderer. Doing that here would let a window that had been open since Tuesday
 * write back a total that predates every request made since — silently
 * refunding them. So the renderer may set the ceiling and erase the record, and
 * those are the only two writes it has. The totals themselves are written by
 * main alone, on the completion of requests main itself made.
 */

import { AI_PROVIDERS, type AiProviderId } from './aiProviders';
import {
  normalizeAgentProviderPrice,
  normalizeAgentProviderPricingTable,
  type AgentProviderPrice,
  type AgentProviderPricingTable,
} from './agentProviderPricing';
import {
  normalizeAgentSpendLedger,
  agentSpendTotals,
  type AgentSpendLedger,
  type AgentSpendTotals,
} from './agentSpendLedger';

/**
 * Channel ids in one place so a parity test can assert the handler, the preload
 * method and the call site agree. Call sites still spell the literal out, as
 * every other channel in this repo does, so `tools/architecture-audit.cjs` can
 * see both ends.
 */
export const AGENT_SPEND_CHANNELS = {
  load: 'agentSpend:load',
  setBudget: 'agentSpend:setBudget',
  clear: 'agentSpend:clear',
  changed: 'agentSpend:changed',
  pricingLoad: 'agentPricing:load',
  pricingSet: 'agentPricing:set',
  pricingMigrate: 'agentPricing:migrate',
  pricingChanged: 'agentPricing:changed',
} as const;

export type AgentSpendChannel =
  (typeof AGENT_SPEND_CHANNELS)[keyof typeof AGENT_SPEND_CHANNELS];

/**
 * `bridge-unavailable` is renderer-only: `window.api` does not carry the method,
 * which is what a stale preload or a non-Electron host looks like. The other
 * three can only originate in main.
 */
export type AgentSpendFailureCode =
  | 'invalid-request'
  | 'read-failed'
  | 'write-failed'
  | 'bridge-unavailable';

export interface AgentSpendSnapshotPayload {
  ledger: AgentSpendLedger;
  /** The bucket main considers "this month". Resolved there so the UI cannot disagree. */
  period: string;
  currentPeriod: AgentSpendTotals;
}

export interface AgentSpendSuccess {
  ok: true;
  snapshot: AgentSpendSnapshotPayload;
}

export interface AgentSpendFailure {
  ok: false;
  code: AgentSpendFailureCode;
}

export type AgentSpendResult = AgentSpendSuccess | AgentSpendFailure;

const FAILURE_CODES = new Set<AgentSpendFailureCode>([
  'invalid-request',
  'read-failed',
  'write-failed',
  'bridge-unavailable',
]);

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The user's own per-provider rates, main-owned since 2026-09 (see
 * `main/agentPricingStore.ts`). Only what the user entered crosses; the
 * built-in estimates are shared code, so both sides compute the same
 * effective table from it.
 */
export type AgentPricingResult =
  | { ok: true; rates: AgentProviderPricingTable }
  | { ok: false; code: AgentSpendFailureCode };

export function normalizeAgentPricingResult(value: unknown): AgentPricingResult {
  if (!value || typeof value !== 'object') return { ok: false, code: 'read-failed' };
  const raw = value as { ok?: unknown; code?: unknown; rates?: unknown };
  if (raw.ok === true) return { ok: true, rates: normalizeAgentProviderPricingTable(raw.rates) };
  return {
    ok: false,
    code: typeof raw.code === 'string' && FAILURE_CODES.has(raw.code as AgentSpendFailureCode)
      ? raw.code as AgentSpendFailureCode
      : 'read-failed',
  };
}

/** A set request: a known provider and a whole price, or `null` to return to the estimate. */
export function isAgentPricingSetRequest(
  value: unknown,
): value is { providerId: AiProviderId; price: AgentProviderPrice | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as { providerId?: unknown; price?: unknown };
  if (typeof raw.providerId !== 'string' || !AI_PROVIDERS.some((provider) => provider.id === raw.providerId)) {
    return false;
  }
  return raw.price === null || normalizeAgentProviderPrice(raw.price) !== undefined;
}

export function agentSpendSuccess(snapshot: AgentSpendSnapshotPayload): AgentSpendSuccess {
  return { ok: true, snapshot };
}

export function agentSpendFailure(code: AgentSpendFailureCode): AgentSpendFailure {
  return { ok: false, code };
}

/**
 * Guards the one write that carries a value.
 *
 * `null` is an accepted request — it withdraws the ceiling — so this cannot be a
 * plain truthiness check. Anything else non-numeric is refused at the boundary
 * rather than normalized, because `normalizeAgentSpendBudget` turns a malformed
 * value into `null`, and silently withdrawing a user's spending limit in
 * response to a malformed request is the one outcome this control must never
 * have.
 */
export function isAgentSpendBudgetRequest(value: unknown): value is { budgetUsd: number | null } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const budget = (value as { budgetUsd?: unknown }).budgetUsd;
  if (budget === null) return true;
  return typeof budget === 'number' && Number.isFinite(budget);
}

/**
 * Re-derives a result from whatever actually crossed. An unknown shape becomes
 * `read-failed` rather than a thrown renderer exception: the consumers have a
 * recoverable path and no way to recover from a throw.
 */
export function normalizeAgentSpendResult(value: unknown): AgentSpendResult {
  if (!value || typeof value !== 'object') return agentSpendFailure('read-failed');
  const raw = value as { ok?: unknown; code?: unknown; snapshot?: unknown };
  if (raw.ok === false) {
    return agentSpendFailure(
      typeof raw.code === 'string' && FAILURE_CODES.has(raw.code as AgentSpendFailureCode)
        ? (raw.code as AgentSpendFailureCode)
        : 'read-failed',
    );
  }
  if (raw.ok !== true) return agentSpendFailure('read-failed');
  return agentSpendSuccess(normalizeAgentSpendSnapshot(raw.snapshot));
}

/**
 * The totals are recomputed from the normalized ledger rather than read off the
 * payload. They are derivable, and a derived number that crossed a process
 * boundary is a number that can disagree with the rows printed beside it.
 */
export function normalizeAgentSpendSnapshot(value: unknown): AgentSpendSnapshotPayload {
  const raw = (value && typeof value === 'object' ? value : {}) as {
    ledger?: unknown;
    period?: unknown;
  };
  const ledger = normalizeAgentSpendLedger(raw.ledger);
  const period = typeof raw.period === 'string' && PERIOD_PATTERN.test(raw.period)
    ? raw.period
    : '';
  return { ledger, period, currentPeriod: agentSpendTotals(ledger, period) };
}
