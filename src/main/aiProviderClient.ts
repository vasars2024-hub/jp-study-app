// Generic cloud-LLM HTTP callers (Gemini / DeepSeek), extracted verbatim from
// mining.ts so that EPUB-mining enrichment and translate-analysis share one
// client instead of growing a third near-duplicate fetch pair. Callers must
// supply an explicit JSON schema — the mining-specific fallbacks stayed behind
// in mining.ts.
import type { AiProviderId } from '../shared/mining';
import { AI_PROVIDER_TIMEOUT_MS, runCloudAiRequest } from './providerRuntime';

export { AI_PROVIDER_TIMEOUT_MS } from './providerRuntime';

export function maxTokensForItemCount(itemCount: number): number {
  return Math.min(16384, Math.max(2048, itemCount * 450));
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = AI_PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `AI request timed out after ${Math.round(timeoutMs / 1000)}s. Try fewer items or check your connection.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function parseAiJson<T>(text: string, context: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${context} returned invalid JSON. Try fewer items or switch provider.`);
  }
}

export async function callGeminiApi(
  apiKey: string,
  prompt: string,
  schema: unknown,
  options?: { itemCount?: number; timeoutMs?: number },
): Promise<string> {
  const itemCount = Math.max(1, options?.itemCount ?? 1);
  return (await runCloudAiRequest({
    providerId: 'gemini-2.5-flash',
    apiKey,
    prompt,
    responseSchema: schema,
    responseMimeType: 'application/json',
    maxOutputTokens: maxTokensForItemCount(itemCount),
    timeoutMs: options?.timeoutMs ?? AI_PROVIDER_TIMEOUT_MS,
  })).text;
}

export async function callDeepSeekApi(
  providerId: AiProviderId,
  apiKey: string,
  prompt: string,
  schema: unknown,
  options?: { itemCount?: number; timeoutMs?: number },
): Promise<string> {
  const itemCount = Math.max(1, options?.itemCount ?? 1);
  const schemaHint = `\n\nReturn valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`;
  return (await runCloudAiRequest({
    providerId,
    apiKey,
    prompt,
    systemPrompt:
      'You are a language-learning card generator. Respond with valid JSON only. Include the word json in your reasoning and follow the schema exactly.' +
      schemaHint,
    responseSchema: schema,
    responseMimeType: 'application/json',
    maxOutputTokens: maxTokensForItemCount(itemCount),
    timeoutMs: options?.timeoutMs ?? AI_PROVIDER_TIMEOUT_MS,
  })).text;
}

export async function callAiProvider(
  providerId: AiProviderId,
  apiKey: string,
  prompt: string,
  schema: unknown,
  options?: { itemCount?: number; timeoutMs?: number },
): Promise<string> {
  if (providerId === 'gemini-2.5-flash') return callGeminiApi(apiKey, prompt, schema, options);
  return callDeepSeekApi(providerId, apiKey, prompt, schema, options);
}
