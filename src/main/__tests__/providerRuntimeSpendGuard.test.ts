/**
 * The monthly ceiling, tested where it actually bites: inside the provider
 * runtime, against a real on-disk store rather than a stub verdict.
 *
 * `providerRuntime.test.ts` already covers the per-request cap. This file exists
 * for the property that one cannot show — that a run which is individually cheap
 * enough to pass every existing check is still refused once the *month* is
 * spent, and that the refusal happens before the network is read.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentSpendStore, type AgentSpendStore } from '../agentSpendStore';
import {
  clearAiProviderSessionCache,
  runCloudAiRequest,
  setAgentSpendGuard,
} from '../providerRuntime';

const NOW = new Date(2026, 2, 14, 9, 0, 0).getTime();
const PRICING = { inputPerMillionTokens: 1, outputPerMillionTokens: 1 };

let root: string;
let store: AgentSpendStore;

function reply(text: string, inputTokens: number, outputTokens: number): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: {
        promptTokenCount: inputTokens,
        candidatesTokenCount: outputTokens,
        totalTokenCount: inputTokens + outputTokens,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    providerId: 'gemini-2.5-flash' as const,
    apiKey: 'key',
    prompt: 'A short question.',
    maxOutputTokens: 1_000,
    pricing: PRICING,
    ...overrides,
  };
}

beforeEach(() => {
  clearAiProviderSessionCache();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'spend-guard-'));
  store = createAgentSpendStore(root, () => NOW);
  setAgentSpendGuard(store);
});

afterEach(() => {
  setAgentSpendGuard(null);
  fs.rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('provider runtime monthly spending ceiling', () => {
  it('refuses a request that would cross the ceiling, without reading the network', async () => {
    store.setBudget(0.001);
    // 0.0009 of a $0.001 month is spent; the preflight worst case for the
    // request below is 1,000 output tokens at $1/M = $0.001, which does not fit.
    store.record('gemini-2.5-flash', 0.0009);

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(runCloudAiRequest(request())).rejects.toMatchObject({
      code: 'spend-budget',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('NEGATIVE CONTROL: the identical request runs when the ceiling is not in the way', async () => {
    // Everything is the same as the refusal above except the number the user
    // set. If this also failed, the test above would be proving that the
    // request is broken rather than that the ceiling works.
    store.setBudget(5);
    store.record('gemini-2.5-flash', 0.0009);

    const fetchMock = vi.fn().mockResolvedValue(reply('{"ok":true}', 20, 10));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runCloudAiRequest(request());
    expect(result.text).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('with no ceiling set, nothing is refused however much was spent', async () => {
    store.record('gemini-2.5-flash', 999);
    const fetchMock = vi.fn().mockResolvedValue(reply('{"ok":true}', 20, 10));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runCloudAiRequest(request())).resolves.toMatchObject({ text: '{"ok":true}' });
  });

  it('records the actual reported cost, not the worst case it refused on', async () => {
    store.setBudget(5);
    const fetchMock = vi.fn().mockResolvedValue(reply('{"ok":true}', 20, 10));
    vi.stubGlobal('fetch', fetchMock);

    await runCloudAiRequest(request());

    // 20 input + 10 output tokens at $1/M each = $0.00003. The preflight figure
    // was 1,000 output tokens; recording that would have been ~33x the truth.
    const totals = store.read().currentPeriod;
    expect(totals.spentUsd).toBeCloseTo(0.00003, 12);
    expect(totals.requests).toBe(1);
    expect(totals.unpricedRequests).toBe(0);
  });

  it('counts an unpriced provider without inventing a dollar figure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('{"ok":true}', 20, 10));
    vi.stubGlobal('fetch', fetchMock);

    await runCloudAiRequest(request({ pricing: undefined }));

    const totals = store.read().currentPeriod;
    expect(totals.spentUsd).toBe(0);
    expect(totals.requests).toBe(0);
    expect(totals.unpricedRequests).toBe(1);
  });

  it('does not charge the month twice for one cached answer', async () => {
    store.setBudget(5);
    const fetchMock = vi.fn().mockResolvedValue(reply('{"ok":true}', 20, 10));
    vi.stubGlobal('fetch', fetchMock);

    const first = await runCloudAiRequest(request({ cache: 'session' }));
    const second = await runCloudAiRequest(request({ cache: 'session' }));

    expect(second.cached).toBe(true);
    expect(first.cached).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.read().currentPeriod.requests).toBe(1);
  });

  it('does not charge for a request the provider never completed', async () => {
    store.setBudget(5);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('nope', { status: 401 }),
    ));

    await expect(runCloudAiRequest(request())).rejects.toMatchObject({
      code: 'authentication',
    });
    expect(store.read().currentPeriod).toMatchObject({
      spentUsd: 0,
      requests: 0,
      unpricedRequests: 0,
    });
  });
});
