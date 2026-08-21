/**
 * What the user has actually spent at each cloud provider, and the ceiling they
 * set on it.
 *
 * The per-request cost cap in the composer (`AGENT_COST_BUDGET_*`) answers one
 * question — "is *this* request too expensive" — and deliberately answers it for
 * the run in front of the user, session-only. It cannot answer the question the
 * plan's trust bullet actually asks for under "provider budgets": five hundred
 * requests, each comfortably under the cap, add up to a bill nothing in this
 * application ever refused or even counted.
 *
 * Three properties this module exists to hold:
 *
 * - **Main owns it.** The per-request cap is supplied by the renderer with the
 *   request, which is fine for a decision about that request. A *cumulative*
 *   ceiling supplied by the caller is not a ceiling: the total has to survive the
 *   window that spent it, and the check has to run where the request is made.
 * - **Deleting a conversation must not refund anything.** Per-message costs are
 *   already recorded in the workspace document (`agentWorkspace.ts`), so a total
 *   summed from there would fall every time a user tidied up their chats. This
 *   ledger names no conversation and holds no content — a period, a provider, a
 *   sum, and two counts.
 * - **Unpriced work is counted, not valued.** `estimateAgentProviderCostUsd`
 *   returns nothing when the user has entered no rates for a provider, and
 *   folding that into the sum as `0` would report a month of real spending as
 *   free. Those requests land in `unpricedRequests` instead, so the surface can
 *   say plainly that the total does not cover them.
 *
 * Buckets, not rows. One row per provider per month keeps the file a few hundred
 * bytes at any usage level, and the questions a budget has to answer ("how much
 * this month", "refuse this one") are both bucket questions. A per-request log
 * would be a second, weaker copy of the operation history with a cost column.
 */

import type { AiProviderId } from './aiProviders';
import { AI_PROVIDERS } from './aiProviders';

/**
 * A calendar month in **local** time, `YYYY-MM`.
 *
 * Local rather than UTC because the bill this control exists to keep the user
 * under is a calendar-month bill on their own calendar, and a rolling window
 * would refuse requests in a month whose bill had already reset. The cost of
 * local time is that changing the machine's timezone can re-attribute a few
 * hours either side of a month boundary; that can never exceed one day's spend
 * and never deletes a record, which is a smaller wrong than telling a user their
 * February budget is exhausted because of what they spent in January.
 */
export type AgentSpendPeriod = string;

export interface AgentSpendEntry {
  period: AgentSpendPeriod;
  providerId: AiProviderId;
  /** Sum of the priced requests only. Never negative, never `NaN`. */
  spentUsd: number;
  /** Requests whose cost is inside `spentUsd`. */
  requests: number;
  /** Requests that ran with no rates entered, so their cost is not known. */
  unpricedRequests: number;
}

export interface AgentSpendLedger {
  version: 1;
  /** Newest period first, and within a period the provider order of `AI_PROVIDERS`. */
  entries: readonly AgentSpendEntry[];
  /**
   * The monthly ceiling across every cloud provider, in US dollars, or `null`
   * for no ceiling.
   *
   * One number rather than one per provider: the user's constraint is what they
   * are willing to spend on this application in a month, not how it divides
   * between two vendors, and a per-provider table would need three controls to
   * express the one thing they mean. `null` and `0` are deliberately different —
   * `0` is a real, usable choice meaning "refuse every priced cloud request",
   * which is how someone pauses spending without withdrawing their rates.
   */
  budgetUsd: number | null;
}

/**
 * Two years of buckets. Long enough that a user can look back over a year of
 * spending, short enough that the file never becomes a thing to prune carefully.
 */
export const AGENT_SPEND_PERIOD_LIMIT = 24;

/**
 * The ceiling's own bounds. The floor is `0` because "refuse everything priced"
 * is a real setting; the roof matches nothing in particular except that a
 * four-figure monthly budget is far past the point where a typo is the more
 * likely explanation.
 */
export const AGENT_SPEND_BUDGET_MIN_USD = 0;
export const AGENT_SPEND_BUDGET_MAX_USD = 10_000;

/**
 * The tolerance the ceiling comparison is made with.
 *
 * These sums are IEEE doubles, so `4.99 + 0.01` is `5.000000000000001` and a
 * bare `>` would refuse a request that lands exactly on the ceiling — or, with
 * the error the other way, allow one and then report a negative remainder, which
 * is what the first run of this module's own test did. A nanodollar is five
 * orders of magnitude below the smallest cost this application will ever print
 * (`formatAgentCostUsd` gives up at `0.0001`), so nothing a user can perceive
 * moves across it.
 */
export const AGENT_SPEND_EPSILON_USD = 1e-9;

const PROVIDER_IDS: readonly AiProviderId[] = AI_PROVIDERS.map((provider) => provider.id);
const PROVIDER_ID_SET: ReadonlySet<string> = new Set(PROVIDER_IDS);
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function emptyAgentSpendLedger(): AgentSpendLedger {
  return { version: 1, entries: [], budgetUsd: null };
}

/** The bucket key an instant belongs to. Exported because main and the UI must agree on it. */
export function agentSpendPeriod(atMs: number): AgentSpendPeriod {
  const date = new Date(Number.isFinite(atMs) ? atMs : Date.now());
  const month = date.getMonth() + 1;
  return `${date.getFullYear()}-${month < 10 ? '0' : ''}${month}`;
}

function money(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/**
 * A ceiling, or `null`. An out-of-range or malformed value becomes `null` —
 * no ceiling — rather than being clamped to the nearest bound, because clamping
 * a corrupt `budgetUsd` of `-1` to `0` would silently refuse every request the
 * user makes and look exactly like a broken provider.
 */
export function normalizeAgentSpendBudget(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < AGENT_SPEND_BUDGET_MIN_USD || value > AGENT_SPEND_BUDGET_MAX_USD) return null;
  return value;
}

function sortEntries(entries: AgentSpendEntry[]): AgentSpendEntry[] {
  return entries.sort((a, b) => {
    if (a.period !== b.period) return a.period < b.period ? 1 : -1;
    return PROVIDER_IDS.indexOf(a.providerId) - PROVIDER_IDS.indexOf(b.providerId);
  });
}

/**
 * Reads a stored document, dropping anything it cannot vouch for.
 *
 * Duplicate `(period, provider)` pairs are merged rather than kept or dropped:
 * two rows for one bucket can only be a write that went wrong, and both halves
 * are money the user spent.
 */
export function normalizeAgentSpendLedger(value: unknown): AgentSpendLedger {
  if (!value || typeof value !== 'object') return emptyAgentSpendLedger();
  const raw = value as { entries?: unknown; budgetUsd?: unknown };
  const merged = new Map<string, AgentSpendEntry>();
  if (Array.isArray(raw.entries)) {
    for (const item of raw.entries) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Partial<AgentSpendEntry>;
      if (typeof entry.period !== 'string' || !PERIOD_PATTERN.test(entry.period)) continue;
      if (typeof entry.providerId !== 'string' || !PROVIDER_ID_SET.has(entry.providerId)) continue;
      const spent = money(entry.spentUsd);
      if (spent === null) continue;
      const key = `${entry.period}|${entry.providerId}`;
      const existing = merged.get(key);
      merged.set(key, {
        period: entry.period,
        providerId: entry.providerId as AiProviderId,
        spentUsd: (existing?.spentUsd ?? 0) + spent,
        requests: (existing?.requests ?? 0) + count(entry.requests),
        unpricedRequests: (existing?.unpricedRequests ?? 0) + count(entry.unpricedRequests),
      });
    }
  }
  return {
    version: 1,
    entries: sortEntries([...merged.values()]),
    budgetUsd: normalizeAgentSpendBudget(raw.budgetUsd),
  };
}

/** Drops buckets older than the newest `AGENT_SPEND_PERIOD_LIMIT` periods. */
export function pruneAgentSpendLedger(ledger: AgentSpendLedger): AgentSpendLedger {
  const periods = [...new Set(ledger.entries.map((entry) => entry.period))]
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, AGENT_SPEND_PERIOD_LIMIT);
  const kept = new Set(periods);
  const entries = ledger.entries.filter((entry) => kept.has(entry.period));
  if (entries.length === ledger.entries.length) return ledger;
  return { ...ledger, entries };
}

/** What has been spent in `period`, across every provider or one of them. */
export function agentSpendInPeriod(
  ledger: AgentSpendLedger,
  period: AgentSpendPeriod,
  providerId?: AiProviderId,
): number {
  let total = 0;
  for (const entry of ledger.entries) {
    if (entry.period !== period) continue;
    if (providerId !== undefined && entry.providerId !== providerId) continue;
    total += entry.spentUsd;
  }
  return total;
}

export interface AgentSpendTotals {
  spentUsd: number;
  requests: number;
  unpricedRequests: number;
}

/** The whole of one period, for a surface that has to report it honestly. */
export function agentSpendTotals(
  ledger: AgentSpendLedger,
  period: AgentSpendPeriod,
): AgentSpendTotals {
  const totals: AgentSpendTotals = { spentUsd: 0, requests: 0, unpricedRequests: 0 };
  for (const entry of ledger.entries) {
    if (entry.period !== period) continue;
    totals.spentUsd += entry.spentUsd;
    totals.requests += entry.requests;
    totals.unpricedRequests += entry.unpricedRequests;
  }
  return totals;
}

/**
 * Adds one completed request to its bucket.
 *
 * `costUsd` of `undefined` means the request ran with no rates entered. It is
 * counted in `unpricedRequests` and contributes nothing to the sum — see the
 * module doc: a `0` there would report real spending as free.
 *
 * Pure, and returns a new document; the caller decides when it reaches disk.
 */
export function recordAgentSpend(
  ledger: AgentSpendLedger,
  providerId: AiProviderId,
  costUsd: number | undefined,
  atMs: number,
): AgentSpendLedger {
  const period = agentSpendPeriod(atMs);
  const priced = money(costUsd);
  const entries = [...ledger.entries];
  const at = entries.findIndex(
    (entry) => entry.period === period && entry.providerId === providerId,
  );
  const base = at >= 0
    ? entries[at]
    : { period, providerId, spentUsd: 0, requests: 0, unpricedRequests: 0 };
  const next: AgentSpendEntry = {
    period,
    providerId,
    spentUsd: base.spentUsd + (priced ?? 0),
    requests: base.requests + (priced === null ? 0 : 1),
    unpricedRequests: base.unpricedRequests + (priced === null ? 1 : 0),
  };
  if (at >= 0) entries[at] = next;
  else entries.push(next);
  return pruneAgentSpendLedger({ ...ledger, entries: sortEntries(entries) });
}

export type AgentSpendVerdict =
  /** No ceiling is set, or this request's cost is not knowable, so nothing is decided. */
  | { kind: 'allow'; reason: 'no-budget' | 'unpriced' }
  /** Inside the ceiling, with what is left after this request. */
  | { kind: 'allow'; reason: 'within-budget'; remainingUsd: number }
  | { kind: 'refuse'; spentUsd: number; budgetUsd: number; estimatedCostUsd: number };

/**
 * Whether a request whose cost is estimated at `estimatedCostUsd` may run.
 *
 * An **unpriced** request is allowed, and that is the honest answer rather than a
 * loophole: with no rates entered there is no dollar figure to compare, and
 * refusing on a number nobody has would be refusing on a guess. The surface's job
 * is to say so — that is what `unpricedRequests` is for — not this function's.
 *
 * The comparison is against the total *after* the request, so a budget of $5.00
 * with $4.99 spent refuses a $0.02 request rather than letting it through and
 * refusing the next one from over the line.
 */
export function agentSpendVerdict(
  ledger: AgentSpendLedger,
  period: AgentSpendPeriod,
  estimatedCostUsd: number | undefined,
): AgentSpendVerdict {
  const budgetUsd = ledger.budgetUsd;
  if (budgetUsd === null) return { kind: 'allow', reason: 'no-budget' };
  const cost = money(estimatedCostUsd);
  if (cost === null) return { kind: 'allow', reason: 'unpriced' };
  const spentUsd = agentSpendInPeriod(ledger, period);
  if (spentUsd + cost > budgetUsd + AGENT_SPEND_EPSILON_USD) {
    return { kind: 'refuse', spentUsd, budgetUsd, estimatedCostUsd: cost };
  }
  return {
    kind: 'allow',
    reason: 'within-budget',
    remainingUsd: Math.max(0, budgetUsd - spentUsd - cost),
  };
}

/**
 * The two questions the provider runtime asks of the ledger, and nothing else.
 *
 * Declared here rather than in `main/agentSpendStore.ts` so that
 * `main/providerRuntime.ts` can hold a ceiling without importing the store —
 * and therefore without importing `electron`, which it currently does not and
 * which is what keeps its own unit tests bootable. The store satisfies this
 * structurally; a test supplies a fake.
 *
 * `record` returns `void` on purpose. The runtime has no use for the resulting
 * document and must not be tempted to report a total it did not read.
 */
export interface AgentSpendGuard {
  verdict(estimatedCostUsd: number | undefined): AgentSpendVerdict;
  record(providerId: AiProviderId, costUsd: number | undefined): void;
}
