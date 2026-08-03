// Pure translation-engine helpers shared by the main process and tests:
// prompt construction and output parsing carry all the failure-mode handling
// (thinking blocks, malformed JSON, id echoes), so they live here without any
// Electron or node-llama dependencies.

import { langLabel } from './langs';

export interface TranslateBatchItem {
  id: string;
  text: string;
  source: string;
  target: string;
  /** Retry pass — use the stricter single-item prompt. */
  strict?: boolean;
}

export function cleanLlmOutput(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/^[\s\n]+/, '')
    .trim();
}

/**
 * Parse the JSON array a batch prompt asks for. Malformed JSON returns an
 * empty map (the caller treats those items as failed); an item echoing its own
 * id as the "translation" is rejected (the source of stray "t1" card values).
 */
export function parseBatchJson(raw: string, expectedIds: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const cleaned = cleanLlmOutput(raw);
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    const arr = Array.isArray(parsed) ? parsed : (parsed as { results?: unknown })?.results;
    if (!Array.isArray(arr)) return out;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const id = typeof obj.id === 'string' ? obj.id : '';
      const text = typeof obj.text === 'string' ? obj.text.trim() : '';
      if (id && expectedIds.has(id) && text && text !== id) out.set(id, text);
    }
  } catch {
    /* fall through */
  }
  return out;
}

export function buildBatchPrompt(items: TranslateBatchItem[]): string {
  const source = langLabel(items[0].source);
  const target = langLabel(items[0].target);
  const lines = items.map((item) => `[${item.id}] ${item.text}`);
  const longForm = items.some((item) => item.text.length > 40);
  if (longForm) {
    return (
      `/no_think\nTranslate each numbered ${source} passage into ${target}. ` +
      `Keep meaning and tone; output ${target} only. ` +
      `Return ONLY a JSON array: [{"id":"0","text":"<${target} translation>"}, ...]\n\n` +
      lines.join('\n')
    );
  }
  return (
    `/no_think\nTranslate each numbered ${source} term into ${target}. ` +
    `Give the ${target} meaning only — never romaji, kana, or the original word. ` +
    `Return ONLY a JSON array: [{"id":"t0","text":"<${target} translation>"}, ...]\n\n` +
    lines.join('\n')
  );
}

/** Stricter single-item retry prompt used after a validation failure. */
export function buildStrictPrompt(item: TranslateBatchItem): string {
  const source = langLabel(item.source);
  const target = langLabel(item.target);
  return (
    `/no_think\nTranslate this ${source} term into ${target}. ` +
    `Respond with ONLY the ${target} translation written in ${target} — ` +
    `no ${source} characters, no romanization, no explanations, no quotes.\n\n` +
    `Term: ${item.text}`
  );
}

export function buildSentencePrompt(text: string, source: string, target: string): string {
  return (
    `/no_think\nTranslate the following ${langLabel(source)} text to ${langLabel(target)}. ` +
    `Output ONLY the translation, nothing else.\n\nText: ${text}`
  );
}
