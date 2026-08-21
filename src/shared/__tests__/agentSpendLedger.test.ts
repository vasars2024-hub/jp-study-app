import { describe, expect, it } from 'vitest';

import {
  AGENT_SPEND_BUDGET_MAX_USD,
  AGENT_SPEND_PERIOD_LIMIT,
  agentSpendInPeriod,
  agentSpendPeriod,
  agentSpendTotals,
  agentSpendVerdict,
  emptyAgentSpendLedger,
  normalizeAgentSpendBudget,
  normalizeAgentSpendLedger,
  pruneAgentSpendLedger,
  recordAgentSpend,
  type AgentSpendLedger,
} from '../agentSpendLedger';

const JAN = Date.UTC(2026, 0, 15, 12);
const FEB = Date.UTC(2026, 1, 15, 12);

describe('agentSpendPeriod', () => {
  it('buckets by local calendar month with a padded key', () => {
    expect(agentSpendPeriod(JAN)).toBe('2026-01');
    expect(agentSpendPeriod(FEB)).toBe('2026-02');
    expect(agentSpendPeriod(Date.UTC(2026, 10, 15, 12))).toBe('2026-11');
  });

  it('falls back to now rather than producing NaN-NaN', () => {
    expect(agentSpendPeriod(Number.NaN)).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('normalizeAgentSpendLedger', () => {
  it('reads an empty document from anything unusable', () => {
    expect(normalizeAgentSpendLedger(null)).toEqual(emptyAgentSpendLedger());
    expect(normalizeAgentSpendLedger('{}')).toEqual(emptyAgentSpendLedger());
    expect(normalizeAgentSpendLedger({ entries: 'no' }).entries).toEqual([]);
  });

  it('drops rows it cannot vouch for', () => {
    const ledger = normalizeAgentSpendLedger({
      entries: [
        { period: '2026-1', providerId: 'gemini-2.5-flash', spentUsd: 1 },
        { period: '2026-13', providerId: 'gemini-2.5-flash', spentUsd: 1 },
        { period: '2026-01', providerId: 'not-a-provider', spentUsd: 1 },
        { period: '2026-01', providerId: 'gemini-2.5-flash', spentUsd: -1 },
        { period: '2026-01', providerId: 'gemini-2.5-flash', spentUsd: 'free' },
        { period: '2026-01', providerId: 'gemini-2.5-flash', spentUsd: 0.5, requests: 2 },
      ],
    });
    expect(ledger.entries).toEqual([
      {
        period: '2026-01',
        providerId: 'gemini-2.5-flash',
        spentUsd: 0.5,
        requests: 2,
        unpricedRequests: 0,
      },
    ]);
  });

  it('merges a duplicated bucket instead of keeping or losing half the money', () => {
    const ledger = normalizeAgentSpendLedger({
      entries: [
        { period: '2026-01', providerId: 'deepseek-v4-pro', spentUsd: 1.25, requests: 3 },
        { period: '2026-01', providerId: 'deepseek-v4-pro', spentUsd: 0.75, unpricedRequests: 4 },
      ],
    });
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({ spentUsd: 2, requests: 3, unpricedRequests: 4 });
  });

  it('orders newest period first, then by provider order', () => {
    const ledger = normalizeAgentSpendLedger({
      entries: [
        { period: '2025-12', providerId: 'gemini-2.5-flash', spentUsd: 1 },
        { period: '2026-02', providerId: 'deepseek-v4-pro', spentUsd: 1 },
        { period: '2026-02', providerId: 'gemini-2.5-flash', spentUsd: 1 },
      ],
    });
    expect(ledger.entries.map((entry) => `${entry.period}|${entry.providerId}`)).toEqual([
      '2026-02|gemini-2.5-flash',
      '2026-02|deepseek-v4-pro',
      '2025-12|gemini-2.5-flash',
    ]);
  });
});

describe('normalizeAgentSpendBudget', () => {
  it('keeps zero, which is a real setting', () => {
    expect(normalizeAgentSpendBudget(0)).toBe(0);
  });

  it('reads an out-of-range or malformed ceiling as no ceiling, never as a clamp', () => {
    expect(normalizeAgentSpendBudget(-1)).toBeNull();
    expect(normalizeAgentSpendBudget(AGENT_SPEND_BUDGET_MAX_USD + 1)).toBeNull();
    expect(normalizeAgentSpendBudget(Number.NaN)).toBeNull();
    expect(normalizeAgentSpendBudget('5')).toBeNull();
    expect(normalizeAgentSpendBudget(undefined)).toBeNull();
  });
});

describe('recordAgentSpend', () => {
  it('adds a priced request to its bucket', () => {
    const ledger = recordAgentSpend(emptyAgentSpendLedger(), 'gemini-2.5-flash', 0.02, JAN);
    expect(ledger.entries).toEqual([
      {
        period: '2026-01',
        providerId: 'gemini-2.5-flash',
        spentUsd: 0.02,
        requests: 1,
        unpricedRequests: 0,
      },
    ]);
  });

  it('counts an unpriced request without valuing it at zero', () => {
    let ledger = recordAgentSpend(emptyAgentSpendLedger(), 'gemini-2.5-flash', undefined, JAN);
    ledger = recordAgentSpend(ledger, 'gemini-2.5-flash', 0.04, JAN);
    expect(ledger.entries[0]).toMatchObject({
      spentUsd: 0.04,
      requests: 1,
      unpricedRequests: 1,
    });
    expect(agentSpendTotals(ledger, '2026-01')).toEqual({
      spentUsd: 0.04,
      requests: 1,
      unpricedRequests: 1,
    });
  });

  it('keeps providers and months in separate buckets', () => {
    let ledger = recordAgentSpend(emptyAgentSpendLedger(), 'gemini-2.5-flash', 1, JAN);
    ledger = recordAgentSpend(ledger, 'deepseek-v4-pro', 2, JAN);
    ledger = recordAgentSpend(ledger, 'gemini-2.5-flash', 4, FEB);
    expect(ledger.entries).toHaveLength(3);
    expect(agentSpendInPeriod(ledger, '2026-01')).toBe(3);
    expect(agentSpendInPeriod(ledger, '2026-01', 'gemini-2.5-flash')).toBe(1);
    expect(agentSpendInPeriod(ledger, '2026-02')).toBe(4);
  });

  it('carries the ceiling through untouched', () => {
    const ledger = recordAgentSpend(
      { ...emptyAgentSpendLedger(), budgetUsd: 5 },
      'gemini-2.5-flash',
      1,
      JAN,
    );
    expect(ledger.budgetUsd).toBe(5);
  });
});

describe('pruneAgentSpendLedger', () => {
  it('keeps the newest periods and drops the rest', () => {
    let ledger = emptyAgentSpendLedger();
    for (let index = 0; index < AGENT_SPEND_PERIOD_LIMIT + 3; index += 1) {
      ledger = recordAgentSpend(ledger, 'gemini-2.5-flash', 1, Date.UTC(2020, index, 15, 12));
    }
    const periods = new Set(ledger.entries.map((entry) => entry.period));
    expect(periods.size).toBe(AGENT_SPEND_PERIOD_LIMIT);
    expect(periods.has('2020-01')).toBe(false);
    expect(agentSpendInPeriod(ledger, agentSpendPeriod(Date.UTC(2020, 26, 15, 12)))).toBe(1);
  });

  it('returns the same object when nothing is over the limit', () => {
    const ledger = recordAgentSpend(emptyAgentSpendLedger(), 'gemini-2.5-flash', 1, JAN);
    expect(pruneAgentSpendLedger(ledger)).toBe(ledger);
  });
});

describe('agentSpendVerdict', () => {
  const spent = (amount: number, budgetUsd: number | null): AgentSpendLedger => ({
    ...recordAgentSpend(emptyAgentSpendLedger(), 'gemini-2.5-flash', amount, JAN),
    budgetUsd,
  });

  it('decides nothing when no ceiling is set', () => {
    expect(agentSpendVerdict(spent(99, null), '2026-01', 1))
      .toEqual({ kind: 'allow', reason: 'no-budget' });
  });

  it('allows an unpriced request rather than refusing on a number nobody has', () => {
    expect(agentSpendVerdict(spent(99, 1), '2026-01', undefined))
      .toEqual({ kind: 'allow', reason: 'unpriced' });
  });

  it('refuses the request that would cross the line, not the one after it', () => {
    const ledger = spent(4.99, 5);
    expect(agentSpendVerdict(ledger, '2026-01', 0.02)).toEqual({
      kind: 'refuse',
      spentUsd: 4.99,
      budgetUsd: 5,
      estimatedCostUsd: 0.02,
    });
    expect(agentSpendVerdict(ledger, '2026-01', 0.01))
      .toEqual({ kind: 'allow', reason: 'within-budget', remainingUsd: 0 });
  });

  it('lands exactly on the ceiling rather than refusing on float error', () => {
    // `4.99 + 0.01` is `5.000000000000001` as a double. Without the tolerance
    // this allows the request and then reports a negative remainder.
    const verdict = agentSpendVerdict(spent(4.99, 5), '2026-01', 0.01);
    expect(verdict).toEqual({ kind: 'allow', reason: 'within-budget', remainingUsd: 0 });
    // The negative control: one cent past the ceiling still refuses, so the
    // tolerance is not quietly a free allowance.
    expect(agentSpendVerdict(spent(4.99, 5), '2026-01', 0.02).kind).toBe('refuse');
  });

  it('is scoped to its period, so a new month starts clear', () => {
    const ledger = spent(10, 5);
    expect(agentSpendVerdict(ledger, '2026-01', 1).kind).toBe('refuse');
    expect(agentSpendVerdict(ledger, '2026-02', 1).kind).toBe('allow');
  });

  it('treats a ceiling of zero as refusing every priced request', () => {
    const ledger = { ...emptyAgentSpendLedger(), budgetUsd: 0 };
    expect(agentSpendVerdict(ledger, '2026-01', 0.0001).kind).toBe('refuse');
    // The negative control for the line above: with the ceiling withdrawn the
    // same request passes, so the refusal is the budget's doing and not the
    // empty ledger's.
    expect(agentSpendVerdict({ ...ledger, budgetUsd: null }, '2026-01', 0.0001).kind).toBe('allow');
  });
});
