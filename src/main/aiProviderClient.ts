/**
 * The JSON-feature client: one call that sends a prompt plus a JSON schema to
 * the configured cloud provider and returns the reply text, ready to parse.
 *
 * Every AI feature that wants structured data (AI cards, the analyses, the
 * media assistant, Anki additions, the subtitle-fusion arbiter, Mirror Writing)
 * goes through `callAiProvider`, so the rules live here once:
 *
 * - the "Use AI features" switch, and the calling feature's cloud opt-in;
 * - an unknown provider id is refused before any key is read (audit R1);
 * - the schema travels the way each wire format wants it: Gemini's
 *   `responseSchema`, an Anthropic forced tool, an OpenAI `json_schema` /
 *   DeepSeek JSON mode with the schema in the system prompt;
 * - code fences are stripped from the reply;
 * - a caller can cancel (`signal`), which reaches the HTTP request.
 */
import type { ZodType, ZodTypeDef } from 'zod';
import type { AiProviderId } from '../shared/aiProviders';
import type { AiCloudFeatureId } from '../shared/aiSetup';
import { AI_PROVIDER_TIMEOUT_MS, AiProviderRuntimeError, runCloudAiRequest } from './providerRuntime';
import { AI_FEATURES_OFF_MESSAGE, aiFeaturesEnabled, assertAiFeatureAllowed } from './aiFeatureGate';
import { parseAiReplyJson, parseAiReplyWith, stripJsonFences } from './aiStructuredOutput';
import { AI_PROVIDERS } from '../shared/aiProviders';

export { AI_PROVIDER_TIMEOUT_MS } from './providerRuntime';

export function maxTokensForItemCount(itemCount: number): number {
  return Math.min(16384, Math.max(2048, itemCount * 450));
}

/**
 * Parses a reply as JSON. Tolerates code fences and surrounding prose, which
 * models add whatever the prompt says (a bare `JSON.parse` here threw on every
 * fenced reply).
 */
export function parseAiJson<T>(text: string, context: string): T {
  return parseAiReplyJson(text, context) as T;
}

export interface CallAiProviderOptions {
  itemCount?: number;
  timeoutMs?: number;
  /** Cancels the in-flight HTTP request. */
  signal?: AbortSignal;
  /** The calling feature; its cloud opt-in (Settings > AI) is enforced when given. */
  feature?: AiCloudFeatureId;
  /** Extra output room; defaults to `maxTokensForItemCount(itemCount)`. */
  maxOutputTokens?: number;
  /**
   * Streams the reply as it arrives (`main/aiStreamRelay.ts`, docs/AI_AUDIT.md F9).
   * A preview only: the returned text, and so the parse, are the same either way.
   */
  onTextChunk?: (text: string) => void;
}

const JSON_SYSTEM_PROMPT =
  'You are a careful language-learning assistant. Respond with valid JSON only (json), no prose and no code fences, and follow the schema exactly.';

export async function callAiProvider(
  providerId: AiProviderId,
  apiKey: string,
  prompt: string,
  schema: unknown,
  options?: CallAiProviderOptions,
): Promise<string> {
  // Every caller of this helper is an AI feature, so the "Use AI features"
  // switch is enforced here once rather than in each of them. Machine
  // translation reaches the runtime directly and is not affected.
  if (!aiFeaturesEnabled()) throw new AiProviderRuntimeError(AI_FEATURES_OFF_MESSAGE, 'ai-off');
  const provider = AI_PROVIDERS.find((entry) => entry.id === providerId);
  if (!provider) {
    throw new AiProviderRuntimeError(`Unknown AI provider "${String(providerId)}".`, 'unknown-provider');
  }
  if (options?.feature) assertAiFeatureAllowed(options.feature, 'cloud');
  const itemCount = Math.max(1, options?.itemCount ?? 1);
  // Gemini and Anthropic enforce the schema natively; chat-completions servers
  // are told it as well, because DeepSeek only has a JSON mode and a local
  // model follows an explicit schema far better than a bare "JSON please".
  const schemaHint = provider.wire === 'openai-chat'
    ? `\n\nReturn valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`
    : '';
  const result = await runCloudAiRequest({
    providerId,
    apiKey,
    prompt,
    systemPrompt: JSON_SYSTEM_PROMPT + schemaHint,
    responseSchema: schema,
    responseMimeType: 'application/json',
    maxOutputTokens: options?.maxOutputTokens ?? maxTokensForItemCount(itemCount),
    timeoutMs: options?.timeoutMs ?? AI_PROVIDER_TIMEOUT_MS,
    ...(options?.signal ? { signal: options.signal } : {}),
    ...(options?.onTextChunk ? { onTextChunk: options.onTextChunk } : {}),
  });
  return stripJsonFences(result.text);
}

/**
 * `callAiProvider` plus validation: the reply is parsed and checked against a
 * zod schema. A reply that does not match gets ONE repair retry that says what
 * was wrong; a second failure is a typed `invalid-response`, never a half-built
 * object handed to the caller.
 */
export async function callAiProviderJson<T>(
  providerId: AiProviderId,
  apiKey: string,
  prompt: string,
  schema: unknown,
  validator: ZodType<T, ZodTypeDef, unknown>,
  options?: CallAiProviderOptions & { context?: string },
): Promise<T> {
  const context = options?.context ?? 'The AI provider';
  const text = await callAiProvider(providerId, apiKey, prompt, schema, options);
  try {
    return parseAiReplyWith(text, validator, context);
  } catch (error) {
    if (!(error instanceof AiProviderRuntimeError) || error.code !== 'invalid-response') throw error;
    if (options?.signal?.aborted) throw new AiProviderRuntimeError('AI request was cancelled.', 'cancelled');
    const repair = `${prompt}\n\nYour previous reply could not be used (${error.message}). Reply again with JSON only, matching the schema exactly.`;
    const retried = await callAiProvider(providerId, apiKey, repair, schema, options);
    return parseAiReplyWith(retried, validator, context);
  }
}
