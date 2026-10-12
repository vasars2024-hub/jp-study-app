// @vitest-environment node
/**
 * The unified provider layer, against a LOCAL HTTP FAKE — a real `http` server on
 * 127.0.0.1 with a random port. Requests aimed at a vendor's real origin are
 * rewritten to the fake before they leave, so the code under test builds its real
 * URLs, headers and bodies, and nothing reaches a real AI API (or a real Ollama /
 * LM Studio: the fake never listens on 11434 or 1234).
 *
 * Covers every audit defect in the runtime (R1–R5), the new providers (Anthropic
 * Messages API, OpenAI, an OpenAI-compatible local server), the JSON client
 * (fences, cancel, per-feature consent, zod validation and its repair retry), and
 * "Test connection".
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AiProviderRuntimeError,
  clearAiProviderSessionCache,
  runCloudAiRequest,
  setAgentSpendGuard,
  setAiProviderOptionsReader,
} from '../providerRuntime';
import { callAiProvider, callAiProviderJson, parseAiJson } from '../aiProviderClient';
import { setAiCloudFeatureReader, setAiFeaturesReader } from '../aiFeatureGate';
import { testAiConnection } from '../aiSetupIpc';

const secrets = vi.hoisted(() => ({ values: {} as Record<string, string>, reads: [] as string[] }));

// Hoisted above the imports by vitest: the runtime reads keys from here, never the vault.
vi.mock('../credentials/ai', () => ({
  readAiProviderSecret: (bucket: string): string => {
    secrets.reads.push(bucket);
    return secrets.values[bucket] ?? '';
  },
}));

// ---------------------------------------------------------------------------
// The fake
// ---------------------------------------------------------------------------

interface Seen {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}

type Script = (seen: Seen) => { status?: number; json?: unknown; sse?: unknown[]; hang?: boolean };

let server: http.Server;
let base = '';
const seen: Seen[] = [];
let script: Script = () => ({ status: 500, json: {} });
const hanging = new Set<http.ServerResponse>();

const VENDOR_ORIGINS: Record<string, string> = {
  'https://generativelanguage.googleapis.com': '/gemini',
  'https://api.deepseek.com': '/deepseek',
  'https://api.anthropic.com': '/anthropic',
  'https://api.openai.com': '/openai',
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const entry: Seen = {
        method: req.method ?? '',
        path: req.url ?? '',
        headers: req.headers,
        body: raw ? JSON.parse(raw) as Record<string, unknown> : {},
      };
      seen.push(entry);
      const out = script(entry);
      const keepOpen = (): void => {
        hanging.add(res);
        res.on('close', () => hanging.delete(res));
      };
      if (out.sse) {
        res.writeHead(out.status ?? 200, { 'Content-Type': 'text/event-stream' });
        for (const event of out.sse) res.write(`data: ${event === '[DONE]' ? event : JSON.stringify(event)}\n\n`);
        // `hang` with events: a stream that started and never finishes.
        if (out.hang) keepOpen();
        else res.end();
        return;
      }
      if (out.hang) {
        keepOpen();
        return;
      }
      res.writeHead(out.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out.json ?? {}));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  // The harness refuses the real local-server ports; so must this fake.
  expect([11434, 1234]).not.toContain(port);
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  for (const res of hanging) res.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const realFetch = globalThis.fetch;

beforeEach(() => {
  seen.length = 0;
  secrets.reads.length = 0;
  secrets.values = { gemini: 'G-KEY', deepseek: 'D-KEY', anthropic: 'A-KEY', openai: 'O-KEY' };
  clearAiProviderSessionCache();
  setAiProviderOptionsReader(null);
  setAiFeaturesReader(null);
  setAiCloudFeatureReader(null);
  setAgentSpendGuard(null);
  // Vendor origins go to the fake; anything else must not be fetched at all.
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    const url = String(input);
    for (const [origin, prefix] of Object.entries(VENDOR_ORIGINS)) {
      if (url.startsWith(origin)) return realFetch(`${base}${prefix}${url.slice(origin.length)}`, init);
    }
    if (url.startsWith(base)) return realFetch(url, init);
    return Promise.reject(new Error(`test fetched a real URL: ${url}`));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAiProviderOptionsReader(null);
  setAiFeaturesReader(null);
  setAiCloudFeatureReader(null);
  setAgentSpendGuard(null);
});

function guard(budgetUsd: number | null = null) {
  const records: Array<{ providerId: string; cost: number | undefined }> = [];
  const spent = { total: 0 };
  return {
    records,
    verdict: (estimated: number | undefined) => {
      if (budgetUsd === null || estimated === undefined) return { kind: 'allow' as const, reason: 'no-budget' as const };
      return spent.total + estimated > budgetUsd
        ? { kind: 'refuse' as const, spentUsd: spent.total, budgetUsd, estimatedCostUsd: estimated }
        : { kind: 'allow' as const, reason: 'within-budget' as const, remainingUsd: budgetUsd - spent.total - estimated };
    },
    record: (providerId: string, cost: number | undefined) => {
      records.push({ providerId, cost });
      spent.total += cost ?? 0;
    },
  };
}

const PRICING = { inputPerMillionTokens: 1_000_000, outputPerMillionTokens: 1_000_000 }; // $1 per token: easy sums

// ---------------------------------------------------------------------------
// R1 — never the wrong vendor
// ---------------------------------------------------------------------------

describe('R1: an unknown provider id is an error, never another vendor', () => {
  it('refuses before reading any key or sending anything', async () => {
    await expect(runCloudAiRequest({ providerId: 'gpt-mystery' as never, prompt: 'x' }))
      .rejects.toMatchObject({ code: 'unknown-provider' });
    expect(secrets.reads).toEqual([]);
    expect(seen).toEqual([]);
  });

  it('callAiProvider refuses it too', async () => {
    await expect(callAiProvider('nope' as never, '', 'x', { type: 'object' }))
      .rejects.toMatchObject({ code: 'unknown-provider' });
    expect(seen).toEqual([]);
  });

  it('each vendor gets only its own key, in its own header', async () => {
    script = (req) => {
      if (req.path.startsWith('/gemini')) return { json: { candidates: [{ content: { parts: [{ text: 'g' }] } }] } };
      if (req.path.startsWith('/anthropic')) return { json: { content: [{ type: 'text', text: 'a' }], stop_reason: 'end_turn' } };
      return { json: { choices: [{ message: { content: 'c' }, finish_reason: 'stop' }] } };
    };
    for (const providerId of ['gemini-2.5-flash', 'deepseek-v4-pro', 'claude-sonnet-5-5', 'openai'] as const) {
      await runCloudAiRequest({ providerId, prompt: 'hi' });
    }
    const [gemini, deepseek, anthropic, openai] = seen;
    expect(gemini.headers['x-goog-api-key']).toBe('G-KEY');
    expect(gemini.headers.authorization).toBeUndefined();
    expect(deepseek.headers.authorization).toBe('Bearer D-KEY');
    expect(anthropic.headers['x-api-key']).toBe('A-KEY');
    expect(anthropic.headers.authorization).toBeUndefined();
    expect(openai.headers.authorization).toBe('Bearer O-KEY');
  });
});

// ---------------------------------------------------------------------------
// R2 / R4 / R5
// ---------------------------------------------------------------------------

describe('R2: DeepSeek truncation is detected', () => {
  it('maps finish_reason "length" to output-truncated, buffered and streamed', async () => {
    script = () => ({
      json: { choices: [{ message: { content: '{"items":[{"a":' }, finish_reason: 'length' }], usage: { prompt_tokens: 3, completion_tokens: 5 } },
    });
    await expect(runCloudAiRequest({ providerId: 'deepseek-v4-flash', prompt: 'x' }))
      .rejects.toMatchObject({ code: 'output-truncated' });

    script = () => ({
      sse: [
        { choices: [{ delta: { content: '{"a":' } }] },
        { choices: [{ delta: {}, finish_reason: 'length' }], usage: null },
        '[DONE]',
      ],
    });
    await expect(runCloudAiRequest({ providerId: 'deepseek-v4-flash', prompt: 'x', onTextChunk: () => undefined }))
      .rejects.toMatchObject({ code: 'output-truncated' });
  });
});

describe('R4/R5: Gemini', () => {
  it('sends the key in x-goog-api-key, never in the URL', async () => {
    script = () => ({ json: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });
    await runCloudAiRequest({ providerId: 'gemini-2.5-flash', prompt: 'x' });
    expect(seen[0].path).toBe('/gemini/v1beta/models/gemini-2.5-flash:generateContent');
    expect(seen[0].path).not.toContain('key=');
    expect(seen[0].headers['x-goog-api-key']).toBe('G-KEY');
  });

  it('joins every text part of a reply, and skips thought parts', async () => {
    script = () => ({
      json: {
        candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"a":' }, { text: '1}' }] } }],
      },
    });
    const result = await runCloudAiRequest({ providerId: 'gemini-2.5-flash', prompt: 'x' });
    expect(result.text).toBe('{"a":1}');
  });
});

// ---------------------------------------------------------------------------
// R3 — spend
// ---------------------------------------------------------------------------

describe('R3: spend', () => {
  it('records a billed failure with the usage the provider reported', async () => {
    const ledger = guard();
    setAgentSpendGuard(ledger);
    script = () => ({
      json: { choices: [{ message: { content: '{' }, finish_reason: 'length' }], usage: { prompt_tokens: 2, completion_tokens: 3 } },
    });
    await expect(runCloudAiRequest({ providerId: 'deepseek-v4-flash', prompt: 'x', pricing: PRICING }))
      .rejects.toMatchObject({ code: 'output-truncated' });
    expect(ledger.records).toEqual([{ providerId: 'deepseek-v4-flash', cost: 5 }]);
  });

  it('records Gemini MAX_TOKENS and an unparsable reply, but not a refused (401) request', async () => {
    const ledger = guard();
    setAgentSpendGuard(ledger);
    script = () => ({
      json: { candidates: [{ finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 4 } },
    });
    await expect(runCloudAiRequest({ providerId: 'gemini-2.5-flash', prompt: 'x', pricing: PRICING }))
      .rejects.toMatchObject({ code: 'output-truncated' });
    script = () => ({ json: { content: [], stop_reason: 'end_turn', usage: { input_tokens: 2, output_tokens: 1 } } });
    await expect(runCloudAiRequest({ providerId: 'claude-haiku-5-5', prompt: 'x', pricing: PRICING }))
      .rejects.toMatchObject({ code: 'invalid-response' });
    script = () => ({ status: 401, json: { error: 'bad key' } });
    await expect(runCloudAiRequest({ providerId: 'openai', prompt: 'x', pricing: PRICING }))
      .rejects.toMatchObject({ code: 'authentication' });
    expect(ledger.records).toEqual([
      { providerId: 'gemini-2.5-flash', cost: 5 },
      { providerId: 'claude-haiku-5-5', cost: 3 },
    ]);
  });

  it('records the worst-case estimate for a stream cut by cancel after the provider accepted it', async () => {
    const ledger = guard();
    setAgentSpendGuard(ledger);
    const controller = new AbortController();
    // A stream whose headers arrived and whose body never ends.
    script = () => ({ sse: [{ choices: [{ delta: { content: 'par' } }] }], hang: true });
    const chunks: string[] = [];
    const run = runCloudAiRequest({
      providerId: 'deepseek-v4-flash',
      prompt: 'abcd',
      maxOutputTokens: 10,
      pricing: PRICING,
      signal: controller.signal,
      onTextChunk: (chunk) => {
        chunks.push(chunk);
        controller.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ code: 'cancelled' });
    expect(chunks).toEqual(['par']);
    // Worst case: 1 input token + 10 output tokens at $1 each.
    expect(ledger.records).toEqual([{ providerId: 'deepseek-v4-flash', cost: 11 }]);
  });

  it('reserves before sending, so parallel requests cannot cross the ceiling together', async () => {
    // $25 a month. Each request's worst case is 4 input + 10 output tokens = $14:
    // one fits, two together do not — even though the ledger shows $0 spent while
    // both are in flight.
    const ledger = guard(25);
    setAgentSpendGuard(ledger);
    script = () => ({ json: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } } });
    const request = { providerId: 'deepseek-v4-flash' as const, prompt: 'abcdefghijklmnop', maxOutputTokens: 10, pricing: PRICING };
    const results = await Promise.allSettled([runCloudAiRequest(request), runCloudAiRequest(request)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ code: 'spend-budget' });
    expect(seen).toHaveLength(1);
    // Settled at the actual cost ($2), and the reservation released: the next one fits again.
    expect(ledger.records).toEqual([{ providerId: 'deepseek-v4-flash', cost: 2 }]);
    await expect(runCloudAiRequest(request)).resolves.toMatchObject({ text: 'ok' });
  });
});

// ---------------------------------------------------------------------------
// Anthropic Messages API
// ---------------------------------------------------------------------------

describe('Anthropic Claude', () => {
  const schema = { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] };

  it('builds a Messages API request with a forced tool for structured output', async () => {
    script = () => ({
      json: {
        content: [{ type: 'tool_use', id: 't1', name: 'respond', input: { word: '猫' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 2 },
      },
    });
    const result = await runCloudAiRequest({
      providerId: 'claude-haiku-5-5',
      prompt: 'One word.',
      systemPrompt: 'Be brief.',
      responseSchema: schema,
      responseMimeType: 'application/json',
      maxOutputTokens: 300,
      temperature: 0.2,
      pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 5 },
    });
    expect(JSON.parse(result.text)).toEqual({ word: '猫' });
    expect(result.model).toBe('claude-haiku-5-5');
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 4 });
    const [req] = seen;
    expect(req.path).toBe('/anthropic/v1/messages');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    expect(req.headers['x-api-key']).toBe('A-KEY');
    expect(req.body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 300,
      temperature: 0.2,
      system: [{ type: 'text', text: 'Be brief.' }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'One word.' }] }],
      tools: [{ name: 'respond', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'respond' },
    });
  });

  it('sends images as base64 blocks ahead of the text', async () => {
    script = () => ({ json: { content: [{ type: 'text', text: 'a cat' }], stop_reason: 'end_turn' } });
    await runCloudAiRequest({
      providerId: 'claude-opus-5-5',
      prompt: 'What is this?',
      images: [{ mimeType: 'image/png', base64: 'AAAA' }],
    });
    expect((seen[0].body.messages as Array<{ content: unknown[] }>)[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'text', text: 'What is this?' },
    ]);
  });

  it('marks a long system prefix for prompt caching', async () => {
    script = () => ({ json: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } });
    await runCloudAiRequest({ providerId: 'claude-sonnet-5-5', prompt: 'x', systemPrompt: 'S'.repeat(5_000) });
    expect((seen[0].body.system as Array<Record<string, unknown>>)[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('treats max_tokens as truncation and a refusal as an unusable answer', async () => {
    script = () => ({ json: { content: [{ type: 'text', text: '{"wo' }], stop_reason: 'max_tokens' } });
    await expect(runCloudAiRequest({ providerId: 'claude-haiku-5-5', prompt: 'x' })).rejects.toMatchObject({ code: 'output-truncated' });
    script = () => ({ json: { content: [], stop_reason: 'refusal' } });
    await expect(runCloudAiRequest({ providerId: 'claude-haiku-5-5', prompt: 'x' })).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('maps 401, 429 and the overloaded 529 to typed errors, retrying only the transient ones', async () => {
    script = () => ({ status: 401, json: {} });
    await expect(runCloudAiRequest({ providerId: 'claude-haiku-5-5', prompt: 'x', retryAttempts: 2, retryBaseDelayMs: 0 }))
      .rejects.toMatchObject({ code: 'authentication', status: 401 });
    expect(seen).toHaveLength(1);
    seen.length = 0;
    let n = 0;
    script = () => (++n === 1
      ? { status: 529, json: {} }
      : { json: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } });
    await expect(runCloudAiRequest({ providerId: 'claude-haiku-5-5', prompt: 'x', retryAttempts: 2, retryBaseDelayMs: 0 }))
      .resolves.toMatchObject({ text: 'ok', attempts: 2 });
    script = () => ({ status: 429, json: {} });
    await expect(runCloudAiRequest({ providerId: 'claude-haiku-5-5', prompt: 'x' })).rejects.toMatchObject({ code: 'rate-limit' });
  });

  it('streams text deltas and tool JSON, with usage from message_start and message_delta', async () => {
    script = () => ({
      sse: [
        { type: 'message_start', message: { usage: { input_tokens: 7, output_tokens: 1 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'respond' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"word":' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"犬"}' } },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 6 } },
        { type: 'message_stop' },
      ],
    });
    const chunks: string[] = [];
    const result = await runCloudAiRequest({
      providerId: 'claude-sonnet-5-5',
      prompt: 'x',
      responseSchema: schema,
      onTextChunk: (chunk) => chunks.push(chunk),
    });
    expect(JSON.parse(result.text)).toEqual({ word: '犬' });
    expect(chunks.join('')).toBe('{"word":"犬"}');
    expect(result.usage).toMatchObject({ inputTokens: 7, outputTokens: 6 });
    expect(seen[0].body.stream).toBe(true);
  });

  it('a stream that stops at max_tokens or reports an error event fails typed', async () => {
    script = () => ({
      sse: [
        { type: 'message_start', message: { usage: { input_tokens: 1 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'half' } },
        { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 9 } },
      ],
    });
    await expect(runCloudAiRequest({ providerId: 'claude-haiku-5-5', prompt: 'x', onTextChunk: () => undefined }))
      .rejects.toMatchObject({ code: 'output-truncated' });
    script = () => ({ sse: [{ type: 'error', error: { type: 'overloaded_error', message: 'busy' } }] });
    await expect(runCloudAiRequest({ providerId: 'claude-haiku-5-5', prompt: 'x', onTextChunk: () => undefined }))
      .rejects.toMatchObject({ code: 'upstream' });
  });
});

// ---------------------------------------------------------------------------
// OpenAI and an OpenAI-compatible local server
// ---------------------------------------------------------------------------

describe('OpenAI', () => {
  it('uses json_schema, max_completion_tokens, no temperature, and the configured model', async () => {
    setAiProviderOptionsReader(() => ({ openaiModel: 'gpt-5', compatBaseUrl: '', compatModel: '' }));
    script = () => ({ json: { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2 } } });
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
    const result = await runCloudAiRequest({ providerId: 'openai', prompt: 'x', responseSchema: schema, temperature: 0.3, maxOutputTokens: 64 });
    expect(result.model).toBe('gpt-5');
    expect(seen[0].path).toBe('/openai/v1/chat/completions');
    expect(seen[0].body).toMatchObject({
      model: 'gpt-5',
      max_completion_tokens: 64,
      response_format: { type: 'json_schema', json_schema: { name: 'response', schema } },
    });
    expect(seen[0].body).not.toHaveProperty('temperature');
    expect(seen[0].body).not.toHaveProperty('max_tokens');
  });

  it('defaults to gpt-5-mini and carries images as data URLs', async () => {
    script = () => ({ json: { choices: [{ message: { content: 'a cat' }, finish_reason: 'stop' }] } });
    await runCloudAiRequest({ providerId: 'openai', prompt: 'What?', images: [{ mimeType: 'image/jpeg', base64: 'QQ==' }] });
    expect(seen[0].body.model).toBe('gpt-5-mini');
    expect((seen[0].body.messages as Array<{ content: unknown }>)[0].content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QQ==' } },
      { type: 'text', text: 'What?' },
    ]);
  });
});

describe('OpenAI-compatible local server (Ollama, LM Studio)', () => {
  beforeEach(() => {
    setAiProviderOptionsReader(() => ({ openaiModel: '', compatBaseUrl: `${base}/v1`, compatModel: 'qwen3:8b' }));
  });

  it('calls the configured base URL with no key and no Authorization header', async () => {
    script = () => ({ json: { choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }] } });
    const result = await runCloudAiRequest({
      providerId: 'openai-compatible',
      prompt: 'x',
      responseSchema: { type: 'object' },
    });
    expect(result.text).toBe('{"a":1}');
    expect(seen[0].path).toBe('/v1/chat/completions');
    expect(seen[0].headers.authorization).toBeUndefined();
    expect(seen[0].body).toMatchObject({
      model: 'qwen3:8b',
      max_tokens: 2048,
      response_format: { type: 'json_schema', json_schema: { name: 'response', schema: { type: 'object' } } },
    });
    expect(seen[0].body).not.toHaveProperty('stream_options');
  });

  it('sends an optional key when one is saved', async () => {
    secrets.values['openai-compatible'] = 'PROXY-KEY';
    script = () => ({ json: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] } });
    await runCloudAiRequest({ providerId: 'openai-compatible', prompt: 'x' });
    expect(seen[0].headers.authorization).toBe('Bearer PROXY-KEY');
  });

  it('a server on this computer is not billed and never touches the spending ledger', async () => {
    const ledger = guard(0);
    setAgentSpendGuard(ledger);
    script = () => ({ json: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5 } } });
    await expect(runCloudAiRequest({ providerId: 'openai-compatible', prompt: 'x', pricing: PRICING })).resolves.toMatchObject({ text: 'ok' });
    expect(ledger.records).toEqual([]);
  });

  it('is "missing-credential" until both the URL and the model are set', async () => {
    setAiProviderOptionsReader(() => ({ openaiModel: '', compatBaseUrl: `${base}/v1`, compatModel: '' }));
    await expect(runCloudAiRequest({ providerId: 'openai-compatible', prompt: 'x' })).rejects.toMatchObject({ code: 'missing-credential' });
    expect(seen).toEqual([]);
  });

  it('reports truncation and a server that is not running', async () => {
    script = () => ({ json: { choices: [{ message: { content: '{' }, finish_reason: 'length' }] } });
    await expect(runCloudAiRequest({ providerId: 'openai-compatible', prompt: 'x' })).rejects.toMatchObject({ code: 'output-truncated' });
    // A port nothing listens on (never 11434 or 1234).
    setAiProviderOptionsReader(() => ({ openaiModel: '', compatBaseUrl: 'http://127.0.0.1:9/v1', compatModel: 'm' }));
    await expect(runCloudAiRequest({ providerId: 'openai-compatible', prompt: 'x' })).rejects.toMatchObject({ code: 'network' });
  });
});

// ---------------------------------------------------------------------------
// The JSON client
// ---------------------------------------------------------------------------

describe('callAiProvider / callAiProviderJson', () => {
  it('strips code fences from a reply', async () => {
    script = () => ({ json: { choices: [{ message: { content: 'Sure!\n```json\n{"a":1}\n```' }, finish_reason: 'stop' }] } });
    const text = await callAiProvider('deepseek-v4-flash', '', 'x', { type: 'object' });
    expect(text).toBe('{"a":1}');
    expect(parseAiJson<{ a: number }>('```\n{"a":2}\n```', 'test').a).toBe(2);
  });

  it('cancels the in-flight request through its signal', async () => {
    script = () => ({ hang: true });
    const controller = new AbortController();
    const pending = callAiProvider('gemini-2.5-flash', '', 'x', { type: 'object' }, { signal: controller.signal });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('enforces the master switch and the calling feature\'s cloud opt-in before sending', async () => {
    setAiFeaturesReader(() => false);
    await expect(callAiProvider('gemini-2.5-flash', '', 'x', {}, { feature: 'cardGen' })).rejects.toMatchObject({ code: 'ai-off' });
    setAiFeaturesReader(() => true);
    setAiCloudFeatureReader((feature) => feature !== 'cardGen');
    await expect(callAiProvider('gemini-2.5-flash', '', 'x', {}, { feature: 'cardGen' })).rejects.toMatchObject({ code: 'cloud-disabled' });
    expect(seen).toEqual([]);
  });

  it('subtitle translation is not allowed the cloud by default', async () => {
    await expect(callAiProvider('gemini-2.5-flash', '', 'x', {}, { feature: 'subtitleTranslate' }))
      .rejects.toMatchObject({ code: 'cloud-disabled' });
  });

  it('sends the schema the way each wire format wants it', async () => {
    const schema = { type: 'object', properties: { a: { type: 'number' } } };
    script = (req) => (req.path.startsWith('/gemini')
      ? { json: { candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] } }
      : req.path.startsWith('/anthropic')
        ? { json: { content: [{ type: 'tool_use', name: 'respond', input: { a: 1 } }], stop_reason: 'tool_use' } }
        : { json: { choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }] } });
    await callAiProvider('gemini-2.5-flash', '', 'x', schema);
    await callAiProvider('claude-haiku-5-5', '', 'x', schema);
    await callAiProvider('deepseek-v4-flash', '', 'x', schema);
    expect((seen[0].body.generationConfig as Record<string, unknown>).responseSchema).toEqual(schema);
    expect((seen[1].body.tools as Array<Record<string, unknown>>)[0].input_schema).toEqual(schema);
    expect(seen[2].body.response_format).toEqual({ type: 'json_object' });
    expect(String((seen[2].body.messages as Array<{ content: string }>)[0].content)).toContain('"a"');
  });

  it('validates with zod and repairs once, then gives up typed', async () => {
    const shape = z.object({ a: z.number() });
    let n = 0;
    script = () => ({ json: { choices: [{ message: { content: ++n === 1 ? '{"a":"one"}' : '{"a":1}' }, finish_reason: 'stop' }] } });
    await expect(callAiProviderJson('deepseek-v4-flash', '', 'x', {}, shape)).resolves.toEqual({ a: 1 });
    expect(seen).toHaveLength(2);
    expect(String((seen[1].body.messages as Array<{ content: string }>)[1].content)).toContain('could not be used');

    script = () => ({ json: { choices: [{ message: { content: 'not json' }, finish_reason: 'stop' }] } });
    await expect(callAiProviderJson('deepseek-v4-flash', '', 'x', {}, shape)).rejects.toBeInstanceOf(AiProviderRuntimeError);
  });
});

describe('keys never reach a log', () => {
  it('redacts every header and key shape this layer sends', async () => {
    const { redactSecrets } = await import('../errorLog');
    const line = redactSecrets(
      'x-goog-api-key: AIzaSyA1234567890abcdefghijk x-api-key: sk-ant-api03-abcdefghijklmnop Authorization: Bearer sk-proj-abcdefghijklmnopqrst',
    );
    expect(line).not.toMatch(/AIza|sk-ant|sk-proj/);
  });
});

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

describe('Test connection', () => {
  it('reports success with the model and a latency', async () => {
    script = () => ({ json: { content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn' } });
    const result = await testAiConnection('claude-haiku-5-5');
    expect(result).toMatchObject({ ok: true, model: 'claude-haiku-5-5' });
    // A fixed probe, never user text, and a tiny answer.
    expect(seen[0].body).toMatchObject({ max_tokens: 24 });
  });

  it('counts a reply cut at the tiny cap as connected', async () => {
    script = () => ({ json: { candidates: [{ finishReason: 'MAX_TOKENS' }] } });
    expect(await testAiConnection('gemini-2.5-flash')).toMatchObject({ ok: true });
  });

  it('names the failure by code and HTTP status, never as prose', async () => {
    script = () => ({ status: 401, json: {} });
    expect(await testAiConnection('openai')).toEqual({ ok: false, code: 'authentication', status: 401 });
    secrets.values.anthropic = '';
    expect(await testAiConnection('claude-haiku-5-5')).toEqual({ ok: false, code: 'missing-credential' });
    expect(await testAiConnection('nonsense')).toEqual({ ok: false, code: 'unknown-provider' });
  });
});
