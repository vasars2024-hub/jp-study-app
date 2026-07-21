// Generic cloud-LLM HTTP callers (Gemini / DeepSeek), extracted verbatim from
// mining.ts so that EPUB-mining enrichment and translate-analysis share one
// client instead of growing a third near-duplicate fetch pair. Callers must
// supply an explicit JSON schema — the mining-specific fallbacks stayed behind
// in mining.ts.
import type { AiProviderId } from '../shared/mining';

export const AI_PROVIDER_TIMEOUT_MS = 120_000;

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
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          maxOutputTokens: maxTokensForItemCount(itemCount),
        },
      }),
    },
    options?.timeoutMs ?? AI_PROVIDER_TIMEOUT_MS,
  );
  if (response.status === 429) throw new Error('Gemini rate limit reached. Wait a moment and try again.');
  if (response.status === 401 || response.status === 403) {
    throw new Error('Gemini rejected the API key. Check the key and API access.');
  }
  if (!response.ok) throw new Error(`Gemini returned ${response.status}.`);
  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

export async function callDeepSeekApi(
  providerId: AiProviderId,
  apiKey: string,
  prompt: string,
  schema: unknown,
  options?: { itemCount?: number; timeoutMs?: number },
): Promise<string> {
  const model = providerId === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';
  const itemCount = Math.max(1, options?.itemCount ?? 1);
  const schemaHint = `\n\nReturn valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`;
  const response = await fetchWithTimeout(
    'https://api.deepseek.com/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a language-learning card generator. Respond with valid JSON only. Include the word json in your reasoning and follow the schema exactly.' +
              schemaHint,
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: maxTokensForItemCount(itemCount),
        stream: false,
      }),
    },
    options?.timeoutMs ?? AI_PROVIDER_TIMEOUT_MS,
  );
  if (response.status === 429) throw new Error('DeepSeek rate limit reached. Wait a moment and try again.');
  if (response.status === 401 || response.status === 403) {
    throw new Error('DeepSeek rejected the API key. Check the key at platform.deepseek.com.');
  }
  if (!response.ok) throw new Error(`DeepSeek returned ${response.status}.`);
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('DeepSeek returned an empty response.');
  return text;
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
