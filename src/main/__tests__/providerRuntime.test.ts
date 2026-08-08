import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiProviderRuntimeError,
  agentCloudRuntimeOptions,
  clearAiProviderSessionCache,
  estimateAiProviderCostUsd,
  runCloudAiRequest,
  type AiProviderRuntimeEvent,
} from '../providerRuntime';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('main-owned AI provider runtime', () => {
  beforeEach(() => {
    clearAiProviderSessionCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds the Gemini structured request and reports provider usage/cost', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runCloudAiRequest({
      providerId: 'gemini-2.5-flash',
      apiKey: 'gemini-key',
      prompt: 'Return one object.',
      responseSchema: { type: 'object' },
      responseMimeType: 'application/json',
      maxOutputTokens: 321,
      temperature: 0.1,
      pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 2 },
    });

    expect(result.text).toBe('{"ok":true}');
    expect(result.usage).toEqual({
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      estimatedCostUsd: 0.00004,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-2.5-flash:generateContent?key=gemini-key');
    const body = JSON.parse(String(init.body)) as {
      generationConfig: Record<string, unknown>;
    };
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseSchema: { type: 'object' },
      maxOutputTokens: 321,
      temperature: 0.1,
    });
  });

  it('retries only retriable failures and emits an auditable lifecycle', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'busy' }, 429))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const events: AiProviderRuntimeEvent[] = [];

    const result = await runCloudAiRequest({
      providerId: 'deepseek-v4-pro',
      apiKey: 'deepseek-key',
      prompt: 'Return JSON.',
      systemPrompt: 'JSON only.',
      responseMimeType: 'application/json',
      retryAttempts: 1,
      retryBaseDelayMs: 0,
      onEvent: (event) => events.push(event),
    });

    expect(result.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.type)).toEqual(['start', 'retry', 'start', 'complete']);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer deepseek-key');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'deepseek-v4-pro',
      response_format: { type: 'json_object' },
      stream: false,
    });
  });

  it('owns a prompt-safe session cache without repeating the network call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: 'cached answer' }] } }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const request = {
      providerId: 'gemini-2.5-flash' as const,
      apiKey: 'key',
      prompt: 'same request',
      cache: 'session' as const,
    };

    const first = await runCloudAiRequest(request);
    const second = await runCloudAiRequest(request);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.attempts).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses input and cost budgets before reading the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(runCloudAiRequest({
      providerId: 'gemini-2.5-flash',
      apiKey: 'key',
      prompt: 'too long',
      maxInputChars: 3,
    })).rejects.toMatchObject({ code: 'input-budget' });

    await expect(runCloudAiRequest({
      providerId: 'gemini-2.5-flash',
      apiKey: 'key',
      prompt: 'budgeted',
      maxOutputTokens: 10_000,
      maxEstimatedCostUsd: 0.000001,
      pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 1 },
    })).rejects.toMatchObject({ code: 'cost-budget' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(estimateAiProviderCostUsd(10, 5, {
      inputPerMillionTokens: 1,
      outputPerMillionTokens: 2,
    })).toBe(0.00002);
  });

  it('honors cancellation before a provider can receive context', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(runCloudAiRequest({
      providerId: 'deepseek-v4-flash',
      apiKey: 'key',
      prompt: 'private context',
      signal: controller.signal,
    })).rejects.toEqual(expect.objectContaining<Partial<AiProviderRuntimeError>>({
      code: 'cancelled',
    }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies malformed provider JSON without retrying and ignores observer failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not-json', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runCloudAiRequest({
      providerId: 'gemini-2.5-flash',
      apiKey: 'key',
      prompt: 'response',
      retryAttempts: 3,
      onEvent: () => {
        throw new Error('observer failure');
      },
    })).rejects.toMatchObject({ code: 'invalid-response', retriable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps the Agent cloud policy and refuses unencrypted persistent retention', async () => {
    const options = agentCloudRuntimeOptions({
      target: { kind: 'cloud', providerId: 'deepseek-v4-flash' },
      allowCloud: true,
      allowSensitiveContext: false,
      maxInputChars: 4000,
      maxOutputTokens: 500,
      maxEstimatedCostUsd: 0.05,
      cache: 'persistent',
      retryAttempts: 2,
      timeoutMs: 30_000,
      streaming: false,
    });
    expect(options).toMatchObject({
      providerId: 'deepseek-v4-flash',
      maxInputChars: 4000,
      maxOutputTokens: 500,
      cache: 'persistent',
      retryAttempts: 2,
      timeoutMs: 30_000,
    });
    if (!options) throw new Error('expected a cloud runtime policy');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(runCloudAiRequest({
      ...options,
      apiKey: 'key',
      prompt: 'retained answer',
    })).rejects.toMatchObject({ code: 'persistent-cache-unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
