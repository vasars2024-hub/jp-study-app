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

function sseResponse(events: unknown[]): Response {
  const body = events
    .map((event) => `data: ${event === '[DONE]' ? event : JSON.stringify(event)}\n\n`)
    .join('');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
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

  it('streams Gemini SSE chunks and preserves final usage metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      { candidates: [{ content: { parts: [{ text: 'first' }] } }] },
      {
        candidates: [{ content: { parts: [{ text: ' second' }] } }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 3, totalTokenCount: 11 },
      },
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];

    const result = await runCloudAiRequest({
      providerId: 'gemini-2.5-flash',
      apiKey: 'gemini-key',
      prompt: 'Stream this.',
      pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 2 },
      onTextChunk: (chunk) => {
        chunks.push(chunk);
        if (chunk === 'first') throw new Error('observer failure');
      },
    });

    expect(chunks).toEqual(['first', ' second']);
    expect(result).toMatchObject({
      text: 'first second',
      delivery: 'streamed',
      usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11, estimatedCostUsd: 0.000014 },
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(':streamGenerateContent?alt=sse&key=gemini-key');
  });

  it('streams DeepSeek deltas and requests final usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      { choices: [{ delta: { content: 'deep' } }], usage: null },
      { choices: [{ delta: { content: ' seek' } }], usage: null },
      { choices: [], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } },
      '[DONE]',
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];

    const result = await runCloudAiRequest({
      providerId: 'deepseek-v4-flash',
      apiKey: 'deepseek-key',
      prompt: 'Stream this.',
      onTextChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual(['deep', ' seek']);
    expect(result).toMatchObject({
      text: 'deep seek',
      delivery: 'streamed',
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('does not retry a failed stream after visible text was delivered', async () => {
    const encoder = new TextEncoder();
    let reads = 0;
    const response = {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            reads += 1;
            if (reads === 1) {
              return {
                done: false,
                value: encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: 'visible' } }] })}\n\n`,
                ),
              };
            }
            throw new Error('stream exploded');
          },
        }),
      },
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    const chunks: string[] = [];

    await expect(runCloudAiRequest({
      providerId: 'deepseek-v4-pro',
      apiKey: 'key',
      prompt: 'Stream once.',
      retryAttempts: 2,
      retryBaseDelayMs: 0,
      onTextChunk: (chunk) => chunks.push(chunk),
    })).rejects.toMatchObject({ code: 'network', retriable: false });

    expect(chunks).toEqual(['visible']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  /**
   * `MAX_TOKENS` with no `parts` is what a thinking model returns when it spends
   * the whole output budget reasoning. It used to surface as "Gemini returned an
   * empty response", which sent every caller looking at the provider instead of
   * at the size of its own request — including F5, which lost whole arbitration
   * batches to it and recorded only `invalid-response`.
   */
  it('names a truncated Gemini answer as truncation, not as an empty response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ finishReason: 'MAX_TOKENS' }],
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 4096, totalTokenCount: 4996 },
    })));

    await expect(runCloudAiRequest({
      providerId: 'gemini-2.5-flash',
      apiKey: 'gemini-key',
      prompt: 'Arbitrate sixteen windows.',
      maxOutputTokens: 4096,
    })).rejects.toMatchObject({ code: 'output-truncated' });
  });

  it('still calls a genuinely empty Gemini answer empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: '   ' }] }, finishReason: 'STOP' }],
    })));

    await expect(runCloudAiRequest({
      providerId: 'gemini-2.5-flash',
      apiKey: 'gemini-key',
      prompt: 'Say nothing.',
      maxOutputTokens: 256,
    })).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('fails a stream cut off mid-answer rather than handing back half a JSON object', async () => {
    // The worse half of the same defect: the text parses far enough to look
    // like an answer and is missing its tail.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      { candidates: [{ content: { parts: [{ text: '{"lines":[{"id":0,' }] } }] },
      { candidates: [{ finishReason: 'MAX_TOKENS' }] },
      '[DONE]',
    ])));

    await expect(runCloudAiRequest({
      providerId: 'gemini-2.5-flash',
      apiKey: 'gemini-key',
      prompt: 'Stream sixteen windows.',
      maxOutputTokens: 4096,
      onTextChunk: () => {},
    })).rejects.toMatchObject({ code: 'output-truncated' });
  });
});
