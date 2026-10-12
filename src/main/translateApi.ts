// API translation batch engine for EPUB mining: any provider in the table, including
// a keyless local OpenAI-compatible server (Ollama / LM Studio).
// Shares prompt/parse logic with offline Qwen via translateCore.

import { AI_PROVIDERS, type AiProviderId } from '../shared/aiProviders';
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
import { getAiProviderHealth, runCloudAiRequest } from './providerRuntime';

const BATCH_SIZE = 40;
const BATCH_CONCURRENCY = 6;
/**
 * A local OpenAI-compatible server (Ollama, LM Studio) runs one generation at a
 * time on the user's own GPU; six 40-line batches in flight only queue there and
 * time out one after another.
 */
const LOCAL_SERVER_CONCURRENCY = 1;

function providerWire(providerId: AiProviderId): string | null {
  return AI_PROVIDERS.find((provider) => provider.id === providerId)?.wire ?? null;
}

function keyOptional(providerId: AiProviderId): boolean {
  return AI_PROVIDERS.find((provider) => provider.id === providerId)?.keyOptional === true;
}

export interface RunApiTranslationBatchOptions {
  shouldCancel?: () => boolean;
  onProgress?: (done: number, total: number) => void;
  /** Ignore cached translations (they are still refreshed): "translate these again". */
  fresh?: boolean;
}

async function callProviderTranslate(
  providerId: AiProviderId,
  apiKey: string,
  prompt: string,
): Promise<string> {
  return (await runCloudAiRequest({
    providerId,
    apiKey,
    prompt,
    // By wire format, not by one id: every chat-completions server (DeepSeek,
    // OpenAI, a local server) and Claude need the JSON instruction.
    systemPrompt: providerWire(providerId) === 'gemini'
      ? undefined
      : 'You are a translation assistant. Respond with valid JSON only — either a JSON array ' +
        '[{"id":"t0","text":"..."}, ...] or {"results":[...]} with the same item shape.',
    responseMimeType: 'application/json',
    maxOutputTokens: 8192,
    temperature: 0.1,
  })).text;
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
      if (valid) setCachedTranslation(item.text, item.source, item.target, text, providerId);
      out.push({ id: item.id, text: valid ? text : '' });
    }
  }

  for (const item of strictItems) {
    const prompt = buildStrictPrompt(item);
    const raw = cleanLlmOutput(await callProviderTranslate(providerId, apiKey, prompt));
    const text = isValidCrossLangTranslation(item.source, item.target, item.text, raw) ? raw : '';
    if (text) setCachedTranslation(item.text, item.source, item.target, text, providerId);
    out.push({ id: item.id, text });
  }

  return out;
}

async function translateApiBatchChunk(
  providerId: AiProviderId,
  apiKey: string,
  items: TranslateBatchItem[],
  fresh = false,
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
    // Scoped to this provider: an offline or other-provider translation is not this one's.
    const cached = fresh ? undefined : getCachedTranslation(item.text, item.source, item.target, providerId);
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
      const chunkResults = await translateApiBatchChunk(providerId, apiKey, chunks[i], options?.fresh === true);
      results.push(...chunkResults);
      done += chunks[i].length;
      options?.onProgress?.(done, list.length);
    }
  }
  const concurrency = keyOptional(providerId) ? LOCAL_SERVER_CONCURRENCY : BATCH_CONCURRENCY;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker()),
  );
  flushTranslationCache();
  return results;
}

/**
 * A key, or — for a provider that takes none, the local OpenAI-compatible
 * server — a configured URL and model. "Has a key" alone made EPUB API
 * translation unreachable with Ollama or LM Studio.
 */
export function isApiTranslationAvailable(
  providerId: AiProviderId,
  apiKey: string,
  configured: (id: AiProviderId) => boolean = (id) => getAiProviderHealth(id).configured,
): boolean {
  if (apiKey.trim()) return true;
  if (!keyOptional(providerId)) return false;
  try {
    return configured(providerId);
  } catch {
    return false;
  }
}
