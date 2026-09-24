import crypto from 'node:crypto';
import type { AiProviderHealth, AiProviderId, AiProviderKeyBucket } from '../shared/aiProviders';
import { AI_PROVIDERS, providerAcceptsImageInput, providerKeyBucket } from '../shared/aiProviders';
import type { AgentProviderPolicy } from '../shared/agentWorkspace';
import type { AgentProviderPrice } from '../shared/agentProviderPricing';
import { agentEstimatedTokens, estimateAgentProviderCostUsd } from '../shared/agentProviderPricing';
import type { AgentSpendGuard } from '../shared/agentSpendLedger';
import { readAiProviderSecret } from './credentials/ai';

export const AI_PROVIDER_TIMEOUT_MS = 120_000;

export type AiProviderCacheMode = AgentProviderPolicy['cache'];
export type AiProviderRuntimeEvent =
  | { type: 'start'; providerId: AiProviderId; model: string; attempt: number }
  | { type: 'retry'; providerId: AiProviderId; model: string; attempt: number; delayMs: number; reason: string }
  | { type: 'cache-hit'; providerId: AiProviderId; model: string }
  | { type: 'complete'; providerId: AiProviderId; model: string; attempts: number; cached: boolean }
  | { type: 'error'; providerId: AiProviderId; model: string; attempts: number; code: AiProviderErrorCode };

export type AiProviderErrorCode =
  | 'cancelled'
  | 'timeout'
  | 'missing-credential'
  | 'persistent-cache-unavailable'
  | 'cloud-disabled'
  | 'sensitive-context'
  | 'input-budget'
  | 'cost-budget'
  /**
   * The user's *cumulative* monthly ceiling would be crossed by this request.
   * Distinct from `cost-budget`, which is about this request being individually
   * too expensive: the remedy differs (wait for the month, or raise the
   * ceiling — not "ask for less"), and a request well under the per-request cap
   * is the normal way this one is hit.
   */
  | 'spend-budget'
  | 'authentication'
  | 'rate-limit'
  | 'upstream'
  | 'network'
  | 'vision-unsupported'
  /**
   * A local request found no model on disk. Raised by the Agent router's local
   * branch rather than by this runtime, and typed rather than left as a plain
   * `Error` because the remedy — install a model — is nothing like "the provider
   * returned an unusable response", which is what an untyped failure became.
   */
  | 'local-model-missing'
  /** "Use AI features" is off in Settings > AI. Raised before any runtime runs. */
  | 'ai-off'
  | 'invalid-response'
  /**
   * The model hit `maxOutputTokens` before finishing. Distinct from
   * `invalid-response` because the fix is different and the caller can act on
   * it: a truncated answer means ask for less, not that the provider is broken.
   */
  | 'output-truncated';

export class AiProviderRuntimeError extends Error {
  constructor(
    message: string,
    readonly code: AiProviderErrorCode,
    readonly retriable = false,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiProviderRuntimeError';
  }
}

/**
 * Aliased rather than redeclared. The composer previews a cost with the same
 * shape the runtime refuses on, and two structurally identical interfaces in two
 * files are two things that can drift.
 */
export type AiProviderPricing = AgentProviderPrice;

export interface AiProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}

/** One image part on a provider request. `base64` is raw, with no `data:` prefix. */
export interface AiProviderImageInput {
  mimeType: string;
  base64: string;
}

export interface AiProviderRequest {
  providerId: AiProviderId;
  apiKey?: string;
  prompt: string;
  /**
   * Image parts to send alongside the prompt. Only providers whose definition
   * sets `acceptsImageInput` may be given these; `runCloudAiRequest` refuses the
   * rest rather than dropping the images and answering from the text alone.
   */
  images?: readonly AiProviderImageInput[];
  systemPrompt?: string;
  responseSchema?: unknown;
  responseMimeType?: 'application/json' | 'text/plain';
  temperature?: number;
  maxOutputTokens?: number;
  maxInputChars?: number;
  maxEstimatedCostUsd?: number;
  pricing?: AiProviderPricing;
  timeoutMs?: number;
  retryAttempts?: number;
  retryBaseDelayMs?: number;
  cache?: AiProviderCacheMode;
  signal?: AbortSignal;
  onEvent?: (event: AiProviderRuntimeEvent) => void;
  onTextChunk?: (text: string) => void;
}

export interface AiProviderResult {
  text: string;
  providerId: AiProviderId;
  model: string;
  credentialBucket: AiProviderKeyBucket;
  inputChars: number;
  startedAt: number;
  completedAt: number;
  attempts: number;
  cached: boolean;
  delivery: 'streamed' | 'buffered';
  usage: AiProviderUsage;
}

export type { AiProviderHealth } from '../shared/aiProviders';

export type AgentCloudRuntimeOptions = Pick<
  AiProviderRequest,
  | 'providerId'
  | 'maxInputChars'
  | 'maxOutputTokens'
  | 'maxEstimatedCostUsd'
  | 'pricing'
  | 'cache'
  | 'retryAttempts'
  | 'timeoutMs'
>;

interface CachedProviderResult {
  text: string;
  usage: AiProviderUsage;
}

const sessionCache = new Map<string, CachedProviderResult>();

/**
 * The cumulative monthly ceiling, or `null` for none.
 *
 * A module-level registration rather than a field on `AiProviderRequest`, and
 * the reason is the same one written above `providerAcceptsImageInput` below:
 * this runtime is reachable from callers other than the Agent router. A ceiling
 * that each caller had to remember to pass would be bypassed by the first one
 * that forgot, and silently — which is the only failure mode a spending limit
 * really has. Enforced by default, opted out of explicitly.
 *
 * `null` until main registers the store at startup, so every unit test that
 * boots this module keeps its existing behaviour rather than acquiring a
 * ceiling it never asked for.
 */
let spendGuard: AgentSpendGuard | null = null;

export function setAgentSpendGuard(guard: AgentSpendGuard | null): void {
  spendGuard = guard;
}

/**
 * Rates for a request whose caller supplied none.
 *
 * Registered for the same reason as the spend guard, and the two only work
 * together: a ceiling compares a request's estimated cost, and a request with no
 * rates has no cost, so it was always allowed. Only the Agent composer ever
 * passed rates; the other eight cloud callers in the app did not, which left the
 * monthly limit unable to stop most of the spending it was set against. With
 * this registered, every request is priced — by the user's own figure where
 * they entered one, by the labelled built-in estimate otherwise — and so every
 * request is both checked against the limit and valued in the ledger.
 *
 * `null` until main registers the store, so unit tests keep their behaviour.
 */
let pricingResolver: ((providerId: AiProviderId) => AiProviderPricing | undefined) | null = null;

export function setAgentPricingResolver(
  resolver: ((providerId: AiProviderId) => AiProviderPricing | undefined) | null,
): void {
  pricingResolver = resolver;
}

function withResolvedPricing(request: AiProviderRequest): AiProviderRequest {
  if (request.pricing || !pricingResolver) return request;
  let pricing: AiProviderPricing | undefined;
  try {
    pricing = pricingResolver(request.providerId);
  } catch {
    // An unreadable rate table is an unpriced request, exactly as before this existed.
    return request;
  }
  return pricing ? { ...request, pricing } : request;
}

function providerModel(providerId: AiProviderId): string {
  if (providerId === 'gemini-2.5-flash') return 'gemini-2.5-flash';
  return providerId === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';
}

function credentialFor(providerId: AiProviderId, supplied?: string): string {
  const direct = supplied?.trim() ?? '';
  if (direct) return direct;
  return readAiProviderSecret(providerKeyBucket(providerId)).trim();
}

export function getAiProviderHealth(providerId: AiProviderId): AiProviderHealth {
  const credentialBucket = providerKeyBucket(providerId);
  return {
    providerId,
    model: providerModel(providerId),
    credentialBucket,
    configured: Boolean(readAiProviderSecret(credentialBucket).trim()),
  };
}

/**
 * Every cloud provider's credential state in one read, in table order.
 *
 * The renderer asks this before a run rather than after one fails, so a keyless
 * provider is visible in the picker instead of arriving as a
 * `missing-credential` refusal at the end of a submitted prompt. No secret
 * crosses the bridge — only the boolean and the bucket name.
 */
export function getAiProviderHealthReport(): readonly AiProviderHealth[] {
  return AI_PROVIDERS.map((provider) => getAiProviderHealth(provider.id));
}

export function clearAiProviderSessionCache(): void {
  sessionCache.clear();
}

/**
 * Converts the frozen Agent policy into provider-runtime options without
 * crossing the local/cloud boundary. The caller must still apply the context
 * privacy decision before supplying a prompt.
 */
export function agentCloudRuntimeOptions(policy: AgentProviderPolicy): AgentCloudRuntimeOptions | null {
  if (policy.target.kind !== 'cloud' || !policy.allowCloud) return null;
  return {
    providerId: policy.target.providerId,
    maxInputChars: policy.maxInputChars,
    maxOutputTokens: policy.maxOutputTokens,
    ...(policy.maxEstimatedCostUsd !== undefined
      ? { maxEstimatedCostUsd: policy.maxEstimatedCostUsd }
      : {}),
    ...(policy.pricing ? { pricing: policy.pricing } : {}),
    cache: policy.cache,
    retryAttempts: policy.retryAttempts,
    timeoutMs: policy.timeoutMs,
  };
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value as number)));
}

const estimatedTokens = agentEstimatedTokens;

export function estimateAiProviderCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricing?: AiProviderPricing,
): number | undefined {
  return estimateAgentProviderCostUsd(inputTokens, outputTokens, pricing);
}

function cacheKey(request: AiProviderRequest, model: string, maxOutputTokens: number): string {
  return crypto.createHash('sha256').update(JSON.stringify({
    providerId: request.providerId,
    model,
    prompt: request.prompt,
    systemPrompt: request.systemPrompt ?? '',
    responseSchema: request.responseSchema ?? null,
    responseMimeType: request.responseMimeType ?? 'text/plain',
    temperature: request.temperature ?? null,
    maxOutputTokens,
    // Digested rather than embedded: the payloads are megabytes, and
    // JSON.stringify would materialise a second copy of every one of them just
    // to compute a key. Omitting them entirely would be the real bug — two
    // "what is in this screenshot" requests share a prompt, and the second would
    // be served the first one's answer out of the session cache.
    images: (request.images ?? []).map((image) => ({
      mimeType: image.mimeType,
      digest: crypto.createHash('sha256').update(image.base64).digest('hex'),
    })),
  })).digest('hex');
}

function runtimeError(error: unknown): AiProviderRuntimeError {
  if (error instanceof AiProviderRuntimeError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new AiProviderRuntimeError('AI request was cancelled.', 'cancelled');
  }
  return new AiProviderRuntimeError(
    error instanceof Error ? error.message : String(error),
    'network',
    true,
  );
}

function emit(request: AiProviderRequest, event: AiProviderRuntimeEvent): void {
  try {
    request.onEvent?.(event);
  } catch {
    // Telemetry and UI observers must never alter provider execution semantics.
  }
}

function emitTextChunk(request: AiProviderRequest, text: string): void {
  try {
    request.onTextChunk?.(text);
  } catch {
    // Streaming observers are presentation-only and cannot change execution.
  }
}

function responseError(providerId: AiProviderId, status: number): AiProviderRuntimeError {
  const label = providerId === 'gemini-2.5-flash' ? 'Gemini' : 'DeepSeek';
  if (status === 401 || status === 403) {
    const suffix = label === 'Gemini'
      ? 'Check the key and API access.'
      : 'Check the key at platform.deepseek.com.';
    return new AiProviderRuntimeError(`${label} rejected the API key. ${suffix}`, 'authentication', false, status);
  }
  if (status === 429) {
    return new AiProviderRuntimeError(`${label} rate limit reached. Wait a moment and try again.`, 'rate-limit', true, status);
  }
  const retriable = status === 408 || status === 425 || status >= 500;
  return new AiProviderRuntimeError(`${label} returned ${status}.`, 'upstream', retriable, status);
}

function usageWithCost(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  totalTokens: number | undefined,
  pricing?: AiProviderPricing,
): AiProviderUsage {
  const estimatedCostUsd = inputTokens !== undefined && outputTokens !== undefined
    ? estimateAiProviderCostUsd(inputTokens, outputTokens, pricing)
    : undefined;
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
  };
}

async function parseGeminiResponse(response: Response, pricing?: AiProviderPricing): Promise<{ text: string; usage: AiProviderUsage }> {
  let json: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  try {
    json = await response.json() as typeof json;
  } catch {
    throw new AiProviderRuntimeError('Gemini returned invalid JSON.', 'invalid-response');
  }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  // Checked before the empty test, because a thinking model that spends the
  // whole budget on thoughts returns MAX_TOKENS *with no parts at all* — which
  // read as "the provider returned nothing" and sent every caller looking in
  // the wrong place. A truncated answer is the caller's size problem.
  if (json.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new AiProviderRuntimeError(
      'Gemini hit its output token limit before finishing. Try fewer items.',
      'output-truncated',
    );
  }
  if (!text) throw new AiProviderRuntimeError('Gemini returned an empty response.', 'invalid-response');
  const usage = json.usageMetadata;
  return {
    text,
    usage: usageWithCost(usage?.promptTokenCount, usage?.candidatesTokenCount, usage?.totalTokenCount, pricing),
  };
}

async function parseDeepSeekResponse(response: Response, pricing?: AiProviderPricing): Promise<{ text: string; usage: AiProviderUsage }> {
  let json: {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  try {
    json = await response.json() as typeof json;
  } catch {
    throw new AiProviderRuntimeError('DeepSeek returned invalid JSON.', 'invalid-response');
  }
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiProviderRuntimeError('DeepSeek returned an empty response.', 'invalid-response');
  return {
    text,
    usage: usageWithCost(json.usage?.prompt_tokens, json.usage?.completion_tokens, json.usage?.total_tokens, pricing),
  };
}

interface StreamAccumulator {
  text: string;
  usage: AiProviderUsage;
}

async function consumeSse(
  response: Response,
  consume: (payload: unknown) => void,
): Promise<void> {
  if (!response.body) {
    throw new AiProviderRuntimeError('AI provider returned an empty stream.', 'invalid-response');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeEvent = (event: string): boolean => {
    const data = event
      .split(/\r?\n/u)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data) return false;
    if (data === '[DONE]') return true;
    try {
      consume(JSON.parse(data) as unknown);
    } catch (error) {
      if (error instanceof AiProviderRuntimeError) throw error;
      throw new AiProviderRuntimeError('AI provider returned an invalid stream event.', 'invalid-response');
    }
    return false;
  };

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/u);
    buffer = events.pop() ?? '';
    for (const event of events) {
      if (consumeEvent(event)) {
        try {
          await reader.cancel();
        } catch {
          // The provider may close the connection immediately after [DONE].
        }
        return;
      }
    }
    if (done) break;
  }
  if (buffer.trim()) consumeEvent(buffer);
}

function recordUsage(
  rawInput: unknown,
  rawOutput: unknown,
  rawTotal: unknown,
  pricing?: AiProviderPricing,
): AiProviderUsage {
  const input = typeof rawInput === 'number' && Number.isFinite(rawInput) ? rawInput : undefined;
  const output = typeof rawOutput === 'number' && Number.isFinite(rawOutput) ? rawOutput : undefined;
  const total = typeof rawTotal === 'number' && Number.isFinite(rawTotal) ? rawTotal : undefined;
  return usageWithCost(input, output, total, pricing);
}

async function parseGeminiStream(
  response: Response,
  request: AiProviderRequest,
): Promise<StreamAccumulator> {
  let text = '';
  let usage: AiProviderUsage = {};
  let truncated = false;
  await consumeSse(response, (payload) => {
    if (typeof payload !== 'object' || payload === null) {
      throw new AiProviderRuntimeError('Gemini returned an invalid stream event.', 'invalid-response');
    }
    const chunk = payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown; totalTokenCount?: unknown };
    };
    if (chunk.candidates?.[0]?.finishReason === 'MAX_TOKENS') truncated = true;
    const delta = chunk.candidates?.[0]?.content?.parts
      ?.map((part) => typeof part.text === 'string' ? part.text : '')
      .join('') ?? '';
    if (delta) {
      text += delta;
      emitTextChunk(request, delta);
    }
    if (chunk.usageMetadata) {
      usage = recordUsage(
        chunk.usageMetadata.promptTokenCount,
        chunk.usageMetadata.candidatesTokenCount,
        chunk.usageMetadata.totalTokenCount,
        request.pricing,
      );
    }
  });
  // A stream that was cut mid-JSON is worse than one that produced nothing: the
  // text parses far enough to look like an answer and is missing its tail. It
  // fails as truncation whether or not any text arrived.
  if (truncated) {
    throw new AiProviderRuntimeError(
      'Gemini hit its output token limit before finishing. Try fewer items.',
      'output-truncated',
    );
  }
  if (!text.trim()) throw new AiProviderRuntimeError('Gemini returned an empty response.', 'invalid-response');
  return { text: text.trim(), usage };
}

async function parseDeepSeekStream(
  response: Response,
  request: AiProviderRequest,
): Promise<StreamAccumulator> {
  let text = '';
  let usage: AiProviderUsage = {};
  await consumeSse(response, (payload) => {
    if (typeof payload !== 'object' || payload === null) {
      throw new AiProviderRuntimeError('DeepSeek returned an invalid stream event.', 'invalid-response');
    }
    const chunk = payload as {
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown } | null;
    };
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) {
      text += delta;
      emitTextChunk(request, delta);
    }
    if (chunk.usage) {
      usage = recordUsage(
        chunk.usage.prompt_tokens,
        chunk.usage.completion_tokens,
        chunk.usage.total_tokens,
        request.pricing,
      );
    }
  });
  if (!text.trim()) throw new AiProviderRuntimeError('DeepSeek returned an empty response.', 'invalid-response');
  return { text: text.trim(), usage };
}

function requestBody(request: AiProviderRequest, model: string, maxOutputTokens: number): { url: string; init: RequestInit } {
  const streaming = Boolean(request.onTextChunk);
  if (request.providerId === 'gemini-2.5-flash') {
    // The 2.5 series thinks by default and charges its thoughts against
    // `maxOutputTokens`, which is the cause of the MAX_TOKENS truncations read
    // below: the answer is cut off before it starts. Left out until 2026-08-15
    // only because an unknown `generationConfig` field is a 400 and a wrong guess
    // breaks *every* cloud call in the app; the field is now confirmed against
    // Google's own REST reference for `v1beta/models/gemini-2.5-flash`, where
    // `thinkingBudget` is an integer 0..24576 (0 disables, -1 is the dynamic
    // default).
    //
    // A quarter of the budget, floored at 512 so a small request still gets room
    // to think and ceilinged at the documented maximum. Not 0: disabling thinking
    // entirely is a quality change to every cloud answer in the app, and the
    // defect being fixed is thoughts *consuming the reply's* budget, not thinking
    // itself. Three quarters left for the answer is what the arbiter's split
    // retry was compensating for.
    const thinkingBudget = Math.min(24_576, Math.max(512, Math.floor(maxOutputTokens / 4)));
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens,
      thinkingConfig: { thinkingBudget },
      ...(request.responseMimeType === 'application/json' || request.responseSchema
        ? { responseMimeType: 'application/json' }
        : {}),
      ...(request.responseSchema ? { responseSchema: request.responseSchema } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    };
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:${streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'}`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(request.systemPrompt ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } } : {}),
          contents: [{
            parts: [
              // Images lead. Gemini reads parts in order, and a prompt that says
              // "what does this screenshot show" placed BEFORE the screenshot is
              // a question about nothing yet.
              ...(request.images ?? []).map((image) => ({
                inlineData: { mimeType: image.mimeType, data: image.base64 },
              })),
              { text: request.prompt },
            ],
          }],
          generationConfig,
        }),
      },
    };
  }

  return {
    url: 'https://api.deepseek.com/chat/completions',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          { role: 'user', content: request.prompt },
        ],
        ...(request.responseMimeType === 'application/json' || request.responseSchema
          ? { response_format: { type: 'json_object' } }
          : {}),
        max_tokens: maxOutputTokens,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        stream: streaming,
        ...(streaming ? { stream_options: { include_usage: true } } : {}),
      }),
    },
  };
}

async function fetchAttempt(
  request: AiProviderRequest,
  model: string,
  apiKey: string,
  maxOutputTokens: number,
  timeoutMs: number,
): Promise<{ text: string; usage: AiProviderUsage }> {
  if (request.signal?.aborted) {
    throw new AiProviderRuntimeError('AI request was cancelled.', 'cancelled');
  }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(request.signal?.reason);
  request.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let emittedChunk = false;
  const requestWithTrackedChunks: AiProviderRequest = request.onTextChunk
    ? {
        ...request,
        onTextChunk: (text) => {
          emittedChunk = true;
          emitTextChunk(request, text);
        },
      }
    : request;
  try {
    const built = requestBody(requestWithTrackedChunks, model, maxOutputTokens);
    const headers = new Headers(built.init.headers);
    if (request.providerId === 'gemini-2.5-flash') {
      built.url += `${built.url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
    } else {
      headers.set('Authorization', `Bearer ${apiKey}`);
    }
    const response = await fetch(built.url, { ...built.init, headers, signal: controller.signal });
    if (!response.ok) throw responseError(request.providerId, response.status);
    if (requestWithTrackedChunks.onTextChunk) {
      return await (request.providerId === 'gemini-2.5-flash'
        ? parseGeminiStream(response, requestWithTrackedChunks)
        : parseDeepSeekStream(response, requestWithTrackedChunks));
    }
    return await (request.providerId === 'gemini-2.5-flash'
      ? parseGeminiResponse(response, request.pricing)
      : parseDeepSeekResponse(response, request.pricing));
  } catch (error) {
    if (timedOut) {
      throw new AiProviderRuntimeError(
        `AI request timed out after ${Math.round(timeoutMs / 1000)}s. Try fewer items or check your connection.`,
        'timeout',
        true,
      );
    }
    if (request.signal?.aborted) {
      throw new AiProviderRuntimeError('AI request was cancelled.', 'cancelled');
    }
    const normalized = runtimeError(error);
    if (emittedChunk && normalized.retriable) {
      throw new AiProviderRuntimeError(normalized.message, normalized.code, false, normalized.status);
    }
    throw normalized;
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', abort);
  }
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AiProviderRuntimeError('AI request was cancelled.', 'cancelled'));
    const abort = () => {
      clearTimeout(timer);
      reject(new AiProviderRuntimeError('AI request was cancelled.', 'cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function runCloudAiRequest(input: AiProviderRequest): Promise<AiProviderResult> {
  const startedAt = Date.now();
  const request = withResolvedPricing(input);
  const model = providerModel(request.providerId);
  const credentialBucket = providerKeyBucket(request.providerId);
  const inputChars = request.prompt.length + (request.systemPrompt?.length ?? 0);
  if (request.maxInputChars !== undefined && inputChars > Math.max(0, request.maxInputChars)) {
    throw new AiProviderRuntimeError('AI request exceeds the configured input budget.', 'input-budget');
  }
  // Refused, never silently dropped. This runtime is reachable from callers
  // other than the Agent router, so the capability check lives here as well as
  // there — sending a screenshot's worth of question to a text-only model and
  // returning its confident answer is the failure mode being prevented.
  if ((request.images?.length ?? 0) > 0 && !providerAcceptsImageInput(request.providerId)) {
    throw new AiProviderRuntimeError(
      `${providerModel(request.providerId)} does not accept image input.`,
      'vision-unsupported',
    );
  }
  const maxOutputTokens = boundedInteger(request.maxOutputTokens, 2048, 1, 65_536);
  const preflightCost = estimateAiProviderCostUsd(
    estimatedTokens(inputChars),
    maxOutputTokens,
    request.pricing,
  );
  if (
    request.maxEstimatedCostUsd !== undefined
    && preflightCost !== undefined
    && preflightCost > Math.max(0, request.maxEstimatedCostUsd)
  ) {
    throw new AiProviderRuntimeError('AI request exceeds the configured cost budget.', 'cost-budget');
  }
  // Second, and after the per-request cap on purpose: "this one request is too
  // expensive" is the more specific complaint and names the control the user
  // most likely just set. Both are preflight, and both estimate output at
  // `maxOutputTokens` — the worst case — because a ceiling that can be crossed
  // by a request it approved is not a ceiling. The cost is that a request which
  // would in fact have fit can be refused near the boundary; the remedy for
  // that is visible and reversible, whereas the alternative is a total that
  // quietly ends the month above the number the user set.
  if (spendGuard) {
    const spend = spendGuard.verdict(preflightCost);
    if (spend.kind === 'refuse') {
      throw new AiProviderRuntimeError(
        'AI request would exceed the monthly spending limit.',
        'spend-budget',
      );
    }
  }
  const apiKey = credentialFor(request.providerId, request.apiKey);
  if (!apiKey) throw new AiProviderRuntimeError('AI provider credential is not configured.', 'missing-credential');

  const cacheMode = request.cache ?? 'off';
  if (cacheMode === 'persistent') {
    throw new AiProviderRuntimeError(
      'Persistent AI response caching is not available until encrypted retention is configured.',
      'persistent-cache-unavailable',
    );
  }
  const key = cacheKey(request, model, maxOutputTokens);
  const cached = cacheMode === 'session' ? sessionCache.get(key) : undefined;
  if (cached) {
    emit(request, { type: 'cache-hit', providerId: request.providerId, model });
    emit(request, { type: 'complete', providerId: request.providerId, model, attempts: 0, cached: true });
    return {
      text: cached.text,
      providerId: request.providerId,
      model,
      credentialBucket,
      inputChars,
      startedAt,
      completedAt: Date.now(),
      attempts: 0,
      cached: true,
      delivery: 'buffered',
      usage: cached.usage,
    };
  }

  const retryAttempts = boundedInteger(request.retryAttempts, 0, 0, 5);
  const retryBaseDelayMs = boundedInteger(request.retryBaseDelayMs, 500, 0, 30_000);
  const timeoutMs = boundedInteger(request.timeoutMs, AI_PROVIDER_TIMEOUT_MS, 1, 10 * 60_000);
  let attempts = 0;
  for (;;) {
    attempts += 1;
    emit(request, { type: 'start', providerId: request.providerId, model, attempt: attempts });
    try {
      const result = await fetchAttempt(request, model, apiKey, maxOutputTokens, timeoutMs);
      if (cacheMode === 'session') {
        sessionCache.set(key, { text: result.text, usage: result.usage });
      }
      // The *actual* cost, not the worst-case figure the preflight refused on:
      // the ledger is a record of what was spent, and charging the user's month
      // for output tokens the model did not produce would make the total wrong
      // in the direction that refuses their next request.
      //
      // Only here, so a cache hit adds nothing — it made no request and there is
      // no bill for it — and only on success, so a failed attempt that was
      // retried is not counted once per attempt.
      spendGuard?.record(request.providerId, result.usage.estimatedCostUsd);
      emit(request, { type: 'complete', providerId: request.providerId, model, attempts, cached: false });
      return {
        text: result.text,
        providerId: request.providerId,
        model,
        credentialBucket,
        inputChars,
        startedAt,
        completedAt: Date.now(),
        attempts,
        cached: false,
        delivery: request.onTextChunk ? 'streamed' : 'buffered',
        usage: result.usage,
      };
    } catch (error) {
      const normalized = runtimeError(error);
      if (!normalized.retriable || attempts > retryAttempts) {
        emit(request, { type: 'error', providerId: request.providerId, model, attempts, code: normalized.code });
        throw normalized;
      }
      const delayMs = retryBaseDelayMs * 2 ** (attempts - 1);
      emit(request, {
        type: 'retry',
        providerId: request.providerId,
        model,
        attempt: attempts + 1,
        delayMs,
        reason: normalized.code,
      });
      await wait(delayMs, request.signal);
    }
  }
}
