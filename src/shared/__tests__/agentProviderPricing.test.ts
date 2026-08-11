import { describe, expect, it } from 'vitest';
import {
  AGENT_PROVIDER_PRICE_MAX,
  agentEstimatedTokens,
  agentProviderPrice,
  estimateAgentProviderCostUsd,
  formatAgentCostUsd,
  normalizeAgentProviderPrice,
  normalizeAgentProviderPricingTable,
} from '../agentProviderPricing';

describe('normalizeAgentProviderPrice', () => {
  it('keeps a complete pair of rates', () => {
    expect(normalizeAgentProviderPrice({
      inputPerMillionTokens: 0.3,
      outputPerMillionTokens: 2.5,
    })).toEqual({ inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 });
  });

  it('accepts zero, which is a real rate on a free tier', () => {
    expect(normalizeAgentProviderPrice({
      inputPerMillionTokens: 0,
      outputPerMillionTokens: 0,
    })).toEqual({ inputPerMillionTokens: 0, outputPerMillionTokens: 0 });
  });

  it('refuses a half-entered price rather than treating the missing half as free', () => {
    expect(normalizeAgentProviderPrice({ inputPerMillionTokens: 0.3 })).toBeUndefined();
    expect(normalizeAgentProviderPrice({ outputPerMillionTokens: 2.5 })).toBeUndefined();
  });

  it('refuses negative, non-finite and out-of-range rates', () => {
    expect(normalizeAgentProviderPrice({
      inputPerMillionTokens: -1,
      outputPerMillionTokens: 2.5,
    })).toBeUndefined();
    expect(normalizeAgentProviderPrice({
      inputPerMillionTokens: Number.NaN,
      outputPerMillionTokens: 2.5,
    })).toBeUndefined();
    expect(normalizeAgentProviderPrice({
      inputPerMillionTokens: 0.3,
      outputPerMillionTokens: AGENT_PROVIDER_PRICE_MAX + 1,
    })).toBeUndefined();
  });

  it('refuses non-objects', () => {
    expect(normalizeAgentProviderPrice(null)).toBeUndefined();
    expect(normalizeAgentProviderPrice('0.3')).toBeUndefined();
  });
});

describe('normalizeAgentProviderPricingTable', () => {
  it('keeps known providers and drops unknown keys', () => {
    const table = normalizeAgentProviderPricingTable({
      'gemini-2.5-flash': { inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 },
      'not-a-provider': { inputPerMillionTokens: 1, outputPerMillionTokens: 1 },
    });
    expect(table['gemini-2.5-flash']).toEqual({
      inputPerMillionTokens: 0.3,
      outputPerMillionTokens: 2.5,
    });
    expect(Object.keys(table)).toEqual(['gemini-2.5-flash']);
  });

  it('drops a provider whose stored price is incomplete', () => {
    expect(normalizeAgentProviderPricingTable({
      'deepseek-v4-pro': { inputPerMillionTokens: 0.27 },
    })).toEqual({});
  });

  it('survives a corrupt store', () => {
    expect(normalizeAgentProviderPricingTable(null)).toEqual({});
    expect(normalizeAgentProviderPricingTable('{}')).toEqual({});
  });
});

describe('agentProviderPrice', () => {
  const table = normalizeAgentProviderPricingTable({
    'gemini-2.5-flash': { inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 },
  });

  it('answers for a priced cloud target', () => {
    expect(agentProviderPrice(table, 'gemini-2.5-flash')?.outputPerMillionTokens).toBe(2.5);
  });

  it('answers nothing for an unpriced cloud target', () => {
    expect(agentProviderPrice(table, 'deepseek-v4-flash')).toBeUndefined();
  });

  it('never prices a local target, so a local run reports no dollar figure', () => {
    expect(agentProviderPrice(table, 'local')).toBeUndefined();
  });
});

describe('estimateAgentProviderCostUsd', () => {
  it('is undefined without a price rather than zero', () => {
    expect(estimateAgentProviderCostUsd(1_000, 1_000, undefined)).toBeUndefined();
  });

  it('prices input and output separately', () => {
    expect(estimateAgentProviderCostUsd(1_000_000, 1_000_000, {
      inputPerMillionTokens: 0.3,
      outputPerMillionTokens: 2.5,
    })).toBeCloseTo(2.8, 10);
  });

  it('matches the runtime character approximation the composer previews with', () => {
    expect(agentEstimatedTokens(0)).toBe(1);
    expect(agentEstimatedTokens(4)).toBe(1);
    expect(agentEstimatedTokens(5)).toBe(2);
  });
});

describe('formatAgentCostUsd', () => {
  it('does not round an ordinary turn away to zero', () => {
    expect(formatAgentCostUsd(0.00042)).toBe('0.0004');
    expect(formatAgentCostUsd(0.0000004)).toBe('<0.0001');
  });

  it('uses cents once the amount is worth counting in cents', () => {
    expect(formatAgentCostUsd(1.239)).toBe('1.24');
    expect(formatAgentCostUsd(0.01)).toBe('0.01');
  });

  it('reports an exact zero as zero, not as a rounding floor', () => {
    expect(formatAgentCostUsd(0)).toBe('0');
  });
});
