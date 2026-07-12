// Cloud translation batch engine for EPUB mining fail-switch (Gemini / DeepSeek).
// Shares prompt/parse logic with offline Qwen via translateCore.

import type { AiProviderId } from '../shared/aiProviders';
import { isValidCrossLangTranslation } from '../shared/epubEnrichment';
import {
  buildBatchPrompt,
  buildStrictPrompt,
  cleanLlmOutput,
  parseBatchJson,
  type TranslateBatchItem,
} from '../shared/translateCore';
import {
  flushTranslationCache,
  getCachedTranslation,
  setCachedTranslation,
} from './translate';

const BATCH_SIZE = 40;
const BATCH_CONCURRENCY = 6;

export interface RunApiTranslationBatchOptions {
  shouldCancel?: () => boolean;
  onProgress?: (done: number, total: number) => void;
}

async function callGeminiTranslate(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    },
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

async function callDeepSeekTranslate(providerId: AiProviderId, apiKey: string, prompt: string): Promise<string> {
  const model = providerId === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';
  const response = await fetch('https://api.deepseek.com/chat/completions', {
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
            'You are a translation assistant. Respond with valid JSON only — either a JSON array ' +
            '[{"id":"t0","text":"..."}, ...] or {"results":[...]} with the same item shape.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      temperature: 0.1,
      stream: false,
    }),
  });
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

async function callProviderTranslate(
  providerId: AiProviderId,
  apiKey: string,
  prompt: string,
): Promise<string> {
  if (providerId === 'gemini-2.5-flash') return callGeminiTranslate(apiKey, prompt);
  return callDeepSeekTranslate(providerId, apiKey, prompt);
}

async function translateApiGroup(
  providerId: AiProviderId,
  apiKey: string,
  items: TranslateBatchItem[],
): Promise<{ id: string; text: string }[]> {
  if (!items.length) return [];
  const strictItems = items.filter((i) => i.strict);
  const batchItems = items.filter((i) => !i.strict);
  const out: { id: string; text: string }[] = [];

  if (batchItems.length) {
    const prompt = buildBatchPrompt(batchItems);
    const raw = await callProviderTranslate(providerId, apiKey, prompt);
    const expected = new Set(batchItems.map((i) => i.id));
    const parsed = parseBatchJson(raw, expected);
    for (const item of batchItems) {
      const text = parsed.get(item.id)?.trim() ?? '';
      const valid = text && isValidCrossLangTranslation(item.source, item.target, item.text, text);
      if (valid) setCachedTranslation(item.text, item.source, item.target, text);
      out.push({ id: item.id, text: valid ? text : '' });
    }
  }

  for (const item of strictItems) {
    const prompt = buildStrictPrompt(item);
    const raw = cleanLlmOutput(await callProviderTranslate(providerId, apiKey, prompt));
    const text = isValidCrossLangTranslation(item.source, item.target, item.text, raw) ? raw : '';
    if (text) setCachedTranslation(item.text, item.source, item.target, text);
    out.push({ id: item.id, text });
  }

  return out;
}

async function translateApiBatchChunk(
  providerId: AiProviderId,
  apiKey: string,
  items: TranslateBatchItem[],
): Promise<{ id: string; text: string }[]> {
  const out: { id: string; text: string }[] = [];
  const needsLlm: TranslateBatchItem[] = [];

  for (const item of items) {
    if (item.source === item.target || !item.text.trim()) {
      out.push({ id: item.id, text: item.text });
      continue;
    }
    if (item.strict) {
      needsLlm.push(item);
      continue;
    }
    const cached = getCachedTranslation(item.text, item.source, item.target);
    if (cached !== undefined && isValidCrossLangTranslation(item.source, item.target, item.text, cached)) {
      out.push({ id: item.id, text: cached });
    } else {
      needsLlm.push(item);
    }
  }

  if (!needsLlm.length) return out;

  const groups = new Map<string, TranslateBatchItem[]>();
  for (const item of needsLlm) {
    const key = item.strict ? `strict:${item.id}` : `${item.source}:${item.target}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  for (const [key, group] of groups) {
    if (key.startsWith('strict:')) {
      for (const item of group) {
        out.push(...(await translateApiGroup(providerId, apiKey, [item])));
      }
      continue;
    }
    for (let i = 0; i < group.length; i += BATCH_SIZE) {
      out.push(...(await translateApiGroup(providerId, apiKey, group.slice(i, i + BATCH_SIZE))));
    }
  }

  return out;
}

/** Batch cloud translation — same contract as offline runTranslationBatch. */
export async function runApiTranslationBatch(
  items: TranslateBatchItem[],
  providerId: AiProviderId,
  apiKey: string,
  options?: RunApiTranslationBatchOptions,
): Promise<{ id: string; text: string }[]> {
  const deduped = new Map<string, TranslateBatchItem>();
  for (const item of items) {
    if (!item.id || !item.text.trim()) continue;
    deduped.set(item.id, item);
  }
  const list = [...deduped.values()];
  if (!list.length) return [];

  const chunks: TranslateBatchItem[][] = [];
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    chunks.push(list.slice(i, i + BATCH_SIZE));
  }

  const results: { id: string; text: string }[] = [];
  let ptr = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (ptr < chunks.length) {
      if (options?.shouldCancel?.()) return;
      const i = ptr++;
      const chunkResults = await translateApiBatchChunk(providerId, apiKey, chunks[i]);
      results.push(...chunkResults);
      done += chunks[i].length;
      options?.onProgress?.(done, list.length);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, chunks.length) }, () => worker()),
  );
  flushTranslationCache();
  return results;
}

export function isApiTranslationAvailable(providerId: AiProviderId, apiKey: string): boolean {
  return Boolean(apiKey.trim());
}
