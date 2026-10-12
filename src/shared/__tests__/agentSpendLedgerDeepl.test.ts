// @vitest-environment node
/**
 * risk4: DeepL is a billed cloud service that is not an LLM provider, so it was
 * not a ledger provider id and its spending could never be recorded. The ledger
 * now takes spend-only ids after the LLM ones; documents written before stay as
 * they were, and an id no reader knows is still dropped.
 */
import { describe, expect, it } from 'vitest';
import {
  agentSpendInPeriod,
  agentSpendPeriod,
  agentSpendVerdict,
  emptyAgentSpendLedger,
  isAgentSpendProviderId,
  normalizeAgentSpendLedger,
  recordAgentSpend,
  SPEND_ONLY_PROVIDER_IDS,
  type AgentSpendLedger,
} from '../agentSpendLedger';

const AT = new Date(2026, 9, 9).getTime();
const PERIOD = agentSpendPeriod(AT);

describe('spend ledger: DeepL', () => {
  it('records DeepL into the same monthly total the ceiling reads', () => {
    let ledger: AgentSpendLedger = { ...emptyAgentSpendLedger(), budgetUsd: 1 };
    ledger = recordAgentSpend(ledger, 'gemini-2.5-flash', 0.4, AT);
    ledger = recordAgentSpend(ledger, 'deepl', 0.5, AT);
    expect(agentSpendInPeriod(ledger, PERIOD)).toBeCloseTo(0.9);
    expect(agentSpendInPeriod(ledger, PERIOD, 'deepl')).toBeCloseTo(0.5);
    expect(agentSpendVerdict(ledger, PERIOD, 0.2).kind).toBe('refuse');
    // LLM providers first, then the spend-only ones.
    expect(ledger.entries.map((e) => e.providerId)).toEqual(['gemini-2.5-flash', 'deepl']);
  });

  it('a stored DeepL row survives normalization; an unknown id is dropped', () => {
    const doc = normalizeAgentSpendLedger({
      version: 1,
      budgetUsd: 5,
      entries: [
        { period: PERIOD, providerId: 'deepl', spentUsd: 0.25, requests: 3, unpricedRequests: 0 },
        { period: PERIOD, providerId: 'someday-provider', spentUsd: 9, requests: 1, unpricedRequests: 0 },
      ],
    });
    expect(doc.entries).toEqual([
      { period: PERIOD, providerId: 'deepl', spentUsd: 0.25, requests: 3, unpricedRequests: 0 },
    ]);
  });

  it('knows its ids', () => {
    expect(SPEND_ONLY_PROVIDER_IDS).toContain('deepl');
    expect(isAgentSpendProviderId('deepl')).toBe(true);
    expect(isAgentSpendProviderId('deepseek-v4-pro')).toBe(true);
    expect(isAgentSpendProviderId('local')).toBe(false);
  });
});
