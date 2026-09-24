// @vitest-environment node
/**
 * The monthly limit has to be able to stop EVERY cloud caller, not only the Agent composer.
 *
 * Before this, rates lived in the renderer and only the composer sent them; the other cloud callers
 * (analysis, mining, the media assistant, Anki additions, subtitle fusion …) called
 * `runCloudAiRequest` with no `pricing`, and `agentSpendVerdict` allows an unpriced request by
 * design. So a user with a $1 limit could spend without bound through any of them. These tests call
 * the runtime exactly the way those callers do — no `pricing` field — with main's rate store
 * registered as it is at boot.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_PROVIDER_DEFAULT_PRICING } from '../../shared/agentProviderPricing';
import { createAgentPricingStore, type AgentPricingStore } from '../agentPricingStore';
import { createAgentSpendStore, type AgentSpendStore } from '../agentSpendStore';
import {
  clearAiProviderSessionCache,
  runCloudAiRequest,
  setAgentPricingResolver,
  setAgentSpendGuard,
} from '../providerRuntime';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));

const NOW = new Date(2026, 2, 14, 9, 0, 0).getTime();

let root: string;
let spend: AgentSpendStore;
let pricing: AgentPricingStore;

function reply(inputTokens: number, outputTokens: number): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    usageMetadata: { promptTokenCount: inputTokens, candidatesTokenCount: outputTokens },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/** Shaped like `aiProviderClient.ts`'s call: no pricing at all. */
function unpricedCallerRequest() {
  return {
    providerId: 'gemini-2.5-flash' as const,
    apiKey: 'key',
    prompt: 'Analyse this sentence.',
    maxOutputTokens: 1_000,
  };
}

beforeEach(() => {
  clearAiProviderSessionCache();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-store-'));
  spend = createAgentSpendStore(root, () => NOW);
  pricing = createAgentPricingStore(root);
  setAgentSpendGuard(spend);
  setAgentPricingResolver((providerId) => pricing.priceFor(providerId));
});

afterEach(() => {
  setAgentSpendGuard(null);
  setAgentPricingResolver(null);
  fs.rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('rates for callers that pass none', () => {
  it('refuses an unpriced caller once the month is spent, before the network', async () => {
    spend.setBudget(0.001);
    spend.record('gemini-2.5-flash', 0.001);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(runCloudAiRequest(unpricedCallerRequest())).rejects.toMatchObject({ code: 'spend-budget' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('NEGATIVE CONTROL: without the resolver the same caller slipped past the limit', async () => {
    setAgentPricingResolver(null);
    spend.setBudget(0.001);
    spend.record('gemini-2.5-flash', 0.001);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(20, 10)));

    await expect(runCloudAiRequest(unpricedCallerRequest())).resolves.toMatchObject({ text: '{"ok":true}' });
  });

  it('values the request with the built-in estimate, so the ledger counts it in dollars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(1_000_000, 1_000_000)));
    await runCloudAiRequest(unpricedCallerRequest());
    const estimate = AGENT_PROVIDER_DEFAULT_PRICING['gemini-2.5-flash'];
    const totals = spend.read().currentPeriod;
    expect(totals.spentUsd).toBeCloseTo(estimate.inputPerMillionTokens + estimate.outputPerMillionTokens, 9);
    expect(totals.unpricedRequests).toBe(0);
  });

  it("uses the user's own rate over the estimate", async () => {
    pricing.setPrice('gemini-2.5-flash', { inputPerMillionTokens: 10, outputPerMillionTokens: 20 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(1_000_000, 1_000_000)));
    await runCloudAiRequest(unpricedCallerRequest());
    expect(spend.read().currentPeriod.spentUsd).toBeCloseTo(30, 9);
  });

  it('leaves a caller-supplied rate alone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(1_000_000, 0)));
    await runCloudAiRequest({ ...unpricedCallerRequest(), pricing: { inputPerMillionTokens: 7, outputPerMillionTokens: 7 } });
    expect(spend.read().currentPeriod.spentUsd).toBeCloseTo(7, 9);
  });
});

describe('the rate store', () => {
  it('persists only what the user entered, and clearing returns to the estimate', () => {
    pricing.setPrice('deepseek-v4-pro', { inputPerMillionTokens: 2, outputPerMillionTokens: 4 });
    const reopened = createAgentPricingStore(root);
    expect(reopened.read().rates).toEqual({ 'deepseek-v4-pro': { inputPerMillionTokens: 2, outputPerMillionTokens: 4 } });
    reopened.setPrice('deepseek-v4-pro', null);
    expect(reopened.priceFor('deepseek-v4-pro')).toEqual(AGENT_PROVIDER_DEFAULT_PRICING['deepseek-v4-pro']);
  });

  it('adopts the legacy renderer table exactly once', () => {
    const legacy = { 'deepseek-v4-flash': { inputPerMillionTokens: 0.5, outputPerMillionTokens: 1 } };
    expect(pricing.migrateLegacy(legacy).rates).toEqual(legacy);
    pricing.setPrice('deepseek-v4-flash', null);
    // A stale window re-sending the old table must not resurrect a rate the user cleared.
    expect(pricing.migrateLegacy(legacy).rates).toEqual({});
  });

  it('drops malformed legacy rows rather than storing half a price', () => {
    const doc = pricing.migrateLegacy({ 'gemini-2.5-flash': { inputPerMillionTokens: 1 }, nonsense: {} });
    expect(doc.rates).toEqual({});
    expect(doc.migrated).toBe(true);
  });
});
