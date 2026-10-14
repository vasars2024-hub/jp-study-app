/**
 * The offline model's half of a structured AI call, shared by the helper runners
 * (`aiStudyAssist.ts`, `aiImmerseAssist.ts`) and Card Studio (`mining.ts`).
 *
 * - The cache identity of the local model is its GGUF file and size
 *   (`translate.localModelCacheKey()`), never the constant 'local-qwen': swapping
 *   the offline model kept serving the previous model's answers.
 * - A structured call decodes under a JSON grammar (W1-A, `llamaGrammar.ts`), so the
 *   1.7B model can only answer with a JSON object. The prompt's "JSON only" sentence
 *   stays: a backend that cannot build the grammar drops it and decodes freely.
 */
import type { LlamaJsonGrammar } from './llamaHost';

export const LOCAL_JSON_GRAMMAR: LlamaJsonGrammar = { kind: 'json' };

export interface LocalStructuredRunOptions {
  signal: AbortSignal;
  maxTokens: number;
  timeoutMs: number;
  /** Constrained decoding (`LOCAL_JSON_GRAMMAR` for every structured call). */
  jsonGrammar?: LlamaJsonGrammar;
  /** The reply as it streams in; a preview only (`aiStreamRelay.ts`). */
  onTextChunk?: (text: string) => void;
}

/** `local:<gguf file>:<bytes>`; a translate module that will not load still keys apart from the cloud. */
export async function defaultLocalModelKey(): Promise<string> {
  try {
    return (await import('./translate')).localModelCacheKey();
  } catch {
    return 'local:unknown';
  }
}
