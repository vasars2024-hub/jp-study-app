// @vitest-environment jsdom
/**
 * The renderer's view of the main-owned monthly spend ledger.
 *
 * Three properties are worth pinning, and each has a quiet way to go wrong:
 *
 * - a window whose preload predates the bridge must report `bridge-unavailable`,
 *   not "nothing has been spent". The second is the same shape as a real empty
 *   month, so a degraded window would tell a user their spending is zero;
 * - the totals must be RECOMPUTED from the normalized rows rather than read off
 *   the payload, so the figure printed can never disagree with the rows it is
 *   printed beside;
 * - a rejected invoke must land as a failure code, not a thrown exception into a
 *   render path that has no way to recover from one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearAgentSpend,
  loadAgentSpend,
  onAgentSpendChanged,
  setAgentSpendBudget,
} from '../agentSpendClient';
import type { AgentSpendSnapshotPayload } from '../../shared/agentSpendBridge';

const PERIOD = '2026-08';

function ledgerPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    version: 1,
    budgetUsd: 25,
    entries: [
      {
        period: PERIOD,
        providerId: 'gemini-2.5-flash',
        spentUsd: 1.5,
        requests: 3,
        unpricedRequests: 2,
      },
      {
        period: PERIOD,
        providerId: 'deepseek-v4-pro',
        spentUsd: 0.25,
        requests: 1,
        unpricedRequests: 0,
      },
    ],
    ...overrides,
  };
}

function installBridge(api: Record<string, unknown>): void {
  (window as unknown as { api?: unknown }).api = api;
}

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('agentSpendClient', () => {
  it('reports bridge-unavailable rather than an empty month when the preload has no methods', async () => {
    installBridge({});
    expect(await loadAgentSpend()).toEqual({ ok: false, code: 'bridge-unavailable' });
    expect(await setAgentSpendBudget(5)).toEqual({ ok: false, code: 'bridge-unavailable' });
    expect(await clearAgentSpend()).toEqual({ ok: false, code: 'bridge-unavailable' });
  });

  it('returns a no-op unsubscribe when the change push is unavailable', () => {
    installBridge({});
    const unsubscribe = onAgentSpendChanged(() => {
      throw new Error('must not fire');
    });
    expect(() => unsubscribe()).not.toThrow();
  });

  it('recomputes the period totals from the rows instead of trusting the payload', async () => {
    installBridge({
      agentSpendLoad: () =>
        Promise.resolve({
          ok: true,
          snapshot: {
            ledger: ledgerPayload(),
            period: PERIOD,
            // Deliberately wrong. If this crossed through, the panel would print
            // a total that contradicts the rows main sent with it.
            currentPeriod: { spentUsd: 999, requests: 999, unpricedRequests: 999 },
          },
        }),
    });
    const result = await loadAgentSpend();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.currentPeriod).toEqual({
      spentUsd: 1.75,
      requests: 4,
      unpricedRequests: 2,
    });
    expect(result.snapshot.ledger.budgetUsd).toBe(25);
  });

  it('counts only the resolved period, so last month is not added to this one', async () => {
    installBridge({
      agentSpendLoad: () =>
        Promise.resolve({
          ok: true,
          snapshot: {
            ledger: ledgerPayload({
              entries: [
                {
                  period: PERIOD,
                  providerId: 'gemini-2.5-flash',
                  spentUsd: 1,
                  requests: 1,
                  unpricedRequests: 0,
                },
                {
                  period: '2026-07',
                  providerId: 'gemini-2.5-flash',
                  spentUsd: 40,
                  requests: 90,
                  unpricedRequests: 7,
                },
              ],
            }),
            period: PERIOD,
          },
        }),
    });
    const result = await loadAgentSpend();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.currentPeriod).toEqual({
      spentUsd: 1,
      requests: 1,
      unpricedRequests: 0,
    });
    // The older bucket is still carried — the surface may show a history — it is
    // simply not part of this month's figure.
    expect(result.snapshot.ledger.entries).toHaveLength(2);
  });

  it('sends the ceiling verbatim, including the null that withdraws it', async () => {
    const agentSpendSetBudget = vi.fn(() =>
      Promise.resolve({ ok: true, snapshot: { ledger: ledgerPayload(), period: PERIOD } }),
    );
    installBridge({ agentSpendSetBudget });
    await setAgentSpendBudget(0);
    await setAgentSpendBudget(null);
    expect(agentSpendSetBudget.mock.calls).toEqual([[0], [null]]);
  });

  it('passes a main-side refusal through with its own code', async () => {
    installBridge({
      agentSpendSetBudget: () => Promise.resolve({ ok: false, code: 'invalid-request' }),
    });
    expect(await setAgentSpendBudget(5)).toEqual({ ok: false, code: 'invalid-request' });
  });

  it('turns a rejected invoke into a failure code rather than a thrown render', async () => {
    installBridge({
      agentSpendLoad: () => Promise.reject(new Error('no handler registered')),
      agentSpendClear: () => Promise.reject(new Error('no handler registered')),
    });
    expect(await loadAgentSpend()).toEqual({ ok: false, code: 'read-failed' });
    expect(await clearAgentSpend()).toEqual({ ok: false, code: 'write-failed' });
  });

  it('normalizes a pushed snapshot and unsubscribes through the bridge', () => {
    let pushed: ((snapshot: unknown) => void) | null = null;
    const removeListener = vi.fn();
    installBridge({
      onAgentSpendChanged: (cb: (snapshot: unknown) => void) => {
        pushed = cb;
        return removeListener;
      },
    });
    const seen: AgentSpendSnapshotPayload[] = [];
    const unsubscribe = onAgentSpendChanged((snapshot) => seen.push(snapshot));
    expect(pushed).toBeTypeOf('function');
    // A push crosses the same untrusted boundary as a reply: a bad period and a
    // junk row must reduce, not reach the panel.
    pushed?.({ ledger: ledgerPayload({ budgetUsd: 'lots' }), period: 'not-a-month' });
    expect(seen).toHaveLength(1);
    expect(seen[0].period).toBe('');
    expect(seen[0].ledger.budgetUsd).toBeNull();
    expect(seen[0].currentPeriod).toEqual({ spentUsd: 0, requests: 0, unpricedRequests: 0 });
    unsubscribe();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});
