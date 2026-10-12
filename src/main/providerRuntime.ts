import crypto from 'node:crypto';
import type {
  AiProviderDefinition,
  AiProviderHealth,
  AiProviderId,
  AiProviderKeyBucket,
} from '../shared/aiProviders';
import {
  AI_PROVIDER_BASE_URLS,
  AI_PROVIDERS,
  isLoopbackUrl,
  providerAcceptsImageInput,
} from '../shared/aiProviders';
import { DEFAULT_AI_PROVIDER_OPTIONS, type AiProviderOptions } from '../shared/aiSetup';
import type { AgentProviderPolicy } from '../shared/agentWorkspace';
import type { AgentProviderPrice } from '../shared/agentProviderPricing';
import { agentEstimatedTokens, estimateAgentProviderCostUsd } from '../shared/agentProviderPricing';
import type { AgentSpendGuard, AgentSpendProviderId } from '../shared/agentSpendLedger';
import { readAiProviderSecret } from './credentials/ai';

export const AI_PROVIDER_TIMEOUT_MS = 120_000;

/** The Messages API version this client speaks. */
const ANTHROPIC_VERSION = '2023-06-01';
/** The forced tool Anthropic answers structured requests through. */
const ANTHROPIC_RESPONSE_TOOL = 'respond';
/** A system prompt this long is worth marking for Anthropic prompt caching. */
const ANTHROPIC_CACHE_MIN_CHARS = 4_000;

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
   * The model hit its output limit before finishing (Gemini `MAX_TOKENS`,
   * chat-completions `finish_reason: "length"`, Anthropic `max_tokens`).
   * Distinct from `invalid-response` because the fix is different and the
   * caller can act on it: a truncated answer means ask for less, not that the
   * provider is broken.
   */
  | 'output-truncated'
  /**
   * The provider id is not one this build knows. Refused before any key is read:
   * an unknown id used to borrow Gemini's key and DeepSeek's endpoint (audit R1).
   */
  | 'unknown-provider';

export class AiProviderRuntimeError extends Error {
  /**
   * Set when the failure happened AFTER the provider accepted the request, so the
   * vendor bills it (a truncated answer, a reply that did not parse, a stream cut
   * by cancel or timeout). The runtime records it in the monthly ledger: before
   * this, only successes were counted, so billed failures were invisible to the
   * spending limit (audit R3).
   */
  billedUsage?: AiProviderUsage;

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
 * A module-level registration rather than a field on `AiProviderRequest`: this
 * runtime is reachable from many callers, and a ceiling that each caller had to
 * remember to pass would be bypassed by the first one that forgot, and silently.
 *
 * `null` until main registers the store at startup, so every unit test that
 * boots this module keeps its existing behaviour.
 */
let spendGuard: AgentSpendGuard | null = null;

/**
 * Worst-case cost of every cloud request currently in flight, already counted
 * against the ceiling but not yet in the ledger.
 *
 * This is what makes the check and the record atomic (audit R3). The check used
 * to read the ledger, then `await` the provider, then record — so ten parallel
 * requests each saw the same spent total and together crossed the ceiling. Now
 * the check includes every reservation, and the reservation is taken in the same
 * synchronous turn as the check (no `await` between them), so the next request
 * sees it. Settling releases the reservation and records the actual cost.
 */
let reservedUsd = 0;

export function setAgentSpendGuard(guard: AgentSpendGuard | null): void {
  spendGuard = guard;
  reservedUsd = 0;
}

/**
 * The monthly ceiling's verdict for a cloud request that does not go through
 * `runCloudAiRequest` — a dedicated translation API (DeepL) has no LLM body for
 * this runtime to build, but the user's ceiling still applies to it. `true`
 * with no guard registered, exactly as an unguarded `runCloudAiRequest` is.
 */
export function cloudSpendAllows(estimatedCostUsd: number | undefined): boolean {
  if (!spendGuard) return true;
  try {
    const withReservations = estimatedCostUsd === undefined ? undefined : estimatedCostUsd + reservedUsd;
    return spendGuard.verdict(withReservations).kind !== 'refuse';
  } catch {
    // An unreadable ledger refuses: a ceiling that cannot be read is not a reason to spend.
    return false;
  }
}

/**
 * Adds a completed request made outside `runCloudAiRequest` (DeepL) to the
 * monthly ledger the ceiling is checked against (risk4). No-op with no guard
 * registered, exactly as `cloudSpendAllows`.
 */
export function recordCloudSpend(providerId: AgentSpendProviderId, costUsd: number | undefined): void {
  spendGuard?.record(providerId, costUsd);
}

/**
 * Rates for a request whose caller supplied none: the user's own figure where
 * they entered one, the labelled built-in estimate otherwise. Without this a
 * request had no cost and the monthly limit could not stop it.
 *
 * `null` until main registers the store, so unit tests keep their behaviour.
 */
let pricingResolver: ((providerId: AiProviderId) => AiProviderPricing | undefined) | null = null;

export function setAgentPricingResolver(
  resolver: ((providerId: AiProviderId) => AiProviderPricing | undefined) | null,
): void {
  pricingResolver = resolver;
}

/**
 * The non-secret provider choices (OpenAI model, local server URL and model)
 * from Settings > AI. Registered by main for the same reason as the guards
 * above; `null` reads as the defaults — no local server configured.
 */
let providerOptionsReader: (() => AiProviderOptions) | null = null;

export function setAiProviderOptionsReader(next: (() => AiProviderOptions) | null): void {
  providerOptionsReader = next;
}

function providerOptions(): AiProviderOptions {
  if (!providerOptionsReader) return DEFAULT_AI_PROVIDER_OPTIONS;
  try {
    return providerOptionsReader();
  } catch {
    return DEFAULT_AI_PROVIDER_OPTIONS;
  }
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

/** Where one request goes and as what. */
interface ResolvedTarget {
  def: AiProviderDefinition;
  model: string;
  baseUrl: string;
  /** A server on this computer: not the cloud, never billed, not in the ledger. */
  local: boolean;
}

function knownProvider(providerId: string): AiProviderDefinition {
  const def = AI_PROVIDERS.find((provider) => provider.id === providerId);
  if (!def) {
    throw new AiProviderRuntimeError(`Unknown AI provider "${String(providerId)}".`, 'unknown-provider');
  }
  return def;
}

/**
 * The model and endpoint for a provider. Throws `unknown-provider` for an id this
 * build does not know — fail closed, before any key is read (audit R1).
 */
function resolveTarget(providerId: AiProviderId): ResolvedTarget {
  const def = knownProvider(providerId);
  const options = providerOptions();
  if (def.keyBucket === 'openai-compatible') {
    return {
      def,
      model: options.compatModel,
      baseUrl: options.compatBaseUrl,
      local: isLoopbackUrl(options.compatBaseUrl),
    };
  }
  return {
    def,
    model: def.modelConfigurable && options.openaiModel ? options.openaiModel : def.model,
    baseUrl: AI_PROVIDER_BASE_URLS[def.keyBucket],
    local: false,
  };
}

function credentialFor(def: AiProviderDefinition, supplied?: string): string {
  const direct = supplied?.trim() ?? '';
  if (direct) return direct;
  return readAiProviderSecret(def.keyBucket).trim();
}

function safeSecretSet(bucket: AiProviderKeyBucket): boolean {
  try {
    return Boolean(readAiProviderSecret(bucket).trim());
  } catch {
    return false;
  }
}

export function getAiProviderHealth(providerId: AiProviderId): AiProviderHealth {
  const target = resolveTarget(providerId);
  const configured = target.def.keyBucket === 'openai-compatible'
    ? Boolean(target.baseUrl && target.model)
    : safeSecretSet(target.def.keyBucket);
  return {
    providerId,
    model: target.model,
    credentialBucket: target.def.keyBucket,
    configured,
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

function cacheKey(request: AiProviderRequest, target: ResolvedTarget, maxOutputTokens: number): string {
  return crypto.createHash('sha256').update(JSON.stringify({
    providerId: request.providerId,
    model: target.model,
    baseUrl: target.baseUrl,
    prompt: request.prompt,
    systemPrompt: request.systemPrompt ?? '',
    responseSchema: request.responseSchema ?? null,
    responseMimeType: request.responseMimeType ?? 'text/plain',
    temperature: request.temperature ?? null,
    maxOutputTokens,
    // Digested rather than embedded: the payloads are megabytes. Omitting them
    // entirely would be the real bug — two "what is in this screenshot"
    // requests share a prompt, and the second would get the first one's answer.
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

/** The vendor's short name for messages. */
function vendorLabel(def: AiProviderDefinition): string {
  switch (def.keyBucket) {
    case 'gemini':
      return 'Gemini';
    case 'deepseek':
      return 'DeepSeek';
    case 'anthropic':
      return 'Anthropic';
    case 'openai':
      return 'OpenAI';
    default:
      return 'The local AI server';
  }
}

function responseError(def: AiProviderDefinition, status: number): AiProviderRuntimeError {
  const label = vendorLabel(def);
  if (status === 401 || status === 403) {
    return new AiProviderRuntimeError(`${label} rejected the API key. Check the key and API access.`, 'authentication', false, status);
  }
  if (status === 429) {
    return new AiProviderRuntimeError(`${label} rate limit reached. Wait a moment and try again.`, 'rate-limit', true, status);
  }
  // 529 is Anthropic's "overloaded": a busy provider, worth a retry.
  const retriable = status === 408 || status === 425 || status >= 500;
  return new AiProviderRuntimeError(`${label} returned ${status}.`, 'upstream', retriable, status);
}

/** An error the vendor will still bill for: the reply arrived, with this usage. */
function billedError(
  message: string,
  code: AiProviderErrorCode,
  usage: AiProviderUsage | undefined,
): AiProviderRuntimeError {
  const error = new AiProviderRuntimeError(message, code);
  if (usage && Object.keys(usage).length) error.billedUsage = usage;
  return error;
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

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function recordUsage(
  rawInput: unknown,
  rawOutput: unknown,
  rawTotal: unknown,
  pricing?: AiProviderPricing,
): AiProviderUsage {
  return usageWithCost(finiteNumber(rawInput), finiteNumber(rawOutput), finiteNumber(rawTotal), pricing);
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new AiProviderRuntimeError(`${label} returned invalid JSON.`, 'invalid-response');
  }
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: unknown;
  thought?: unknown;
}

/** Every answer part's text, in order. Thought summaries are not the answer. */
function geminiPartsText(parts: readonly GeminiPart[] | undefined): string {
  return (parts ?? [])
    .filter((part) => part.thought !== true)
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('');
}

async function parseGeminiResponse(response: Response, pricing?: AiProviderPricing): Promise<{ text: string; usage: AiProviderUsage }> {
  const json = await readJson<{
    candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown; totalTokenCount?: unknown };
  }>(response, 'Gemini');
  const usage = recordUsage(
    json.usageMetadata?.promptTokenCount,
    json.usageMetadata?.candidatesTokenCount,
    json.usageMetadata?.totalTokenCount,
    pricing,
  );
  // Every text part, not `parts[0]` (audit R5): a reply split across parts lost
  // everything after the first one.
  const text = geminiPartsText(json.candidates?.[0]?.content?.parts).trim();
  // Checked before the empty test, because a thinking model that spends the
  // whole budget on thoughts returns MAX_TOKENS *with no parts at all*.
  if (json.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw billedError('Gemini hit its output token limit before finishing. Try fewer items.', 'output-truncated', usage);
  }
  if (!text) throw billedError('Gemini returned an empty response.', 'invalid-response', usage);
  return { text, usage };
}

async function parseGeminiStream(
  response: Response,
  request: AiProviderRequest,
  stream: StreamState,
): Promise<{ text: string; usage: AiProviderUsage }> {
  let text = '';
  let truncated = false;
  await consumeSse(response, (payload) => {
    if (typeof payload !== 'object' || payload === null) {
      throw new AiProviderRuntimeError('Gemini returned an invalid stream event.', 'invalid-response');
    }
    const chunk = payload as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown; totalTokenCount?: unknown };
    };
    if (chunk.candidates?.[0]?.finishReason === 'MAX_TOKENS') truncated = true;
    const delta = geminiPartsText(chunk.candidates?.[0]?.content?.parts);
    if (delta) {
      text += delta;
      emitTextChunk(request, delta);
    }
    if (chunk.usageMetadata) {
      stream.usage = recordUsage(
        chunk.usageMetadata.promptTokenCount,
        chunk.usageMetadata.candidatesTokenCount,
        chunk.usageMetadata.totalTokenCount,
        request.pricing,
      );
    }
  });
  // A stream cut mid-JSON is worse than one that produced nothing: the text
  // parses far enough to look like an answer and is missing its tail.
  if (truncated) {
    throw billedError('Gemini hit its output token limit before finishing. Try fewer items.', 'output-truncated', stream.usage);
  }
  if (!text.trim()) throw billedError('Gemini returned an empty response.', 'invalid-response', stream.usage);
  return { text: text.trim(), usage: stream.usage };
}

function geminiRequest(
  request: AiProviderRequest,
  target: ResolvedTarget,
  apiKey: string,
  maxOutputTokens: number,
): { url: string; init: RequestInit } {
  const streaming = Boolean(request.onTextChunk);
  // The 2.5 series thinks by default and charges its thoughts against
  // `maxOutputTokens`. A quarter of the budget, floored at 512 and ceilinged at
  // the documented maximum; three quarters left for the answer.
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
    url: `${target.baseUrl}/models/${encodeURIComponent(target.model)}:${streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'}`,
    init: {
      method: 'POST',
      // In a header, never the query string (audit R4): a URL ends up in proxy
      // logs, crash reports and error messages; a header does not.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        ...(request.systemPrompt ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } } : {}),
        contents: [{
          parts: [
            // Images lead: Gemini reads parts in order.
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

// ---------------------------------------------------------------------------
// OpenAI-style chat completions (DeepSeek, OpenAI, Ollama, LM Studio)
// ---------------------------------------------------------------------------

function truncatedChatError(label: string, usage: AiProviderUsage): AiProviderRuntimeError {
  return billedError(
    `${label} hit its output token limit before finishing. Try fewer items.`,
    'output-truncated',
    usage,
  );
}

async function parseChatResponse(
  response: Response,
  target: ResolvedTarget,
  pricing?: AiProviderPricing,
): Promise<{ text: string; usage: AiProviderUsage }> {
  const label = vendorLabel(target.def);
  const json = await readJson<{
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
  }>(response, label);
  const usage = recordUsage(json.usage?.prompt_tokens, json.usage?.completion_tokens, json.usage?.total_tokens, pricing);
  // A reply cut at `max_tokens` is truncated JSON that used to be returned as a
  // success (audit R2).
  if (json.choices?.[0]?.finish_reason === 'length') throw truncatedChatError(label, usage);
  const content = json.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) throw billedError(`${label} returned an empty response.`, 'invalid-response', usage);
  return { text, usage };
}

async function parseChatStream(
  response: Response,
  request: AiProviderRequest,
  target: ResolvedTarget,
  stream: StreamState,
): Promise<{ text: string; usage: AiProviderUsage }> {
  const label = vendorLabel(target.def);
  let text = '';
  let truncated = false;
  await consumeSse(response, (payload) => {
    if (typeof payload !== 'object' || payload === null) {
      throw new AiProviderRuntimeError(`${label} returned an invalid stream event.`, 'invalid-response');
    }
    const chunk = payload as {
      choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown } | null;
    };
    if (chunk.choices?.[0]?.finish_reason === 'length') truncated = true;
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) {
      text += delta;
      emitTextChunk(request, delta);
    }
    if (chunk.usage) {
      stream.usage = recordUsage(
        chunk.usage.prompt_tokens,
        chunk.usage.completion_tokens,
        chunk.usage.total_tokens,
        request.pricing,
      );
    }
  });
  if (truncated) throw truncatedChatError(label, stream.usage);
  if (!text.trim()) throw billedError(`${label} returned an empty response.`, 'invalid-response', stream.usage);
  return { text: text.trim(), usage: stream.usage };
}

function chatResponseFormat(request: AiProviderRequest, target: ResolvedTarget): Record<string, unknown> | undefined {
  const wantsJson = request.responseMimeType === 'application/json' || Boolean(request.responseSchema);
  if (!wantsJson) return undefined;
  const schema = request.responseSchema as { type?: unknown } | undefined;
  const objectSchema = schema && typeof schema === 'object' && schema.type === 'object';
  switch (target.def.keyBucket) {
    case 'deepseek':
      // DeepSeek has JSON mode only; the schema travels in the system prompt.
      return { type: 'json_object' };
    case 'openai':
      return objectSchema
        ? { type: 'json_schema', json_schema: { name: 'response', schema: request.responseSchema } }
        : { type: 'json_object' };
    default:
      // Local servers: LM Studio refuses `json_object`, and both it and Ollama
      // accept a JSON schema. Without one, the prompt asks for JSON.
      return objectSchema
        ? { type: 'json_schema', json_schema: { name: 'response', schema: request.responseSchema } }
        : undefined;
  }
}

function chatRequest(
  request: AiProviderRequest,
  target: ResolvedTarget,
  apiKey: string,
  maxOutputTokens: number,
): { url: string; init: RequestInit } {
  const streaming = Boolean(request.onTextChunk);
  const isOpenAi = target.def.keyBucket === 'openai';
  const responseFormat = chatResponseFormat(request, target);
  const images = request.images ?? [];
  const userContent = images.length
    ? [
        ...images.map((image) => ({
          type: 'image_url',
          image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
        })),
        { type: 'text', text: request.prompt },
      ]
    : request.prompt;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return {
    url: `${target.baseUrl}/chat/completions`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: target.model,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          { role: 'user', content: userContent },
        ],
        ...(responseFormat ? { response_format: responseFormat } : {}),
        // OpenAI's current models take `max_completion_tokens` and reject a
        // non-default temperature; everything else takes the classic pair.
        ...(isOpenAi ? { max_completion_tokens: maxOutputTokens } : { max_tokens: maxOutputTokens }),
        ...(!isOpenAi && request.temperature !== undefined ? { temperature: request.temperature } : {}),
        stream: streaming,
        // Usage on a stream: DeepSeek and OpenAI support it. Local servers are
        // left alone — an unknown field is a 400 on some of them.
        ...(streaming && target.def.keyBucket !== 'openai-compatible'
          ? { stream_options: { include_usage: true } }
          : {}),
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Anthropic Messages API
// ---------------------------------------------------------------------------

interface AnthropicUsageRaw {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
}

/** Input counts every token the request carried, cached or not; an estimate that errs high. */
function anthropicInputTokens(raw: AnthropicUsageRaw | undefined): number | undefined {
  const parts = [raw?.input_tokens, raw?.cache_creation_input_tokens, raw?.cache_read_input_tokens]
    .map(finiteNumber)
    .filter((value): value is number => value !== undefined);
  return parts.length ? parts.reduce((sum, value) => sum + value, 0) : undefined;
}

function anthropicUsage(input: number | undefined, output: number | undefined, pricing?: AiProviderPricing): AiProviderUsage {
  const total = input !== undefined && output !== undefined ? input + output : undefined;
  return usageWithCost(input, output, total, pricing);
}

/** Structured output goes through a forced tool when the schema is an object. */
function anthropicUsesTool(request: AiProviderRequest): boolean {
  const schema = request.responseSchema as { type?: unknown } | undefined;
  return Boolean(schema && typeof schema === 'object' && schema.type === 'object');
}

function anthropicRequest(
  request: AiProviderRequest,
  target: ResolvedTarget,
  apiKey: string,
  maxOutputTokens: number,
): { url: string; init: RequestInit } {
  const streaming = Boolean(request.onTextChunk);
  const useTool = anthropicUsesTool(request);
  const wantsJson = request.responseMimeType === 'application/json' || Boolean(request.responseSchema);
  const systemParts: string[] = [];
  if (request.systemPrompt) systemParts.push(request.systemPrompt);
  if (wantsJson && !useTool) {
    systemParts.push(
      request.responseSchema
        ? `Respond with JSON only, matching this schema:\n${JSON.stringify(request.responseSchema)}`
        : 'Respond with a single JSON value only: no prose, no code fences.',
    );
  }
  const systemText = systemParts.join('\n\n');
  return {
    url: `${target.baseUrl}/v1/messages`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: target.model,
        max_tokens: maxOutputTokens,
        ...(systemText
          ? {
              system: [{
                type: 'text',
                text: systemText,
                // A long, stable prefix (a schema, a grammar list) is cached by
                // the provider; short ones are below the minimum and unaffected.
                ...(systemText.length >= ANTHROPIC_CACHE_MIN_CHARS ? { cache_control: { type: 'ephemeral' } } : {}),
              }],
            }
          : {}),
        messages: [{
          role: 'user',
          content: [
            ...(request.images ?? []).map((image) => ({
              type: 'image',
              source: { type: 'base64', media_type: image.mimeType, data: image.base64 },
            })),
            { type: 'text', text: request.prompt },
          ],
        }],
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(useTool
          ? {
              tools: [{
                name: ANTHROPIC_RESPONSE_TOOL,
                description: 'Return the answer as structured data matching the input schema.',
                input_schema: request.responseSchema,
              }],
              tool_choice: { type: 'tool', name: ANTHROPIC_RESPONSE_TOOL },
            }
          : {}),
        ...(streaming ? { stream: true } : {}),
      }),
    },
  };
}

function anthropicStopError(stopReason: unknown, usage: AiProviderUsage): AiProviderRuntimeError | null {
  if (stopReason === 'max_tokens') {
    return billedError('Anthropic hit its output token limit before finishing. Try fewer items.', 'output-truncated', usage);
  }
  if (stopReason === 'refusal') {
    return billedError('Anthropic declined to answer this request.', 'invalid-response', usage);
  }
  return null;
}

async function parseAnthropicResponse(
  response: Response,
  pricing?: AiProviderPricing,
): Promise<{ text: string; usage: AiProviderUsage }> {
  const json = await readJson<{
    content?: Array<{ type?: unknown; text?: unknown; name?: unknown; input?: unknown }>;
    stop_reason?: unknown;
    usage?: AnthropicUsageRaw;
  }>(response, 'Anthropic');
  const usage = anthropicUsage(anthropicInputTokens(json.usage), finiteNumber(json.usage?.output_tokens), pricing);
  const stop = anthropicStopError(json.stop_reason, usage);
  if (stop) throw stop;
  const blocks = Array.isArray(json.content) ? json.content : [];
  const tool = blocks.find((block) => block.type === 'tool_use' && block.name === ANTHROPIC_RESPONSE_TOOL);
  const text = tool
    ? JSON.stringify(tool.input ?? null)
    : blocks
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('')
      .trim();
  if (!text || text === 'null') throw billedError('Anthropic returned an empty response.', 'invalid-response', usage);
  return { text, usage };
}

function anthropicStreamError(error: { type?: unknown; message?: unknown } | undefined): AiProviderRuntimeError {
  const type = typeof error?.type === 'string' ? error.type : '';
  if (type === 'rate_limit_error') {
    return new AiProviderRuntimeError('Anthropic rate limit reached. Wait a moment and try again.', 'rate-limit', true);
  }
  if (type === 'authentication_error' || type === 'permission_error') {
    return new AiProviderRuntimeError('Anthropic rejected the API key. Check the key and API access.', 'authentication');
  }
  return new AiProviderRuntimeError(`Anthropic stream failed (${type || 'error'}).`, 'upstream', type === 'overloaded_error');
}

async function parseAnthropicStream(
  response: Response,
  request: AiProviderRequest,
  stream: StreamState,
): Promise<{ text: string; usage: AiProviderUsage }> {
  let text = '';
  let toolJson = '';
  let sawTool = false;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let stopReason: unknown;
  const refresh = (): void => {
    stream.usage = anthropicUsage(inputTokens, outputTokens, request.pricing);
  };
  await consumeSse(response, (payload) => {
    if (typeof payload !== 'object' || payload === null) {
      throw new AiProviderRuntimeError('Anthropic returned an invalid stream event.', 'invalid-response');
    }
    const event = payload as {
      type?: unknown;
      message?: { usage?: AnthropicUsageRaw };
      content_block?: { type?: unknown; name?: unknown };
      delta?: { type?: unknown; text?: unknown; partial_json?: unknown; stop_reason?: unknown };
      usage?: AnthropicUsageRaw;
      error?: { type?: unknown; message?: unknown };
    };
    switch (event.type) {
      case 'message_start':
        inputTokens = anthropicInputTokens(event.message?.usage);
        outputTokens = finiteNumber(event.message?.usage?.output_tokens) ?? outputTokens;
        refresh();
        break;
      case 'content_block_start':
        if (event.content_block?.type === 'tool_use' && event.content_block.name === ANTHROPIC_RESPONSE_TOOL) {
          sawTool = true;
        }
        break;
      case 'content_block_delta':
        if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string' && event.delta.text) {
          text += event.delta.text;
          emitTextChunk(request, event.delta.text);
        } else if (event.delta?.type === 'input_json_delta' && typeof event.delta.partial_json === 'string') {
          toolJson += event.delta.partial_json;
          if (event.delta.partial_json) emitTextChunk(request, event.delta.partial_json);
        }
        break;
      case 'message_delta':
        if (event.delta?.stop_reason !== undefined) stopReason = event.delta.stop_reason;
        outputTokens = finiteNumber(event.usage?.output_tokens) ?? outputTokens;
        refresh();
        break;
      case 'error':
        throw anthropicStreamError(event.error);
      default:
        break;
    }
  });
  const stop = anthropicStopError(stopReason, stream.usage);
  if (stop) throw stop;
  const answer = (sawTool ? toolJson : text).trim();
  if (!answer) throw billedError('Anthropic returned an empty response.', 'invalid-response', stream.usage);
  return { text: answer, usage: stream.usage };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** What a stream has reported so far; read on failure to bill a cut-off reply. */
interface StreamState {
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

function buildRequest(
  request: AiProviderRequest,
  target: ResolvedTarget,
  apiKey: string,
  maxOutputTokens: number,
): { url: string; init: RequestInit } {
  switch (target.def.wire) {
    case 'gemini':
      return geminiRequest(request, target, apiKey, maxOutputTokens);
    case 'anthropic':
      return anthropicRequest(request, target, apiKey, maxOutputTokens);
    default:
      return chatRequest(request, target, apiKey, maxOutputTokens);
  }
}

async function parseReply(
  response: Response,
  request: AiProviderRequest,
  target: ResolvedTarget,
  stream: StreamState,
): Promise<{ text: string; usage: AiProviderUsage }> {
  const streaming = Boolean(request.onTextChunk);
  switch (target.def.wire) {
    case 'gemini':
      return streaming ? parseGeminiStream(response, request, stream) : parseGeminiResponse(response, request.pricing);
    case 'anthropic':
      return streaming ? parseAnthropicStream(response, request, stream) : parseAnthropicResponse(response, request.pricing);
    default:
      return streaming ? parseChatStream(response, request, target, stream) : parseChatResponse(response, target, request.pricing);
  }
}

async function fetchAttempt(
  request: AiProviderRequest,
  target: ResolvedTarget,
  apiKey: string,
  maxOutputTokens: number,
  timeoutMs: number,
  preflightCost: number | undefined,
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
  // True once the provider accepted the request (2xx): from then on the vendor
  // bills it, whatever happens to the reply.
  let accepted = false;
  const stream: StreamState = { usage: {} };
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
    const built = buildRequest(requestWithTrackedChunks, target, apiKey, maxOutputTokens);
    const response = await fetch(built.url, { ...built.init, signal: controller.signal });
    if (!response.ok) throw responseError(target.def, response.status);
    accepted = true;
    return await parseReply(response, requestWithTrackedChunks, target, stream);
  } catch (error) {
    let normalized: AiProviderRuntimeError;
    if (timedOut) {
      normalized = new AiProviderRuntimeError(
        `AI request timed out after ${Math.round(timeoutMs / 1000)}s. Try fewer items or check your connection.`,
        'timeout',
        true,
      );
    } else if (request.signal?.aborted) {
      normalized = new AiProviderRuntimeError('AI request was cancelled.', 'cancelled');
    } else {
      normalized = runtimeError(error);
      if (emittedChunk && normalized.retriable) {
        normalized = new AiProviderRuntimeError(normalized.message, normalized.code, false, normalized.status);
      }
    }
    if (accepted && !normalized.billedUsage) {
      // The reply reached us and failed afterwards: billed. With the provider's
      // own count where a stream reported one, the worst-case estimate otherwise.
      const reported = error instanceof AiProviderRuntimeError ? error.billedUsage : undefined;
      normalized.billedUsage = reported
        ?? (Object.keys(stream.usage).length ? stream.usage : undefined)
        ?? (preflightCost !== undefined ? { estimatedCostUsd: preflightCost } : {});
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
  // First, before pricing, keys or anything else: an id this build does not
  // know is refused, never mapped onto another vendor (audit R1).
  const target = resolveTarget(input.providerId);
  const request = withResolvedPricing(input);
  const { model } = target;
  const credentialBucket = target.def.keyBucket;
  const inputChars = request.prompt.length + (request.systemPrompt?.length ?? 0);
  if (request.maxInputChars !== undefined && inputChars > Math.max(0, request.maxInputChars)) {
    throw new AiProviderRuntimeError('AI request exceeds the configured input budget.', 'input-budget');
  }
  // Refused, never silently dropped: sending a screenshot's worth of question to
  // a text-only model and returning its confident answer is the failure mode.
  if ((request.images?.length ?? 0) > 0 && !providerAcceptsImageInput(request.providerId)) {
    throw new AiProviderRuntimeError(
      `${target.def.label} does not accept image input.`,
      'vision-unsupported',
    );
  }
  if (target.def.keyBucket === 'openai-compatible' && (!target.baseUrl || !target.model)) {
    throw new AiProviderRuntimeError(
      'The local AI server URL and model are not set. Set them in Settings > AI.',
      'missing-credential',
    );
  }
  const maxOutputTokens = boundedInteger(request.maxOutputTokens, 2048, 1, 65_536);
  // A server on this computer bills nothing: no rates, no ledger, no ceiling.
  const preflightCost = target.local
    ? undefined
    : estimateAiProviderCostUsd(estimatedTokens(inputChars), maxOutputTokens, request.pricing);
  if (
    request.maxEstimatedCostUsd !== undefined
    && preflightCost !== undefined
    && preflightCost > Math.max(0, request.maxEstimatedCostUsd)
  ) {
    throw new AiProviderRuntimeError('AI request exceeds the configured cost budget.', 'cost-budget');
  }
  const apiKey = credentialFor(target.def, request.apiKey);
  if (!apiKey && !target.def.keyOptional) {
    throw new AiProviderRuntimeError('AI provider credential is not configured.', 'missing-credential');
  }

  const cacheMode = request.cache ?? 'off';
  if (cacheMode === 'persistent') {
    throw new AiProviderRuntimeError(
      'Persistent AI response caching is not available until encrypted retention is configured.',
      'persistent-cache-unavailable',
    );
  }
  const key = cacheKey(request, target, maxOutputTokens);
  const cached = cacheMode === 'session' ? sessionCache.get(key) : undefined;
  if (cached) {
    // A cache hit makes no request and costs nothing, so it neither needs the
    // ceiling's permission nor adds to the ledger.
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

  // The ceiling, with every in-flight request's worst case already counted, and
  // the reservation taken in the same synchronous turn as the check — the
  // atomic "reserve, then settle" that stops parallel requests from crossing the
  // ceiling together (audit R3). Worst case = output at `maxOutputTokens`,
  // because a ceiling that can be crossed by a request it approved is not one.
  const ledgered = Boolean(spendGuard) && !target.local;
  let reservation = 0;
  if (ledgered && spendGuard) {
    let refused: boolean;
    try {
      const withReservations = preflightCost === undefined ? undefined : preflightCost + reservedUsd;
      refused = spendGuard.verdict(withReservations).kind === 'refuse';
    } catch {
      // An unreadable ledger refuses: a ceiling that cannot be read is not a reason to spend.
      refused = true;
    }
    if (refused) {
      throw new AiProviderRuntimeError('AI request would exceed the monthly spending limit.', 'spend-budget');
    }
    reservation = preflightCost ?? 0;
    reservedUsd += reservation;
  }
  const settle = (costUsd: number | undefined): void => {
    if (!ledgered) return;
    try {
      spendGuard?.record(request.providerId, costUsd);
    } catch {
      // A ledger write failure must not turn a delivered answer into an error.
    }
  };

  const retryAttempts = boundedInteger(request.retryAttempts, 0, 0, 5);
  const retryBaseDelayMs = boundedInteger(request.retryBaseDelayMs, 500, 0, 30_000);
  const timeoutMs = boundedInteger(request.timeoutMs, AI_PROVIDER_TIMEOUT_MS, 1, 10 * 60_000);
  let attempts = 0;
  try {
    for (;;) {
      attempts += 1;
      emit(request, { type: 'start', providerId: request.providerId, model, attempt: attempts });
      try {
        const result = await fetchAttempt(request, target, apiKey, maxOutputTokens, timeoutMs, preflightCost);
        if (cacheMode === 'session') {
          sessionCache.set(key, { text: result.text, usage: result.usage });
        }
        // The *actual* cost, not the worst-case figure the preflight reserved:
        // the ledger records what was spent.
        settle(result.usage.estimatedCostUsd);
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
        // Billed by the vendor even though it failed: counted, once per attempt
        // that reached the provider. A refused attempt (401, 429, 5xx) is not.
        if (normalized.billedUsage) settle(normalized.billedUsage.estimatedCostUsd);
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
  } finally {
    reservedUsd = Math.max(0, reservedUsd - reservation);
  }
}
